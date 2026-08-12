import { z } from 'zod';

/**
 * Environment Variable Schema enforcing Zero-Trust configuration principles.
 * Purges static keys and requires environment-driven configuration with strict fallbacks.
 */
export const EnvironmentConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Zero Trust Network & OpenZiti Config
  ZITI_IDENTITY_FILE: z.string().default('ziti-identity.json'),
  ZITI_SERVICE_NAME: z.string().default('ap4m-settlement-service'),
  
  // Non-Human Identity (NHI) & SPIFFE / SPIRE Config
  SPIFFE_ENDPOINT_SOCKET: z.string().default('unix:///tmp/spire-agent/public/api.sock'),
  SPIFFE_TRUST_DOMAIN: z.string().default('zero-trust.machine.customer'),
  
  // OPA Dynamic Authorization Config
  OPA_SERVER_URL: z.string().url().default('http://localhost:8181/v1/data/machine_customer/authz'),
  OPA_ENFORCE_STRICT: z.boolean().default(true),
  
  // OAuth 2.1 & RFC 8693 Token Exchange Config
  OAUTH_AUTHORIZATION_SERVER: z.string().url().default('http://localhost:8080/oauth2/token'),
  OAUTH_CLIENT_ID: z.string().default('machine-customer-agent-001'),
  
  // AI Kernel & LLM Adapter Config
  LLM_PROVIDER: z.enum(['litellm', 'openai', 'anthropic', 'gemma-local']).default('gemma-local'),
  LLM_MODEL_NAME: z.string().default('gemma-4-e2b'),
  LLM_API_BASE_URL: z.string().optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

/**
 * Safe Environment Configuration Loader
 */
export function loadEnvironmentConfig(envOverride?: Record<string, string | undefined>): EnvironmentConfig {
  const source = envOverride || (typeof process !== 'undefined' ? process.env : {});
  const parsed = EnvironmentConfigSchema.safeParse(source);

  if (!parsed.success) {
    console.error('❌ Environment configuration validation failed:', parsed.error.format());
    throw new Error(`Configuration Error: ${parsed.error.message}`);
  }

  return parsed.data;
}

export const envConfig = loadEnvironmentConfig();
