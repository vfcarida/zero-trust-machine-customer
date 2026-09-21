/**
 * Core Domain Errors for Zero Trust Machine Customer Architecture.
 */

export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly timestamp: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SecurityPolicyViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_SECURITY_POLICY_VIOLATION');
  }
}

export class TaintSanitizationError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_TAINT_SANITIZATION_FAILED');
  }
}

export class TokenExchangeError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_TOKEN_EXCHANGE_FAILED');
  }
}

export class DPoPSignatureError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_DPOP_SIGNATURE_FAILED');
  }
}

export class SpiffeIdentityError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_SPIFFE_IDENTITY_FAILED');
  }
}

export class AgentKernelQuotaExceededError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_KERNEL_QUOTA_EXCEEDED');
  }
}

export class IllegalStateTransitionError extends DomainError {
  constructor(fromState: string, toState: string, reason?: string) {
    super(
      `Illegal state transition attempted from "${fromState}" to "${toState}"${reason ? `: ${reason}` : ''}`,
      'ERR_ILLEGAL_STATE_TRANSITION'
    );
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_IDEMPOTENCY_CONFLICT');
  }
}

export class AmbiguousSettlementError extends DomainError {
  constructor(message: string) {
    super(message, 'ERR_AMBIGUOUS_SETTLEMENT');
  }
}

