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
  emitAppNotification,
  formatRupiahNotif,
} from './notificationCenterService';
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
  const created = await runFinanceApi(
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
  emitAppNotification({
    title: 'Akun Keuangan Dibuat',
    message: `${created.name} (${created.kind === 'cash' ? 'Kas Tunai' : created.bankName || 'Rekening Bank'})`,
    module: 'keuangan',
    severity: 'success',
    actionType: 'create_finance_account',
    ...(created.openingBalance > 0
      ? {
          amountValue: created.openingBalance,
          amountLabel: `Saldo Awal ${formatRupiahNotif(created.openingBalance)}`,
        }
      : {}),
    targetLabel: created.name,
    targetNav: 'keuangan',
  });
  return created;
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
  const updated = await runFinanceApi(
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
  emitAppNotification({
    title: 'Akun Keuangan Diperbarui',
    message: `${updated.name} · Saldo awal ${formatRupiahNotif(updated.openingBalance)}`,
    module: 'keuangan',
    severity: 'info',
    actionType: 'update_finance_account',
    amountValue: updated.openingBalance,
    amountLabel: formatRupiahNotif(updated.openingBalance),
    targetLabel: updated.name,
    targetNav: 'keuangan',
  });
  return updated;
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
  emitAppNotification({
    title: 'Akun Keuangan Dihapus',
    message: `Akun kas/rekening #${accountId} dihapus dari daftar aktif.`,
    module: 'keuangan',
    severity: 'warning',
    actionType: 'delete_finance_account',
    targetNav: 'keuangan',
  });
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
  const transfer = await runFinanceApi(
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
  emitAppNotification({
    title: 'Transfer Saldo Internal',
    message: `${transfer.fromAccountName} → ${transfer.toAccountName} (${transfer.date})`,
    module: 'keuangan',
    severity: 'info',
    actionType: 'create_finance_transfer',
    amountValue: transfer.amount,
    amountLabel: formatRupiahNotif(transfer.amount),
    targetNav: 'keuangan',
  });
  return transfer;
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
  emitAppNotification({
    title: 'Transfer Internal Dihapus',
    message: `Mutasi transfer internal #${transferId} telah dibatalkan.`,
    module: 'keuangan',
    severity: 'warning',
    actionType: 'delete_finance_transfer',
    targetNav: 'keuangan',
  });
}

export async function createFinanceCategory(
  adminToken: string,
  payload: {
    name: string;
    type: FinanceTransactionType;
    description?: string;
  }
): Promise<FinanceCategory> {
  const created = await runFinanceApi(
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
  emitAppNotification({
    title: 'Kategori Keuangan Ditambahkan',
    message: `${created.name} (${created.type === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'})`,
    module: 'keuangan',
    severity: 'success',
    actionType: 'create_finance_category',
    targetNav: 'keuangan',
  });
  return created;
}

export async function updateFinanceCategory(
  adminToken: string,
  categoryId: string,
  payload: {
    name?: string;
    description?: string;
  }
): Promise<FinanceCategory> {
  const updated = await runFinanceApi(
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
  emitAppNotification({
    title: 'Kategori Keuangan Diperbarui',
    message: `Kategori "${updated.name}" telah diperbarui.`,
    module: 'keuangan',
    severity: 'info',
    actionType: 'update_finance_category',
    targetNav: 'keuangan',
  });
  return updated;
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
  emitAppNotification({
    title: 'Kategori Keuangan Dihapus',
    message: `Kategori #${categoryId} dihapus dari daftar kategori.`,
    module: 'keuangan',
    severity: 'warning',
    actionType: 'delete_finance_category',
    targetNav: 'keuangan',
  });
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
  const tx = await runFinanceApi(
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
  const isIncome = tx.type === 'pendapatan';
  const sign = isIncome ? '+' : '-';
  emitAppNotification({
    title: isIncome ? 'Pendapatan Perusahaan Tercatat' : 'Pengeluaran Perusahaan Tercatat',
    message: `${tx.title} · ${tx.categoryName}${tx.counterparty ? ` · ${tx.counterparty}` : ''} (${tx.date})`,
    module: 'keuangan',
    severity: isIncome ? 'success' : 'warning',
    actionType: 'create_finance_transaction',
    amountValue: tx.amount,
    amountLabel: `${sign}${formatRupiahNotif(tx.amount)}`,
    targetLabel: tx.categoryName,
    targetNav: 'keuangan',
  });
  return tx;
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
  const tx = await runFinanceApi(
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
  const sign = tx.type === 'pendapatan' ? '+' : '-';
  emitAppNotification({
    title: 'Transaksi Keuangan Diperbarui',
    message: `${tx.title} · ${tx.categoryName} (${tx.date})`,
    module: 'keuangan',
    severity: 'info',
    actionType: 'update_finance_transaction',
    amountValue: tx.amount,
    amountLabel: `${sign}${formatRupiahNotif(tx.amount)}`,
    targetLabel: tx.categoryName,
    targetNav: 'keuangan',
  });
  return tx;
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
  emitAppNotification({
    title: 'Transaksi Keuangan Dihapus',
    message: `Entri transaksi keuangan #${txId} telah dihapus.`,
    module: 'keuangan',
    severity: 'warning',
    actionType: 'delete_finance_transaction',
    targetNav: 'keuangan',
  });
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

  emitAppNotification({
    title: 'Backup Keuangan Diekspor',
    message: `File karyapresensi-keuangan-${stamp}.json berhasil diunduh.`,
    module: 'keuangan',
    severity: 'info',
    actionType: 'download_finance_backup',
    targetNav: 'keuangan',
  });
}

export async function restoreFinanceBackup(
  adminToken: string,
  backupPayload: unknown
): Promise<FinanceDatabaseState> {
  const restored = await runFinanceApi(
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
  emitAppNotification({
    title: 'Restore Data Keuangan Berhasil',
    message: `${restored.transactions.length} transaksi & ${restored.accounts.length} akun dipulihkan.`,
    module: 'keuangan',
    severity: 'success',
    actionType: 'restore_finance_backup',
    targetNav: 'keuangan',
  });
  return restored;
}
