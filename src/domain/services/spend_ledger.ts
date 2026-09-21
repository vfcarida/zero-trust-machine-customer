import { TransactionState } from './settlement_state_machine';
import { logger } from '../../infrastructure/logging/logger';

function getNodeFs(): typeof import('fs') | null {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const req = eval('require');
      return req('fs');
    }
  } catch {
    return null;
  }
  return null;
}

function getNodePath(): typeof import('path') | null {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const req = eval('require');
      return req('path');
    }
  } catch {
    return null;
  }
  return null;
}

export interface SpendRecord {
  id: string;
  nonce: string;
  amountUcents: number;
  merchantId: string;
  currency: string;
  state: TransactionState;
  authCode?: string;
  transactionId?: string;
  error?: string;
  compensationId?: string;
  timestamp: string;
  updatedAt: string;
}

/**
 * Pluggable Storage Interface for the Unified Spend Ledger.
 *
 * Extension Point:
 * In a distributed multi-tenant production environment, implement this interface
 * backed by PostgreSQL (e.g. Prisma / Drizzle) or AWS DynamoDB with strict ACID guarantees:
 *
 * ```typescript
 * export class PostgresSpendLedgerStore implements ISpendLedgerStore {
 *   constructor(private db: DatabasePool) {}
 *   async getTransaction(nonce: string): Promise<SpendRecord | null> { ... }
 *   async saveTransaction(record: SpendRecord): Promise<void> { ... }
 *   async getDailySpendUcents(windowStartIso: string): Promise<number> { ... }
 * }
 * ```
 */
export interface ISpendLedgerStore {
  getTransaction(nonce: string): Promise<SpendRecord | null> | (SpendRecord | null);
  saveTransaction(record: SpendRecord): Promise<void> | void;
  getAllTransactions(): Promise<SpendRecord[]> | SpendRecord[];
  getDailySpendUcents(windowStartIso?: string): Promise<number> | number;
  clear(): Promise<void> | void;
}

/**
 * In-Memory Spend Ledger Store for isolated unit and integration tests.
 */
export class InMemorySpendLedgerStore implements ISpendLedgerStore {
  private records: Map<string, SpendRecord> = new Map(); // nonce -> SpendRecord

  public getTransaction(nonce: string): SpendRecord | null {
    return this.records.get(nonce) || null;
  }

  public saveTransaction(record: SpendRecord): void {
    this.records.set(record.nonce, { ...record, updatedAt: new Date().toISOString() });
  }

  public getAllTransactions(): SpendRecord[] {
    return Array.from(this.records.values());
  }

  public getDailySpendUcents(windowStartIso?: string): number {
    const windowStart = windowStartIso
      ? new Date(windowStartIso).getTime()
      : Date.now() - 24 * 60 * 60 * 1000;

    let total = 0;
    for (const record of this.records.values()) {
      const recordTime = new Date(record.timestamp).getTime();
      // Only count transactions that are currently SETTLING (reserved) or SETTLED (finalized)
      if (recordTime >= windowStart && (record.state === 'SETTLED' || record.state === 'SETTLING')) {
        total += record.amountUcents;
      }
    }
    return total;
  }

  public clear(): void {
    this.records.clear();
  }
}

/**
 * Durable File-backed Spend Ledger Store that persists state to disk across process restarts.
 */
export class FileSpendLedgerStore implements ISpendLedgerStore {
  private filePath: string;
  private records: Map<string, SpendRecord> = new Map();

