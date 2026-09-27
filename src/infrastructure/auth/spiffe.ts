import crypto from 'crypto';
import { SpiffeId, SpiffeIdSchema } from '../../domain/types';
import { SpiffeIdentityError } from '../../domain/errors/domain_errors';
import { logger } from '../logging/logger';

/**
 * Synthetic Workload SVID Representation.
 *
 * NOTE (ZTMC-T08): This is a synthetic mock representing SPIFFE workload identity in
 * local development and sandbox mode. It emits a raw RSA-2048 SPKI public key (PEM)
 * rather than an ASN.1 X.509 certificate. No connection to a SPIRE Workload API daemon
 * (e.g. `unix:///run/spire/sockets/agent.sock`) is established in this standalone mode.
 */
export interface SyntheticWorkloadSvid {
  spiffeId: SpiffeId;
  /**
   * Raw RSA-2048 SPKI public key in PEM format.
   * NOTE: This is a raw cryptographic public key (`-----BEGIN PUBLIC KEY-----`),
   * NOT an X.509 certificate (`-----BEGIN CERTIFICATE-----`).
   */
  rawPublicKeyPem: string;
  privateKeyPem: string;
  /**
   * Synthetic SPIFFE trust bundle representation (mock for standalone demonstration).
   */
  trustBundlePem: string;
  expiresAt: string;
  /** Explicit simulation indicator (ZTMC-T08) */
  simulated: true;
  /** Explicit synthetic indicator (ZTMC-T08) */
  synthetic: true;
  /** Provenance tag */
  provenance: 'synthetic-local-dev';
  /** Diagnostic note explaining synthetic nature */
  notes: string;
}

/** Backward compatibility alias */
export type X509Svid = SyntheticWorkloadSvid;

export interface SpiffeValidationOptions {
  expectedTrustDomain?: string;
  expectedWorkloadPrefix?: string;
  allowSubdomains?: boolean;
}

export interface SpiffeValidationResult {
  isValid: boolean;
  trustDomain?: string;
  path?: string;
  workloadId?: string;
  error?: string;
}

/**
 * Validates and parses a SPIFFE ID against the official SPIFFE Standard Specification (NIST SP 800-204A).
 *
 * Rules:
 * 1. Must use 'spiffe:' scheme.
 * 2. Trust domain must be valid lowercase DNS hostname (RFC 1123) without port, userinfo, or query.
 * 3. Path must start with '/' and contain non-empty segments without trailing slash.
 * 4. Traversal segments ('.' or '..') are strictly rejected.
 * 5. Validates against expectedTrustDomain and expectedWorkloadPrefix when configured.
 */
export function validateSpiffeWorkloadId(
  rawSpiffeId: string,
  options?: SpiffeValidationOptions
): SpiffeValidationResult {
  if (!rawSpiffeId || typeof rawSpiffeId !== 'string') {
    return { isValid: false, error: 'SPIFFE ID must be a non-empty string' };
  }

  // Pre-URL-normalization check for dot-segments / directory traversal
  if (
    rawSpiffeId.includes('/../') ||
    rawSpiffeId.endsWith('/..') ||
    rawSpiffeId.includes('/./') ||
    rawSpiffeId.endsWith('/.')
  ) {
    return { isValid: false, error: 'SPIFFE ID path must not contain directory traversal segments' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawSpiffeId);
  } catch {
    return { isValid: false, error: 'Malformed URI syntax' };
  }

  if (parsedUrl.protocol !== 'spiffe:') {
    return { isValid: false, error: `Invalid scheme: expected "spiffe:", got "${parsedUrl.protocol}"` };
  }

  if (parsedUrl.search) {
    return { isValid: false, error: 'SPIFFE ID must not contain a query string' };
  }
  if (parsedUrl.hash) {
    return { isValid: false, error: 'SPIFFE ID must not contain a fragment' };
  }
  if (parsedUrl.username || parsedUrl.password) {
    return { isValid: false, error: 'SPIFFE ID must not contain userinfo' };
  }
  if (parsedUrl.port) {
    return { isValid: false, error: 'SPIFFE ID trust domain must not specify a port' };
  }

  const trustDomain = parsedUrl.hostname;
  if (!trustDomain) {
    return { isValid: false, error: 'Missing trust domain' };
  }

  const dnsHostnameRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
  if (!dnsHostnameRegex.test(trustDomain)) {
    return { isValid: false, error: `Invalid trust domain format: "${trustDomain}"` };
  }

  const path = parsedUrl.pathname;
  if (!path || path === '/') {
    return { isValid: false, error: 'SPIFFE ID path must contain at least one segment' };
  }
  if (path.endsWith('/') && path !== '/') {
    return { isValid: false, error: 'SPIFFE ID path must not end with a trailing slash' };
  }
  if (path.includes('//')) {
    return { isValid: false, error: 'SPIFFE ID path must not contain empty segments' };
  }

  const segments = path.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      return { isValid: false, error: 'SPIFFE ID path must not contain directory traversal segments' };
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(seg)) {
      return { isValid: false, error: `SPIFFE ID path segment "${seg}" contains invalid characters` };
    }
  }

  if (options?.expectedTrustDomain) {
    const expected = options.expectedTrustDomain.toLowerCase();
    if (options.allowSubdomains) {
      if (trustDomain !== expected && !trustDomain.endsWith(`.${expected}`)) {
        return {
          isValid: false,
          error: `Trust domain "${trustDomain}" does not match or belong to expected domain "${expected}"`,
        };
      }
    } else if (trustDomain !== expected) {
      return {
        isValid: false,
        error: `Trust domain "${trustDomain}" does not match expected domain "${expected}"`,
      };
    }
  }

  if (options?.expectedWorkloadPrefix) {
    if (!path.startsWith(options.expectedWorkloadPrefix)) {
      return {
        isValid: false,
        error: `SPIFFE ID path "${path}" does not start with expected prefix "${options.expectedWorkloadPrefix}"`,
      };
    }
  }

  const workloadId = segments[segments.length - 1];

  return {
    isValid: true,
    trustDomain,
    path,
    workloadId,
  };
}

