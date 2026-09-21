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
