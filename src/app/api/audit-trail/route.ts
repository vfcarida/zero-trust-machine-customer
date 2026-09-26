import { NextResponse } from 'next/server';
import { globalAuditTrail, AuditEventType } from '@/infrastructure/logging/audit_trail';
import { logger } from '@/infrastructure/logging/logger';

/**
 * API Route: /api/audit-trail
 *
 * NIST SP 800-207 §3.4 Continuous Diagnostics & Mitigation:
 * - Query and stream the cryptographic SHA-256 hash-chained audit ledger.
 * - On-demand verification of chain integrity (detects retroactive tampering, deletion, or reordering).
 * - Direct export as standard JSON-Lines (NDJSON) for SIEM ingestion (Splunk, Elastic, Sentinel).
 */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format')?.toLowerCase();

    // 1. JSON-Lines streaming export for SIEM pipelines
    if (format === 'jsonl' || format === 'ndjson') {
      const jsonlContent = globalAuditTrail.exportJsonLines();
      return new Response(jsonlContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': 'attachment; filename="audit_trail.jsonl"',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // 2. Standard JSON response with verification summary
    const records = globalAuditTrail.getHistory();
    const verification = globalAuditTrail.verifyIntegrity();

    return NextResponse.json(
      {
        success: true,
        count: records.length,
        verification,
        records,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve audit trail', { error: msg });
    return NextResponse.json(
      { success: false, error: `Failed to query audit trail: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Action 1: On-demand cryptographic integrity verification
    if (action === 'verify' || !action) {
      const verification = globalAuditTrail.verifyIntegrity();
      return NextResponse.json(
        {
          success: true,
          verification,
          count: globalAuditTrail.getRecordCount(),
        },
        { status: 200 }
      );
    }

    // Action 2: Record an adversarial attack or security incident event
    if (action === 'record_event') {
      const eventType = body.eventType as AuditEventType;
      const data = (body.data as Record<string, unknown>) || {};
      const agentId = body.agentId as string | undefined;

      if (!eventType) {
        return NextResponse.json(
          { success: false, error: 'Missing eventType parameter' },
          { status: 400 }
        );
      }

      const record = globalAuditTrail.recordEvent(eventType, data, agentId);
      return NextResponse.json(
        {
          success: true,
          record,
          verification: globalAuditTrail.verifyIntegrity(),
        },
        { status: 201 }
      );
    }

    // Action 3: Simulate tampering for live security demonstration
    if (action === 'simulate_tamper') {
      const sequence = Number(body.sequence);
      if (isNaN(sequence) || sequence <= 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid sequence number provided for tampering' },
          { status: 400 }
        );
      }

      const corruptedData = (body.data as Record<string, unknown>) || {
        tamperedBy: 'adversary_simulator',
        tamperedAt: new Date().toISOString(),
        unauthorizedModification: true,
      };

      const success = globalAuditTrail.simulateTamper(sequence, corruptedData);
      if (!success) {
        return NextResponse.json(
          { success: false, error: `Audit record with sequence ${sequence} not found` },
          { status: 404 }
        );
      }

      const verification = globalAuditTrail.verifyIntegrity();
      return NextResponse.json(
        {
          success: true,
          tamperedSequence: sequence,
          verification,
        },
        { status: 200 }
      );
    }

    // Action 4: Clear ledger (dev/demo reset)
    if (action === 'clear') {
      globalAuditTrail.clear();
      return NextResponse.json(
        {
          success: true,
          message: 'Audit trail history cleared',
          count: 0,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: "${action}"` },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to process audit trail action', { error: msg });
    return NextResponse.json(
      { success: false, error: `Audit action processing failed: ${msg}` },
      { status: 500 }
    );
  }
}
