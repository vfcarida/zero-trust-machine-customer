'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSimulation, LedgerItem } from '@/hooks/use-simulation';
import { 
  Receipt, Search, Lock, Unlock, CheckCircle, 
  Trash2, XCircle, ShieldCheck, Download, RefreshCw, AlertTriangle, Link as LinkIcon
} from 'lucide-react';
import { useToast } from '@/components/toast-provider';

interface AuditRecord {
  sequence: number;
  eventId: string;
  timestamp: string;
  eventType: string;
  agentId: string;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

interface AuditVerificationResult {
  isValid: boolean;
  tamperedSequence?: number;
  reason?: string;
  totalRecords: number;
}

export default function LedgerPage() {
  const { ledger, clearLedger } = useSimulation();
  const { showToast } = useToast();
  
  const [viewMode, setViewMode] = useState<'TRANSACTIONS' | 'AUDIT_TRAIL'>('TRANSACTIONS');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUCCESS' | 'BLOCKED' | 'FAILED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectItem, setInspectItem] = useState<LedgerItem | null>(null);

  // Cryptographic Audit Trail State
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [inspectAuditRecord, setInspectAuditRecord] = useState<AuditRecord | null>(null);

  const formatUcentsToUSD = (ucents: number) => {
    return (ucents / 1000000).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // 1. Metric calculations
  const successfulTransactions = ledger.filter((item) => item.status === 'SUCCESS');
  const totalVolumeUcents = successfulTransactions.reduce((sum, item) => sum + item.amountUcents, 0);
  const averageTicketUcents = successfulTransactions.length > 0 ? totalVolumeUcents / successfulTransactions.length : 0;
  const blockedTransactions = ledger.filter((item) => item.status === 'BLOCKED');

  // 2. Listing filters
  const filteredLedger = ledger.filter((item) => {
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch = 
      item.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.merchantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleWipeLedger = () => {
    if (confirm('Are you sure you want to permanently wipe all ledger records? This action cannot be undone.')) {
      clearLedger();
      showToast('Ledger history wiped successfully.', 'warning');
    }
  };

  // Fetch Cryptographic Audit Trail
  const fetchAuditTrail = useCallback(async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/audit-trail');
      const data = await res.json();
      if (data.success) {
        setAuditRecords(data.records || []);
        setVerification(data.verification || null);
      } else {
        showToast(`Failed to load audit trail: ${data.error}`, 'error');
      }
    } catch {
      showToast('Failed to reach audit trail service.', 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [showToast]);

  useEffect(() => {
    let ignore = false;
    if (viewMode === 'AUDIT_TRAIL') {
      fetch('/api/audit-trail')
        .then((res) => res.json())
        .then((data) => {
          if (!ignore && data.success) {
            setAuditRecords(data.records || []);
            setVerification(data.verification || null);
          }
        })
        .catch(() => {});
    }
    return () => {
      ignore = true;
    };
  }, [viewMode]);

  // Verify Chain Integrity on demand
  const handleVerifyIntegrity = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/audit-trail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' }),
      });
      const data = await res.json();
      if (data.success) {
        setVerification(data.verification);
        if (data.verification.isValid) {
          showToast(`Cryptographic chain verified intact (${data.count} records).`, 'success');
        } else {
          showToast(`Tampering detected at sequence #${data.verification.tamperedSequence}!`, 'error');
        }
      }
    } catch {
      showToast('Failed to verify chain integrity.', 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Simulate Tampering for Security Demonstration
  const handleSimulateTamper = async () => {
    if (auditRecords.length === 0) {
      showToast('No audit records available to simulate tampering.', 'warning');
      return;
    }
    const targetSeq = auditRecords[0].sequence;
    try {
      const res = await fetch('/api/audit-trail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_tamper',
          sequence: targetSeq,
          data: {
            forgedBy: 'adversarial_agent',
            unauthorizedAlteration: true,
            tamperedAt: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVerification(data.verification);
        showToast(`Record #${targetSeq} altered retrospectively. Integrity check triggered.`, 'warning');
        await fetchAuditTrail();
      }
    } catch {
      showToast('Failed to simulate tampering.', 'error');
    }
  };

  // Export SIEM JSON-Lines format
  const handleExportJsonLines = () => {
    window.open('/api/audit-trail?format=jsonl', '_blank');
    showToast('Exported audit trail in SIEM JSON-Lines (NDJSON) format.', 'success');
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
            <Receipt className="text-indigo-400" size={32} />
            <span>Cryptographic Spend Ledger & Audit</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Auditing autonomous Machine-to-Machine (M2M) settlements, cryptographic signatures, and NIST SP 800-207 §3.4 tamper-evident event chains.
          </p>
        </div>
        {viewMode === 'TRANSACTIONS' ? (
          <button
            disabled={ledger.length === 0}
            onClick={handleWipeLedger}
            className="flex items-center space-x-1.5 text-xs font-bold text-rose-400 hover:text-white border border-rose-950 hover:bg-rose-950 bg-slate-950 px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-slate-950"
          >
            <Trash2 size={12} />
            <span>Wipe Ledger</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportJsonLines}
              className="flex items-center space-x-1.5 text-xs font-bold text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 bg-slate-900 px-3.5 py-2 rounded-xl transition-all"
            >
              <Download size={13} className="text-indigo-400" />
              <span>Export SIEM (JSONL)</span>
            </button>
            <button
              onClick={handleVerifyIntegrity}
              disabled={isLoadingAudit}
              className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 hover:text-white border border-emerald-950 hover:bg-emerald-950 bg-slate-950 px-3.5 py-2 rounded-xl transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoadingAudit ? 'animate-spin' : ''} />
              <span>Verify Chain</span>
            </button>
          </div>
        )}
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setViewMode('TRANSACTIONS')}
          className={`px-5 py-3 font-mono text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
            viewMode === 'TRANSACTIONS'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt size={14} />
          <span>M2M Transaction Ledger</span>
        </button>
        <button
          onClick={() => setViewMode('AUDIT_TRAIL')}
          className={`px-5 py-3 font-mono text-xs font-bold border-b-2 transition-all flex items-center space-x-2 ${
            viewMode === 'AUDIT_TRAIL'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck size={14} />
          <span>Cryptographic Audit Trail (NIST SP 800-207 §3.4)</span>
        </button>
      </div>

      {viewMode === 'TRANSACTIONS' ? (
        <>
          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Settled Volume</span>
              <span className="text-2xl font-black text-white block">
                {formatUcentsToUSD(totalVolumeUcents)}
              </span>
              <span className="text-[10px] text-emerald-400">Via OpenZiti AP4M encrypted overlay</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Settled Orders (M2M)</span>
              <span className="text-2xl font-black text-white block">
                {successfulTransactions.length} <span className="text-xs text-slate-500 font-normal">orders</span>
              </span>
              <span className="text-[10px] text-slate-400">Avg Ticket: {formatUcentsToUSD(averageTicketUcents)}</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Compliance Blocks</span>
              <span className="text-2xl font-black text-rose-400 block">
                {blockedTransactions.length} <span className="text-xs text-slate-500 font-normal font-sans">alerts</span>
              </span>
              <span className="text-[10px] text-rose-400">Intercepted by Guard Mode</span>
            </div>
          </div>

          {/* Filter and Search Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
            
            {/* Search input */}
            <div className="relative w-full md:w-80">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search by merchant or intent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-white pl-9 pr-4 py-2.5 rounded-xl font-mono text-xs outline-none transition-all"
              />
            </div>

            {/* Status filters */}
            <div className="flex flex-wrap gap-2 w-full md:w-auto md:ml-auto">
              {([
                { key: 'ALL', label: 'All' },
                { key: 'SUCCESS', label: 'Approved' },
                { key: 'BLOCKED', label: 'Blocked' },
                { key: 'FAILED', label: 'Failed' }
              ] as const).map((status) => (
                <button
                  key={status.key}
                  onClick={() => setFilterStatus(status.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
                    filterStatus === status.key
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>

          </div>

          {/* Ledger Table */}
          {filteredLedger.length === 0 ? (
            <div className="text-center p-12 bg-slate-900/60 border border-slate-800 rounded-2xl animate-fade-in font-mono">
              <XCircle size={40} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 font-bold">No transactions match query filter.</p>
              <p className="text-slate-600 text-xs mt-1">Adjust search parameters or trigger simulated requests.</p>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-850 bg-slate-950/40">
                      <th className="p-4 font-semibold">Timestamp</th>
                      <th className="p-4 font-semibold">Intent</th>
                      <th className="p-4 font-semibold">Merchant</th>
                      <th className="p-4 font-semibold">Amount</th>
                      <th className="p-4 font-semibold">Compliance Status</th>
                      <th className="p-4 font-semibold">Transport Overlay</th>
                      <th className="p-4 font-semibold text-right">Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {filteredLedger.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-950/20 transition-colors">
                        <td className="p-4 text-slate-400 whitespace-nowrap">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-4 font-bold text-slate-200 max-w-[240px] truncate" title={item.intent}>
                          {item.intent}
                        </td>
                        <td className="p-4 text-slate-400 font-bold">{item.merchantId}</td>
                        <td className="p-4 text-slate-100 font-bold">{formatUcentsToUSD(item.amountUcents)}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            item.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : item.status === 'BLOCKED'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {item.status === 'SUCCESS' ? 'APPROVED' : item.status === 'BLOCKED' ? 'BLOCKED' : 'FAILED'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">
                          {item.zitiSecured ? (
                            <span className="flex items-center space-x-1 text-emerald-400">
                              <Lock size={12} />
                              <span>OpenZiti</span>
                            </span>
                          ) : (
                            <span className="flex items-center space-x-1 text-rose-400">
                              <Unlock size={12} />
                              <span>Cleartext</span>
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setInspectItem(item)}
                            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Cryptographic Hash-Chained Audit Trail View (NIST SP 800-207 §3.4) */
        <div className="space-y-6">
          {/* Integrity Status Alert Banner */}
          {verification && (
            <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono ${
              verification.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-350'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-350'
            }`}>
              <div className="flex items-start space-x-3">
                {verification.isValid ? (
                  <CheckCircle size={22} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={22} className="text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                )}
                <div>
                  <h3 className="font-bold text-sm">
                    {verification.isValid
                      ? 'NIST SP 800-207 §3.4 Cryptographic Integrity Verified'
                      : `Tampering Detected: Sequence #${verification.tamperedSequence}`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {verification.isValid
                      ? `All ${verification.totalRecords} sequential audit blocks have valid SHA-256 cryptographic chain pointers from GENESIS to HEAD.`
                      : verification.reason || 'Cryptographic digest mismatch detected.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleSimulateTamper}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-rose-900 bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 transition-all"
                >
                  Simulate Tampering (Demo)
                </button>
                <button
                  onClick={handleVerifyIntegrity}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all"
                >
                  Re-Verify
                </button>
              </div>
            </div>
          )}

          {/* Audit Chain List */}
          {auditRecords.length === 0 ? (
            <div className="text-center p-12 bg-slate-900/60 border border-slate-800 rounded-2xl font-mono">
              <ShieldCheck size={40} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 font-bold">Audit trail empty.</p>
              <p className="text-slate-600 text-xs mt-1">
                Execute automated procurement or prompt injection tests in the simulator to generate cryptographically signed audit events.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {auditRecords.map((record) => {
                const isGenesis = record.previousHash === 'GENESIS';
                const isMalicious = record.eventType === 'ADVERSARIAL_ATTACK_DETECTED';

                return (
                  <div
                    key={record.sequence}
                    className={`bg-slate-900/80 border rounded-2xl p-5 font-mono text-xs transition-all ${
                      isMalicious 
                        ? 'border-rose-500/40 bg-rose-500/5' 
                        : 'border-slate-800 hover:border-slate-750'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-850 pb-3 mb-3">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-[11px]">
                          #{record.sequence}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isMalicious
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                            : record.eventType.includes('FINALIZED')
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : record.eventType.includes('DPOP')
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {record.eventType}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {new Date(record.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[280px]">
                        Event: {record.eventId}
                      </div>
                    </div>

                    {/* Hash Continuity Pointers */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-850/80 mb-3 text-[11px]">
                      <div>
                        <span className="text-slate-500 flex items-center space-x-1 mb-0.5">
                          <LinkIcon size={11} className="text-slate-600" />
                          <span>Previous Hash Pointer ({isGenesis ? 'Root' : `Seq #${record.sequence - 1}`}):</span>
                        </span>
                        <span className={`font-bold block truncate ${
                          isGenesis ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          {record.previousHash}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 flex items-center space-x-1 mb-0.5">
                          <Lock size={11} className="text-indigo-400" />
                          <span>Sealed SHA-256 Digest:</span>
                        </span>
                        <span className="font-bold text-indigo-300 block truncate">
                          {record.hash}
                        </span>
                      </div>
                    </div>

                    {/* Payload Summary & Inspect Action */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400 text-[11px] truncate max-w-[450px]">
                        Data: {JSON.stringify(record.data)}
                      </span>
                      <button
                        onClick={() => setInspectAuditRecord(record)}
                        className="text-indigo-400 hover:text-indigo-300 font-bold underline text-[11px] shrink-0 ml-3"
                      >
                        Inspect Block Data
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Transaction Inspection Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Receipt size={18} className="text-indigo-400" />
                    <span>M2M Transaction Details</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    ID: {inspectItem.id}
                  </p>
                </div>
                <button
                  onClick={() => setInspectItem(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-mono">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                    <span className="text-slate-500 block">Status</span>
                    <span className="font-bold text-white block mt-1">{inspectItem.status}</span>
                  </div>
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                    <span className="text-slate-500 block">Amount</span>
                    <span className="font-bold text-emerald-400 block mt-1">{formatUcentsToUSD(inspectItem.amountUcents)}</span>
                  </div>
                </div>

                {inspectItem.securityReason && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-3.5 rounded-xl text-rose-350">
                    <span className="font-bold block">Security Block Reason:</span>
                    <span className="block mt-1">{inspectItem.securityReason}</span>
                  </div>
                )}

                <div>
                  <span className="text-slate-400 font-bold block mb-1.5">Payload Data:</span>
                  <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-indigo-300 overflow-x-auto">
                    {JSON.stringify(inspectItem.payload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectItem(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Block Data Inspection Modal */}
      {inspectAuditRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <ShieldCheck size={18} className="text-emerald-400" />
                    <span>Cryptographic Block #{inspectAuditRecord.sequence}</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Event Type: {inspectAuditRecord.eventType}
                  </p>
                </div>
                <button
                  onClick={() => setInspectAuditRecord(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-mono">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Event ID:</span>
                    <span className="text-slate-300 font-bold">{inspectAuditRecord.eventId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timestamp:</span>
                    <span className="text-slate-300">{inspectAuditRecord.timestamp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Agent SPIFFE/DID:</span>
                    <span className="text-slate-300 truncate max-w-[320px]">{inspectAuditRecord.agentId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Previous Hash:</span>
                    <span className="text-amber-400 truncate max-w-[320px]">{inspectAuditRecord.previousHash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Record Hash:</span>
                    <span className="text-indigo-400 truncate max-w-[320px]">{inspectAuditRecord.hash}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-bold block mb-1.5">Block Payload Data:</span>
                  <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 text-indigo-300 overflow-x-auto max-h-[220px]">
                    {JSON.stringify(inspectAuditRecord.data, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectAuditRecord(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                Close Block View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
