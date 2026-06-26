'use client';

import React, { useState } from 'react';
import { useSimulation, LedgerItem } from '@/hooks/use-simulation';
import { Receipt, Search, Filter, RotateCcw, Lock, Unlock, ShieldAlert, CheckCircle, Eye, Trash2, XCircle } from 'lucide-react';
import { useToast } from '@/components/toast-provider';

export default function LedgerPage() {
  const { ledger, clearLedger } = useSimulation();
  const { showToast } = useToast();
  
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUCCESS' | 'BLOCKED' | 'FAILED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectItem, setInspectItem] = useState<LedgerItem | null>(null);

  const formatUcentsToUSD = (ucents: number) => {
    return (ucents / 1000000).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // 1. Calculations for stats
  const successfulTransactions = ledger.filter((item) => item.status === 'SUCCESS');
  const totalVolumeUcents = successfulTransactions.reduce((sum, item) => sum + item.amountUcents, 0);
  const averageTicketUcents = successfulTransactions.length > 0 ? totalVolumeUcents / successfulTransactions.length : 0;
  const blockedTransactions = ledger.filter((item) => item.status === 'BLOCKED');

  // 2. Filter list
  const filteredLedger = ledger.filter((item) => {
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch = 
      item.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.merchantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleWipeLedger = () => {
    if (confirm('Are you sure you want to permanently delete all ledger records? This cannot be undone.')) {
      clearLedger();
      showToast('Transaction ledger wiped clean.', 'warning');
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
            <Receipt className="text-indigo-400" size={32} />
            <span>Cryptographic Transaction Ledger</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Auditing historical machine-to-machine transactions, signatures, and overlay tunnels.
          </p>
        </div>
        <button
          disabled={ledger.length === 0}
          onClick={handleWipeLedger}
          className="flex items-center space-x-1.5 text-xs font-bold text-rose-400 hover:text-white border border-rose-950 hover:bg-rose-950 bg-slate-950 px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-slate-950"
        >
          <Trash2 size={12} />
          <span>Wipe Ledger</span>
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Settled Volume</span>
          <span className="text-2xl font-black text-white block">
            {formatUcentsToUSD(totalVolumeUcents)}
          </span>
          <span className="text-[10px] text-emerald-400">Through OpenZiti AP4M Tunnel</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Autonomous Orders Settled</span>
          <span className="text-2xl font-black text-white block">
            {successfulTransactions.length} <span className="text-xs text-slate-500 font-normal">orders</span>
          </span>
          <span className="text-[10px] text-slate-400">Avg Ticket: {formatUcentsToUSD(averageTicketUcents)}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Halted Violations</span>
          <span className="text-2xl font-black text-rose-400 block">
            {blockedTransactions.length} <span className="text-xs text-slate-500 font-normal">blocks</span>
          </span>
          <span className="text-[10px] text-rose-400">Intercepted by Guard rails</span>
        </div>
      </div>

      {/* Filter and search Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Search order intent or merchant ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white pl-9 pr-4 py-2.5 rounded-xl font-mono text-xs outline-none transition-all"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto md:ml-auto">
          {(['ALL', 'SUCCESS', 'BLOCKED', 'FAILED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
                filterStatus === status
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

      </div>

      {/* Table Ledger list */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        {filteredLedger.length === 0 ? (
          <div className="p-16 text-center text-slate-500 italic">
            <XCircle size={32} className="mx-auto mb-3 text-slate-700" />
            <p className="font-bold">No transactions found</p>
            <p className="text-xs text-slate-600 mt-1 font-mono">Try adjusting search or status filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-4 px-6">Timestamp</th>
                  <th className="py-4 px-6">Transaction ID / UUID</th>
                  <th className="py-4 px-6">Intent Description</th>
                  <th className="py-4 px-6">Merchant</th>
                  <th className="py-4 px-6">Amount</th>
                  <th className="py-4 px-6">Security Check</th>
                  <th className="py-4 px-6">Routing Type</th>
                  <th className="py-4 px-6 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLedger.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/20 transition-colors">
                    <td className="py-4 px-6 text-slate-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-300">
                      {item.transactionId || item.id.substring(0, 15)}...
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-200 max-w-[200px] truncate" title={item.intent}>
                      {item.intent}
                    </td>
                    <td className="py-4 px-6 text-slate-400 font-bold">{item.merchantId}</td>
                    <td className="py-4 px-6 text-slate-200 font-bold">{formatUcentsToUSD(item.amountUcents)}</td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 w-fit ${
                        item.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : item.status === 'BLOCKED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {item.status === 'SUCCESS' ? (
                          <>
                            <CheckCircle size={10} />
                            <span>APPROVED</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={10} />
                            <span>{item.status}</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {item.zitiSecured ? (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <Lock size={12} />
                          <span>ZT Overlay</span>
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center space-x-1">
                          <Unlock size={12} />
                          <span>Unencrypted</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setInspectItem(item)}
                        className="text-[11px] font-bold bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/15 transition-all flex items-center space-x-1 ml-auto"
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Audit modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Receipt className="text-indigo-400" size={18} />
                    <span>Cryptographic Audit Inspector</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Tx ID: {inspectItem.transactionId || inspectItem.id}
                  </p>
                </div>
                <button
                  onClick={() => setInspectItem(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Status information */}
              <div className="space-y-4 font-mono text-xs mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-slate-500 text-[10px]">TIMESTAMP</span>
                    <span className="text-slate-200 font-bold block">{inspectItem.timestamp}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-slate-500 text-[10px]">MERCHANT SATELLITE</span>
                    <span className="text-slate-200 font-bold block">{inspectItem.merchantId}</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-slate-500 text-[10px] block">SECURITY AUDIT METRIC LOGS</span>
                  <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
                    <p>Status Code: {inspectItem.status}</p>
                    <p>Compliance Check: {inspectItem.securityCheck === 'PASSED' ? '✅ COMPLIANT' : '❌ VIOLATION DETECTED'}</p>
                    {inspectItem.securityReason && (
                      <p className="text-rose-400 mt-1">Audit Reason: {inspectItem.securityReason}</p>
                    )}
                    {inspectItem.authCode && <p className="text-emerald-400">Settlement Auth Code: {inspectItem.authCode}</p>}
                  </div>
                </div>
              </div>

              {/* Signed payload */}
              <div className="space-y-2 font-mono text-xs">
                <span className="text-slate-400 font-bold block">Raw x402 signed JSON:</span>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] text-indigo-300 font-mono overflow-x-auto leading-relaxed max-h-[180px] scrollbar-thin">
                  {JSON.stringify(inspectItem.payload, null, 2)}
                </pre>
              </div>

              {/* Execution / overlay logs */}
              <div className="space-y-2 mt-4 font-mono text-xs">
                <span className="text-slate-400 font-bold block">Transmission & AI reasoning logs:</span>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-y-auto max-h-[180px] space-y-1.5 scrollbar-thin leading-tight">
                  {inspectItem.logs.map((logLine, idx) => (
                    <div key={idx} className="border-l border-slate-800 pl-2">
                      {logLine}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectItem(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
