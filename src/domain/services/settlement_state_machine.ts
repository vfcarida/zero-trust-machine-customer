import { IllegalStateTransitionError } from '../errors/domain_errors';

export type TransactionState =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'SETTLING'
  | 'SETTLED'
  | 'FAILED'
  | 'COMPENSATED';

export interface StateTransitionRecord {
  from: TransactionState;
  to: TransactionState;
  timestamp: string;
  reason?: string;
}

/**
 * Valid state transition graph for the Zero-Trust Settlement Lifecycle:
 *
 *   [PENDING]
 *     |  \
 *     |   ---> [FAILED] (e.g. invalid signature, schema failure, OPA deny)
 *     v
 *   [AUTHORIZED]
 *     |  \
 *     |   ---> [FAILED] (e.g. pre-flight timeout, cancelled)
 *     v
 *   [SETTLING]
 *     |  \  \
 *     |   \  ---> [COMPENSATED] (ambiguous outcome reconciled/voided)
 *     |    -----> [FAILED] (acquirer/rail rejected)
 *     v
 *   [SETTLED]
 */
const LEGAL_TRANSITIONS: Record<TransactionState, readonly TransactionState[]> = {
  PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['SETTLING', 'FAILED'],
  SETTLING: ['SETTLED', 'FAILED', 'COMPENSATED'],
  SETTLED: [], // Terminal
  FAILED: [], // Terminal
  COMPENSATED: [], // Terminal
};

export class SettlementStateMachine {
  private currentState: TransactionState;
  private history: StateTransitionRecord[] = [];

  constructor(initialState: TransactionState = 'PENDING') {
    this.currentState = initialState;
    this.history.push({
      from: initialState,
      to: initialState,
      timestamp: new Date().toISOString(),
      reason: 'Initial state creation',
    });
  }

  public getState(): TransactionState {
    return this.currentState;
  }

  public isTerminal(): boolean {
    return LEGAL_TRANSITIONS[this.currentState].length === 0;
  }

  public getHistory(): readonly StateTransitionRecord[] {
    return this.history;
  }

  public canTransitionTo(targetState: TransactionState): boolean {
    const allowed = LEGAL_TRANSITIONS[this.currentState];
    return allowed.includes(targetState);
  }

  public transitionTo(targetState: TransactionState, reason?: string): void {
    if (this.currentState === targetState) {
      return; // Idempotent no-op
    }

    if (!this.canTransitionTo(targetState)) {
      throw new IllegalStateTransitionError(
        this.currentState,
        targetState,
        reason || `Legal transitions from "${this.currentState}" are: [${LEGAL_TRANSITIONS[this.currentState].join(', ')}]`
      );
    }

    const record: StateTransitionRecord = {
      from: this.currentState,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason,
    };

    this.history.push(record);
    this.currentState = targetState;
  }
}
