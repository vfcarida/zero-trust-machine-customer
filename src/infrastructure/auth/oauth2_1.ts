import crypto from 'crypto';
import {
  TokenExchangeRequest,
  TokenExchangeResponse,
  TokenExchangeRequestSchema,
  ActorClaim,
} from '../../domain/types';
import { TokenExchangeError } from '../../domain/errors/domain_errors';
import { logger } from '../logging/logger';

/**
 * OAuth 2.1 & RFC 8693 Token Exchange Implementation for Machine Customers.
 * Handles PKCE verifiers stored exclusively in ephemeral memory and nested delegation chains via the `act` claim.
 */
export class OAuth21Client {
  private ephemeralCodeVerifiers: Map<string, string> = new Map();

  /**
   * Generates a Cryptographic PKCE Code Challenge (S256) and stores the Code Verifier in ephemeral memory.
   */
  public generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Store in ephemeral memory indexed by code challenge
    this.ephemeralCodeVerifiers.set(codeChallenge, codeVerifier);

    return { codeVerifier, codeChallenge };
  }

  /**
   * Retrieves and immediately purges a PKCE code verifier from ephemeral memory.
   */
  public consumeCodeVerifier(codeChallenge: string): string | undefined {
    const verifier = this.ephemeralCodeVerifiers.get(codeChallenge);
    if (verifier) {
      this.ephemeralCodeVerifiers.delete(codeChallenge);
    }
    return verifier;
  }

  /**
   * Executes RFC 8693 Token Exchange to request ephemeral, audience-bound access tokens.
   * Encapsulates the actor (`act`) claim to preserve delegation chains: (Human User -> Machine Customer -> Downstream API).
   *
   * NOTE (ZTMC-T08): This is a simulated local exchange implementation for demonstration
   * and unit testing. Outputs are explicitly labeled `simulated: true`. No external
   * Authorization Server (AS) validates the subject token or enforces `may_act` policies.
   */
  public async performTokenExchange(
    request: TokenExchangeRequest,
    delegatingActor?: ActorClaim
  ): Promise<TokenExchangeResponse> {
    const validatedRequest = TokenExchangeRequestSchema.safeParse(request);
    if (!validatedRequest.success) {
      throw new TokenExchangeError(`Invalid Token Exchange Request: ${validatedRequest.error.message}`);
    }

    logger.info('Executing RFC 8693 Token Exchange (Simulated Local Dev)', {
      action: 'rfc8693_token_exchange',
      audience: request.audience,
      subjectToken: request.subjectToken.substring(0, 10) + '...',
      hasActorClaim: Boolean(delegatingActor),
      simulated: true,
      provenance: 'simulated-local-dev',
    });

    // Build nested actor claim chain
    const actorChain: ActorClaim = delegatingActor
      ? {
          sub: 'spiffe://zero-trust.machine.customer/workload/machine-customer-agent',
          iss: 'https://auth.zero-trust.machine.customer',
          act: delegatingActor, // Preserves nested chain
        }
      : {
          sub: 'spiffe://zero-trust.machine.customer/workload/machine-customer-agent',
          iss: 'https://auth.zero-trust.machine.customer',
        };

    // Ephemeral DPoP-bound Access Token generation
    const ephemeralToken = `dpop_at_${crypto.randomBytes(24).toString('hex')}`;

    return {
      accessToken: ephemeralToken,
      issuedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      tokenType: 'DPoP',
      expiresIn: 300, // 5-minute ephemeral lifespan
      scope: request.scope || 'm2m:procurement:write',
      actor: actorChain,
      simulated: true,
      provenance: 'simulated-local-dev',
      notes:
        'RFC 8693 token exchange simulated locally without upstream Authorization Server (AS) validation. No may_act policy enforced by external AS.',
    };
  }
}
