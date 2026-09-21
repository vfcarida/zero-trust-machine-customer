import { NextResponse } from 'next/server';
import { transmitPayloadOverZiti } from '@/lib/ziti_server';
import { verifyX402Payload } from '@/lib/agent_pay_protocol';
import { OPAClient } from '@/infrastructure/authorization/opa_client';
import { DPoPManager } from '@/infrastructure/auth/dpop';
import { X402PayloadSchema } from '@/domain/types';
import { defaultSpendLedger } from '@/domain/services/spend_ledger';
import { logger } from '@/infrastructure/logging/logger';

const routeDPoPManager = new DPoPManager();

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

    if (!payload.signature || typeof payload.signature !== 'string' || !payload.signature.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or empty cryptographic signature in payload.',
          logs: [`[${new Date().toISOString()}] ❌ Rejecting request: Missing payload signature.`],
        },
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

    // 2.5. RFC 9449 Demonstrating Proof-of-Possession (DPoP) Verification
    const dpopHeader =
      req.headers?.get?.('DPoP') ||
      req.headers?.get?.('dpop') ||
      body.dpopProof ||
      payload.dpopProof;

    if (dpopHeader) {
      const dpopResult = await routeDPoPManager.verifyProofWithDetails(
        dpopHeader,
        req.method || 'POST',
        'http://localhost:3000/api/transmit-ziti'
      );

      if (!dpopResult.valid) {
        logger.warn('API Gateway rejected invalid DPoP proof', {
          error: dpopResult.error,
          jti: dpopResult.jti,
        });
        return NextResponse.json(
          {
            success: false,
            error: `DPoP proof verification failed: ${dpopResult.error}`,
            logs: [`[${new Date().toISOString()}] ❌ Rejecting request: DPoP proof verification failed (${dpopResult.error}).`],
          },
          { status: 401 }
        );
      }
      logger.info('API Gateway successfully verified RFC 9449 DPoP proof', {
        jti: dpopResult.jti,
        thumbprint: dpopResult.thumbprint,
      });
    }

    // 3. Dynamic Policy-as-Code Authorization via OPA (fail-closed in strict mode)
    const currentDailySpend = await defaultSpendLedger.getDailySpendUcents();
    const opaClient = new OPAClient();
    const opaDecision = await opaClient.evaluateAuthorization({
      action: 'execute_transaction',
      transaction: payload,
      currentDailySpendUcents: currentDailySpend,
      guardSettings: {
        enabled: true,
        dailySpendLimitUcents: 50000000,
        allowlist: ['aws_compute', 'partssource_corp', 'google_cloud_m2m', 'mcmaster_carr'],
        maxRatePerMinute: 60,
      },
      taintStatus: 'UNTAINTED',
    });

    if (!opaDecision.allow) {
      logger.warn('API Gateway blocked transaction via OPA Policy-as-Code', {
        reasons: opaDecision.reasons,
        provenance: opaDecision.provenance,
        agentId: payload.agentId,
      });
      return NextResponse.json(
        {
          success: false,
          error: `OPA Policy Authorization Denied: ${opaDecision.reasons.join(', ')}`,
          logs: [`[${new Date().toISOString()}] ❌ Policy Denied (${opaDecision.provenance}): ${opaDecision.reasons.join(', ')}`],
        },
        { status: 403 }
      );
    }

    // 4. Transmit payload over OpenZiti dark network overlay (settlement lifecycle executed behind the dark mesh)
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

    logger.info('API Gateway successfully processed Ziti transmission & settlement', {
      durationMs: Date.now() - startTime,
      transactionId: zitiResult.responsePayload?.transactionId,
    });

    return NextResponse.json({
      success: true,
      logs: zitiResult.logs,
      responsePayload: zitiResult.responsePayload,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error in transmit-ziti API route', { error: errorMsg });
    return NextResponse.json(
      {
        success: false,
        error: errorMsg || 'Internal Server Error during Ziti transmission.',
        logs: [`[${new Date().toISOString()}] ❌ Gateway error: ${errorMsg}`],
      },
      { status: 500 }
    );
  }
}
