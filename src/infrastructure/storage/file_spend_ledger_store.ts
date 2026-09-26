import fs from 'node:fs';
import path from 'node:path';
import { ISpendLedgerStore, SpendRecord } from '../../domain/services/spend_ledger';
import { logger } from '../logging/logger';

/**
 * Durable File-backed Spend Ledger Store.
 *
 * Implements persistent ISpendLedgerStore using standard Node.js filesystem APIs.
 * Completely decoupled from domain logic without requiring dynamic eval or module introspection hacks.
 */
export class FileSpendLedgerStore implements ISpendLedgerStore {
  private filePath: string;
  private records: Map<string, SpendRecord> = new Map();

  constructor(filePath?: string) {
    this.filePath =
      filePath ||
      path.resolve(process.cwd(), '.data', 'spend_ledger.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
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
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.records.values()), null, 2);
      fs.writeFileSync(this.filePath, data, 'utf8');
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
