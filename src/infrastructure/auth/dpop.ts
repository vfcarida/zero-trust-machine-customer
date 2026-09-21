import crypto from 'crypto';
import * as jose from 'jose';
import { DPoPProof, DPoPProofSchema } from '../../domain/types';
import { DPoPSignatureError } from '../../domain/errors/domain_errors';
import { logger } from '../logging/logger';

export interface DPoPKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * Interface for DPoP JTI Replay Cache.
 *
 * Extension Point:
 * For multi-instance / distributed production environments, implement this interface
 * backed by a distributed durable store such as Redis:
 *
 * ```typescript
 * export class RedisDPoPReplayStore implements IDPoPReplayStore {
 *   constructor(private redis: RedisClient) {}
 *   async recordIfUnseen(jti: string, expiresAtUnixSeconds: number): Promise<boolean> {
 *     const ttl = Math.max(1, expiresAtUnixSeconds - Math.floor(Date.now() / 1000));
 *     const res = await this.redis.set(`dpop:jti:${jti}`, '1', 'EX', ttl, 'NX');
 *     return res === 'OK';
 *   }
 *   async has(jti: string): Promise<boolean> {
 *     return (await this.redis.exists(`dpop:jti:${jti}`)) === 1;
 *   }
 *   async clear(): Promise<void> { ... }
 *   async size(): Promise<number> { ... }
 * }
 * ```
 */
export interface IDPoPReplayStore {
  recordIfUnseen(jti: string, expiresAtUnixSeconds: number): boolean | Promise<boolean>;
  has(jti: string): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  size(): number | Promise<number>;
}

/**
 * Default in-memory single-use JTI replay cache with automatic TTL eviction.
 */
export class InMemoryDPoPReplayStore implements IDPoPReplayStore {
  private cache: Map<string, number> = new Map(); // jti -> expiresAtUnixSeconds

  public recordIfUnseen(jti: string, expiresAtUnixSeconds: number): boolean {
    this.cleanup();
    if (this.cache.has(jti)) {
      return false; // Replay detected
    }
    this.cache.set(jti, expiresAtUnixSeconds);
    return true; // Unseen, successfully recorded
  }

  public has(jti: string): boolean {
    this.cleanup();
    return this.cache.has(jti);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    this.cleanup();
    return this.cache.size;
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of this.cache.entries()) {
      if (exp < now) {
        this.cache.delete(jti);
      }
    }
  }
}

export interface DPoPVerificationOptions {
  maxAgeSeconds?: number;
  accessToken?: string;
  replayStore?: IDPoPReplayStore;
  skipReplayCheck?: boolean;
}

export interface DPoPVerificationResult {
  valid: boolean;
  error?: string;
  jti?: string;
  jwk?: Record<string, unknown>;
  claims?: Record<string, unknown>;
  thumbprint?: string;
}

// Global shared replay store for singleton server validation
export const globalDPoPReplayStore = new InMemoryDPoPReplayStore();

/**
 * Helper to compute RFC 9449 access token hash (ath = base64url(sha256(accessToken)))
 */
export function computeAccessTokenHash(accessToken: string): string {
  return crypto.createHash('sha256').update(accessToken).digest('base64url');
}

/**
 * RFC 9449 Demonstrating Proof-of-Possession (DPoP) Manager.
 * Uses real ES256 ECDSA key pairs and JWS compact serialization with embedded public JWK.
 */
export class DPoPManager {
  private publicKeyObject: crypto.KeyObject;
  private privateKeyObject: crypto.KeyObject;
  private publicJwk: Record<string, unknown>;
  private publicKeyPem: string;
  private privateKeyPem: string;
  private replayStore: IDPoPReplayStore;

  constructor(keyPair?: DPoPKeyPair, replayStore?: IDPoPReplayStore) {
    this.replayStore = replayStore || globalDPoPReplayStore;

    if (keyPair) {
      this.publicKeyPem = keyPair.publicKeyPem;
      this.privateKeyPem = keyPair.privateKeyPem;
      this.publicKeyObject = crypto.createPublicKey(keyPair.publicKeyPem);
      this.privateKeyObject = crypto.createPrivateKey(keyPair.privateKeyPem);
    } else {
      const kp = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.publicKeyPem = kp.publicKey;
      this.privateKeyPem = kp.privateKey;
      this.publicKeyObject = crypto.createPublicKey(kp.publicKey);
      this.privateKeyObject = crypto.createPrivateKey(kp.privateKey);
    }

    const exportedJwk = this.publicKeyObject.export({ format: 'jwk' });
    delete (exportedJwk as any).d; // Ensure zero private key components
    this.publicJwk = exportedJwk as Record<string, unknown>;
  }

