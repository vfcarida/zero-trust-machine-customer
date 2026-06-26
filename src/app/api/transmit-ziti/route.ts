import { NextResponse } from 'next/server';
import { transmitPayloadOverZiti } from '@/lib/ziti_server';
import { verifyX402Payload } from '@/lib/agent_pay_protocol';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { payload, publicKey } = body;

    if (!payload || !publicKey) {
      return NextResponse.json(
        { success: false, error: 'Missing payment payload or agent public key.' },
        { status: 400 }
      );
    }

    // 1. Redundant signature verification on the API boundary (defense-in-depth)
    const isSignatureValid = verifyX402Payload(payload, publicKey);
    if (!isSignatureValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cryptographic signature verification failed at the API Gateway.',
          logs: [`[${new Date().toISOString()}] ❌ Rejecting request: Invalid payload signature.`] 
        },
        { status: 401 }
      );
    }

    // 2. Transmit the payload over the OpenZiti overlay network
    const zitiResult = await transmitPayloadOverZiti('ap4m-settlement-service', payload);

    if (!zitiResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: zitiResult.error || 'Failed to transmit via OpenZiti', 
          logs: zitiResult.logs 
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      logs: zitiResult.logs,
      responsePayload: zitiResult.responsePayload
    });

  } catch (error: any) {
    console.error('Error in transmit-ziti API route:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Internal Server Error during Ziti transmission.',
        logs: [`[${new Date().toISOString()}] ❌ System crash: ${error.message || error}`] 
      },
      { status: 500 }
    );
  }
}
