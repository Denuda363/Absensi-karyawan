import {
  FinanceAccount,
  FinanceAccountKind,
  FinanceCategory,
  FinanceDatabaseState,
  FinancePaymentMethod,
  FinanceTransaction,
  FinanceTransactionType,
  FinanceTransfer,
} from '../types';
import { executeApiWithFallback, HttpApiError } from './apiClient';
import {
  clientCreateFinanceAccount,
  clientCreateFinanceCategory,
  clientCreateFinanceTransaction,
  clientCreateFinanceTransfer,
  clientDeleteFinanceAccount,
  clientDeleteFinanceCategory,
  clientDeleteFinanceTransaction,
  clientDeleteFinanceTransfer,
  clientFetchFinanceState,
  clientGetFinanceBackupPayload,
  clientRestoreFinanceBackup,
  clientUpdateFinanceAccount,
  clientUpdateFinanceCategory,
  clientUpdateFinanceTransaction,
} from './clientFallbackStore';

export class AdminModeUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminModeUnauthorizedError';
  }
}

async function runFinanceApi<T>(
  requestFn: () => Promise<Response>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await executeApiWithFallback(requestFn, fallbackFn);
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 401) {
      throw new AdminModeUnauthorizedError(err.message);
    }
    throw err;
  }
}

export async function fetchFinanceState(
  adminToken: string
): Promise<FinanceDatabaseState> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/state', {
        headers: { 'X-Admin-Token': adminToken },
      }),
    () => clientFetchFinanceState(adminToken)
  );
}

export async function createFinanceAccount(
  adminToken: string,
  payload: {
    name: string;
    kind: FinanceAccountKind;
    bankName?: string;
    accountNumber?: string;
    holderName?: string;
    openingBalance?: number;
  }
): Promise<FinanceAccount> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreateFinanceAccount(adminToken, payload)
  );
}

export async function updateFinanceAccount(
  adminToken: string,
  accountId: string,
  payload: Partial<{
    name: string;
    bankName: string;
    accountNumber: string;
    holderName: string;
    openingBalance: number;
  }>
): Promise<FinanceAccount> {
  return runFinanceApi(
    () =>
      fetch(`/api/finance/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateFinanceAccount(adminToken, accountId, payload)
  );
}

export async function deleteFinanceAccount(
  adminToken: string,
  accountId: string
): Promise<void> {
  await runFinanceApi<{ ok: boolean }>(
    () =>
      fetch(`/api/finance/accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken },
      }),
    async () => {
      await clientDeleteFinanceAccount(adminToken, accountId);
      return { ok: true };
    }
  );
}

export async function createFinanceTransfer(
  adminToken: string,
  payload: {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    referenceNo?: string;
    notes?: string;
  }
): Promise<FinanceTransfer> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreateFinanceTransfer(adminToken, payload)
  );
}

export async function deleteFinanceTransfer(
  adminToken: string,
  transferId: string
): Promise<void> {
  await runFinanceApi<{ ok: boolean }>(
    () =>
      fetch(`/api/finance/transfers/${encodeURIComponent(transferId)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken },
      }),
    async () => {
      await clientDeleteFinanceTransfer(adminToken, transferId);
      return { ok: true };
    }
  );
}

export async function createFinanceCategory(
  adminToken: string,
  payload: {
    name: string;
    type: FinanceTransactionType;
    description?: string;
  }
): Promise<FinanceCategory> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreateFinanceCategory(adminToken, payload)
  );
}

export async function updateFinanceCategory(
  adminToken: string,
  categoryId: string,
  payload: {
    name?: string;
    description?: string;
  }
): Promise<FinanceCategory> {
  return runFinanceApi(
    () =>
      fetch(`/api/finance/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateFinanceCategory(adminToken, categoryId, payload)
  );
}

export async function deleteFinanceCategory(
  adminToken: string,
  categoryId: string
): Promise<void> {
  await runFinanceApi<{ ok: boolean }>(
    () =>
      fetch(`/api/finance/categories/${encodeURIComponent(categoryId)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken },
      }),
    async () => {
      await clientDeleteFinanceCategory(adminToken, categoryId);
      return { ok: true };
    }
  );
}

export async function createFinanceTransaction(
  adminToken: string,
  payload: {
    date: string;
    type: FinanceTransactionType;
    method: FinancePaymentMethod;
    categoryId: string;
    accountId?: string;
    title: string;
    counterparty?: string;
    bankAccount?: string;
    referenceNo?: string;
    amount: number;
    notes?: string;
  }
): Promise<FinanceTransaction> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreateFinanceTransaction(adminToken, payload)
  );
}

export async function updateFinanceTransaction(
  adminToken: string,
  txId: string,
  payload: Partial<{
    date: string;
    type: FinanceTransactionType;
    method: FinancePaymentMethod;
    categoryId: string;
    accountId: string;
    title: string;
    counterparty: string;
    bankAccount: string;
    referenceNo: string;
    amount: number;
    notes: string;
  }>
): Promise<FinanceTransaction> {
  return runFinanceApi(
    () =>
      fetch(`/api/finance/transactions/${encodeURIComponent(txId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateFinanceTransaction(adminToken, txId, payload)
  );
}

export async function deleteFinanceTransaction(
  adminToken: string,
  txId: string
): Promise<void> {
  await runFinanceApi<{ ok: boolean }>(
    () =>
      fetch(`/api/finance/transactions/${encodeURIComponent(txId)}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': adminToken },
      }),
    async () => {
      await clientDeleteFinanceTransaction(adminToken, txId);
      return { ok: true };
    }
  );
}

export async function downloadFinanceBackupJson(adminToken: string): Promise<void> {
  const data = await runFinanceApi<Record<string, unknown>>(
    () =>
      fetch('/api/finance/backup', {
        headers: { 'X-Admin-Token': adminToken },
      }),
    () => clientGetFinanceBackupPayload(adminToken)
  );
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(
    2,
    '0'
  )}${String(now.getMinutes()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `karyapresensi-keuangan-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function restoreFinanceBackup(
  adminToken: string,
  backupPayload: unknown
): Promise<FinanceDatabaseState> {
  return runFinanceApi(
    () =>
      fetch('/api/finance/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify(backupPayload),
      }),
    () => clientRestoreFinanceBackup(adminToken, backupPayload)
  );
}