  public getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  public getPrivateKeyPem(): string {
    return this.privateKeyPem;
  }

  public getPublicJWK(): Record<string, unknown> {
    return this.publicJwk;
  }

  /**
   * Generates a conformant RFC 9449 DPoP Proof Header synchronously.
   * Produces a JWS with typ="dpop+jwt", alg="ES256", and an embedded public JWK without private parameters.
   */
  public generateProofSync(
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    httpUrl: string,
    accessToken?: string,
    customClaims?: { iat?: number; jti?: string }
  ): DPoPProof & { jwt: string; toString(): string } {
    const jti = customClaims?.jti || crypto.randomUUID();
    const iat = customClaims?.iat ?? Math.floor(Date.now() / 1000);

    const ath = accessToken ? computeAccessTokenHash(accessToken) : undefined;

    const header = {
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: this.publicJwk,
    };

    const payload: Record<string, unknown> = {
      htm: httpMethod,
      htu: httpUrl,
      jti,
      iat,
      ...(ath ? { ath } : {}),
    };

    const headerB64 = jose.base64url.encode(JSON.stringify(header));
    const payloadB64 = jose.base64url.encode(JSON.stringify(payload));
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);

    const rawSignature = crypto.sign('SHA256', signingInput, {
      key: this.privateKeyObject,
      dsaEncoding: 'ieee-p1363', // Raw (r || s) 64 bytes per RFC 7515 / RFC 9449 ES256
    });

    const signature = jose.base64url.encode(rawSignature);
    const jwt = `${headerB64}.${payloadB64}.${signature}`;

    logger.debug('Generated RFC 9449 DPoP Proof', {
      action: 'dpop_proof_generation',
      jti,
      htm: httpMethod,
      htu: httpUrl,
    });

    const proofResult = {
      jwt,
      jti,
      htm: httpMethod,
      htu: httpUrl,
      iat,
      ath,
      signature,
      publicKeyJwk: this.publicJwk,
      toString() {
        return jwt;
      },
    };

