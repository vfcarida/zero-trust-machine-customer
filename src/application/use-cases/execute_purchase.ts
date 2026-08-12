import { X402Payload, GuardSettings, X402SettlementResponse } from '../../domain/types';
import { AgentReasoningService } from '../../domain/services/agent_reasoning';
import { TaintEnvelopeTracker } from '../../domain/entities/taint_envelope';
import { AgentKernel } from '../kernel/agent_kernel';
import { DPoPManager } from '../../infrastructure/auth/dpop';
import { SpiffeWorkloadIdentity } from '../../infrastructure/auth/spiffe';
import { transmitPayloadOverZiti, ZitiTransmissionResult } from '../../lib/ziti_server';
import { signX402Payload } from '../../lib/agent_pay_protocol';
import { logger } from '../../infrastructure/logging/logger';

export interface ExecutePurchaseCommand {
  telemetry: { resourceType: 'compute' | 'coolant'; currentLevel: number; threshold: number };
  agentId: string;
  privateKeyPem: string;
  guardSettings: GuardSettings;
  hitlApproval?: boolean;
}

export interface ExecutePurchaseResult {
  success: boolean;
  settlementResponse?: X402SettlementResponse;
  zitiLogs: string[];
  reasoningSteps: string[];
  dpopProofHeader?: string;
  spiffeId?: string;
  error?: string;
}

/**
 * Use Case: Execute Machine Purchase.
 * Orchestrates agent reasoning, cryptographic signing, AgentKernel interception, OPA authorization,
 * DPoP proof generation, SPIFFE workload identity fetch, and OpenZiti dark tunnel transmission.
 */
export class ExecuteMachinePurchaseUseCase {
  private reasoningService: AgentReasoningService;
  private kernel: AgentKernel;
  private dpopManager: DPoPManager;
  private spiffeHandler: SpiffeWorkloadIdentity;

  constructor(
    guardSettings: GuardSettings,
    dpopManager?: DPoPManager,
    spiffeHandler?: SpiffeWorkloadIdentity
  ) {
    this.reasoningService = new AgentReasoningService();
    this.kernel = new AgentKernel(guardSettings);
    this.dpopManager = dpopManager || new DPoPManager();
    this.spiffeHandler = spiffeHandler || new SpiffeWorkloadIdentity();
  }

  public async execute(command: ExecutePurchaseCommand): Promise<ExecutePurchaseResult> {
    logger.info('Starting ExecuteMachinePurchaseUseCase orchestration flow', {
      agentId: command.agentId,
      resourceType: command.telemetry.resourceType,
      currentLevel: command.telemetry.currentLevel,
    });

    try {
      // 1. Fetch SPIFFE Workload Identity SVID (NIST SP 800-204)
      const svid = await this.spiffeHandler.fetchX509Svid();

      // 2. Reason and generate transaction payload
      const reasoning = this.reasoningService.generatePurchaseIntent(
        command.telemetry,
        command.agentId,
        command.guardSettings
      );

      // 3. Cryptographically sign x402 payload
      const signature = signX402Payload(reasoning.proposedPayload, command.privateKeyPem);
      const fullPayload: X402Payload = {
        ...reasoning.proposedPayload,
        signature,
      };

      // 4. Wrap in Trusted Metadata Envelope and apply Taint Tracking
      let envelope = TaintEnvelopeTracker.wrapPayload(
        JSON.stringify(fullPayload),
        `agent_telemetry_${command.telemetry.resourceType}`,
        'UNTAINTED'
      );

      if (command.hitlApproval && envelope.taintStatus === 'TAINTED') {
        envelope = TaintEnvelopeTracker.sanitizeEnvelope(envelope, true);
      }

      // 5. Intercept and evaluate via AgentKernel & OPA Policy Engine
      const kernelResult = await this.kernel.interceptAndValidate({
        action: 'execute_transaction',
        payload: fullPayload,
        envelope,
        actorSpiffeId: svid.spiffeId,
      });

      if (!kernelResult.allowed) {
        return {
          success: false,
          zitiLogs: [`[${new Date().toISOString()}] ❌ Kernel Authorization Denied by OPA Policy.`],
          reasoningSteps: reasoning.reasoningSteps,
          error: 'Execution blocked by AgentKernel OPA Policy.',
        };
      }

      // 6. Generate RFC 9449 DPoP Proof for transmission
      const dpopProof = this.dpopManager.generateProof(
        'POST',
        'http://localhost:3000/api/transmit-ziti',
        'ephemeral_oauth_token'
      );

      // 7. Transmit payload over OpenZiti dark network tunnel
      const zitiResult: ZitiTransmissionResult = await transmitPayloadOverZiti(
        'ap4m-settlement-service',
        fullPayload
      );

      return {
        success: zitiResult.success,
        settlementResponse: zitiResult.responsePayload as X402SettlementResponse,
        zitiLogs: zitiResult.logs,
        reasoningSteps: reasoning.reasoningSteps,
        dpopProofHeader: JSON.stringify(dpopProof),
        spiffeId: svid.spiffeId,
      };
    } catch (err: any) {
      logger.error('ExecuteMachinePurchaseUseCase error encountered', { error: err.message });
      return {
        success: false,
        zitiLogs: [`[${new Date().toISOString()}] ❌ Orchestration Exception: ${err.message}`],
        reasoningSteps: [],
        error: err.message,
      };
    }
  }
}
