import { z } from 'zod';

/**
 * Value Object: Ucents (Micro-cents, 1 USD = 1,000,000 ucents)
 */
export const UcentsSchema = z.number().int().nonnegative();
export type Ucents = z.infer<typeof UcentsSchema>;

/**
 * Value Object: DPoP Proof details (RFC 9449)
 */
export const DPoPProofSchema = z.object({
  jwt: z.string().min(1).optional(),
  jti: z.string().min(1),
  htm: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  htu: z.string().min(1),
  iat: z.number().int(),
  ath: z.string().optional(), // Access Token Hash
  signature: z.string().optional(),
  publicKeyJwk: z.record(z.unknown()),
});
export type DPoPProof = z.infer<typeof DPoPProofSchema>;

/**
 * Value Object: SPIFFE ID (NIST SP 800-204 Workload Identity)
 */
export const SpiffeIdSchema = z.string().regex(/^spiffe:\/\/[a-zA-Z0-9._-]+\/workload\/[a-zA-Z0-9._-]+$/);
export type SpiffeId = z.infer<typeof SpiffeIdSchema>;

/**
 * Value Object: Taint Envelope Status & Metadata (OWASP Agentic Top 10)
 */
export const TaintStatusSchema = z.enum(['UNTAINTED', 'TAINTED', 'SANITIZED']);
export type TaintStatus = z.infer<typeof TaintStatusSchema>;

export const TrustedMetadataEnvelopeSchema = z.object({
  payloadId: z.string(),
  source: z.string(),
  content: z.string(),
  taintStatus: TaintStatusSchema,
  signature: z.string().optional(),
  timestamp: z.string().datetime(),
  requiresHITL: z.boolean(),
});
export type TrustedMetadataEnvelope = z.infer<typeof TrustedMetadataEnvelopeSchema>;

/**
 * Entity: Mastercard AP4M x402 Protocol Payload
 */
export const X402PayloadSchema = z.object({
  x402Version: z.string().min(1),
  agentId: z.string().min(1),
  merchantId: z.string().min(1),
  intent: z.string().min(1),
  amountUcents: UcentsSchema.refine((val) => val > 0, {
    message: 'Amount in ucents must be strictly positive',
  }),
  currency: z.string().length(3),
  timestamp: z.string().datetime(),
  nonce: z.string().min(8),
  signature: z.string().min(1),
  dpopProof: z.string().optional(),
});
export type X402Payload = z.infer<typeof X402PayloadSchema>;

/**
 * Entity: Payment Settlement Response (x402 / AP4M)
 */
export const X402SettlementResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string(),
  settledAmountUcents: UcentsSchema,
  currency: z.string(),
  merchantId: z.string(),
  authCode: z.string(),
  timestamp: z.string(),
  zitiSecured: z.boolean(),
  error: z.string().optional(),
  idempotentReplay: z.boolean().optional(),
  state: z.string().optional(),
  compensationId: z.string().optional(),
});
export type X402SettlementResponse = z.infer<typeof X402SettlementResponseSchema>;

/**
 * Entity: RFC 8693 OAuth 2.1 Token Exchange Request & Response
 */
export type ActorClaim = {
  sub: string;
  iss: string;
  act?: ActorClaim;
};

export const ActorClaimSchema: z.ZodType<ActorClaim> = z.lazy(() =>
  z.object({
    sub: z.string(),
    iss: z.string(),
    act: ActorClaimSchema.optional(),
  })
);

export const TokenExchangeRequestSchema = z.object({
  grantType: z.literal('urn:ietf:params:oauth:grant-type:token-exchange'),
  subjectToken: z.string(),
  subjectTokenType: z.string(),
  actorToken: z.string().optional(),
  actorTokenType: z.string().optional(),
  requestedTokenType: z.string(),
  audience: z.string(),
  scope: z.string().optional(),
  pkceChallenge: z.string(),
  pkceMethod: z.literal('S256'),
});
export type TokenExchangeRequest = z.infer<typeof TokenExchangeRequestSchema>;

export const TokenExchangeResponseSchema = z.object({
  accessToken: z.string(),
  issuedTokenType: z.string(),
  tokenType: z.literal('DPoP'),
  expiresIn: z.number().int().positive(),
  scope: z.string(),
  actor: ActorClaimSchema.optional(),
  simulated: z.boolean().optional(),
  provenance: z.string().optional(),
  notes: z.string().optional(),
});
export type TokenExchangeResponse = z.infer<typeof TokenExchangeResponseSchema>;

/**
 * Entity: Non-Human Identity (NHI) Profile
 */
export const NhiIdentitySchema = z.object({
  spiffeId: SpiffeIdSchema,
  clientId: z.string(),
  publicKeyPem: z.string(),
  privateKeyPem: z.string(),
  dpopKeyPair: z.object({
    publicKey: z.string(),
    privateKey: z.string(),
  }),
  activeTokens: z.map(z.string(), TokenExchangeResponseSchema).optional(),
});
export type NhiIdentity = z.infer<typeof NhiIdentitySchema>;

/**
 * Entity: Guard Settings & Policy Controls
 */
export const GuardSettingsSchema = z.object({
  enabled: z.boolean(),
  dailySpendLimitUcents: UcentsSchema,
  allowlist: z.array(z.string()),
  maxRatePerMinute: z.number().int().positive().optional(),
});
export type GuardSettings = z.infer<typeof GuardSettingsSchema>;
