'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  X402Payload, 
  X402SettlementResponse, 
  generateAgentKeyPair, 
  signX402Payload 
} from '@/lib/agent_pay_protocol';
import { 
  GuardSettings, 
  DEFAULT_GUARD_SETTINGS, 
  evaluateTransaction 
} from '@/lib/AgentGuardMode';

// Tipos de recursos do inventário
export interface ResourceState {
  name: string;
  type: 'compute' | 'coolant';
  level: number; // 0 a 100
  capacity: string;
  costPerUnitUcents: number;
  replenishQuantity: number;
  merchantId: string;
  unitName: string;
}

export interface LedgerItem {
  id: string;
  timestamp: string;
  resource: 'compute' | 'coolant';
  merchantId: string;
  amountUcents: number;
  intent: string;
  status: 'SUCCESS' | 'BLOCKED' | 'FAILED';
  securityCheck: 'PASSED' | 'FAILED';
  securityReason?: string;
  zitiSecured: boolean;
  transactionId?: string;
  authCode?: string;
  logs: string[];
  payload?: X402Payload;
}

interface SimulationContextType {
  inventory: Record<'compute' | 'coolant', ResourceState>;
  guardSettings: GuardSettings;
  setGuardSettings: (settings: GuardSettings) => void;
  ledger: LedgerItem[];
  clearLedger: () => void;
  dailySpendUcents: number;
  agentKeys: { publicKey: string; privateKey: string } | null;
  rotateKeys: () => void;
  isAutopilot: boolean;
  setIsAutopilot: (val: boolean) => void;
  triggerAIProcurement: (resourceType: 'compute' | 'coolant', reasoning: string) => Promise<LedgerItem>;
  isProcessing: boolean;
  aiLogs: string[];
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  
  // 1. Estados Centrais
  const [inventory, setInventory] = useState<Record<'compute' | 'coolant', ResourceState>>({
    compute: {
      name: 'Processamento de CPU em Nuvem',
      type: 'compute',
      level: 85,
      capacity: '64 Cores',
      costPerUnitUcents: 250000, // $0.25 por core-hora
      replenishQuantity: 32, // Reabastece 32 unidades ($8.00)
      merchantId: 'aws_compute',
      unitName: 'Cores',
    },
    coolant: {
      name: 'Nível de Fluido Coolant',
      type: 'coolant',
      level: 75,
      capacity: '50 Litros',
      costPerUnitUcents: 400000, // $0.40 por Litro
      replenishQuantity: 15, // Reabastece 15 Litros ($6.00)
      merchantId: 'mcmaster_carr',
      unitName: 'Litros',
    },
  });

