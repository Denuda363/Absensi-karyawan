import {
  EmployeeSalaryProfile,
  PayrollAdjustment,
  PayrollAdjustmentType,
  PayrollDatabaseState,
  PayrollMonthlyStatus,
  PayrollRecordStatus,
  PayrollSettings,
  SalaryRaiseMethod,
  SalaryRaiseRecord,
} from '../types';
import { executeApiWithFallback, HttpApiError } from './apiClient';
import {
  clientChangeAdminModePin,
  clientCreatePayrollAdjustment,
  clientCreateSalaryRaise,
  clientDeletePayrollAdjustment,
  clientDeleteSalaryRaise,
  clientFetchPayrollState,
  clientGetPayrollBackupPayload,
  clientLockAdminModeSession,
  clientLockPayrollSession,
  clientRestorePayrollBackup,
  clientSaveEmployeeSalaryProfile,
  clientUnlockAdminModeWithPin,
  clientUnlockPayrollWithPin,
  clientUpdatePayrollMonthlyStatus,
  clientUpdatePayrollSettings,
} from './clientFallbackStore';

export class PayrollUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollUnauthorizedError';
  }
}

async function runPayrollApi<T>(
  requestFn: () => Promise<Response>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await executeApiWithFallback(requestFn, fallbackFn);
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 401) {
      throw new PayrollUnauthorizedError(err.message);
    }
    throw err;
  }
}

export async function unlockAdminModeWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  return runPayrollApi(
    () =>
      fetch('/api/admin-mode/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    () => clientUnlockAdminModeWithPin(pin)
  );
}

export async function lockAdminModeSession(adminToken: string): Promise<void> {
  if (!adminToken) return;
  try {
    await executeApiWithFallback<{ ok: boolean }>(
      () =>
        fetch('/api/admin-mode/lock', {
          method: 'POST',
          headers: { 'X-Admin-Token': adminToken },
        }),
      async () => {
        await clientLockAdminModeSession(adminToken);
        return { ok: true };
      }
    );
  } catch {
    await clientLockAdminModeSession(adminToken);
  }
}

export async function changeAdminModePin(payload: {
  currentPin: string;
  newPin: string;
}): Promise<void> {
  await runPayrollApi<{ ok: boolean }>(
    () =>
      fetch('/api/admin-mode/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    async () => {
      await clientChangeAdminModePin(payload);
      return { ok: true };
    }
  );
}

export async function unlockPayrollWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    () => clientUnlockPayrollWithPin(pin)
  );
}

export async function lockPayrollSession(token: string): Promise<void> {
  if (!token) return;
  try {
    await executeApiWithFallback<{ ok: boolean }>(
      () =>
        fetch('/api/payroll/lock', {
          method: 'POST',
          headers: { 'X-Payroll-Token': token },
        }),
      async () => {
        await clientLockPayrollSession(token);
        return { ok: true };
      }
    );
  } catch {
    await clientLockPayrollSession(token);
  }
}

export async function fetchPayrollState(token: string): Promise<PayrollDatabaseState> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/state', {
        headers: { 'X-Payroll-Token': token },
      }),
    () => clientFetchPayrollState(token)
  );
}

export async function updatePayrollSettings(
  token: string,
  payload: Partial<PayrollSettings>
): Promise<PayrollSettings> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientUpdatePayrollSettings(token, payload)
  );
}

export async function saveEmployeeSalaryProfile(
  token: string,
  employeeId: string,
  payload: Partial<Omit<EmployeeSalaryProfile, 'employeeId' | 'updatedAt'>>
): Promise<EmployeeSalaryProfile> {
  return runPayrollApi(
    () =>
      fetch(`/api/payroll/profiles/${encodeURIComponent(employeeId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientSaveEmployeeSalaryProfile(token, employeeId, payload)
  );
}

export async function createPayrollAdjustment(
  token: string,
  payload: {
    employeeId: string;
    yearMonth: string;
    type: PayrollAdjustmentType;
    title: string;
    amount: number;
    date: string;
    notes: string;
  }
): Promise<PayrollAdjustment> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreatePayrollAdjustment(token, payload)
  );
}

export async function deletePayrollAdjustment(
  token: string,
  adjustmentId: string
): Promise<void> {
  await runPayrollApi<{ ok: boolean }>(
    () =>
      fetch(`/api/payroll/adjustments/${encodeURIComponent(adjustmentId)}`, {
        method: 'DELETE',
        headers: { 'X-Payroll-Token': token },
      }),
    async () => {
      await clientDeletePayrollAdjustment(token, adjustmentId);
      return { ok: true };
    }
  );
}

export async function createSalaryRaise(
  token: string,
  payload: {
    employeeId: string;
    effectiveMonth: string;
    raiseDate: string;
    method: SalaryRaiseMethod;
    percentIncrease?: number;
    newBaseSalary: number;
    newPositionAllowance: number;
    newTransportMealAllowance: number;
    newOtherAllowance: number;
    reason: string;
    notes: string;
    applyToProfile?: boolean;
  }
): Promise<SalaryRaiseRecord> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/raises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientCreateSalaryRaise(token, payload)
  );
}

export async function deleteSalaryRaise(
  token: string,
  raiseId: string
): Promise<void> {
  await runPayrollApi<{ ok: boolean }>(
    () =>
      fetch(`/api/payroll/raises/${encodeURIComponent(raiseId)}`, {
        method: 'DELETE',
        headers: { 'X-Payroll-Token': token },
      }),
    async () => {
      await clientDeleteSalaryRaise(token, raiseId);
      return { ok: true };
    }
  );
}

export async function updatePayrollMonthlyStatus(
  token: string,
  payload: {
    employeeId: string;
    yearMonth: string;
    status: PayrollRecordStatus;
  }
): Promise<PayrollMonthlyStatus> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientUpdatePayrollMonthlyStatus(token, payload)
  );
}

export async function downloadPayrollBackupJson(token: string): Promise<void> {
  const data = await runPayrollApi<Record<string, unknown>>(
    () =>
      fetch('/api/payroll/backup', {
        headers: { 'X-Payroll-Token': token },
      }),
    () => clientGetPayrollBackupPayload(token)
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
  link.download = `karyapresensi-gaji-rahasia-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function restorePayrollBackup(
  token: string,
  backupPayload: unknown
): Promise<PayrollDatabaseState> {
  return runPayrollApi(
    () =>
      fetch('/api/payroll/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payroll-Token': token,
        },
        body: JSON.stringify(backupPayload),
      }),
    () => clientRestorePayrollBackup(token, backupPayload)
  );
}
