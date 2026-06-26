'use client';

import React, { useState } from 'react';
import { useSimulation, LedgerItem } from '@/hooks/use-simulation';
import { Receipt, Search, RotateCcw, Lock, Unlock, ShieldAlert, CheckCircle, Eye, Trash2, XCircle } from 'lucide-react';
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

  // 1. Cálculos de métricas
  const successfulTransactions = ledger.filter((item) => item.status === 'SUCCESS');
  const totalVolumeUcents = successfulTransactions.reduce((sum, item) => sum + item.amountUcents, 0);
  const averageTicketUcents = successfulTransactions.length > 0 ? totalVolumeUcents / successfulTransactions.length : 0;
  const blockedTransactions = ledger.filter((item) => item.status === 'BLOCKED');

  // 2. Filtros de listagem
  const filteredLedger = ledger.filter((item) => {
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch = 
      item.intent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.merchantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleWipeLedger = () => {
    if (confirm('Tem certeza de que deseja apagar permanentemente todos os registros do livro ledger? Esta ação é irreversível.')) {
      clearLedger();
      showToast('Histórico do ledger limpo com sucesso.', 'warning');
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
            <Receipt className="text-indigo-400" size={32} />
            <span>Livro de Registro Criptográfico (Ledger)</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Auditoria histórica das transações autônomas máquina para máquina (M2M), assinaturas e conexões de rede.
          </p>
        </div>
        <button
          disabled={ledger.length === 0}
          onClick={handleWipeLedger}
          className="flex items-center space-x-1.5 text-xs font-bold text-rose-450 hover:text-white border border-rose-950 hover:bg-rose-950 bg-slate-950 px-4 py-2 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-slate-950 text-rose-400"
        >
          <Trash2 size={12} />
          <span>Wipe Ledger</span>
        </button>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Volume Total Liquidado</span>
          <span className="text-2xl font-black text-white block">
            {formatUcentsToUSD(totalVolumeUcents)}
          </span>
          <span className="text-[10px] text-emerald-400">Via túneis criptografados OpenZiti AP4M</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Pedidos Liquidados (M2M)</span>
          <span className="text-2xl font-black text-white block">
            {successfulTransactions.length} <span className="text-xs text-slate-500 font-normal">pedidos</span>
          </span>
          <span className="text-[10px] text-slate-400">Ticket Médio: {formatUcentsToUSD(averageTicketUcents)}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1.5 font-mono">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Bloqueios por Conformidade</span>
          <span className="text-2xl font-black text-rose-400 block">
            {blockedTransactions.length} <span className="text-xs text-slate-500 font-normal font-sans">alertas</span>
          </span>
          <span className="text-[10px] text-rose-455 text-rose-400">Interceptados pelo Guard Mode</span>
        </div>
      </div>

      {/* Controles de Filtros e Busca */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
        
        {/* Input de Busca */}
        <div className="relative w-full md:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por fornecedor ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-white pl-9 pr-4 py-2.5 rounded-xl font-mono text-xs outline-none transition-all"
          />
        </div>

        {/* Status para Filtrar */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto md:ml-auto">
          {([
            { key: 'ALL', label: 'Todos' },
            { key: 'SUCCESS', label: 'Aprovados' },
            { key: 'BLOCKED', label: 'Bloqueados' },
            { key: 'FAILED', label: 'Falhados' }
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

      {/* Tabela do Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        {filteredLedger.length === 0 ? (
          <div className="p-16 text-center text-slate-500 italic">
            <XCircle size={32} className="mx-auto mb-3 text-slate-700" />
            <p className="font-bold">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-600 mt-1 font-mono">Modifique os parâmetros de busca ou os filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-4 px-6">Timestamp</th>
                  <th className="py-4 px-6">Transação ID</th>
                  <th className="py-4 px-6">Intenção do Pedido</th>
                  <th className="py-4 px-6">Fornecedor</th>
                  <th className="py-4 px-6">Valor</th>
                  <th className="py-4 px-6">Filtro Guard</th>
                  <th className="py-4 px-6">Roteamento</th>
                  <th className="py-4 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredLedger.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/20 transition-colors">
                    <td className="py-4 px-6 text-slate-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-350">
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
                            ? 'bg-rose-500/10 text-rose-450 border-rose-500/20 animate-pulse text-rose-400'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {item.status === 'SUCCESS' ? (
                          <>
                            <CheckCircle size={10} />
                            <span>APROVADA</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={10} />
                            <span>{item.status === 'BLOCKED' ? 'BLOQUEADA' : 'FALHOU'}</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {item.zitiSecured ? (
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <Lock size={12} />
                          <span>Ziti Overlay</span>
                        </span>
                      ) : (
                        <span className="text-rose-450 flex items-center space-x-1 text-rose-400">
                          <Unlock size={12} />
                          <span>Standard HTTP</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => setInspectItem(item)}
                        className="text-[11px] font-bold bg-indigo-650/10 hover:bg-indigo-650/20 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/15 transition-all flex items-center space-x-1 ml-auto"
                      >
                        <Eye size={12} />
                        <span>Inspecionar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalhado de Inspeção */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Receipt className="text-indigo-400" size={18} />
                    <span>Auditoria de Transação Máquina</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    ID da Transação: {inspectItem.transactionId || inspectItem.id}
                  </p>
                </div>
                <button
                  onClick={() => setInspectItem(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Status */}
              <div className="space-y-4 font-mono text-xs mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-1">
                    <span className="text-slate-500 text-[10px]">DATA DA TRANSAÇÃO</span>
                    <span className="text-slate-200 font-bold block">{inspectItem.timestamp}</span>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-1">
                    <span className="text-slate-500 text-[10px]">FORNECEDOR REGISTRADO</span>
                    <span className="text-slate-200 font-bold block">{inspectItem.merchantId}</span>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-1.5">
                  <span className="text-slate-500 text-[10px] block">CONFORMIDADE DA CARTEIRA</span>
                  <div className="text-[10px] text-slate-400 space-y-1 leading-relaxed">
                    <p>Status Final: {inspectItem.status}</p>
                    <p>Filtro Guard: {inspectItem.securityCheck === 'PASSED' ? '✅ COMPLIANT' : '❌ VIOLAÇÃO DE LIMITES'}</p>
                    {inspectItem.securityReason && (
                      <p className="text-rose-450 mt-1 text-rose-400">Motivo do Bloqueio: {inspectItem.securityReason}</p>
                    )}
                    {inspectItem.authCode && <p className="text-emerald-450 text-emerald-400">Código de Autorização Bancária: {inspectItem.authCode}</p>}
                  </div>
                </div>
              </div>

              {/* Payload JSON */}
              <div className="space-y-2 font-mono text-xs">
                <span className="text-slate-400 font-bold block">Payload Criptográfico x402 Assinado:</span>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-[11px] text-indigo-300 font-mono overflow-x-auto leading-relaxed max-h-[180px] scrollbar-thin">
                  {JSON.stringify(inspectItem.payload, null, 2)}
                </pre>
              </div>

              {/* Logs do Roteamento Ziti */}
              <div className="space-y-2 mt-4 font-mono text-xs">
                <span className="text-slate-400 font-bold block">Histórico de Conectividade OpenZiti e Raciocínio de IA:</span>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 text-[10px] text-slate-350 font-mono overflow-y-auto max-h-[180px] space-y-1.5 scrollbar-thin leading-tight">
                  {inspectItem.logs.map((logLine, idx) => (
                    <div key={idx} className="border-l border-slate-850 pl-2">
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
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
