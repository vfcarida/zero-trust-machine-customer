import { ISpendLedgerStore } from '../../domain/services/spend_ledger';
import { FileSpendLedgerStore } from './file_spend_ledger_store';

let defaultStoreInstance: ISpendLedgerStore | null = null;

/**
 * Returns the active SpendLedgerStore singleton instance.
 * Defaults to durable FileSpendLedgerStore (.data/spend_ledger.json).
 */
export function getSpendLedgerStore(): ISpendLedgerStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new FileSpendLedgerStore();
  }
  return defaultStoreInstance;
}

/**
 * Overrides the SpendLedgerStore instance (useful for testing or custom persistence).
 */
export function setSpendLedgerStore(store: ISpendLedgerStore | null): void {
  defaultStoreInstance = store;
}
