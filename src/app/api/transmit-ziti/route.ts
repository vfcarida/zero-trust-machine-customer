import { NextResponse } from 'next/server';
import { transmitPayloadOverZiti } from '@/lib/ziti_server';
import { verifyX402Payload } from '@/lib/agent_pay_protocol';
import { X402PayloadSchema } from '@/domain/types';
import { logger } from '@/infrastructure/logging/logger';

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { payload, publicKey } = body;

    logger.info('API Gateway received transmit-ziti request', {
      action: 'api_transmit_ziti',
      merchantId: payload?.merchantId,
    });

    if (!payload || !publicKey) {
      return NextResponse.json(
        { success: false, error: 'Missing payment payload or agent public key.' },
        { status: 400 }
      );
    }

    // 1. Zod Schema Boundary Validation
    const validatedPayload = X402PayloadSchema.safeParse(payload);
    if (!validatedPayload.success) {
      logger.warn('API Gateway rejected invalid payload schema', {
        errors: validatedPayload.error.format(),
      });
      return NextResponse.json(
        {
          success: false,
          error: `Payload validation failed: ${validatedPayload.error.message}`,
          logs: [`[${new Date().toISOString()}] ❌ Rejecting request: Invalid payload schema.`],
        },
        { status: 422 }
      );
    }

    // 2. Cryptographic signature verification at API boundary (defense-in-depth)
    const isSignatureValid = verifyX402Payload(payload, publicKey);
    if (!isSignatureValid) {
      logger.warn('API Gateway rejected invalid agent signature', {
        agentId: payload.agentId,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Cryptographic signature verification failed at the API Gateway.',
          logs: [`[${new Date().toISOString()}] ❌ Rejecting request: Invalid payload signature.`],
        },
        { status: 401 }
      );
    }

    // 3. Transmit payload over OpenZiti dark network overlay
    const zitiResult = await transmitPayloadOverZiti('ap4m-settlement-service', payload);

    if (!zitiResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: zitiResult.error || 'Failed to transmit via OpenZiti',
          logs: zitiResult.logs,
        },
        { status: 502 }
      );
    }

    logger.info('API Gateway successfully processed Ziti transmission', {
      durationMs: Date.now() - startTime,
      transactionId: zitiResult.responsePayload?.transactionId,
    });

    return NextResponse.json({
      success: true,
      logs: zitiResult.logs,
      responsePayload: zitiResult.responsePayload,
    });
  } catch (error: any) {
    logger.error('Error in transmit-ziti API route', { error: error.message || error });
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal Server Error during Ziti transmission.',
        logs: [`[${new Date().toISOString()}] ❌ Gateway error: ${error.message || error}`],
      },
      { status: 500 }
    );
  }
}
