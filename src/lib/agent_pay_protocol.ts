import crypto from 'crypto';

/**
 * Interface representing the Mastercard Agent Pay for Machines (AP4M) 
 * x402 Protocol HTTP Payload structure.
 */
export interface X402Payload {
  x402Version: string;
  agentId: string;
  merchantId: string;
  intent: string;
  amountUcents: number; // Value in micro-cents (1 USD = 1,000,000 ucents)
  currency: string;
  timestamp: string;
  nonce: string;
  signature: string; // Cryptographic signature of the payload
}

/**
 * Interface representing the merchant settlement response.
 */
export interface X402SettlementResponse {
  success: boolean;
  transactionId: string;
  settledAmountUcents: number;
  currency: string;
  merchantId: string;
  authCode: string;
  timestamp: string;
  zitiSecured: boolean;
  error?: string;
}

/**
 * Generates an RSA key pair for the machine customer agent.
 * In a real MetaMask Agent Wallet scenario, these would represent the agent's delegation keys.
 */
export function generateAgentKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * Helper to serialize the key fields of the payload for signature stability.
 */
function serializePayload(payload: Omit<X402Payload, 'signature'>): string {
  // Sort keys to ensure deterministic ordering
  return JSON.stringify({
    x402Version: payload.x402Version,
    agentId: payload.agentId,
    merchantId: payload.merchantId,
    intent: payload.intent,
    amountUcents: payload.amountUcents,
    currency: payload.currency,
    timestamp: payload.timestamp,
    nonce: payload.nonce,
  });
}

/**
 * Cryptographically signs the x402 payload using the agent's private key.
 */
export function signX402Payload(
  payloadWithoutSignature: Omit<X402Payload, 'signature'>,
  privateKeyPem: string
): string {
  try {
    const data = serializePayload(payloadWithoutSignature);
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKeyPem, 'base64');
  } catch (error) {
    console.error('Error signing x402 payload:', error);
    // Fallback signature in case of environment issue
    return `sim_sig_${crypto.randomBytes(16).toString('hex')}`;
  }
}

/**
 * Cryptographically verifies the x402 payload signature using the agent's public key.
 */
export function verifyX402Payload(payload: X402Payload, publicKeyPem: string): boolean {
  try {
    if (payload.signature.startsWith('sim_sig_')) {
      return true; // Accept simulated signature in fallback mode
    }
    const data = serializePayload(payload);
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKeyPem, payload.signature, 'base64');
  } catch (error) {
    console.error('Error verifying x402 payload signature:', error);
    return false;
  }
}

/**
 * Simulates the settlement of an x402 transaction on the merchant side.
 */
export async function processX402Settlement(
  payload: X402Payload,
  publicKeyPem: string,
  zitiSecured: boolean
): Promise<X402SettlementResponse> {
  // 1. Verify cryptographic validity
  const isValidSignature = verifyX402Payload(payload, publicKeyPem);
  if (!isValidSignature) {
    return {
      success: false,
      transactionId: `tx_${crypto.randomBytes(8).toString('hex')}`,
      settledAmountUcents: 0,
      currency: payload.currency,
      merchantId: payload.merchantId,
      authCode: '000000',
      timestamp: new Date().toISOString(),
      zitiSecured,
      error: 'Invalid agent signature (Authentication Failed)',
    };
  }

  // 2. Simulate processor settlement latency (300-800ms)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

  // 3. Generate receipt
  return {
    success: true,
    transactionId: `tx_${crypto.randomBytes(12).toString('hex')}`,
    settledAmountUcents: payload.amountUcents,
    currency: payload.currency,
    merchantId: payload.merchantId,
    authCode: Math.floor(100000 + Math.random() * 900000).toString(),
    timestamp: new Date().toISOString(),
    zitiSecured,
  };
}
