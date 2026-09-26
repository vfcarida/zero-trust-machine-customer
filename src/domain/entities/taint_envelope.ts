import crypto from 'crypto';
import {
  TrustedMetadataEnvelope,
  TrustedMetadataEnvelopeSchema,
  TaintStatus,
} from '../types';
import { TaintSanitizationError } from '../errors/domain_errors';

export type ThreatCategory =
  | 'DIRECT_INSTRUCTION_OVERRIDE'
  | 'SYSTEM_PROMPT_EXTRACTION'
  | 'PRIVILEGE_ESCALATION'
  | 'FINANCIAL_HIJACKING'
  | 'DELIMITER_EVASION'
  | 'EXFILTRATION_PAYLOAD';

export interface ThreatAnalysisResult {
  isMalicious: boolean;
  threatCategories: ThreatCategory[];
  matchedPatterns: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const THREAT_RULES: { category: ThreatCategory; pattern: RegExp; name: string }[] = [
  {
    category: 'DIRECT_INSTRUCTION_OVERRIDE',
    pattern: /ignore (?:all |any |previous |above )*instructions|disregard (?:all |any )*prior|system prompt override|act as (?:dan|unrestricted)|new directive/i,
    name: 'Direct instruction override pattern',
  },
  {
    category: 'SYSTEM_PROMPT_EXTRACTION',
    pattern: /repeat your system prompt|reveal your instructions|print system prompt|dump context|output the text above/i,
    name: 'System prompt extraction pattern',
  },
  {
    category: 'PRIVILEGE_ESCALATION',
    pattern: /grant admin|elevate permissions|sudo mode|bypass authentication|set role admin|override security policy|escalate role/i,
    name: 'Privilege escalation pattern',
  },
  {
    category: 'FINANCIAL_HIJACKING',
    pattern: /bypass guard|override limit|set limit to unlimited|transfer (?:all |any )*(?:balance|funds|money)|redirect (?:payment|wallet)|send to wallet|drain wallet/i,
    name: 'Financial transaction hijacking pattern',
  },
  {
    category: 'DELIMITER_EVASION',
    pattern: /<\/?(?:system|instruction|prompt|im_start|im_end)>|\[(?:INST|\/INST|SYS|\/SYS)\]|---\s*BEGIN\s+(?:SYSTEM|PROMPT)/i,
    name: 'Special token / delimiter evasion pattern',
  },
  {
    category: 'EXFILTRATION_PAYLOAD',
    pattern: /!\[.*?\]\(https?:\/\/.*?\)|\b(?:fetch|curl|wget)\s*\(|javascript:\s*|data:text\/html|<script/i,
    name: 'Markdown / URI data exfiltration pattern',
  },
];

/**
 * Taint Tracking & Trusted Metadata Envelope System (OWASP Top 10 for Agentic Applications).
 * Encapsulates untrusted external inputs and tool outputs to prevent Prompt Injection and Confused Deputy attacks.
 */
export class TaintEnvelopeTracker {
  /**
   * Evaluates if a given source origin crossed an untrusted external boundary.
   * Untrusted boundaries include LLM outputs, tool responses, external merchant inputs,
   * unauthenticated network payloads, and untrusted third-party inputs.
   */
  public static isUntrustedBoundary(source: string): boolean {
    if (!source || typeof source !== 'string') return true;
    const s = source.toLowerCase();
    const untrustedKeywords = [
      'llm',
      'tool',
      'merchant',
      'vendor',
      'external',
      'network',
      'untrusted',
      'prompt',
      'user',
      'web',
    ];
    return untrustedKeywords.some((kw) => s.includes(kw));
  }

  /**
   * Performs deep heuristic threat analysis on content across 6 adversarial vectors.
   */
  public static analyzeContent(content: string): ThreatAnalysisResult {
    if (!content || typeof content !== 'string') {
      return { isMalicious: false, threatCategories: [], matchedPatterns: [], riskLevel: 'LOW' };
    }

    const matchedCategories = new Set<ThreatCategory>();
    const matchedPatterns: string[] = [];

    for (const rule of THREAT_RULES) {
      if (rule.pattern.test(content)) {
        matchedCategories.add(rule.category);
        matchedPatterns.push(rule.name);
      }
    }

    const threatCategories = Array.from(matchedCategories);
    const isMalicious = threatCategories.length > 0;

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (threatCategories.includes('FINANCIAL_HIJACKING') || threatCategories.includes('DELIMITER_EVASION')) {
      riskLevel = 'CRITICAL';
    } else if (threatCategories.length >= 2) {
      riskLevel = 'CRITICAL';
    } else if (threatCategories.length === 1) {
      riskLevel = 'HIGH';
    }

    return {
      isMalicious,
      threatCategories,
      matchedPatterns,
      riskLevel,
    };
  }

  /**
   * Derives real taint status by checking boundary provenance and multi-vector prompt injection heuristics.
   */
  public static deriveTaintStatus(content: string, source: string): TaintStatus {
    // 1. Boundary check: any input that crossed an untrusted boundary is tainted
    if (this.isUntrustedBoundary(source)) {
      return 'TAINTED';
    }

    // 2. Multi-vector prompt injection & adversarial heuristic check
    const analysis = this.analyzeContent(content);
    if (analysis.isMalicious) {
      return 'TAINTED';
    }

    return 'UNTAINTED';
  }

  /**
   * Wraps raw payload content into a Trusted Metadata Envelope.
   * Derives taint from boundary provenance rather than defaulting to UNTAINTED.
   */
  public static wrapPayload(
    content: string,
    source: string,
    explicitTaint?: TaintStatus
  ): TrustedMetadataEnvelope {
    const payloadId = `env_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const taintStatus: TaintStatus = explicitTaint ?? this.deriveTaintStatus(content, source);
    const requiresHITL = taintStatus === 'TAINTED';

    const envelope: TrustedMetadataEnvelope = {
      payloadId,
      source,
      content,
      taintStatus,
      timestamp,
      requiresHITL,
    };

    const validated = TrustedMetadataEnvelopeSchema.safeParse(envelope);
    if (!validated.success) {
      throw new TaintSanitizationError(`Envelope creation failed: ${validated.error.message}`);
    }

    return validated.data;
  }

  /**
   * Sanitizes a tainted envelope payload through an explicit security verification check.
   */
  public static sanitizeEnvelope(
    envelope: TrustedMetadataEnvelope,
    hitlApproval: boolean
  ): TrustedMetadataEnvelope {
    if (!hitlApproval) {
      throw new TaintSanitizationError(
        `Payload "${envelope.payloadId}" remains tainted. Human-in-the-Loop (HITL) approval was denied.`
      );
    }

    return {
      ...envelope,
      taintStatus: 'SANITIZED',
      requiresHITL: false,
    };
  }
}
