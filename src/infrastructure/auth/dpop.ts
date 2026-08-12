import crypto from 'crypto';
import { DPoPProof, DPoPProofSchema } from '../../domain/types';
import { DPoPSignatureError } from '../../domain/errors/domain_errors';
import { logger } from '../logging/logger';

export interface DPoPKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * RFC 9449 Demonstrating Proof-of-Possession (DPoP) Manager.
 * Cryptographically binds OAuth 2.1 access tokens to the runtime key pair of the Machine Customer Agent.
 */
export class DPoPManager {
  private keyPair: DPoPKeyPair;

  constructor(keyPair?: DPoPKeyPair) {
    if (keyPair) {
      this.keyPair = keyPair;
    } else {
      // Generate localized, ephemeral RSA keypair for runtime DPoP proofs
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.keyPair = { publicKeyPem: publicKey, privateKeyPem: privateKey };
    }
  }

  public getPublicKeyPem(): string {
    return this.keyPair.publicKeyPem;
  }

  /**
   * Generates a DPoP Proof Header (RFC 9449) for an outbound HTTP request.
   */
  public generateProof(
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    httpUrl: string,
    accessToken?: string
  ): DPoPProof {
    const jti = crypto.randomUUID();
    const iat = Math.floor(Date.now() / 1000);

    // Compute Access Token Hash (ath) if access token is supplied
    const ath = accessToken
      ? crypto.createHash('sha256').update(accessToken).digest('base64url')
      : undefined;

    const payloadToSign = JSON.stringify({
      jti,
      htm: httpMethod,
      htu: httpUrl,
      iat,
      ...(ath ? { ath } : {}),
    });

    const signer = crypto.createSign('SHA256');
    signer.update(payloadToSign);
    signer.end();
    const signature = signer.sign(this.keyPair.privateKeyPem, 'base64url');

    const proof: DPoPProof = {
      jti,
      htm: httpMethod,
      htu: httpUrl,
      iat,
      ath,
      signature,
      publicKeyJwk: {
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
      },
    };

    logger.debug('Generated RFC 9449 DPoP Proof', {
      action: 'dpop_proof_generation',
      jti,
      htm: httpMethod,
      htu: httpUrl,
    });

    return proof;
  }

  /**
   * Validates a received DPoP Proof against expected request context and public key.
   */
  public verifyProof(
    proof: DPoPProof,
    expectedMethod: string,
    expectedUrl: string,
    publicKeyPem: string
  ): boolean {
    const validated = DPoPProofSchema.safeParse(proof);
    if (!validated.success) {
      throw new DPoPSignatureError(`DPoP proof schema validation failed: ${validated.error.message}`);
    }

    if (proof.htm !== expectedMethod || proof.htu !== expectedUrl) {
      return false;
    }

    // Assert timestamp freshness (must be within +/- 300 seconds)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - proof.iat) > 300) {
      return false;
    }

    const payloadToVerify = JSON.stringify({
      jti: proof.jti,
      htm: proof.htm,
      htu: proof.htu,
      iat: proof.iat,
      ...(proof.ath ? { ath: proof.ath } : {}),
    });

    try {
      const verifier = crypto.createVerify('SHA256');
      verifier.update(payloadToVerify);
      verifier.end();
      return verifier.verify(publicKeyPem, proof.signature, 'base64url');
    } catch (error: any) {
      logger.error('DPoP Signature verification failed', { error: error.message });
      return false;
    }
  }
}
