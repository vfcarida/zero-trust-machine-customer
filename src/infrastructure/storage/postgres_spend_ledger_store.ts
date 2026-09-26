import { ISpendLedgerStore, SpendRecord } from '../../domain/services/spend_ledger';
import { TransactionState } from '../../domain/services/settlement_state_machine';
import { logger } from '../logging/logger';

/**
 * Generic minimal SQL Client interface compatible with pg, pg-pool, postgres, or Neon serverless.
 */
export interface ISqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresSpendLedgerOptions {
  tableName?: string;
  autoMigrate?: boolean;
}

interface RawSpendRecordRow {
  id: string;
  nonce: string;
  amount_ucents: string | number;
  merchant_id: string;
  currency: string;
  state: string;
  auth_code: string | null;
  transaction_id: string | null;
  error: string | null;
  compensation_id: string | null;
  timestamp: string | Date;
  updated_at: string | Date;
}

/**
 * Production-ready PostgreSQL Spend Ledger Store.
 *
 * Implements ISpendLedgerStore for distributed, multi-instance, and high-availability deployments.
 * All SQL queries use parameterized queries ($1, $2, ...) to prevent SQL injection.
 * Provides idempotent table initialization and atomic upsert semantics on conflict.
 */
export class PostgresSpendLedgerStore implements ISpendLedgerStore {
  private client: ISqlClient;
  private tableName: string;
  private autoMigrate: boolean;
  private isMigrated = false;

  constructor(client: ISqlClient, options?: PostgresSpendLedgerOptions) {
    this.client = client;
    // Sanitize table name to prevent SQL injection in identifier
    const rawTableName = options?.tableName || 'spend_ledger';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawTableName)) {
      throw new Error(`Invalid SQL table name: "${rawTableName}". Must be alphanumeric and underscore only.`);
    }
    this.tableName = rawTableName;
    this.autoMigrate = options?.autoMigrate ?? true;
  }

  /**
   * Idempotently create schema and indexes if they do not exist.
   */
  public async ensureSchema(): Promise<void> {
    if (this.isMigrated) return;

    const ddl = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR(64) PRIMARY KEY,
        nonce VARCHAR(64) UNIQUE NOT NULL,
        amount_ucents BIGINT NOT NULL,
        merchant_id VARCHAR(128) NOT NULL,
        currency VARCHAR(16) NOT NULL,
        state VARCHAR(32) NOT NULL,
        auth_code VARCHAR(64),
        transaction_id VARCHAR(128),
        error TEXT,
        compensation_id VARCHAR(128),
        timestamp TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_timestamp ON ${this.tableName}(timestamp);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_nonce ON ${this.tableName}(nonce);
    `;

    try {
      await this.client.query(ddl);
      this.isMigrated = true;
      logger.info('PostgresSpendLedgerStore schema verified', { table: this.tableName });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to initialize Postgres spend ledger schema', { error: msg, table: this.tableName });
      throw err;
    }
  }

  private async prepare(): Promise<void> {
    if (this.autoMigrate && !this.isMigrated) {
      await this.ensureSchema();
    }
  }

  private mapRowToRecord(row: RawSpendRecordRow): SpendRecord {
    return {
      id: row.id,
      nonce: row.nonce,
      amountUcents: typeof row.amount_ucents === 'string' ? parseInt(row.amount_ucents, 10) : Number(row.amount_ucents),
      merchantId: row.merchant_id,
      currency: row.currency,
      state: row.state as TransactionState,
      authCode: row.auth_code ?? undefined,
      transactionId: row.transaction_id ?? undefined,
      error: row.error ?? undefined,
      compensationId: row.compensation_id ?? undefined,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
    };
  }

  public async getTransaction(nonce: string): Promise<SpendRecord | null> {
    await this.prepare();

    const sql = `
      SELECT id, nonce, amount_ucents, merchant_id, currency, state,
             auth_code, transaction_id, error, compensation_id, timestamp, updated_at
      FROM ${this.tableName}
      WHERE nonce = $1
      LIMIT 1
    `;

    const result = await this.client.query<RawSpendRecordRow>(sql, [nonce]);
    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return this.mapRowToRecord(result.rows[0]);
  }

  public async saveTransaction(record: SpendRecord): Promise<void> {
    await this.prepare();

    const updatedAt = new Date().toISOString();
    const sql = `
      INSERT INTO ${this.tableName} (
        id, nonce, amount_ucents, merchant_id, currency, state,
        auth_code, transaction_id, error, compensation_id, timestamp, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (nonce) DO UPDATE SET
        state = EXCLUDED.state,
        auth_code = EXCLUDED.auth_code,
        transaction_id = EXCLUDED.transaction_id,
        error = EXCLUDED.error,
        compensation_id = EXCLUDED.compensation_id,
        updated_at = EXCLUDED.updated_at
    `;

    const params = [
      record.id,
      record.nonce,
      record.amountUcents,
      record.merchantId,
      record.currency,
      record.state,
      record.authCode ?? null,
      record.transactionId ?? null,
      record.error ?? null,
      record.compensationId ?? null,
      record.timestamp,
      updatedAt,
    ];

    await this.client.query(sql, params);
  }

  public async getAllTransactions(): Promise<SpendRecord[]> {
    await this.prepare();

    const sql = `
      SELECT id, nonce, amount_ucents, merchant_id, currency, state,
             auth_code, transaction_id, error, compensation_id, timestamp, updated_at
      FROM ${this.tableName}
      ORDER BY timestamp DESC
    `;

    const result = await this.client.query<RawSpendRecordRow>(sql);
    return (result.rows || []).map((row) => this.mapRowToRecord(row));
  }

  public async getDailySpendUcents(windowStartIso?: string): Promise<number> {
    await this.prepare();

    const windowStart = windowStartIso
      ? new Date(windowStartIso).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT COALESCE(SUM(amount_ucents), 0) AS total
      FROM ${this.tableName}
      WHERE timestamp >= $1 AND state IN ('SETTLED', 'SETTLING')
    `;

    const result = await this.client.query<{ total: string | number }>(sql, [windowStart]);
    if (!result.rows || result.rows.length === 0) {
      return 0;
    }

    const total = result.rows[0].total;
    return typeof total === 'string' ? parseInt(total, 10) : Number(total);
  }

  public async clear(): Promise<void> {
    await this.prepare();
    await this.client.query(`DELETE FROM ${this.tableName}`);
  }
}
