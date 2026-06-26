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

  // Copia para área de transferência
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado com sucesso!`, 'success');
  };

  // Salva o limite
  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(limitInput);
    if (isNaN(val) || val <= 0) {
      showToast('Por favor, insira um valor positivo válido.', 'error');
      return;
    }
    const limitUcents = Math.round(val * 1000000);
    setGuardSettings({
      ...guardSettings,
      dailySpendLimitUcents: limitUcents,
    });
    showToast('Limite de gastos diários atualizado!', 'success');
  };

  // Alterna o Guard Mode
  const handleToggleGuard = () => {
    setGuardSettings({
      ...guardSettings,
      enabled: !guardSettings.enabled,
    });
    showToast(
      `Guard Mode ${!guardSettings.enabled ? 'Ativado' : 'Desativado'}`,
      !guardSettings.enabled ? 'success' : 'warning'
    );
  };

  // Adiciona Fornecedor
  const handleAddMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMerchant.trim().toLowerCase();
    if (!trimmed) return;
    if (guardSettings.allowlist.includes(trimmed)) {
      showToast('Fornecedor já está na allowlist', 'warning');
      return;
    }
    setGuardSettings({
      ...guardSettings,
      allowlist: [...guardSettings.allowlist, trimmed],
    });
    setNewMerchant('');
    showToast(`Fornecedor "${trimmed}" adicionado à lista`, 'success');
  };

  // Remove Fornecedor
  const handleRemoveMerchant = (merchant: string) => {
    setGuardSettings({
      ...guardSettings,
      allowlist: guardSettings.allowlist.filter((m) => m !== merchant),
    });
    showToast(`Fornecedor "${merchant}" removido da lista`, 'warning');
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Título */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
          <Shield className="text-indigo-400" size={32} />
          <span>Políticas e Limites do Guard Mode</span>
        </h1>
        <p className="text-slate-400 text-sm">
          Defina limites de gastos diários, adicione fornecedores à allowlist e gerencie as chaves de delegação criptográfica do agente.
        </p>
      </div>

      {/* Alerta de perigo caso Guard Mode esteja desligado */}
      {!guardSettings.enabled && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-350 p-5 rounded-2xl flex items-start space-x-4">
          <AlertTriangle size={24} className="text-rose-450 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <h3 className="font-bold text-sm text-rose-300">Alerta de Inconformidade: Guard Mode Desativado</h3>
            <p className="text-xs text-rose-400/80 mt-1 leading-relaxed">
              ATENÇÃO: O agente de IA está operando sem nenhuma barreira de limite. Ele pode fazer compras
              de valores ilimitados de insumos e negociar com qualquer fornecedor sem verificação prévia. Ative o Guard Mode para proteger os fundos.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Limite Diário de Gastos */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="text-indigo-400" size={18} />
              <span>Limite Financeiro</span>
            </h2>
            
            {/* Chave liga/desliga */}
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">
                Limite de Gastos Diário ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  disabled={!guardSettings.enabled}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 disabled:opacity-50 text-white pl-8 pr-4 py-3 rounded-xl font-mono text-sm outline-none transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!guardSettings.enabled}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-550 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              Atualizar Limite Diário
            </button>
          </form>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 font-mono text-xs text-slate-400 space-y-2">
            <div className="flex justify-between">
              <span>Gasto Hoje:</span>
              <span className="text-slate-200">${(dailySpendUcents / 1000000).toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between">
              <span>Orçamento Restante:</span>
              <span className="text-indigo-400 font-bold">
                ${Math.max(0, (guardSettings.dailySpendLimitUcents - dailySpendUcents) / 1000000).toFixed(2)} USD
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Allowlist de Fornecedores */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4 mb-4">
              <Shield className="text-indigo-400" size={18} />
              <span>Fornecedores Permitidos</span>
            </h2>

            <form onSubmit={handleAddMerchant} className="flex space-x-2 mb-4">
              <input
                type="text"
                placeholder="ID do Fornecedor (ex: aws_compute)"
                disabled={!guardSettings.enabled}
                value={newMerchant}
                onChange={(e) => setNewMerchant(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-850 focus:border-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-mono text-xs outline-none transition-all"
              />
              <button
                type="submit"
                disabled={!guardSettings.enabled}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-850 disabled:text-slate-600 text-white font-bold px-4 rounded-xl transition-all"
              >
                <Plus size={16} />
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin">
              {guardSettings.allowlist.map((m) => (
                <div key={m} className="flex items-center justify-between bg-slate-950 border border-slate-850 px-4 py-2.5 rounded-xl font-mono text-xs">
                  <span className="text-slate-350 font-bold">{m}</span>
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
                <p className="text-slate-500 text-xs italic text-center py-4">Nenhum fornecedor aprovado.</p>
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 font-mono leading-relaxed mt-4">
            Apenas requisições com destino a esses IDs serão liberadas pela barreira local de compliance.
          </p>
        </div>

      </div>

      {/* Seção de Chaves Criptográficas */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-2">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <KeyRound className="text-indigo-400" size={18} />
            <span>Assinador Criptográfico RSA (Chaves de Delegação)</span>
          </h2>
          <button
            onClick={() => {
              rotateKeys();
              showToast('Par de chaves RSA rotacionado com sucesso!', 'success');
            }}
            className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-white border border-slate-850 bg-slate-950/80 px-3 py-1.5 rounded-xl transition-all"
          >
            <RotateCcw size={12} />
            <span>Rotacionar Chaves</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 font-bold">Chave Pública (formato PEM-spki)</span>
              <button
                onClick={() => handleCopy(agentKeys?.publicKey || '', 'Chave pública')}
                className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
              >
                <Copy size={12} />
                <span>Copiar</span>
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-[10px] text-slate-350 font-mono overflow-x-auto leading-relaxed max-h-[120px] scrollbar-thin">
              {agentKeys?.publicKey || 'Nenhuma chave gerada.'}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 font-bold">Chave Privada (formato PEM-pkcs8)</span>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-slate-500 hover:text-white"
                >
                  {showPrivateKey ? 'Ocultar' : 'Exibir'}
                </button>
                <button
                  onClick={() => handleCopy(agentKeys?.privateKey || '', 'Chave privada')}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                >
                  <Copy size={12} />
                  <span>Copiar</span>
                </button>
              </div>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-[10px] text-slate-350 font-mono overflow-x-auto leading-relaxed max-h-[120px] scrollbar-thin">
              {showPrivateKey ? (agentKeys?.privateKey || 'Nenhuma chave gerada.') : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
