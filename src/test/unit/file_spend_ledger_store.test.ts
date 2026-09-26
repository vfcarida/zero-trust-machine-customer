import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSpendLedgerStore } from '../../infrastructure/storage/file_spend_ledger_store';
import { SpendRecord } from '../../domain/services/spend_ledger';

describe('FileSpendLedgerStore Unit Tests', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztmc-store-test-'));
    tempFile = path.join(tempDir, 'subfolder', 'spend_ledger.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const sampleRecord: SpendRecord = {
    id: 'rec_001',
    nonce: 'nonce_001',
    amountUcents: 15000000,
    merchantId: 'merchant_cloud_aws',
    currency: 'USD',
    state: 'SETTLED',
    timestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('creates parent directory and saves transaction to disk', () => {
    const store = new FileSpendLedgerStore(tempFile);
    store.saveTransaction(sampleRecord);

    expect(fs.existsSync(tempFile)).toBe(true);
    const diskData = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
    expect(diskData).toHaveLength(1);
    expect(diskData[0].nonce).toBe('nonce_001');
    expect(diskData[0].amountUcents).toBe(15000000);
  });

  it('retrieves transaction by nonce and lists all transactions', () => {
    const store = new FileSpendLedgerStore(tempFile);
    store.saveTransaction(sampleRecord);

    const retrieved = store.getTransaction('nonce_001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('rec_001');

    const all = store.getAllTransactions();
    expect(all).toHaveLength(1);
    expect(all[0].nonce).toBe('nonce_001');
  });

  it('reloads saved transactions from disk on fresh instance', () => {
    const store1 = new FileSpendLedgerStore(tempFile);
    store1.saveTransaction(sampleRecord);

    const store2 = new FileSpendLedgerStore(tempFile);
    const retrieved = store2.getTransaction('nonce_001');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.amountUcents).toBe(15000000);
    expect(store2.getAllTransactions()).toHaveLength(1);
  });

  it('calculates daily spend correctly for settled transactions', () => {
    const store = new FileSpendLedgerStore(tempFile);
    store.saveTransaction(sampleRecord);
    store.saveTransaction({
      ...sampleRecord,
      id: 'rec_002',
      nonce: 'nonce_002',
      amountUcents: 5000000,
      state: 'FAILED',
    });

    // FAILED state should not be counted
    expect(store.getDailySpendUcents()).toBe(15000000);
  });

  it('handles corrupted JSON on disk gracefully by initializing empty ledger', () => {
    // Ensure parent dir exists and write corrupt JSON
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(tempFile, '{ NOT_VALID_JSON ...', 'utf8');

    const store = new FileSpendLedgerStore(tempFile);
    expect(store.getAllTransactions()).toHaveLength(0);
    expect(store.getTransaction('nonce_001')).toBeNull();
  });

  it('clears all transactions and updates file on disk', () => {
    const store = new FileSpendLedgerStore(tempFile);
    store.saveTransaction(sampleRecord);
    expect(store.getAllTransactions()).toHaveLength(1);

    store.clear();
    expect(store.getAllTransactions()).toHaveLength(0);
    const diskData = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
    expect(diskData).toHaveLength(0);
  });
});
