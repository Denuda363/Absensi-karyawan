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

export class PayrollUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollUnauthorizedError';
  }
}

async function handlePayrollResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // ignore json parse failure
    }
    if (res.status === 401) {
      throw new PayrollUnauthorizedError(errMsg);
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export async function unlockAdminModeWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch('/api/admin-mode/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return handlePayrollResponse<{ token: string; expiresAt: number }>(res);
}

export async function lockAdminModeSession(adminToken: string): Promise<void> {
  if (!adminToken) return;
  try {
    await fetch('/api/admin-mode/lock', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken },
    });
  } catch {
    // ignore lock cleanup error
  }
}

export async function changeAdminModePin(payload: {
  currentPin: string;
  newPin: string;
}): Promise<void> {
  const res = await fetch('/api/admin-mode/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handlePayrollResponse<{ ok: boolean }>(res);
}

export async function unlockPayrollWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch('/api/payroll/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return handlePayrollResponse<{ token: string; expiresAt: number }>(res);
}

export async function lockPayrollSession(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch('/api/payroll/lock', {
      method: 'POST',
      headers: { 'X-Payroll-Token': token },
    });
  } catch {
    // ignore lock cleanup error
  }
}

export async function fetchPayrollState(token: string): Promise<PayrollDatabaseState> {
  const res = await fetch('/api/payroll/state', {
    headers: { 'X-Payroll-Token': token },
  });
  return handlePayrollResponse<PayrollDatabaseState>(res);
}

export async function updatePayrollSettings(
  token: string,
  payload: Partial<PayrollSettings>
): Promise<PayrollSettings> {
  const res = await fetch('/api/payroll/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handlePayrollResponse<PayrollSettings>(res);
}

export async function saveEmployeeSalaryProfile(
  token: string,
  employeeId: string,
  payload: Partial<Omit<EmployeeSalaryProfile, 'employeeId' | 'updatedAt'>>
): Promise<EmployeeSalaryProfile> {
  const res = await fetch(`/api/payroll/profiles/${encodeURIComponent(employeeId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handlePayrollResponse<EmployeeSalaryProfile>(res);
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
  const res = await fetch('/api/payroll/adjustments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handlePayrollResponse<PayrollAdjustment>(res);
}

export async function deletePayrollAdjustment(
  token: string,
  adjustmentId: string
): Promise<void> {
  const res = await fetch(`/api/payroll/adjustments/${encodeURIComponent(adjustmentId)}`, {
    method: 'DELETE',
    headers: { 'X-Payroll-Token': token },
  });
  await handlePayrollResponse<{ ok: boolean }>(res);
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
  const res = await fetch('/api/payroll/raises', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handlePayrollResponse<SalaryRaiseRecord>(res);
}

export async function deleteSalaryRaise(
  token: string,
  raiseId: string
): Promise<void> {
  const res = await fetch(`/api/payroll/raises/${encodeURIComponent(raiseId)}`, {
    method: 'DELETE',
    headers: { 'X-Payroll-Token': token },
  });
  await handlePayrollResponse<{ ok: boolean }>(res);
}

export async function updatePayrollMonthlyStatus(
  token: string,
  payload: {
    employeeId: string;
    yearMonth: string;
    status: PayrollRecordStatus;
  }
): Promise<PayrollMonthlyStatus> {
  const res = await fetch('/api/payroll/status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handlePayrollResponse<PayrollMonthlyStatus>(res);
}

export async function downloadPayrollBackupJson(token: string): Promise<void> {
  const res = await fetch('/api/payroll/backup', {
    headers: { 'X-Payroll-Token': token },
  });
  const data = await handlePayrollResponse<Record<string, unknown>>(res);
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
  const res = await fetch('/api/payroll/restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payroll-Token': token,
    },
    body: JSON.stringify(backupPayload),
  });
  return handlePayrollResponse<PayrollDatabaseState>(res);
}
