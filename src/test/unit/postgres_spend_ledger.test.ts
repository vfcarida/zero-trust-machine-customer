import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresSpendLedgerStore, ISqlClient } from '../../infrastructure/storage/postgres_spend_ledger_store';
import { SpendRecord } from '../../domain/services/spend_ledger';

describe('PostgresSpendLedgerStore', () => {
  let mockClient: ISqlClient;
  let queries: { sql: string; params?: unknown[] }[];

  beforeEach(() => {
    queries = [];
    mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      }),
    };
  });

  it('rejects invalid table names to prevent SQL injection', () => {
    expect(() => new PostgresSpendLedgerStore(mockClient, { tableName: 'ledger; DROP TABLE x;' })).toThrow(
      /Invalid SQL table name/
    );
    expect(() => new PostgresSpendLedgerStore(mockClient, { tableName: '123_invalid' })).toThrow(
      /Invalid SQL table name/
    );
  });

  it('initializes schema and indexes on first operation when autoMigrate is true', async () => {
    const store = new PostgresSpendLedgerStore(mockClient, { tableName: 'custom_ledger', autoMigrate: true });
    await store.getTransaction('nonce1');

    expect(mockClient.query).toHaveBeenCalledTimes(2);
    expect(queries[0].sql).toContain('CREATE TABLE IF NOT EXISTS custom_ledger');
    expect(queries[1].sql).toContain('SELECT id, nonce, amount_ucents');
    expect(queries[1].params).toEqual(['nonce1']);
  });

  it('saves transactions with parameterized upsert query', async () => {
    const store = new PostgresSpendLedgerStore(mockClient, { autoMigrate: false });
    const record: SpendRecord = {
      id: 'tx_1',
      nonce: 'nonce_abc',
      amountUcents: 5000000,
      merchantId: 'aws_compute',
      currency: 'USD',
      state: 'SETTLING',
      timestamp: '2026-09-25T12:00:00.000Z',
      updatedAt: '2026-09-25T12:00:00.000Z',
    };

    await store.saveTransaction(record);

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(queries[0].sql).toContain('INSERT INTO spend_ledger');
    expect(queries[0].sql).toContain('ON CONFLICT (nonce) DO UPDATE');
    expect(queries[0].params).toEqual([
      'tx_1',
      'nonce_abc',
      5000000,
      'aws_compute',
      'USD',
      'SETTLING',
      null, // authCode
      null, // transactionId
      null, // error
      null, // compensationId
      '2026-09-25T12:00:00.000Z',
      expect.any(String), // updatedAt
    ]);
  });

  it('maps database rows correctly to SpendRecord entities', async () => {
    const fakeRow = {
      id: 'tx_found',
      nonce: 'nonce_found',
      amount_ucents: '7500000',
      merchant_id: 'mcmaster_carr',
      currency: 'USD',
      state: 'SETTLED',
      auth_code: 'AUTH999',
      transaction_id: 'net_tx_123',
      error: null,
      compensation_id: null,
      timestamp: '2026-09-25T10:00:00.000Z',
      updated_at: '2026-09-25T10:01:00.000Z',
    };

    (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [fakeRow] });

    const store = new PostgresSpendLedgerStore(mockClient, { autoMigrate: false });
    const result = await store.getTransaction('nonce_found');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('tx_found');
    expect(result?.amountUcents).toBe(7500000);
    expect(result?.state).toBe('SETTLED');
    expect(result?.authCode).toBe('AUTH999');
    expect(result?.transactionId).toBe('net_tx_123');
    expect(result?.error).toBeUndefined();
  });

  it('calculates daily spend using parameterized window timestamp', async () => {
    (mockClient.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [{ total: '15000000' }] };
    });

    const store = new PostgresSpendLedgerStore(mockClient, { autoMigrate: false });
    const windowStart = '2026-09-24T00:00:00.000Z';
    const total = await store.getDailySpendUcents(windowStart);

    expect(total).toBe(15000000);
    expect(queries[0].sql).toContain('SUM(amount_ucents)');
    expect(queries[0].params).toEqual([new Date(windowStart).toISOString()]);
  });

  it('clears all transactions via TRUNCATE/DELETE query', async () => {
    const store = new PostgresSpendLedgerStore(mockClient, { autoMigrate: false });
    await store.clear();

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(queries[0].sql).toContain('DELETE FROM spend_ledger');
  });
});
