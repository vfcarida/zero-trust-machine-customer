import {
  TokenExchangeRequest,
  TokenExchangeResponse,
  ActorClaim,
} from '../../domain/types';
import { OAuth21Client } from '../../infrastructure/auth/oauth2_1';
import { logger } from '../../infrastructure/logging/logger';

export interface ExchangeTokenCommand {
  subjectToken: string;
  audience: string;
  scope?: string;
  delegatingActor?: ActorClaim;
}

/**
 * Use Case: RFC 8693 Token Exchange.
 * Orchestrates requesting ephemeral, audience-bound access tokens while preserving actor claim delegation chains.
 */
export class ExchangeTokenUseCase {
  private oauthClient: OAuth21Client;

  constructor(oauthClient?: OAuth21Client) {
    this.oauthClient = oauthClient || new OAuth21Client();
  }

  public async execute(command: ExchangeTokenCommand): Promise<TokenExchangeResponse> {
    logger.info('Executing ExchangeTokenUseCase for delegation token exchange', {
      audience: command.audience,
      scope: command.scope,
    });

    const { codeChallenge } = this.oauthClient.generatePKCE();

    const request: TokenExchangeRequest = {
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subjectToken: command.subjectToken,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      audience: command.audience,
      scope: command.scope || 'm2m:procurement:write',
      pkceChallenge: codeChallenge,
      pkceMethod: 'S256',
    };

    return this.oauthClient.performTokenExchange(request, command.delegatingActor);
  }
}
