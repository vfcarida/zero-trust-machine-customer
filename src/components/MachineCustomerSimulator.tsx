'use client';

import React, { useState } from 'react';
import { useSimulation, LedgerItem } from '@/hooks/use-simulation';
import { 
  Cpu, Wrench, Shield, Zap, TrendingDown, Send, 
  Terminal, Network, Play, Square, RotateCcw, 
  CheckCircle2, XCircle, AlertTriangle, Server, 
  ShieldAlert, ShieldCheck, DollarSign, Activity, ArrowRight, 
  Lock, Unlock, ChevronDown, ChevronUp, Brain
} from 'lucide-react';

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
  const [showPromptConfig, setShowPromptConfig] = useState(false);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(
    'Você é o Gemma E2B, um Agente de Compras Financeiras Autônomo para sistemas de hardware M2M. Analise a telemetria do inventário e determine a necessidade de reposição imediata. Responda estritamente com um JSON contendo merchantId, intent, amountUcents e currency.'
  );

  // Auxiliar para formatar micro-centavos para USD
  const formatUcentsToUSD = (ucents: number) => {
    return (ucents / 1000000).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // Dispara a IA manualmente
  const handleManualTrigger = async (type: 'compute' | 'coolant') => {
    if (isProcessing) return;
    await triggerAIProcurement(
      type,
      `Intervenção Manual do Usuário: Solicitando carga de insumo para ${inventory[type].name}.`
    );
  };

  const dailySpendUSD = dailySpendUcents / 1000000;
  const limitUSD = guardSettings.dailySpendLimitUcents / 1000000;
  const dailySpendPercent = Math.min(100, (dailySpendUSD / limitUSD) * 100);

  // Status de saúde dos sistemas
  const lowResources = Object.values(inventory).filter((res) => res.level < 20);
  const systemStatus = 
    lowResources.length > 0 
      ? { text: 'ATENÇÃO: CONSUMO CRÍTICO', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' } 
      : { text: 'SISTEMAS OPERACIONAIS', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* 1. Cabeçalho de Controle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${systemStatus.color}`}>
              {systemStatus.text}
            </span>
            <span className="flex items-center space-x-1.5 text-xs text-indigo-450 font-bold bg-indigo-550/10 border border-indigo-500/20 px-3 py-1 rounded-full">
              <Activity size={12} className="animate-pulse text-indigo-400" />
              <span className="text-indigo-300">Economia de Clientes Máquina (M2M)</span>
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mt-2">
            Simulador de Compra Autônoma <span className="text-indigo-400">Zero-Trust</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-2xl">
            Simulação de ponta a ponta: o modelo local Gemma 4 E2B avalia a telemetria, 
            gera payloads de pagamento x402, passa pelas barreiras do Guard Mode e transmite 
            o tráfego criptografado por redes OpenZiti.
          </p>
        </div>

        {/* Painel do Autopiloto */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center space-x-6 min-w-[280px]">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modo Autopiloto (AI)</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5 font-mono">
              {isAutopilot ? 'Ativo (Monitoração Direta)' : 'Manual (Esperando Trigger)'}
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

      {/* 2. Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUNA 1: Telemetria e Status dos Insumos */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Activity size={18} className="text-indigo-400" />
                  <span>Telemetria do Servidor</span>
                </h2>
                <span className="text-xs text-slate-500 font-mono">Drenando...</span>
              </div>

              {/* Cards de Insumos */}
              <div className="space-y-6">
                {Object.values(inventory).map((res) => {
                  const isLow = res.level < 20;
                  return (
                    <div 
                      key={res.type} 
                      className={`p-5 rounded-2xl border transition-all ${
                        isLow 
                          ? 'bg-amber-500/5 border-amber-500/25' 
                          : 'bg-slate-950/40 border-slate-900'
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
                              Capacidade: {res.capacity} | ID: {res.merchantId}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                          isLow 
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' 
                            : 'bg-slate-800 text-slate-500 border-slate-700'
                        }`}>
                          {isLow ? 'NÍVEL BAIXO' : 'OK'}
                        </span>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-500">Carga Atual</span>
                          <span className={isLow ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                            {res.level.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isLow ? 'bg-amber-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${res.level}%` }}
                          />
                        </div>
                      </div>

                      {/* Solicitação Manual */}
                      <div className="mt-4 pt-4 border-t border-slate-900/50 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-mono">
                          Lote: {res.replenishQuantity} {res.unitName} (${((res.replenishQuantity * res.costPerUnitUcents) / 1000000).toFixed(2)})
                        </span>
                        <button
                          disabled={isProcessing}
                          onClick={() => handleManualTrigger(res.type)}
                          className="flex items-center space-x-1.5 text-[11px] font-bold bg-slate-850 hover:bg-slate-800 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 transition-colors"
                        >
                          <Send size={11} />
                          <span>Solicitar Insumo</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumo do Guard Mode */}
            <div className="mt-6 pt-6 border-t border-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Shield size={14} className="text-indigo-400" />
                  <span>Wallet Guard Mode (Compliance)</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  guardSettings.enabled 
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-rose-450 bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {guardSettings.enabled ? 'ATIVO' : 'INATIVO'}
                </span>
              </div>

              {/* Informações de Orçamento */}
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Gasto Diário:</span>
                  <span className="text-slate-350">
                    {formatUcentsToUSD(dailySpendUcents)} / {formatUcentsToUSD(guardSettings.dailySpendLimitUcents)}
                  </span>
                </div>
                
                {/* Barra de Progresso do Orçamento */}
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      dailySpendPercent > 90 ? 'bg-rose-500' : dailySpendPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${dailySpendPercent}%` }}
                  />
                </div>

                <div className="pt-2">
                  <span className="text-slate-500">Fornecedores na Allowlist:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {guardSettings.allowlist.map((w) => (
                      <span key={w} className="text-[10px] bg-slate-950 border border-slate-850 text-slate-400 px-2 py-0.5 rounded">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* COLUNA 2: Console de IA e Raciocínio (Gemma 4 E2B) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
            <div className="space-y-4">
              
              {/* Header do terminal */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Terminal size={18} className="text-emerald-400" />
                  <span>Terminal Gemma E2B local</span>
                </h2>
                <button
                  onClick={() => setShowPromptConfig(!showPromptConfig)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono font-bold"
                >
                  {showPromptConfig ? '[Esconder Prompt]' : '[Editar Prompt]'}
                </button>
              </div>

              {/* Editor do Prompt de Sistema */}
              {showPromptConfig && (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 animate-slide-up">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                    Prompt de Sistema Injetado (M2M)
                  </label>
                  <textarea
                    rows={4}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-350 p-2.5 rounded-xl font-mono text-[11px] outline-none focus:border-indigo-500 transition-all resize-none"
                  />
                  <p className="text-[9px] text-slate-500 font-mono">
                    Este prompt instrui o modelo Gemma local a agir autonomamente ao verificar oscilações na telemetria.
                  </p>
                </div>
              )}

              {/* Raciocínio de IA com exposto <|think|> */}
              <div className="bg-slate-950/80 rounded-2xl border border-slate-800/80 p-4 font-mono text-xs h-[320px] overflow-y-auto flex flex-col justify-between scrollbar-thin">
                <div className="space-y-3">
                  
                  {aiLogs.length === 0 ? (
                    <div className="text-slate-650 italic p-4 text-center h-full flex flex-col items-center justify-center space-y-3">
                      <Brain size={32} className="text-slate-800 animate-pulse" />
                      <div>
                        <p className="text-slate-500">Agente em Espera.</p>
                        <p className="text-[9px] text-slate-650 mt-1">Aciona automaticamente sob 20% de telemetria ou via gatilho manual.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Bloco de pensamento inspirado no WhatsApp/GemmaFin */}
                      <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-900 text-slate-300 font-bold hover:bg-slate-900/80 text-[11px]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Brain size={14} className="text-indigo-400" />
                            {isProcessing ? '🧠 Gemma 4 pensando...' : '🧠 Gemma 4 Raciocinou'}
                          </span>
                          {isThinkingExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        
                        {isThinkingExpanded && (
                          <div className="p-3 bg-slate-950/60 border-t border-slate-900 space-y-2">
                            <div className="flex items-center gap-1">
                              <Zap size={10} className="text-yellow-500 animate-pulse" />
                              <span className="text-[9px] uppercase tracking-wider text-yellow-500/80 font-bold">
                                {'<|think|>'} modo ativo
                              </span>
                            </div>

                            {aiLogs
                              .filter(log => !log.includes('JSON') && !log.includes('{') && !log.includes('}') && !log.includes('"'))
                              .map((log, index) => (
                                <div key={index} className="text-[10px] text-slate-400 pl-1.5 border-l border-slate-800">
                                  {log}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* Exibição do JSON Gerado */}
                      {aiLogs.some(log => log.includes('{')) && (
                        <div className="space-y-1.5 mt-4">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">JSON Gerado pelo Modelo:</span>
                          <pre className="p-3 bg-slate-900 border border-slate-800 text-[10px] text-indigo-300 rounded-xl overflow-x-auto">
                            {(() => {
                              // Extrai o JSON gerado
                              const jsonLogs = ledger.length > 0 ? JSON.stringify(ledger[0].payload, null, 2) : '';
                              return jsonLogs || '{\n  "status": "Aguardando geração..."\n}';
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="border-t border-slate-900 pt-3 mt-4 flex items-center space-x-2 text-indigo-400 animate-pulse">
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                    <span>Processando decisão na borda (E2B)...</span>
                  </div>
                )}
              </div>

            </div>

            {/* Rodapé informativo de chaves */}
            <div className="mt-4 bg-slate-950/40 border border-slate-900 p-3 rounded-xl flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span className="truncate max-w-[170px]">
                Assinador: {agentKeys?.publicKey.substring(22, 60)}...
              </span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <Lock size={12} />
                <span>Assinatura Ativa (RSA-2048)</span>
              </span>
            </div>
          </div>
        </div>

        {/* COLUNA 3: Malha de Rede Zero-Trust OpenZiti */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full justify-between">
            <div>
              
              {/* Header de rede */}
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Network size={18} className="text-indigo-400" />
                  <span>Roteamento Zero-Trust</span>
                </h2>
                <span className="text-xs text-indigo-400 font-semibold font-mono">OpenZiti Core</span>
              </div>

              {/* Grafo animado do túnel criptografado */}
              <div className="relative border border-slate-800 bg-slate-950/60 rounded-2xl p-6 h-[200px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.03),transparent)] pointer-events-none" />
                
                <svg className="w-full h-full" viewBox="0 0 300 120" fill="none">
                  {/* Caminho físico */}
                  <path 
                    d="M 40,60 L 260,60" 
                    stroke="#111827" 
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

                  <defs>
                    <linearGradient id="gradient-flow" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="50%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                  </defs>

                  {/* Nós do Grafo */}
                  <circle cx="40" cy="60" r="16" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                  <text x="40" y="90" fill="#6b7280" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Agente SDK
                  </text>
                  <circle cx="40" cy="60" r="5" fill={isProcessing ? "#6366f1" : "#374151"} className={isProcessing ? "animate-pulse" : ""} />

                  <circle cx="150" cy="30" r="12" fill="#022c22" stroke="#10b981" strokeWidth="1.5" />
                  <path d="M 40,60 L 150,30 L 260,60" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="3 3" />
                  <text x="150" y="15" fill="#10b981" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Controller (mTLS)
                  </text>

                  <circle cx="150" cy="60" r="16" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                  <text x="150" y="90" fill="#6b7280" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Router Ziti
                  </text>
                  <circle cx="150" cy="60" r="5" fill={isProcessing ? "#10b981" : "#374151"} className={isProcessing ? "animate-pulse" : ""} />

                  <circle cx="260" cy="60" r="16" fill="#070f1e" stroke="#38bdf8" strokeWidth="2" />
                  <text x="260" y="90" fill="#6b7280" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                    Servidor Escuro
                  </text>
                  <circle cx="260" cy="60" r="5" fill={isProcessing ? "#38bdf8" : "#374151"} />
                </svg>

                <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-800 text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded flex items-center space-x-1">
                  <Lock size={10} />
                  <span>Sem Portas de Entrada Abertas</span>
                </div>
              </div>
            </div>

            {/* Logs de conexão da malha */}
            <div className="mt-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 h-[190px] flex flex-col justify-between">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-2 border-b border-slate-900 pb-1.5 flex items-center justify-between">
                <span>Logs do Túnel OpenZiti</span>
                <span className="text-[9px] text-slate-550 lowercase">
                  {isProcessing ? 'transmitindo...' : 'aguardando'}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[9px] text-slate-400 scrollbar-thin">
                {ledger.length > 0 ? (
                  ledger[0].logs
                    .filter(line => !line.startsWith('[Gemma E2B]'))
                    .map((log, idx) => (
                      <div key={idx} className="leading-tight text-slate-350">
                        {log}
                      </div>
                    ))
                ) : (
                  <div className="text-slate-650 italic text-center pt-8">
                    Nenhum log de conexão ativo.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 3. Livro de Auditoria M2M (Ledger) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldCheck size={18} className="text-indigo-400" />
              <span>Livro Ledger de Liquidações M2M</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Auditoria de conformidade de liquidação x402 e assinaturas criptográficas dos Clientes Máquina.
            </p>
          </div>
          <button
            onClick={clearLedger}
            className="flex items-center space-x-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 border border-slate-850 hover:border-slate-800 bg-slate-950/80 px-3 py-1.5 rounded-xl transition-all"
          >
            <RotateCcw size={11} />
            <span>Limpar Histórico</span>
          </button>
        </div>

        {ledger.length === 0 ? (
          <div className="text-center p-12 bg-slate-950/40 border border-slate-800/60 rounded-2xl animate-fade-in">
            <XCircle size={40} className="text-slate-850 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-400 font-bold">Ledger de Auditoria Vazio.</p>
            <p className="text-slate-600 text-xs mt-1">Os registros de microtransações liquidadas aparecerão aqui.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-slate-500 border-b border-slate-850 pb-2">
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold">Intenção do Pedido</th>
                  <th className="pb-3 font-semibold">Fornecedor</th>
                  <th className="pb-3 font-semibold">Valor</th>
                  <th className="pb-3 font-semibold">Filtro Guard</th>
                  <th className="pb-3 font-semibold">Rede Overlay</th>
                  <th className="pb-3 font-semibold">Aut Code</th>
                  <th className="pb-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {ledger.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-950/20 transition-colors">
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
                        {item.status === 'SUCCESS' ? 'APROVADA' : item.status === 'BLOCKED' ? 'BLOQUEADA' : 'FALHOU'}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-400">
                      {item.zitiSecured ? (
                        <span className="flex items-center space-x-1 text-emerald-400">
                          <Lock size={12} />
                          <span>Ziti Overlay</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-rose-450 text-rose-400">
                          <Unlock size={12} />
                          <span>Padrão HTTP</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 text-slate-500">{item.authCode || 'N/A'}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => setSelectedLedgerItem(item)}
                        className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Inspecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Modal de Inspeção */}
      {selectedLedgerItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Shield size={18} className="text-indigo-400" />
                    <span>Nó de Auditoria Criptográfica x402</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    UUID do Registro: {selectedLedgerItem.id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedLedgerItem(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Detalhes do status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-xs font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-550 block text-slate-500">Resultado do Guard Mode</span>
                  <span className={`text-[13px] font-bold block mt-1 ${
                    selectedLedgerItem.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-450 text-rose-400'
                  }`}>
                    {selectedLedgerItem.status === 'SUCCESS' ? 'AUTORIZADA E LIQUIDADA' : 'BLOQUEIO POR CONFORMIDADE'}
                  </span>
                  {selectedLedgerItem.securityReason && (
                    <span className="text-[10px] text-slate-450 block mt-1.5 leading-relaxed text-slate-400">
                      {selectedLedgerItem.securityReason}
                    </span>
                  )}
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-550 block text-slate-500">Transporte Zero-Trust</span>
                  <span className={`text-[13px] font-bold block mt-1 ${
                    selectedLedgerItem.zitiSecured ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {selectedLedgerItem.zitiSecured ? 'CRIPTOGRAFADO (OpenZiti)' : 'TÚNEL DESATIVADO'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1.5">
                    Identificador de Serviço Ziti: ap4m-settlement-service
                  </span>
                </div>
              </div>

              {/* JSON Assinado */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-450 font-mono block text-slate-400">Payload Assinado x402 JSON:</span>
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
                Fechar Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
