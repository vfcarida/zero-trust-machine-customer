'use client';

import React from 'react';
import { useSimulation } from '@/hooks/use-simulation';
import { Network, Terminal, Lock, HelpCircle, FileJson, Server, Activity, CheckCircle } from 'lucide-react';

export default function NetworkPage() {
  const { ledger } = useSimulation();

  // Obtém os logs do Ziti da transação mais recente
  const lastZitiTx = ledger.find((item) => item.zitiSecured);
  const zitiLogs = lastZitiTx ? lastZitiTx.logs.filter((log) => !log.startsWith('[Gemma E2B]')) : [];

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Título */}
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center space-x-3">
          <Network className="text-indigo-400" size={32} />
          <span>Malha de Rede Overlay Zero-Trust OpenZiti</span>
        </h1>
        <p className="text-slate-400 text-sm">
          Monitore o túnel criptografado, configure identidades seguras e aprenda a inicializar o tráfego OpenZiti real.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Painel de Status de Nós e Roteamento */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Nós Ativos da Rede */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <Activity className="text-indigo-400" size={18} />
              <span>Nós de Conexão Ativos na Malha</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs text-slate-450">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">AGENTE CLIENTE</span>
                <span className="text-slate-200 font-bold block">Gemma Agent Client</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>Identidade Enrolada</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">ROTEADOR EDGE</span>
                <span className="text-slate-200 font-bold block">aws-sao-router-01</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <CheckCircle size={10} />
                  <span>mTLS Ativo</span>
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-1.5">
                <span className="text-[10px] text-slate-550 block">SERVIÇO ALVO</span>
                <span className="text-slate-200 font-bold block">ap4m-settlement</span>
                <span className="text-emerald-400 text-[10px] flex items-center space-x-1">
                  <Lock size={10} />
                  <span>Endpoint Escuro OK</span>
                </span>
              </div>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
              <span className="text-slate-350 font-bold block">Visão de Engenharia de Rede Zero-Trust:</span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                O SDK do OpenZiti cria uma conexão de saída segura diretamente com a malha. 
                Isso resolve o serviço <code className="text-indigo-400">ap4m-settlement-service</code> sem expor 
                nenhum endereço IP público do fornecedor e sem exigir portas de entrada escutando. 
                Como a conexão é outbound, remove-se todo o vetor de ataques remotos baseados em portas expostas e varredura de firewall.
              </p>
            </div>
          </div>

          {/* Guia de Configuração Local */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-4">
              <HelpCircle className="text-indigo-400" size={18} />
              <span>Como Inicializar a Rede OpenZiti Localmente</span>
            </h2>

            <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-mono">
              <div className="space-y-1">
                <p className="text-slate-250 text-slate-200 font-bold">1. Suba o Controller Local</p>
                <p className="text-[11px]">
                  Use o container oficial do OpenZiti para executar a controladora e o roteador localmente:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  docker run --name openziti-controller -d -p 8441:8441 openziti/quickstart
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-250 text-slate-200 font-bold">2. Cadastre as Identidades e Serviços</p>
                <p className="text-[11px]">
                  Utilize o terminal CLI da controladora para criar a identidade do agente comprador e do fornecedor:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Cria identidades do cliente e servidor\nziti edge create identity user agent-customer -a client-identities\nziti edge create identity device merchant-host -a host-identities\n\n# Cadastra o serviço de liquidação ap4m\nziti edge create service ap4m-settlement-service`}
                </pre>
              </div>

              <div className="space-y-1 pt-2">
                <p className="text-slate-250 text-slate-200 font-bold">3. Efetue o Enrollment e Salve o JSON</p>
                <p className="text-[11px]">
                  Faça o download do certificado gerando o arquivo JSON final de identidade:
                </p>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-indigo-400 overflow-x-auto text-[10px] mt-1.5">
                  {`# Executa enrollment\nziti edge enroll agent-customer.jwt -o ziti-identity.json`}
                </pre>
                <p className="text-[10px] text-slate-500 mt-1">
                  Mova o arquivo gerado <code className="text-indigo-400">ziti-identity.json</code> para a raiz do seu projeto Next.js. O sistema irá autodetectar o arquivo e habilitar túneis de mTLS real!
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Coluna Direita: Identidades e Logs */}
        <div className="md:col-span-1 space-y-6">
          
          {/* Identidade JSON */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono">
              <FileJson className="text-indigo-400" size={16} />
              <span>Identidade de Rede</span>
            </h2>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-3">
              <div className="flex justify-between">
                <span>Modo Atual:</span>
                <span className="text-indigo-400 font-bold">SIMULAÇÃO DE BORDA</span>
              </div>
              <div className="flex justify-between">
                <span>Caminho:</span>
                <span className="text-slate-500 font-bold">/ziti-identity.json</span>
              </div>
              <div className="flex justify-between">
                <span>Canal:</span>
                <span className="text-slate-500 font-bold">ap4m-settlement</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-mono">
              O arquivo de identidade contém sua chave privada de encriptação de rede, certificados raiz e rota da controladora.
            </p>
          </div>

          {/* Logs de Transmissão */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 flex flex-col justify-between h-[360px]">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2 uppercase tracking-wider font-mono border-b border-slate-800 pb-3 mb-2">
                <Terminal className="text-indigo-400" size={16} />
                <span>Últimos Logs do Túnel</span>
              </h2>

              <div className="overflow-y-auto space-y-2 max-h-[220px] font-mono text-[9px] text-slate-450 leading-tight scrollbar-thin">
                {zitiLogs.length > 0 ? (
                  zitiLogs.map((log, idx) => (
                    <div key={idx} className="border-l border-slate-850 pl-2 py-0.5 text-slate-350">
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-600 italic text-center py-10">Sem logs ativos. Efetue uma transação na tela principal para popular.</p>
                )}
              </div>
            </div>

            <div className="text-[9px] text-slate-550 font-mono text-center pt-2 border-t border-slate-850">
              Registros da última conexão Zero-Trust estabelecida.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
