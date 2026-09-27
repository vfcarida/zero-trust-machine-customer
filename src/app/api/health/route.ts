import { NextResponse } from 'next/server';
import { getAuditTrailManager } from '@/infrastructure/logging/audit_trail';
import { getSpendLedgerStore } from '@/infrastructure/storage/spend_ledger_store_factory';

export interface HealthCheckResponse {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptimeSeconds: number;
  system: {
    nodeVersion: string;
    memoryUsageMb: number;
    platform: string;
  };
  checks?: {
    spendLedger: {
      status: 'UP' | 'DOWN';
      storeType: string;
      error?: string;
    };
    opaPolicyEngine: {
      status: 'UP' | 'DEGRADED' | 'DOWN';
      mode: 'sidecar' | 'embedded-dev';
      error?: string;
    };
    auditTrail: {
      status: 'UP' | 'DOWN';
      verified: boolean;
      eventCount: number;
      error?: string;
    };
  };
}

const startTime = Date.now();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const probe = url.searchParams.get('probe');

  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsageMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;

  // Fast Liveness Probe: Process is alive and event loop is responding
  if (probe === 'liveness') {
    return NextResponse.json(
      {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptimeSeconds,
      },
      { status: 200 }
    );
  }

  // Deep Readiness Probe: Verify core zero-trust dependencies
  const isReadiness = probe === 'readiness';

  let spendLedgerStatus: 'UP' | 'DOWN' = 'UP';
  let spendLedgerStoreType = 'unknown';
  let spendLedgerError: string | undefined;

  try {
    const store = getSpendLedgerStore();
    spendLedgerStoreType = store.constructor.name;
    // Probe read readiness
    await store.getAllTransactions();
  } catch (err: unknown) {
    spendLedgerStatus = 'DOWN';
    spendLedgerError = err instanceof Error ? err.message : String(err);
  }

  let opaStatus: 'UP' | 'DEGRADED' | 'DOWN' = 'UP';
  let opaMode: 'sidecar' | 'embedded-dev' = 'embedded-dev';
  let opaError: string | undefined;

  try {
    const opaUrl = process.env.OPA_URL || 'http://127.0.0.1:8181';
    
    // Quick ping to OPA sidecar
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    try {
      const pingRes = await fetch(`${opaUrl}/v1/data`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);
      if (pingRes.ok) {
        opaStatus = 'UP';
        opaMode = 'sidecar';
      } else {
        opaMode = 'embedded-dev';
        opaStatus = process.env.OPA_ENFORCE_STRICT === 'true' ? 'DOWN' : 'DEGRADED';
      }
    } catch {
      clearTimeout(timeoutId);
      opaMode = 'embedded-dev';
      opaStatus = process.env.OPA_ENFORCE_STRICT === 'true' ? 'DOWN' : 'DEGRADED';
    }
  } catch (err: unknown) {
    opaStatus = 'DOWN';
    opaError = err instanceof Error ? err.message : String(err);
  }

  let auditTrailStatus: 'UP' | 'DOWN' = 'UP';
  let auditVerified = false;
  let auditEventCount = 0;
  let auditError: string | undefined;

  try {
    const auditMgr = getAuditTrailManager();
    const auditEvents = auditMgr.getHistory();
    auditEventCount = auditEvents.length;
    const verification = auditMgr.verifyIntegrity();
    auditVerified = verification.isValid;
    if (!verification.isValid) {
      auditTrailStatus = 'DOWN';
      auditError = `Audit trail integrity verification failed: ${verification.reason}`;
    }
  } catch (err: unknown) {
    auditTrailStatus = 'DOWN';
    auditError = err instanceof Error ? err.message : String(err);
  }

  // Determine aggregate system status
  let aggregateStatus: 'UP' | 'DEGRADED' | 'DOWN' = 'UP';
  if (spendLedgerStatus === 'DOWN' || auditTrailStatus === 'DOWN' || opaStatus === 'DOWN') {
    aggregateStatus = 'DOWN';
  } else if (opaStatus === 'DEGRADED') {
    aggregateStatus = 'DEGRADED';
  }

  const httpStatus = aggregateStatus === 'DOWN' && isReadiness ? 503 : 200;

  const payload: HealthCheckResponse = {
    status: aggregateStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    system: {
      nodeVersion: process.version,
      memoryUsageMb,
      platform: process.platform,
    },
    checks: {
      spendLedger: {
        status: spendLedgerStatus,
        storeType: spendLedgerStoreType,
        ...(spendLedgerError ? { error: spendLedgerError } : {}),
      },
      opaPolicyEngine: {
        status: opaStatus,
        mode: opaMode,
        ...(opaError ? { error: opaError } : {}),
      },
      auditTrail: {
        status: auditTrailStatus,
        verified: auditVerified,
        eventCount: auditEventCount,
        ...(auditError ? { error: auditError } : {}),
      },
    },
  };

  return NextResponse.json(payload, { status: httpStatus });
}