  constructor(filePath?: string) {
    const nodePath = getNodePath();
    this.filePath =
      filePath ||
      (nodePath ? nodePath.resolve(process.cwd(), '.data', 'spend_ledger.json') : '.data/spend_ledger.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    const nodeFs = getNodeFs();
    if (!nodeFs) return;
    try {
      if (nodeFs.existsSync(this.filePath)) {
        const raw = nodeFs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.records.clear();
          for (const item of parsed) {
            if (item && item.nonce) {
              this.records.set(item.nonce, item);
            }
          }
          logger.info('Loaded durable spend ledger from disk', {
            path: this.filePath,
            recordCount: this.records.size,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to load spend ledger from disk, initializing empty ledger', {
        error: msg,
        path: this.filePath,
      });
      this.records.clear();
    }
  }

  private persistToDisk(): void {
    const nodeFs = getNodeFs();
    const nodePath = getNodePath();
    if (!nodeFs || !nodePath) return;
    try {
      const dir = nodePath.dirname(this.filePath);
      if (!nodeFs.existsSync(dir)) {
        nodeFs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.records.values()), null, 2);
      nodeFs.writeFileSync(this.filePath, data, 'utf8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to persist spend ledger to disk', {
        error: msg,
        path: this.filePath,
      });
    }
  }

  public getTransaction(nonce: string): SpendRecord | null {
    return this.records.get(nonce) || null;
  }

  public saveTransaction(record: SpendRecord): void {
    this.records.set(record.nonce, { ...record, updatedAt: new Date().toISOString() });
    this.persistToDisk();
  }

  public getAllTransactions(): SpendRecord[] {
    return Array.from(this.records.values());
  }

  public getDailySpendUcents(windowStartIso?: string): number {
    const windowStart = windowStartIso
      ? new Date(windowStartIso).getTime()
      : Date.now() - 24 * 60 * 60 * 1000;

    let total = 0;
    for (const record of this.records.values()) {
      const recordTime = new Date(record.timestamp).getTime();
      if (recordTime >= windowStart && (record.state === 'SETTLED' || record.state === 'SETTLING')) {
        total += record.amountUcents;
      }
    }
    return total;
  }

  public clear(): void {
    this.records.clear();
    this.persistToDisk();
  }
}

// Global default singleton ledger store for the application
export const defaultSpendLedgerStore: ISpendLedgerStore =
  typeof window === 'undefined' && getNodeFs()
    ? new FileSpendLedgerStore()
    : new InMemorySpendLedgerStore();

/**
 * Unified Spend Ledger: Single source of truth for machine customer transaction lifecycle and budget quotas.
 */
export class SpendLedger {
  private store: ISpendLedgerStore;

  constructor(store?: ISpendLedgerStore) {
    this.store = store || defaultSpendLedgerStore;
  }

  public getStore(): ISpendLedgerStore {
    return this.store;
  }

  public async getDailySpendUcents(windowStartIso?: string): Promise<number> {
    return await this.store.getDailySpendUcents(windowStartIso);
  }

  public getDailySpendUcentsSync(windowStartIso?: string): number {
    const res = this.store.getDailySpendUcents(windowStartIso);
    return typeof res === 'number' ? res : 0;
  }

  public async getTransaction(nonce: string): Promise<SpendRecord | null> {
    return await this.store.getTransaction(nonce);
  }

  public async saveTransaction(record: SpendRecord): Promise<void> {
    await this.store.saveTransaction(record);
  }

  public async clear(): Promise<void> {
    await this.store.clear();
  }

  public async checkLimit(
    amountUcents: number,
    dailyLimitUcents: number,
    windowStartIso?: string
  ): Promise<{
    allowed: boolean;
    currentDailySpendUcents: number;
    projectedDailySpendUcents: number;
    limitUcents: number;
    reason?: string;
  }> {
    const current = await this.getDailySpendUcents(windowStartIso);
    const projected = current + amountUcents;
    const allowed = projected <= dailyLimitUcents;

    return {
      allowed,
      currentDailySpendUcents: current,
      projectedDailySpendUcents: projected,
      limitUcents: dailyLimitUcents,
      reason: allowed
        ? undefined
        : `Daily spending limit exceeded. Limit: $${(dailyLimitUcents / 1000000).toFixed(2)}, Current: $${(current / 1000000).toFixed(2)}, Projected: $${(projected / 1000000).toFixed(2)}`,
    };
  }
}

export const defaultSpendLedger = new SpendLedger(defaultSpendLedgerStore);