  const [guardSettings, setGuardSettingsState] = useState<GuardSettings>(DEFAULT_GUARD_SETTINGS);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [dailySpendUcents, setDailySpendUcents] = useState<number>(0);
  const [agentKeys, setAgentKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [isAutopilot, setIsAutopilot] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [aiLogs, setAiLogs] = useState<string[]>([]);
  
  const autopilotRef = useRef(isAutopilot);
  autopilotRef.current = isAutopilot;

  // 2. Carrega / Salva do LocalStorage (Offline-First)
  useEffect(() => {
    setMounted(true);
    
    // Chaves criptográficas
    const savedKeys = localStorage.getItem('zt-agent-keys');
    if (savedKeys) {
      setAgentKeys(JSON.parse(savedKeys));
    } else {
      const keys = generateAgentKeyPair();
      localStorage.setItem('zt-agent-keys', JSON.stringify(keys));
      setAgentKeys(keys);
    }

    // Configurações do Guard Mode
    const savedSettings = localStorage.getItem('zt-guard-settings');
    if (savedSettings) {
      setGuardSettingsState(JSON.parse(savedSettings));
    }

    // Ledger transacional
    const savedLedger = localStorage.getItem('zt-ledger');
    if (savedLedger) {
      const parsedLedger = JSON.parse(savedLedger);
      setLedger(parsedLedger);
      
      // Calcula gastos acumulados no dia de hoje
      const todayStr = new Date().toISOString().split('T')[0];
      const todaySpend = parsedLedger
        .filter((item: LedgerItem) => item.status === 'SUCCESS' && item.timestamp.startsWith(todayStr))
        .reduce((sum: number, item: LedgerItem) => sum + item.amountUcents, 0);
      setDailySpendUcents(todaySpend);
    }

    // Níveis do Inventário
    const savedInv = localStorage.getItem('zt-inventory');
    if (savedInv) {
      setInventory(JSON.parse(savedInv));
    }
  }, []);

  const setGuardSettings = (settings: GuardSettings) => {
    setGuardSettingsState(settings);
    localStorage.setItem('zt-guard-settings', JSON.stringify(settings));
  };

  const rotateKeys = () => {
    const keys = generateAgentKeyPair();
    setAgentKeys(keys);
    localStorage.setItem('zt-agent-keys', JSON.stringify(keys));
  };

  const clearLedger = () => {
    setLedger([]);
    setDailySpendUcents(0);
    localStorage.removeItem('zt-ledger');
  };

  // 3. Ticker de Consumo/Drenagem dos Recursos
  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setInventory((prev) => {
        const next = {
          compute: {
            ...prev.compute,
            level: Math.max(0, prev.compute.level - (0.5 + Math.random() * 1.5)),
          },
          coolant: {
            ...prev.coolant,
            level: Math.max(0, prev.coolant.level - (0.3 + Math.random() * 1.2)),
          },
        };
        localStorage.setItem('zt-inventory', JSON.stringify(next));
        return next;
      });
    }, 4000); // drena a cada 4 segundos

    return () => clearInterval(interval);
  }, [mounted]);

  // 4. Trigger do Autopiloto Agêntico
  // Monitora níveis de hardware: quando algum nível cai abaixo de 20%, o autopiloto AI é acionado
  useEffect(() => {
    if (!mounted || isProcessing || !isAutopilot) return;

    const checkAndProcure = async () => {
      if (inventory.compute.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'compute',
          `Telemetria Crítica: Nível de processamento em nuvem em ${inventory.compute.level.toFixed(1)}%. Solicitando alocação urgente de novos cores.`
        );
        setIsProcessing(false);
      } else if (inventory.coolant.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'coolant',
          `Alerta Físico: Nível de fluido coolant abaixo do limite mínimo de segurança (${inventory.coolant.level.toFixed(1)}%). Reabastecendo reservatório.`
        );
        setIsProcessing(false);
      }
    };

    checkAndProcure();
  }, [inventory, isAutopilot, isProcessing, mounted]);

  /**
   * Pipeline de decisão de IA local Gemma 4 E2B + Assinatura x402 + Interceptor Guard + Envio Ziti.
   */
  const triggerAIProcurement = async (
    resourceType: 'compute' | 'coolant',
    reasoning: string
  ): Promise<LedgerItem> => {
    const res = inventory[resourceType];
    const amountUcents = res.replenishQuantity * res.costPerUnitUcents;
    const intent = `Compra autônoma de ${res.replenishQuantity} ${res.unitName} para ${res.name}`;
    const ledgerId = `item_${Date.now()}`;
    const itemLogs: string[] = [];

    // Stream de logs do agente
    setAiLogs([]);
    const logToAI = (text: string) => {
      itemLogs.push(`[Gemma E2B] ${text}`);
      setAiLogs((prev) => [...prev, text]);
    };

    logToAI(`🧠 Instanciando motor local Gemma 4 E2B (Edge-to-Browser)...`);
    await new Promise((r) => setTimeout(r, 600));
    logToAI(`📥 Carregando contexto de telemetria local: { recurso: "${res.name}", nívelAtual: ${res.level.toFixed(1)}%, limiteMínimo: 20.0% }`);
    await new Promise((r) => setTimeout(r, 800));
    logToAI(`⚙️ Injetando Prompt de Sistema: "Você é um Cliente Máquina Autônomo e responsável pela conformidade financeira do inventário M2M de processamento. Analise o estado e gere uma decisão de compra no formato JSON x402."`);
    await new Promise((r) => setTimeout(r, 1000));
    logToAI(`🤔 Raciocínio (<|think|>): Telemetria indica escassez. Nível operacional violado. Identificando fornecedor aprovado na malha: "${res.merchantId}".`);
    await new Promise((r) => setTimeout(r, 700));
    logToAI(`📊 Calculando despesas: ${res.replenishQuantity} unidades * $${(res.costPerUnitUcents / 1000000).toFixed(2)} = $${(amountUcents / 1000000).toFixed(2)} USD.`);
    await new Promise((r) => setTimeout(r, 900));
    
    // Cria payload
    const rawPayload: Omit<X402Payload, 'signature'> = {
      x402Version: '1.0.0',
      agentId: 'did:key:z6MkqB3zV18xPzT9m74H6eF8w4xY7tQ8rL2eD6jP3tS1vW',
      merchantId: res.merchantId,
      intent,
      amountUcents,
      currency: 'USD',
      timestamp: new Date().toISOString(),
      nonce: Math.random().toString(36).substring(2, 15),
    };

    logToAI(`📝 Construindo estrutura do payload padrão x402 (Mastercard AP4M)...`);
    await new Promise((r) => setTimeout(r, 500));

    // Assinatura RSA
    const signature = signX402Payload(rawPayload, agentKeys?.privateKey || '');
    const signedPayload: X402Payload = { ...rawPayload, signature };
    
    logToAI(`🔑 Assinando payload com chave privada RSA-2048 delegada do agente...`);
    logToAI(`🖋️ Assinatura criptográfica gerada: ${signature.substring(0, 24)}...`);
    await new Promise((r) => setTimeout(r, 600));

    // Validação Guard Mode
    logToAI(`🛡️ Enviando transação assinada para o validador local de políticas Guard Mode da carteira...`);
    await new Promise((r) => setTimeout(r, 800));

    const guardResult = evaluateTransaction(signedPayload, dailySpendUcents, guardSettings);

    let newLedgerItem: LedgerItem;

    if (!guardResult.approved) {
      logToAI(`❌ Alerta do Guard Mode: TRANSAÇÃO REJEITADA. Motivo: ${guardResult.reason}`);
      
      newLedgerItem = {
        id: ledgerId,
        timestamp: new Date().toISOString(),
        resource: resourceType,
        merchantId: res.merchantId,
        amountUcents,
        intent,
        status: 'BLOCKED',
        securityCheck: 'FAILED',
        securityReason: guardResult.reason,
        zitiSecured: false,
        logs: [...itemLogs],
        payload: signedPayload,
      };
    } else {
      logToAI(`✅ Verificação do Guard Mode: APROVADO. Orçamento diário e allowlist validados com sucesso.`);
      logToAI(`🌐 Encaminhando transação criptografada para o endpoint da malha OpenZiti...`);
      await new Promise((r) => setTimeout(r, 500));

      try {
        // Envia para a API Route Next.js para tunelamento no servidor
        const response = await fetch('/api/transmit-ziti', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payload: signedPayload,
            publicKey: agentKeys?.publicKey,
          }),
        });

        const data = await response.json();
        
        // Anexa logs do OpenZiti do servidor nos logs da transação
        if (data.logs) {
          data.logs.forEach((logLine: string) => itemLogs.push(logLine));
        }

        if (response.ok && data.success && data.responsePayload.success) {
          const settlement: X402SettlementResponse = data.responsePayload;
          logToAI(`🎉 Transação liquidada e confirmada! Ref Autorização: ${settlement.authCode}.`);
          
          // Reabastece o recurso
          setInventory((prev) => {
            const next = {
              ...prev,
              [resourceType]: {
                ...prev[resourceType],
                level: Math.min(100, prev[resourceType].level + 50), // Sobe 50%
              },
            };
            localStorage.setItem('zt-inventory', JSON.stringify(next));
            return next;
          });

          // Registra o gasto diário
          setDailySpendUcents((prev) => prev + amountUcents);

          newLedgerItem = {
            id: ledgerId,
            timestamp: new Date().toISOString(),
            resource: resourceType,
            merchantId: res.merchantId,
            amountUcents,
            intent,
            status: 'SUCCESS',
            securityCheck: 'PASSED',
            zitiSecured: true,
            transactionId: settlement.transactionId,
            authCode: settlement.authCode,
            logs: [...itemLogs],
            payload: signedPayload,
          };
        } else {
          logToAI(`❌ Falha na Liquidação da Transação: ${data.error || 'Erro desconhecido'}`);
          
          newLedgerItem = {
            id: ledgerId,
            timestamp: new Date().toISOString(),
            resource: resourceType,
            merchantId: res.merchantId,
            amountUcents,
            intent,
            status: 'FAILED',
            securityCheck: 'PASSED',
            zitiSecured: false,
            logs: [...itemLogs],
            payload: signedPayload,
          };
        }
      } catch (err: any) {
        logToAI(`❌ Falha de conexão durante tráfego OpenZiti: ${err.message || err}`);
        
        newLedgerItem = {
          id: ledgerId,
          timestamp: new Date().toISOString(),
          resource: resourceType,
          merchantId: res.merchantId,
          amountUcents,
          intent,
          status: 'FAILED',
          securityCheck: 'PASSED',
          zitiSecured: false,
          logs: [...itemLogs, `[Erro] ${err.message || err}`],
          payload: signedPayload,
        };
      }
    }

    setLedger((prev) => {
      const next = [newLedgerItem, ...prev];
      localStorage.setItem('zt-ledger', JSON.stringify(next));
      return next;
    });

    return newLedgerItem;
  };

  return (
    <SimulationContext.Provider
      value={{
        inventory,
        guardSettings,
        setGuardSettings,
        ledger,
        clearLedger,
        dailySpendUcents,
        agentKeys,
        rotateKeys,
        isAutopilot,
        setIsAutopilot,
        triggerAIProcurement,
        isProcessing,
        aiLogs,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation deve ser usado dentro de um SimulationProvider');
  }
  return context;
};
