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

// Types of inventory resources
export interface ResourceState {
  name: string;
  type: 'compute' | 'coolant';
  level: number; // 0 to 100
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
  
  // 1. Core States
  const [inventory, setInventory] = useState<Record<'compute' | 'coolant', ResourceState>>({
    compute: {
      name: 'Cloud CPU Capacity',
      type: 'compute',
      level: 80,
      capacity: '64 Cores',
      costPerUnitUcents: 250000, // $0.25 per unit core-hour
      replenishQuantity: 32, // Refills 32 units ($8.00)
      merchantId: 'aws_compute',
      unitName: 'Cores',
    },
    coolant: {
      name: 'Liquid Coolant Level',
      type: 'coolant',
      level: 70,
      capacity: '50 Liters',
      costPerUnitUcents: 400000, // $0.40 per Liter
      replenishQuantity: 15, // Refills 15 Liters ($6.00)
      merchantId: 'mcmaster_carr',
      unitName: 'Liters',
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

  // 2. Load / Save from LocalStorage
  useEffect(() => {
    setMounted(true);
    
    // Load keys
    const savedKeys = localStorage.getItem('zt-agent-keys');
    if (savedKeys) {
      setAgentKeys(JSON.parse(savedKeys));
    } else {
      const keys = generateAgentKeyPair();
      localStorage.setItem('zt-agent-keys', JSON.stringify(keys));
      setAgentKeys(keys);
    }

    // Load Guard Settings
    const savedSettings = localStorage.getItem('zt-guard-settings');
    if (savedSettings) {
      setGuardSettingsState(JSON.parse(savedSettings));
    }

    // Load Ledger
    const savedLedger = localStorage.getItem('zt-ledger');
    if (savedLedger) {
      const parsedLedger = JSON.parse(savedLedger);
      setLedger(parsedLedger);
      
      // Calculate daily spend for today
      const todayStr = new Date().toISOString().split('T')[0];
      const todaySpend = parsedLedger
        .filter((item: LedgerItem) => item.status === 'SUCCESS' && item.timestamp.startsWith(todayStr))
        .reduce((sum: number, item: LedgerItem) => sum + item.amountUcents, 0);
      setDailySpendUcents(todaySpend);
    }

    // Load Inventory
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

  // 3. Resource Decay Ticker
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
    }, 4000); // decay every 4 seconds

    return () => clearInterval(interval);
  }, [mounted]);

  // 4. Autonomous Agent Trigger
  // Monitor resource levels: when they dip below 20%, trigger procurement automatically if Autopilot is enabled
  useEffect(() => {
    if (!mounted || isProcessing || !isAutopilot) return;

    const checkAndProcure = async () => {
      if (inventory.compute.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'compute',
          `Automated Sensor Warning: Compute level critically low at ${inventory.compute.level.toFixed(1)}%. Triggering immediate cloud instance scaling request.`
        );
        setIsProcessing(false);
      } else if (inventory.coolant.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'coolant',
          `Hardware Alert: Coolant fluid levels dropped below threshold (${inventory.coolant.level.toFixed(1)}%). Sourcing liquid replenishment.`
        );
        setIsProcessing(false);
      }
    };

    checkAndProcure();
  }, [inventory, isAutopilot, isProcessing, mounted]);

  /**
   * Main AI procurement reasoning + transaction pipeline.
   * Simulates Gemma 4 E2B reasoning, signs x402 transaction, applies Agent Guard, and transmits via Ziti.
   */
  const triggerAIProcurement = async (
    resourceType: 'compute' | 'coolant',
    reasoning: string
  ): Promise<LedgerItem> => {
    const res = inventory[resourceType];
    const amountUcents = res.replenishQuantity * res.costPerUnitUcents;
    const intent = `Purchase of ${res.replenishQuantity} ${res.unitName} for ${res.name}`;
    const ledgerId = `item_${Date.now()}`;
    const itemLogs: string[] = [];

    // Stream AI simulation logs
    setAiLogs([]);
    const logToAI = (text: string) => {
      itemLogs.push(`[Gemma E2B] ${text}`);
      setAiLogs((prev) => [...prev, text]);
    };

    logToAI(`🧠 Gemma 4 E2B instantiated in sandbox environment...`);
    await new Promise((r) => setTimeout(r, 600));
    logToAI(`📥 Input Context Loaded: { resource: "${res.name}", currentLevel: ${res.level.toFixed(1)}%, threshold: 20.0% }`);
    await new Promise((r) => setTimeout(r, 800));
    logToAI(`⚙️ System Prompt: "You are an Autonomous Financial Procurement Agent. Analyze the telemetry and decide whether to purchase resources under x402 Protocol constraints."`);
    await new Promise((r) => setTimeout(r, 1000));
    logToAI(`🤔 Reasoning: Telemetry verified. Low level requires replenishment. Target vendor selected: "${res.merchantId}".`);
    await new Promise((r) => setTimeout(r, 700));
    logToAI(`📊 Calculating cost: ${res.replenishQuantity} units * $${(res.costPerUnitUcents / 1000000).toFixed(2)}/unit = $${(amountUcents / 1000000).toFixed(2)} USD.`);
    await new Promise((r) => setTimeout(r, 900));
    
    // Create payload
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

    logToAI(`📝 Constructing x402 Standard transaction structure...`);
    await new Promise((r) => setTimeout(r, 500));

    // Cryptographic Sign
    const signature = signX402Payload(rawPayload, agentKeys?.privateKey || '');
    const signedPayload: X402Payload = { ...rawPayload, signature };
    
    logToAI(`🔑 Signing payload with Agent Delegated RSA Key Pair...`);
    logToAI(`🖋️ Signature generated: ${signature.substring(0, 24)}...`);
    await new Promise((r) => setTimeout(r, 600));

    // Evaluate Guard Mode Policies
    logToAI(`🛡️ Sending payload to MetaMask Agent Wallet Guard Mode policy validator...`);
    await new Promise((r) => setTimeout(r, 800));

    const guardResult = evaluateTransaction(signedPayload, dailySpendUcents, guardSettings);

    let newLedgerItem: LedgerItem;

    if (!guardResult.approved) {
      logToAI(`❌ Guard Mode Alert: TRANSACTION BLOCKED. Reason: ${guardResult.reason}`);
      
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
      logToAI(`✅ Guard Mode Verification: PASSED. Daily budget and allowlist compliance checked.`);
      logToAI(`🌐 Transmitting transaction package to OpenZiti Zero-Trust Overlay API endpoint...`);
      await new Promise((r) => setTimeout(r, 500));

      try {
        // Send to Next.js API Route for server-side OpenZiti tunneling
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
        
        // Append Ziti server-side logs to item logs
        if (data.logs) {
          data.logs.forEach((logLine: string) => itemLogs.push(logLine));
        }

        if (response.ok && data.success && data.responsePayload.success) {
          const settlement: X402SettlementResponse = data.responsePayload;
          logToAI(`🎉 Transaction settled successfully! Receipt Ref: ${settlement.authCode}.`);
          
          // Refill resource level on success
          setInventory((prev) => {
            const next = {
              ...prev,
              [resourceType]: {
                ...prev[resourceType],
                level: Math.min(100, prev[resourceType].level + 50), // Replenish level by 50%
              },
            };
            localStorage.setItem('zt-inventory', JSON.stringify(next));
            return next;
          });

          // Add to daily spend
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
          logToAI(`❌ Transmission Settlement Failure: ${data.error || 'Unknown error'}`);
          
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
        logToAI(`❌ Network failure during Ziti transit: ${err.message || err}`);
        
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
          logs: [...itemLogs, `[Error] ${err.message || err}`],
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
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
};
