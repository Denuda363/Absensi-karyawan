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

export class AdminModeUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminModeUnauthorizedError';
  }
}

async function handleFinanceResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // ignore json parse failure
    }
    if (res.status === 401) {
      throw new AdminModeUnauthorizedError(errMsg);
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export async function fetchFinanceState(
  adminToken: string
): Promise<FinanceDatabaseState> {
  const res = await fetch('/api/finance/state', {
    headers: { 'X-Admin-Token': adminToken },
  });
  return handleFinanceResponse<FinanceDatabaseState>(res);
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
  const res = await fetch('/api/finance/accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceAccount>(res);
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
  const res = await fetch(`/api/finance/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceAccount>(res);
}

export async function deleteFinanceAccount(
  adminToken: string,
  accountId: string
): Promise<void> {
  const res = await fetch(`/api/finance/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await handleFinanceResponse<{ ok: boolean }>(res);
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
  const res = await fetch('/api/finance/transfers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceTransfer>(res);
}

export async function deleteFinanceTransfer(
  adminToken: string,
  transferId: string
): Promise<void> {
  const res = await fetch(`/api/finance/transfers/${encodeURIComponent(transferId)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await handleFinanceResponse<{ ok: boolean }>(res);
}

export async function createFinanceCategory(
  adminToken: string,
  payload: {
    name: string;
    type: FinanceTransactionType;
    description?: string;
  }
): Promise<FinanceCategory> {
  const res = await fetch('/api/finance/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceCategory>(res);
}

export async function updateFinanceCategory(
  adminToken: string,
  categoryId: string,
  payload: {
    name?: string;
    description?: string;
  }
): Promise<FinanceCategory> {
  const res = await fetch(`/api/finance/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceCategory>(res);
}

export async function deleteFinanceCategory(
  adminToken: string,
  categoryId: string
): Promise<void> {
  const res = await fetch(`/api/finance/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await handleFinanceResponse<{ ok: boolean }>(res);
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
  const res = await fetch('/api/finance/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceTransaction>(res);
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
  const res = await fetch(`/api/finance/transactions/${encodeURIComponent(txId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(payload),
  });
  return handleFinanceResponse<FinanceTransaction>(res);
}

export async function deleteFinanceTransaction(
  adminToken: string,
  txId: string
): Promise<void> {
  const res = await fetch(`/api/finance/transactions/${encodeURIComponent(txId)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await handleFinanceResponse<{ ok: boolean }>(res);
}

export async function downloadFinanceBackupJson(adminToken: string): Promise<void> {
  const res = await fetch('/api/finance/backup', {
    headers: { 'X-Admin-Token': adminToken },
  });
  const data = await handleFinanceResponse<Record<string, unknown>>(res);
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
  const res = await fetch('/api/finance/restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify(backupPayload),
  });
  return handleFinanceResponse<FinanceDatabaseState>(res);
}
