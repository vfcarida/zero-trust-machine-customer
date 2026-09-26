'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
import { defaultDecisionEngine } from '@/domain/services/agent_decision_engine';
import { DPoPManager } from '@/infrastructure/auth/dpop';
import { safeJsonParse } from '@/lib/utils';

// Inventory resource interface definition
export interface ResourceState {
  name: string;
  type: 'compute' | 'coolant';
  level: number; // Percentage value (0 to 100)
  capacity: string;
  costPerUnitUcents: number;
  replenishQuantity: number;
  merchantId: string;
  unitName: string;
}

// Transaction register record definition
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
  const isHydratedRef = useRef(false);
  
  // 1. Core States
  const [inventory, setInventory] = useState<Record<'compute' | 'coolant', ResourceState>>({
    compute: {
      name: 'Cloud CPU Compute instances',
      type: 'compute',
      level: 85,
      capacity: '64 Cores',
      costPerUnitUcents: 250000, // $0.25 USD per core-hour
      replenishQuantity: 32, // Refills 32 units ($8.00 USD)
      merchantId: 'aws_compute',
      unitName: 'Cores',
    },
    coolant: {
      name: 'Hardware Coolant Reserve Level',
      type: 'coolant',
      level: 75,
      capacity: '50 Liters',
      costPerUnitUcents: 400000, // $0.40 USD per Liter
      replenishQuantity: 15, // Refills 15 Liters ($6.00 USD)
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
  
  // Synchronization references to prevent race conditions during asynchronous state updates
  const agentKeysRef = useRef<{ publicKey: string; privateKey: string } | null>(null);
  const dailySpendRef = useRef<number>(0);
  const inventoryRef = useRef<Record<'compute' | 'coolant', ResourceState>>(inventory);
  const queueRef = useRef<(() => Promise<unknown>)[]>([]);
  const queueProcessingRef = useRef<boolean>(false);

  // Synchronize state references
  useEffect(() => {
    dailySpendRef.current = dailySpendUcents;
  }, [dailySpendUcents]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // Offline-first safe storage bootstrap
  useEffect(() => {
    // Cryptographic delegation keys
    const savedKeys = localStorage.getItem('zt-agent-keys');
    let loadedKeys: { publicKey: string; privateKey: string } | null = null;
    if (savedKeys) {
      loadedKeys = safeJsonParse<{ publicKey: string; privateKey: string } | null>(savedKeys, null);
    }
    if (!loadedKeys) {
      loadedKeys = generateAgentKeyPair();
      localStorage.setItem('zt-agent-keys', JSON.stringify(loadedKeys));
    }
    agentKeysRef.current = loadedKeys;

    // Wallet Guard Mode settings
    const savedSettings = localStorage.getItem('zt-guard-settings');
    const settings = savedSettings ? safeJsonParse<GuardSettings | null>(savedSettings, null) : null;

    // Ledger transactions list
    const savedLedger = localStorage.getItem('zt-ledger');
    const parsedLedger = savedLedger ? safeJsonParse<LedgerItem[]>(savedLedger, []) : null;

    // Inventory states
    const savedInv = localStorage.getItem('zt-inventory');
    const parsedInv = savedInv ? safeJsonParse<Record<'compute' | 'coolant', ResourceState> | null>(savedInv, null) : null;

    queueMicrotask(() => {
      setAgentKeys(loadedKeys);
      if (settings) {
        setGuardSettingsState(settings);
      }
      if (parsedLedger) {
        setLedger(parsedLedger);
        const todayStr = new Date().toISOString().split('T')[0];
        const todaySpend = parsedLedger
          .filter((item) => item.status === 'SUCCESS' && item.timestamp.startsWith(todayStr))
          .reduce((sum, item) => sum + item.amountUcents, 0);
        setDailySpendUcents(todaySpend);
        dailySpendRef.current = todaySpend;
      }
      if (parsedInv) {
        setInventory(parsedInv);
        inventoryRef.current = parsedInv;
      }
      isHydratedRef.current = true;
    });
  }, []);

  // Sync state modifications back to local storage cleanly inside side effect hooks (React Purity)
  useEffect(() => {
    if (!isHydratedRef.current) return;
    localStorage.setItem('zt-inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    localStorage.setItem('zt-ledger', JSON.stringify(ledger));
  }, [ledger]);

  const setGuardSettings = (settings: GuardSettings) => {
    setGuardSettingsState(settings);
    localStorage.setItem('zt-guard-settings', JSON.stringify(settings));
  };

  const rotateKeys = () => {
    const keys = generateAgentKeyPair();
    agentKeysRef.current = keys;
    setAgentKeys(keys);
    localStorage.setItem('zt-agent-keys', JSON.stringify(keys));
  };

  const clearLedger = () => {
    setLedger([]);
    setDailySpendUcents(0);
    dailySpendRef.current = 0;
    localStorage.removeItem('zt-ledger');
  };

  // Sequential task executor to prevent concurrent transaction budget race conditions
  const runQueue = useCallback(async () => {
    if (queueProcessingRef.current) return;
    queueProcessingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error('Queue task execution failure:', err);
        }
      }
    }
    
    queueProcessingRef.current = false;
  }, []);

  /**
   * Internal synchronized procurement execution.
   */
  const executeAIProcurement = useCallback(
    async (
      resourceType: 'compute' | 'coolant',
      reasoning: string
    ): Promise<LedgerItem> => {
      const res = inventoryRef.current[resourceType];
      const decision = defaultDecisionEngine.evaluateProcurement({
        resourceType,
        name: res.name,
        currentLevel: res.level,
        criticalThreshold: 20.0,
        capacity: res.capacity,
        costPerUnitUcents: res.costPerUnitUcents,
        replenishQuantity: res.replenishQuantity,
        merchantId: res.merchantId,
        unitName: res.unitName,
        triggerReason: reasoning,
      });

      const amountUcents = decision.amountUcents;
      const intent = decision.intent;
      const ledgerId = `item_${Date.now()}`;
      const itemLogs: string[] = [];

      setAiLogs([]);
      const logToAI = (text: string) => {
        itemLogs.push(`[Gemma E2B] ${text}`);
        setAiLogs((prev) => [...prev, text]);
      };

      for (const step of decision.reasoningSteps) {
        logToAI(step.message);
        await new Promise((r) => setTimeout(r, 400));
      }

      const rawPayload = decision.rawPayload;
      const envelope = decision.envelope;

      // Resolve agent keys (fallback to on-demand generation if not yet bootstrapped)
      let activeKeys = agentKeysRef.current;
      if (!activeKeys) {
        const savedKeys = localStorage.getItem('zt-agent-keys');
        if (savedKeys) {
          activeKeys = safeJsonParse<{ publicKey: string; privateKey: string } | null>(savedKeys, null);
        }
        if (!activeKeys) {
          activeKeys = generateAgentKeyPair();
          localStorage.setItem('zt-agent-keys', JSON.stringify(activeKeys));
        }
        agentKeysRef.current = activeKeys;
      }

      // Sign payload
      const signature = signX402Payload(rawPayload, activeKeys.privateKey);
      const signedPayload: X402Payload = { ...rawPayload, signature };
      
      logToAI(`🔑 Signing payload with RSA-2048 delegated agent wallet private key...`);
      logToAI(`🖋️ Generated cryptographic signature: ${signature.substring(0, 24)}...`);
      await new Promise((r) => setTimeout(r, 300));

      // Enforce Guard Mode compliance check
      logToAI(`🛡️ Sending signed payload to wallet-local Guard Mode firewall...`);
      await new Promise((r) => setTimeout(r, 400));

      // Use synchronized ref for current spend to prevent race condition bypasses
      const guardResult = evaluateTransaction(signedPayload, dailySpendRef.current, guardSettings);

      let newLedgerItem: LedgerItem;

      if (!guardResult.approved) {
        logToAI(`❌ Guard Mode Alert: TRANSACTION REJECTED. Reason: ${guardResult.reason}`);
        
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
        logToAI(`✅ Guard Mode Verification: APPROVED. Daily limit and allowlist validations passed.`);
        logToAI(`🛡️ Generating RFC 9449 Demonstrating Proof-of-Possession (DPoP) token...`);
        
        const dpopManager = new DPoPManager();
        const targetOrigin =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'http://localhost:3000';
        const dpopProof = dpopManager.generateProofSync(
          'POST',
          `${targetOrigin}/api/transmit-ziti`
        );
        logToAI(`🔑 DPoP Proof generated. JTI: ${dpopProof.jti.substring(0, 8)}..., Alg: ES256.`);

        logToAI(`🌐 Dispatching secure overlay transaction to OpenZiti Edge Router...`);
        await new Promise((r) => setTimeout(r, 300));

        try {
          // Post payload to Next.js API Route for server-side native tunneling
          const response = await fetch('/api/transmit-ziti', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'DPoP': dpopProof.jwt,
            },
            body: JSON.stringify({
              payload: { ...signedPayload, dpopProof: dpopProof.jwt },
              publicKey: activeKeys.publicKey,
              dpopProof: dpopProof.jwt,
              envelope,
              guardSettings,
            }),
          });

          const data = await response.json();
          
          // Append server-side Ziti tunnel events logs to agent log history
          if (data.logs) {
            data.logs.forEach((logLine: string) => itemLogs.push(logLine));
          }

          if (response.ok && data.success && data.responsePayload.success) {
            const settlement: X402SettlementResponse = data.responsePayload;
            if (settlement.idempotentReplay) {
              logToAI(`ℹ️ Idempotent replay detected for transaction ${settlement.transactionId}. Funds previously settled; spend counter preserved.`);
            } else {
              logToAI(`🎉 Transaction settled successfully! Auth reference: ${settlement.authCode}.`);
              
              // Refill hardware resource level
              const nextInventory = {
                ...inventoryRef.current,
                [resourceType]: {
                  ...inventoryRef.current[resourceType],
                  level: Math.min(100, inventoryRef.current[resourceType].level + 50), // Increment by 50% capacity
                },
              };
              setInventory(nextInventory);
              inventoryRef.current = nextInventory;

              // Increment daily spend synchronized counter
              const nextDailySpend = dailySpendRef.current + amountUcents;
              dailySpendRef.current = nextDailySpend;
              setDailySpendUcents(nextDailySpend);
            }

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
            logToAI(`❌ Settlement Processor Failure: ${data.error || 'Unknown processor error'}`);
            
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
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logToAI(`❌ Connection error during OpenZiti transit: ${errMsg}`);
          
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
            logs: [...itemLogs, `[Error] ${errMsg}`],
            payload: signedPayload,
          };
        }
      }

      setLedger((prev) => [newLedgerItem, ...prev]);
      return newLedgerItem;
    },
    [guardSettings]
  );

  /**
   * Enqueues and triggers the machine procurement pipeline: 
   * Gemma model decision -> Payload generation -> Guard Mode compliance check -> OpenZiti routing.
   */
  const triggerAIProcurement = useCallback(
    (
      resourceType: 'compute' | 'coolant',
      reasoning: string
    ): Promise<LedgerItem> => {
      return new Promise((resolve, reject) => {
        queueRef.current.push(async () => {
          try {
            const item = await executeAIProcurement(resourceType, reasoning);
            resolve(item);
          } catch (err) {
            reject(err);
          }
        });
        runQueue();
      });
    },
    [executeAIProcurement, runQueue]
  );

  // Hardware depletion simulation loop (every 4 seconds)
  useEffect(() => {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

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
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Autopilot loop: monitors critical depletion state (< 20%)
  useEffect(() => {
    if (!isHydratedRef.current || isProcessing || !isAutopilot) return;

    const checkAndProcure = async () => {
      if (inventory.compute.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'compute',
          `Critical Telemetry: Cloud processing capacity at ${inventory.compute.level.toFixed(1)}%. Triggering urgent Core allocation request.`
        );
        setIsProcessing(false);
      } else if (inventory.coolant.level < 20 && !isProcessing) {
        setIsProcessing(true);
        await triggerAIProcurement(
          'coolant',
          `Physical Alert: Coolant fluid below safe operational bounds (${inventory.coolant.level.toFixed(1)}%). Replenishing reservoir.`
        );
        setIsProcessing(false);
      }
    };

    checkAndProcure();
  }, [inventory, isAutopilot, isProcessing, triggerAIProcurement]);

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