    return proofResult;
  }

  /**
   * Async wrapper for generateProofSync.
   */
  public async generateProof(
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    httpUrl: string,
    accessToken?: string,
    customClaims?: { iat?: number; jti?: string }
  ): Promise<DPoPProof & { jwt: string; toString(): string }> {
    return this.generateProofSync(httpMethod, httpUrl, accessToken, customClaims);
  }

  /**
   * Validates a received DPoP Proof against expected request context, freshness window,
   * single-use replay cache, and cryptographic signature of the embedded JWK.
   */
  public async verifyProofWithDetails(
    proofInput: string | DPoPProof,
    expectedMethod: string,
    expectedUrl: string,
    options?: DPoPVerificationOptions | string
  ): Promise<DPoPVerificationResult> {
    const opts: DPoPVerificationOptions =
      typeof options === 'object' && options !== null ? options : {};
    const maxAgeSeconds = opts.maxAgeSeconds ?? 60; // RFC 9449 standard freshness (+-60s)
    const replayStore = opts.replayStore || this.replayStore;

    // Extract compact serialized JWT string
    let jwtString = '';
    if (typeof proofInput === 'string') {
      jwtString = proofInput.trim();
    } else if (proofInput && typeof proofInput === 'object') {
      jwtString = proofInput.jwt || (typeof proofInput.toString === 'function' ? proofInput.toString() : '');
    }

    if (!jwtString || typeof jwtString !== 'string') {
      return { valid: false, error: 'DPOP_PROOF_MISSING_OR_EMPTY' };
    }

    // Fail closed on simulated bypass or keyless tokens
    if (jwtString.startsWith('sim_') || jwtString.includes('sim_sig_')) {
      logger.warn('DPoP verification rejected simulated signature bypass token', { jwtString });
      return { valid: false, error: 'DPOP_FORBIDDEN_SIMULATED_TOKEN' };
    }

    try {
      // 1. Decode protected header without verifying yet to inspect JWK and header typ/alg
      const protectedHeader = jose.decodeProtectedHeader(jwtString);

      if (!protectedHeader) {
        return { valid: false, error: 'DPOP_INVALID_HEADER' };
      }

      if (protectedHeader.typ !== 'dpop+jwt') {
        return {
          valid: false,
          error: `DPOP_INVALID_HEADER_TYP: Expected "dpop+jwt", received "${protectedHeader.typ}"`,
        };
      }

      if (protectedHeader.alg !== 'ES256') {
        return {
          valid: false,
          error: `DPOP_INVALID_HEADER_ALG: Expected "ES256", received "${protectedHeader.alg}"`,
        };
      }

      const jwk = protectedHeader.jwk;
      if (!jwk || typeof jwk !== 'object') {
        return { valid: false, error: 'DPOP_MISSING_EMBEDDED_JWK' };
      }

      // Check key type and curve
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
        return { valid: false, error: 'DPOP_INVALID_KEY_TYPE: Must be EC curve P-256' };
      }

      // RFC 9449 Section 4.2: The JWK MUST NOT contain private key components ('d')
      if ('d' in jwk) {
        return { valid: false, error: 'DPOP_SECURITY_VIOLATION: JWK contains private key material' };
      }

      // 2. Import public JWK and verify JWS cryptographic signature
      const importedKey = await jose.importJWK(jwk, 'ES256');
      const { payload } = await jose.jwtVerify(jwtString, importedKey, {
        typ: 'dpop+jwt',
        algorithms: ['ES256'],
      });

      const jti = payload.jti;
      const htm = payload.htm as string;
      const htu = payload.htu as string;
      const iat = payload.iat;

      if (!jti || typeof jti !== 'string') {
        return { valid: false, error: 'DPOP_MISSING_OR_INVALID_JTI' };
      }

      if (!iat || typeof iat !== 'number') {
        return { valid: false, error: 'DPOP_MISSING_OR_INVALID_IAT' };
      }

      // 3. HTTP method matching (case-insensitive)
      if (!htm || htm.toUpperCase() !== expectedMethod.toUpperCase()) {
        return {
          valid: false,
          error: `DPOP_HTM_MISMATCH: Expected "${expectedMethod}", received "${htm}"`,
          jti,
        };
      }

      // 4. HTTP URL matching (normalized URI without query string or hash fragment)
      const normalizeUri = (uri: string): string => {
        try {
          const url = new URL(uri);
          return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
        } catch {
          // If not a full URL, strip query and hash
          return uri.split('?')[0].split('#')[0].replace(/\/+$/, '');
        }
      };

      if (!htu || normalizeUri(htu) !== normalizeUri(expectedUrl)) {
        return {
          valid: false,
          error: `DPOP_HTU_MISMATCH: Expected "${normalizeUri(expectedUrl)}", received "${normalizeUri(htu)}"`,
          jti,
        };
      }

      // 5. Freshness window check (+- maxAgeSeconds)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - iat) > maxAgeSeconds) {
        return {
          valid: false,
          error: `DPOP_STALE_TIMESTAMP: Proof age ${Math.abs(now - iat)}s exceeds freshness window ${maxAgeSeconds}s`,
          jti,
        };
      }

      // 6. Single-use replay protection
      if (!opts.skipReplayCheck) {
        const expiresAt = iat + maxAgeSeconds;
        const isUnseen = await replayStore.recordIfUnseen(jti, expiresAt);
        if (!isUnseen) {
          logger.warn('DPoP single-use replay protection triggered: duplicate JTI detected', { jti });
          return { valid: false, error: 'DPOP_REPLAY_DETECTED', jti };
        }
      }

      // 7. Access token hash (ath) validation if access token was expected
      if (opts.accessToken) {
        const expectedAth = computeAccessTokenHash(opts.accessToken);
        if (payload.ath !== expectedAth) {
          return { valid: false, error: 'DPOP_ATH_MISMATCH', jti };
        }
      }

      const thumbprint = await jose.calculateJwkThumbprint(jwk);

      return {
        valid: true,
        jti,
        jwk: jwk as Record<string, unknown>,
        claims: payload as Record<string, unknown>,
        thumbprint,
      };
    } catch (error: any) {
      logger.warn('DPoP Signature verification failed', { error: error.message || error });
      return {
        valid: false,
        error: `DPOP_VERIFICATION_FAILED: ${error.message || error}`,
      };
    }
  }

  /**
   * Boolean convenience wrapper for verifyProofWithDetails.
   */
  public async verifyProof(
    proof: string | DPoPProof,
    expectedMethod: string,
    expectedUrl: string,
    options?: DPoPVerificationOptions | string
  ): Promise<boolean> {
    const result = await this.verifyProofWithDetails(proof, expectedMethod, expectedUrl, options);
    return result.valid;
  }
}