/**
 * SPIFFE/SPIRE Synthetic Workload Identity Handler.
 *
 * Provides a synthetic representation of SPIFFE workload identity concepts (NIST SP 800-204)
 * for standalone demonstrations and unit testing without requiring a running SPIRE agent daemon.
 * Explicitly labeled as synthetic/simulated.
 */
export class SpiffeWorkloadIdentity {
  private trustDomain: string;
  private currentSvid?: SyntheticWorkloadSvid;

  constructor(trustDomain = 'zero-trust.machine.customer') {
    this.trustDomain = trustDomain;
  }

  /**
   * Generates a synthetic SPIFFE workload SVID keypair for local sandbox development.
   * Explicitly labeled as synthetic (no SPIRE agent daemon dialed).
   */
  public async fetchX509Svid(): Promise<SyntheticWorkloadSvid> {
    const rawSpiffeId = `spiffe://${this.trustDomain}/workload/machine-customer-agent`;
    
    // Strict SPIFFE validation check
    const validation = validateSpiffeWorkloadId(rawSpiffeId, {
      expectedTrustDomain: this.trustDomain,
    });
    if (!validation.isValid) {
      throw new SpiffeIdentityError(`Invalid SPIFFE ID: ${validation.error}`);
    }

    const parsedId = SpiffeIdSchema.safeParse(rawSpiffeId);
    if (!parsedId.success) {
      throw new SpiffeIdentityError(`Invalid SPIFFE ID format: ${rawSpiffeId}`);
    }

    logger.info('Acquiring SPIFFE Synthetic Workload Identity (Standalone Dev Mode)', {
      action: 'spiffe_fetch_svid',
      spiffeId: rawSpiffeId,
      trustDomain: this.trustDomain,
      simulated: true,
      synthetic: true,
      provenance: 'synthetic-local-dev',
    });

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const svid: SyntheticWorkloadSvid = {
      spiffeId: parsedId.data,
      rawPublicKeyPem: publicKey,
      privateKeyPem: privateKey,
      trustBundlePem:
        '-----BEGIN SYNTHETIC-SPIFFE-TRUST-BUNDLE-----\nSYNTHETIC_MOCK_SPIFFE_TRUST_ROOT\n-----END SYNTHETIC-SPIFFE-TRUST-BUNDLE-----',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      simulated: true,
      synthetic: true,
      provenance: 'synthetic-local-dev',
      notes:
        'Synthetic SPIFFE SVID generated locally. Emits raw SPKI public key (not an X.509 certificate); no SPIRE Workload API daemon was connected.',
    };

    this.currentSvid = svid;
    return svid;
  }

  public getActiveSvid(): SyntheticWorkloadSvid | undefined {
    return this.currentSvid;
  }
}
