'use client';

import React, { useState } from 'react';
import { useSimulation, LedgerItem } from '@/hooks/use-simulation';
import { 
  Cpu, Wrench, Shield, Zap, TrendingDown, Send, 
  Terminal, Network, Play, Square, RotateCcw, 
  CheckCircle2, XCircle, AlertTriangle, Server, 
  ShieldAlert, ShieldCheck, DollarSign, Activity, ArrowRight, 
  Lock, Unlock 
} from 'lucide-react';
import { APPROVED_MERCHANTS } from '@/lib/constants';

export const MachineCustomerSimulator: React.FC = () => {
  const {
    inventory,
    guardSettings,
    ledger,
    clearLedger,
    dailySpendUcents,
    agentKeys,
    isAutopilot,
    setIsAutopilot,
    triggerAIProcurement,
    isProcessing,
    aiLogs,
  } = useSimulation();

  const [selectedLedgerItem, setSelectedLedgerItem] = useState<LedgerItem | null>(null);

  // Helper to format micro-cents to USD
  const formatUcentsToUSD = (ucents: number) => {
    return (ucents / 1000000).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // Trigger manual procurement for testing
  const handleManualTrigger = async (type: 'compute' | 'coolant') => {
    if (isProcessing) return;
    await triggerAIProcurement(
      type,
      `Manual User Override: Sourcing supply top-up for ${inventory[type].name}.`
    );
  };

  // Calculate percentage of daily limit spent
  const dailySpendUSD = dailySpendUcents / 1000000;
  const limitUSD = guardSettings.dailySpendLimitUcents / 1000000;
  const dailySpendPercent = Math.min(100, (dailySpendUSD / limitUSD) * 100);

  // Check overall system health
  const lowResources = Object.values(inventory).filter((res) => res.level < 20);
  const systemStatus = 
    lowResources.length > 0 
      ? { text: 'WARNING: DRAIN DETECTED', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' } 
      : { text: 'OPERATIONAL', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* 1. Header Control Center */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${systemStatus.color}`}>
              {systemStatus.text}
            </span>
            <span className="flex items-center space-x-1.5 text-xs text-indigo-400 font-bold bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
              <Activity size={12} className="animate-pulse" />
              <span>M2M Economic Simulation</span>
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mt-2">
            M2M Autonomous Procurement <span className="text-indigo-400">Simulator</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-2xl">
            Simulate an AI agent running locally (Gemma 4 E2B) that monitors server telemetry,
            authorizes payments using standard x402 protocols, passes MetaMask Guard rails,
            and routes traffic via OpenZiti.
          </p>
        </div>

        {/* Autopilot Controller */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-6 min-w-[280px]">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Autopilot procurement</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">
              {isAutopilot ? 'AI Autonomously Transacting' : 'Manual Toggles Active'}
            </p>
          </div>
          <button
            onClick={() => setIsAutopilot(!isAutopilot)}
            className={`ml-auto flex items-center justify-center p-2 rounded-xl transition-all border ${
              isAutopilot
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isAutopilot ? <Play size={20} className="animate-pulse" /> : <Square size={20} />}
          </button>
        </div>
      </div>

      {/* 2. Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1: System Telemetry (Inventory) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Activity size={18} className="text-indigo-400" />
                  <span>Hardware Telemetry</span>
                </h2>
                <span className="text-xs text-slate-500 font-mono">Consuming...</span>
              </div>

              {/* Resource Cards */}
              <div className="space-y-6">
                {Object.values(inventory).map((res) => {
                  const isLow = res.level < 20;
                  return (
                    <div 
                      key={res.type} 
                      className={`p-5 rounded-2xl border transition-all ${
                        isLow 
                          ? 'bg-amber-500/5 border-amber-500/20' 
                          : 'bg-slate-950/40 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                            isLow 
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}>
                            {res.type === 'compute' ? <Cpu size={18} /> : <Wrench size={18} />}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-200 text-sm">{res.name}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono">
                              Cap: {res.capacity} | {res.merchantId}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                          isLow 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' 
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {isLow ? 'CRITICAL DRAIN' : 'OK'}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-400">Level</span>
                          <span className={isLow ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                            {res.level.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isLow ? 'bg-amber-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${res.level}%` }}
                          />
                        </div>
                      </div>

                      {/* Manual Top-up button */}
                      <div className="mt-4 pt-4 border-t border-slate-800/55 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-mono">
                          Topup: {res.replenishQuantity} {res.unitName} (${((res.replenishQuantity * res.costPerUnitUcents) / 1000000).toFixed(2)})
                        </span>
                        <button
                          disabled={isProcessing}
                          onClick={() => handleManualTrigger(res.type)}
                          className="flex items-center space-x-1.5 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-700 transition-colors"
                        >
                          <Send size={11} />
                          <span>Order Now</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Guard HUD inside Telemetry Column */}
            <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Shield size={14} className="text-indigo-400" />
                  <span>Wallet Guard HUD</span>
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  guardSettings.enabled 
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                }`}>
                  {guardSettings.enabled ? 'ACTIVE GUARD' : 'DISABLED'}
                </span>
              </div>

              {/* Guard parameters */}
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Daily Spend:</span>
                  <span className="text-slate-200">
                    {formatUcentsToUSD(dailySpendUcents)} / {formatUcentsToUSD(guardSettings.dailySpendLimitUcents)}
                  </span>
                </div>
                
                {/* Progress Limit bar */}
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      dailySpendPercent > 90 ? 'bg-rose-500' : dailySpendPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${dailySpendPercent}%` }}
                  />
                </div>

                <div className="pt-2">
                  <span className="text-slate-400">Allowlisted Vendors:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {guardSettings.allowlist.map((w) => (
                      <span key={w} className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* COLUMN 2: Gemma 4 E2B AI Reasoning Terminal */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                <Terminal size={18} className="text-emerald-400 animate-pulse" />
                <span>Gemma 4 E2B Agent Terminal</span>
              </h2>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>

            {/* Live Terminal screen */}
            <div className="flex-1 bg-slate-950/80 rounded-2xl border border-slate-800/80 p-4 font-mono text-xs overflow-y-auto max-h-[380px] lg:max-h-none h-[380px] flex flex-col justify-between scrollbar-thin">
              <div className="space-y-3">
                {aiLogs.length === 0 ? (
                  <div className="text-slate-500 italic p-4 text-center h-full flex flex-col items-center justify-center space-y-3">
                    <Activity size={32} className="text-slate-700 animate-pulse" />
                    <div>
                      <p>Agent Idle.</p>
                      <p className="text-[10px] mt-1">Telemetry triggers automatically under 20% or on manual click.</p>
                    </div>
                  </div>
                ) : (
                  aiLogs.map((log, index) => (
                    <div 
                      key={index}
                      className={`leading-relaxed border-l-2 pl-2 transition-all duration-300 ${
                        log.includes('❌') 
                          ? 'border-rose-500 text-rose-300' 
                          : log.includes('✅') 
                            ? 'border-emerald-500 text-emerald-300' 
                            : log.includes('📝') || log.includes('🖋️')
                              ? 'border-indigo-500 text-indigo-300'
                              : 'border-slate-800 text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>

              {isProcessing && (
                <div className="border-t border-slate-800 pt-3 mt-4 flex items-center space-x-2 text-indigo-400 animate-pulse">
                  <span className="animate-spin h-3.5 w-3.5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                  <span>Agent Generating procurement Decision...</span>
                </div>
              )}
            </div>
            
            {/* Key Pair info in footer */}
            <div className="mt-4 bg-slate-950/40 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span className="truncate max-w-[170px]">
                Key: {agentKeys?.publicKey.substring(22, 60)}...
              </span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <Lock size={12} />
                <span>Secured (RSA-2048)</span>
              </span>
            </div>
          </div>
        </div>

        {/* COLUMN 3: OpenZiti Zero-Trust Network Visualizer */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Network size={18} className="text-indigo-400" />
                  <span>Zero-Trust Mesh Overlay</span>
                </h2>
                <span className="text-xs text-indigo-400 font-semibold font-mono">OpenZiti v1.0</span>
              </div>

              {/* Animated Tunnel Graph */}
              <div className="relative border border-slate-800 bg-slate-950/60 rounded-2xl p-6 h-[200px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05),transparent)] pointer-events-none" />
                
                {/* SVG Pipeline */}
                <svg className="w-full h-full" viewBox="0 0 300 120" fill="none">
                  {/* Connective pathways */}
                  <path 
                    d="M 40,60 L 260,60" 
                    stroke="#1e293b" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                  />
                  {isProcessing && (
                    <path 
                      d="M 40,60 L 260,60" 
                      stroke="url(#gradient-flow)" 
                      strokeWidth="4" 
                      strokeLinecap="round" 
                      className="animate-[dash_2s_linear_infinite]"
                      strokeDasharray="10 5"
                    />
                  )}

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="gradient-flow" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="50%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                  </defs>

                  {/* Nodes */}
                  {/* 1. Client Node */}
                  <circle cx="40" cy="60" r="16" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                  <text x="40" y="90" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Agent SDK
                  </text>
                  <circle cx="40" cy="60" r="5" fill={isProcessing ? "#6366f1" : "#475569"} className={isProcessing ? "animate-pulse" : ""} />

                  {/* 2. Ziti controller (overlay control plane) */}
                  <circle cx="150" cy="30" r="12" fill="#022c22" stroke="#10b981" strokeWidth="1.5" />
                  <path d="M 40,60 L 150,30 L 260,60" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3 3" />
                  <text x="150" y="15" fill="#10b981" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Controller (mTLS)
                  </text>

                  {/* 3. Edge Router overlay */}
                  <circle cx="150" cy="60" r="16" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                  <text x="150" y="90" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Ziti Router
                  </text>
                  <circle cx="150" cy="60" r="5" fill={isProcessing ? "#10b981" : "#475569"} className={isProcessing ? "animate-pulse" : ""} />

                  {/* 4. Target Server Node */}
                  <circle cx="260" cy="60" r="16" fill="#0c1729" stroke="#38bdf8" strokeWidth="2" />
                  <text x="260" y="90" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Dark Service
                  </text>
                  <circle cx="260" cy="60" r="5" fill={isProcessing ? "#38bdf8" : "#475569"} />
                </svg>

                {/* Secure Badge */}
                <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded flex items-center space-x-1">
                  <Lock size={10} />
                  <span>No Public Listening Ports</span>
                </div>
              </div>
            </div>

            {/* Live Tunnel Transmission log status */}
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 h-[190px] flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                <span>Tunnel Connection Logs</span>
                <span className="text-[10px] text-slate-400 lowercase">
                  {isProcessing ? 'transmitting...' : 'waiting'}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[10px] text-slate-400">
                {ledger.length > 0 ? (
                  ledger[0].logs
                    .filter(line => !line.startsWith('[Gemma E2B]'))
                    .map((log, idx) => (
                      <div key={idx} className="leading-tight text-slate-300">
                        {log}
                      </div>
                    ))
                ) : (
                  <div className="text-slate-600 italic text-center pt-8">
                    No active tunnel routing logs.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 3. Transaction History / Ledger */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldCheck size={18} className="text-indigo-400" />
              <span>Real-Time M2M Settlement Ledger</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Capturing autonomous x402 payment records and Guard Mode outcomes.
            </p>
          </div>
          <button
            onClick={clearLedger}
            className="flex items-center space-x-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 bg-slate-950 px-3 py-1.5 rounded-xl transition-all"
          >
            <RotateCcw size={11} />
            <span>Reset Logs</span>
          </button>
        </div>

        {ledger.length === 0 ? (
          <div className="text-center p-12 bg-slate-950/40 border border-slate-800/60 rounded-2xl">
            <XCircle size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-bold">Ledger Empty.</p>
            <p className="text-slate-600 text-xs mt-1">Autonomous micro-transactions will register here as they are processed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800/80 pb-2">
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold">Intent / Order</th>
                  <th className="pb-3 font-semibold">Merchant</th>
                  <th className="pb-3 font-semibold">Amount</th>
                  <th className="pb-3 font-semibold">Guard Status</th>
                  <th className="pb-3 font-semibold">Overlay Network</th>
                  <th className="pb-3 font-semibold">Ref Code</th>
                  <th className="pb-3 font-semibold text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ledger.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/30 transition-colors">
                    <td className="py-3.5 text-slate-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3.5 font-bold text-slate-200 truncate max-w-[200px]" title={item.intent}>
                      {item.intent}
                    </td>
                    <td className="py-3.5 text-slate-400 font-bold">{item.merchantId}</td>
                    <td className="py-3.5 text-slate-100 font-bold">{formatUcentsToUSD(item.amountUcents)}</td>
                    <td className="py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        item.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : item.status === 'BLOCKED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-400">
                      {item.zitiSecured ? (
                        <span className="flex items-center space-x-1 text-emerald-400">
                          <Lock size={12} />
                          <span>ZT Overlay</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-rose-400">
                          <Unlock size={12} />
                          <span>Standard HTTP</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-slate-500">{item.authCode || 'N/A'}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => setSelectedLedgerItem(item)}
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
        )}
      </div>

      {/* 4. Inspect Modal */}
      {selectedLedgerItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Shield size={18} className="text-indigo-400" />
                    <span>x402 Transaction Audit Node</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    UUID: {selectedLedgerItem.id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLedgerItem(null)}
                  className="p-1.5 bg-slate-850 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Status summary */}
              <div className="grid grid-cols-2 gap-4 mb-6 text-xs font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block">Guard Checks Outcome</span>
                  <span className={`text-sm font-bold block mt-1 ${
                    selectedLedgerItem.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {selectedLedgerItem.status === 'SUCCESS' ? 'APPROVED & SETTLED' : 'BLOCKED / COMPLIANCE VIOLATION'}
                  </span>
                  {selectedLedgerItem.securityReason && (
                    <span className="text-[10px] text-slate-400 block mt-1.5 leading-relaxed">
                      {selectedLedgerItem.securityReason}
                    </span>
                  )}
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-500 block">Ziti Overlay Tunneling</span>
                  <span className={`text-sm font-bold block mt-1 ${
                    selectedLedgerItem.zitiSecured ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {selectedLedgerItem.zitiSecured ? 'SECURED END-TO-END' : 'TUNNEL FAILED'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1.5">
                    Service target: ap4m-settlement-service
                  </span>
                </div>
              </div>

              {/* JSON Payload */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 font-mono block">Signed x402 JSON Payload:</span>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] text-indigo-300 font-mono overflow-x-auto leading-relaxed max-h-[220px] scrollbar-thin">
                  {JSON.stringify(selectedLedgerItem.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLedgerItem(null)}
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
};
