'use client';

import React, { useState } from 'react';
import { useSimulation } from '@/hooks/use-simulation';
import { Shield, ShieldAlert, KeyRound, Copy, RotateCcw, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/toast-provider';

export default function SecurityPage() {
  const { 
    guardSettings, 
    setGuardSettings, 
    agentKeys, 
    rotateKeys, 
    dailySpendUcents 
  } = useSimulation();

  const { showToast } = useToast();
  const [limitInput, setLimitInput] = useState((guardSettings.dailySpendLimitUcents / 1000000).toString());
  const [newMerchant, setNewMerchant] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Copy to clipboard helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`, 'success');
  };

  // Update Limit
  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(limitInput);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid positive number', 'error');
      return;
    }
    const limitUcents = Math.round(val * 1000000);
    setGuardSettings({
      ...guardSettings,
      dailySpendLimitUcents: limitUcents,
    });
    showToast('Daily spend limit updated successfully!', 'success');
  };

  // Toggle Guard Mode
  const handleToggleGuard = () => {
    setGuardSettings({
      ...guardSettings,
      enabled: !guardSettings.enabled,
    });
    showToast(
      `Guard Mode ${!guardSettings.enabled ? 'Enabled' : 'Disabled'}`,
      !guardSettings.enabled ? 'success' : 'warning'
    );
  };

  // Add Merchant to Allowlist
  const handleAddMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMerchant.trim().toLowerCase();
    if (!trimmed) return;
    if (guardSettings.allowlist.includes(trimmed)) {
      showToast('Merchant already in allowlist', 'warning');
      return;
    }
    setGuardSettings({
      ...guardSettings,
      allowlist: [...guardSettings.allowlist, trimmed],
    });
    setNewMerchant('');
    showToast(`Merchant "${trimmed}" added to allowlist`, 'success');
  };

  // Remove Merchant from Allowlist
  const handleRemoveMerchant = (merchant: string) => {
    setGuardSettings({
      ...guardSettings,
      allowlist: guardSettings.allowlist.filter((m) => m !== merchant),
    });
    showToast(`Merchant "${merchant}" removed from allowlist`, 'warning');
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8">
      {/* Page Title */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
          <Shield className="text-indigo-400" size={32} />
          <span>Agent Guardrails & Policies</span>
        </h1>
        <p className="text-slate-400 text-sm">
          Define authorization limits, approve merchants, and inspect cryptographic keys for the autonomous agent.
        </p>
      </div>

      {/* Warning if Guard Mode is Disabled */}
      {!guardSettings.enabled && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-5 rounded-2xl flex items-start space-x-4">
          <AlertTriangle size={24} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Guard Mode Inactive</h3>
            <p className="text-xs text-rose-400/80 mt-1 leading-relaxed">
              WARNING: The agent is running in unrestricted mode. It can procure any volume of resources
              and pay any merchant autonomously without budget limits. Enable Guard Mode to enforce wallet boundaries.
            </p>
          </div>
        </div>
      )}

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Daily Spend Limit & Enable Switch */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="text-indigo-400" size={18} />
              <span>Spend Compliance</span>
            </h2>
            
            {/* Toggle switch */}
            <button
              onClick={handleToggleGuard}
              className={`w-12 h-6 rounded-full p-1 transition-all ${
                guardSettings.enabled ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                  guardSettings.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <form onSubmit={handleSaveLimit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">
                Daily Budget Limit ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  disabled={!guardSettings.enabled}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 disabled:opacity-50 text-white pl-8 pr-4 py-3 rounded-xl font-mono text-sm outline-none transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!guardSettings.enabled}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              Update Spend Limit
            </button>
          </form>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-xs text-slate-400 space-y-2">
            <div className="flex justify-between">
              <span>Today Spend:</span>
              <span className="text-slate-200">${(dailySpendUcents / 1000000).toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between">
              <span>Remaining Budget:</span>
              <span className="text-indigo-400">
                ${Math.max(0, (guardSettings.dailySpendLimitUcents - dailySpendUcents) / 1000000).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Merchant Allowlist */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4 mb-4">
              <Shield className="text-indigo-400" size={18} />
              <span>Merchant Allowlist</span>
            </h2>

            <form onSubmit={handleAddMerchant} className="flex space-x-2 mb-4">
              <input
                type="text"
                placeholder="Add merchant id (e.g. gcp_m2m)"
                disabled={!guardSettings.enabled}
                value={newMerchant}
                onChange={(e) => setNewMerchant(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-mono text-xs outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!guardSettings.enabled}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold px-4 rounded-xl transition-all"
              >
                <Plus size={16} />
              </button>
            </form>

            {/* List items */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
              {guardSettings.allowlist.map((m) => (
                <div key={m} className="flex items-center justify-between bg-slate-950 border border-slate-800/80 px-4 py-2.5 rounded-xl font-mono text-xs">
                  <span className="text-slate-300 font-bold">{m}</span>
                  <button
                    disabled={!guardSettings.enabled}
                    onClick={() => handleRemoveMerchant(m)}
                    className="text-slate-500 hover:text-rose-400 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {guardSettings.allowlist.length === 0 && (
                <p className="text-slate-500 text-xs italic text-center py-4">No merchants approved. All orders will fail.</p>
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-4">
            Only orders matching these merchant identifiers can bypass the local middleware.
          </p>
        </div>

      </div>

      {/* Section 3: Keys & Cryptographic Identity */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-2">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <KeyRound className="text-indigo-400" size={18} />
            <span>Agent Key Pair Delegation (x402 Signer)</span>
          </h2>
          <button
            onClick={() => {
              rotateKeys();
              showToast('RSA Key pair rotated successfully!', 'success');
            }}
            className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-white border border-slate-800 bg-slate-950 px-3 py-1.5 rounded-xl transition-all"
          >
            <RotateCcw size={12} />
            <span>Regenerate Keys</span>
          </button>
        </div>

        <div className="space-y-4">
          {/* Public Key Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold">Public Key (spki-pem format)</span>
              <button
                onClick={() => handleCopy(agentKeys?.publicKey || '', 'Public key')}
                className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <Copy size={12} />
                <span>Copy</span>
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-[120px] scrollbar-thin">
              {agentKeys?.publicKey || 'No key loaded.'}
            </pre>
          </div>

          {/* Private Key Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 font-bold">Private Key (pkcs8-pem format)</span>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-slate-400 hover:text-white"
                >
                  {showPrivateKey ? 'Hide' : 'Reveal'}
                </button>
                <button
                  onClick={() => handleCopy(agentKeys?.privateKey || '', 'Private key')}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                >
                  <Copy size={12} />
                  <span>Copy</span>
                </button>
              </div>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[10px] text-slate-300 font-mono overflow-x-auto leading-relaxed max-h-[120px] scrollbar-thin">
              {showPrivateKey ? (agentKeys?.privateKey || 'No key loaded.') : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
