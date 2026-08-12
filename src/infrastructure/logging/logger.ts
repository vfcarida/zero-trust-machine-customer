/**
 * Structured SIEM-Compatible JSON Logger (Structlog equivalent for TypeScript).
 * Outputs standardized JSON logs containing timestamp, level, context telemetry,
 * execution correlation IDs, and Non-Human Identity (NHI) claims.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  agentId?: string;
  spiffeId?: string;
  action?: string;
  merchantId?: string;
  taintStatus?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface StructuredLogMessage {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
}

export class SIEMLogger {
  private serviceName: string;

  constructor(serviceName = 'zero-trust-machine-customer') {
    this.serviceName = serviceName;
  }

  private emit(level: LogLevel, message: string, context?: LogContext): StructuredLogMessage {
    const entry: StructuredLogMessage = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    const formattedJson = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(formattedJson);
        break;
      case 'warn':
        console.warn(formattedJson);
        break;
      case 'debug':
        console.debug(formattedJson);
        break;
      case 'info':
      default:
        console.log(formattedJson);
        break;
    }

    return entry;
  }

  public debug(message: string, context?: LogContext): StructuredLogMessage {
    return this.emit('debug', message, context);
  }

  public info(message: string, context?: LogContext): StructuredLogMessage {
    return this.emit('info', message, context);
  }

  public warn(message: string, context?: LogContext): StructuredLogMessage {
    return this.emit('warn', message, context);
  }

  public error(message: string, context?: LogContext): StructuredLogMessage {
    return this.emit('error', message, context);
  }
}

export const logger = new SIEMLogger();
