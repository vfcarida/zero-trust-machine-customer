import { describe, it, expect } from 'vitest';
import { OAuth21Client } from '../../infrastructure/auth/oauth2_1';

describe('OAuth 2.1 & RFC 8693 Token Exchange Handler', () => {
  it('should generate PKCE S256 code challenge and consume verifier from ephemeral memory', () => {
    const client = new OAuth21Client();
    const { codeVerifier, codeChallenge } = client.generatePKCE();

    expect(codeVerifier).toBeDefined();
    expect(codeChallenge).toBeDefined();

    const consumed = client.consumeCodeVerifier(codeChallenge);
    expect(consumed).toBe(codeVerifier);

    // Ephemeral memory check: second consumption must return undefined
    const secondConsumed = client.consumeCodeVerifier(codeChallenge);
    expect(secondConsumed).toBeUndefined();
  });

  it('should perform token exchange and include actor claims in delegation chain', async () => {
    const client = new OAuth21Client();
    const humanActor = {
      sub: 'usr_human_vinicius',
      iss: 'https://auth.company.com',
    };

    const tokenResponse = await client.performTokenExchange(
      {
        grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subjectToken: 'subject_token_123',
        subjectTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        audience: 'https://api.merchant.com/x402',
        pkceChallenge: 'challenge_123',
        pkceMethod: 'S256',
      },
      humanActor
    );

    expect(tokenResponse.accessToken).toBeDefined();
    expect(tokenResponse.tokenType).toBe('DPoP');
    expect(tokenResponse.actor).toBeDefined();
    expect(tokenResponse.actor?.act?.sub).toBe('usr_human_vinicius');
  });
});
