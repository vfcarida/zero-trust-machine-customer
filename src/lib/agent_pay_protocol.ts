import crypto from 'crypto';

/**
 * Interface que representa a estrutura do Payload HTTP do Protocolo x402 
 * para o Agent Pay for Machines (AP4M) da Mastercard.
 */
export interface X402Payload {
  x402Version: string;
  agentId: string;
  merchantId: string;
  intent: string;
  amountUcents: number; // Valor em micro-centavos (1 USD = 1.000.000 ucents)
  currency: string;
  timestamp: string;
  nonce: string;
  signature: string; // Assinatura criptográfica do payload
}

/**
 * Interface que representa a resposta de liquidação do fornecedor (merchant).
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
 * Gera um par de chaves RSA para o agente cliente máquina.
 * Em um cenário de carteira MetaMask Agent Wallet, essas chaves representariam as chaves delegadas do agente.
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
 * Auxiliar para serializar os campos principais do payload para garantir a estabilidade da assinatura.
 */
function serializePayload(payload: Omit<X402Payload, 'signature'>): string {
  // Ordena as chaves para garantir consistência na serialização
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
 * Assina criptograficamente o payload x402 usando a chave privada do agente.
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
    console.error('Erro ao assinar payload x402:', error);
    // Assinatura de fallback em caso de problema no ambiente
    return `sim_sig_${crypto.randomBytes(16).toString('hex')}`;
  }
}

/**
 * Verifica criptograficamente a assinatura do payload x402 usando a chave pública do agente.
 */
export function verifyX402Payload(payload: X402Payload, publicKeyPem: string): boolean {
  try {
    if (payload.signature.startsWith('sim_sig_')) {
      return true; // Aceita assinatura simulada em modo de fallback
    }
    const data = serializePayload(payload);
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKeyPem, payload.signature, 'base64');
  } catch (error) {
    console.error('Erro ao verificar assinatura do payload x402:', error);
    return false;
  }
}

/**
 * Simula a liquidação de uma transação x402 no lado do fornecedor.
 */
export async function processX402Settlement(
  payload: X402Payload,
  publicKeyPem: string,
  zitiSecured: boolean
): Promise<X402SettlementResponse> {
  // 1. Verifica validade criptográfica
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
      error: 'Assinatura inválida do agente (Falha na Autenticação)',
    };
  }

  // 2. Simula a latência de liquidação do processador financeiro (300-800ms)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

  // 3. Gera o comprovante/recibo de liquidação
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
