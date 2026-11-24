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
  emitAppNotification,
  formatRupiahNotif,
} from './notificationCenterService';
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
  const session = await runPayrollApi(
    () =>
      fetch('/api/admin-mode/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    () => clientUnlockAdminModeWithPin(pin)
  );
  emitAppNotification({
    title: 'Mode Admin Diaktifkan',
    message: 'Sesi otorisasi terbuka untuk Keuangan Perusahaan, Rekap Gaji, dan Pengaturan Sistem.',
    module: 'sistem',
    severity: 'info',
    actionType: 'unlock_admin_mode',
  });
  return session;
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
  emitAppNotification({
    title: 'Mode Admin Dikunci',
    message: 'Sesi Mode Admin ditutup dan menu rahasia kembali terlindungi.',
    module: 'sistem',
    severity: 'info',
    actionType: 'lock_admin_mode',
  });
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
  emitAppNotification({
    title: 'PIN Mode Admin Diperbarui',
    message: 'PIN keamanan Mode Admin berhasil diganti dengan kombinasi baru.',
    module: 'sistem',
    severity: 'warning',
    actionType: 'change_admin_pin',
    targetNav: 'pengaturan',
  });
}

export async function unlockPayrollWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  const session = await runPayrollApi(
    () =>
      fetch('/api/payroll/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    () => clientUnlockPayrollWithPin(pin)
  );
  emitAppNotification({
    title: 'Akses Rekap Gaji Dibuka',
    message: 'Otorisasi PIN Penggajian terverifikasi.',
    module: 'gaji',
    severity: 'info',
    actionType: 'unlock_payroll',
    targetNav: 'rekap-gaji',
  });
  return session;
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
  emitAppNotification({
    title: 'Sesi Rekap Gaji Dikunci',
    message: 'Data gaji kembali dikunci demi kerahasiaan.',
    module: 'gaji',
    severity: 'info',
    actionType: 'lock_payroll',
  });
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
  const updated = await runPayrollApi(
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
  emitAppNotification({
    title: 'Aturan Penggajian Diperbarui',
    message: `Tarif lembur ${formatRupiahNotif(updated.defaultOvertimeHourlyRate)}/jam · Tanggal gajian tgl ${updated.paydayDayOfMonth}.`,
    module: 'gaji',
    severity: 'info',
    actionType: 'update_payroll_settings',
    targetNav: 'rekap-gaji',
  });
  return updated;
}

export async function saveEmployeeSalaryProfile(
  token: string,
  employeeId: string,
  payload: Partial<Omit<EmployeeSalaryProfile, 'employeeId' | 'updatedAt'>>
): Promise<EmployeeSalaryProfile> {
  const profile = await runPayrollApi(
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
  emitAppNotification({
    title: 'Profil Gaji Karyawan Disimpan',
    message: `Karyawan #${employeeId} · Metode ${profile.paymentMethod === 'transfer' ? profile.bankName || 'Transfer' : 'Tunai'}`,
    module: 'gaji',
    severity: 'success',
    actionType: 'save_salary_profile',
    amountValue: profile.baseSalary,
    amountLabel: formatRupiahNotif(profile.baseSalary),
    targetNav: 'rekap-gaji',
  });
  return profile;
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
  const adj = await runPayrollApi(
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
  const typeLabel =
    adj.type === 'bonus'
      ? 'Bonus'
      : adj.type === 'tunjangan'
        ? 'Tunjangan'
        : 'Potongan';
  const sign = adj.type === 'potongan' ? '-' : '+';
  emitAppNotification({
    title: `${typeLabel} Gaji: ${adj.employeeName}`,
    message: `${adj.title} · Periode ${adj.yearMonth} (${adj.date})`,
    module: 'gaji',
    severity: adj.type === 'potongan' ? 'warning' : 'success',
    actionType: 'create_payroll_adjustment',
    amountValue: adj.amount,
    amountLabel: `${sign}${formatRupiahNotif(adj.amount)}`,
    targetLabel: adj.employeeName,
    targetNav: 'rekap-gaji',
  });
  return adj;
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
  emitAppNotification({
    title: 'Penyesuaian Gaji Dihapus',
    message: `Komponen bonus/potongan #${adjustmentId} telah dihapus.`,
    module: 'gaji',
    severity: 'warning',
    actionType: 'delete_payroll_adjustment',
    targetNav: 'rekap-gaji',
  });
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
  const raise = await runPayrollApi(
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
  emitAppNotification({
    title: `Kenaikan Gaji: ${raise.employeeName}`,
    message: `Efektif ${raise.effectiveMonth} · ${raise.reason || 'Penyesuaian berkala'}`,
    module: 'gaji',
    severity: 'success',
    actionType: 'create_salary_raise',
    amountValue: raise.newBaseSalary,
    amountLabel: formatRupiahNotif(raise.newBaseSalary),
    targetLabel: raise.employeeName,
    targetNav: 'rekap-gaji',
  });
  return raise;
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
  emitAppNotification({
    title: 'Riwayat Kenaikan Gaji Dihapus',
    message: `Catatan kenaikan gaji #${raiseId} dihapus.`,
    module: 'gaji',
    severity: 'warning',
    actionType: 'delete_salary_raise',
    targetNav: 'rekap-gaji',
  });
}

export async function updatePayrollMonthlyStatus(
  token: string,
  payload: {
    employeeId: string;
    yearMonth: string;
    status: PayrollRecordStatus;
  }
): Promise<PayrollMonthlyStatus> {
  const updated = await runPayrollApi(
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
  const statusLabel =
    updated.status === 'dibayar'
      ? 'Dibayar'
      : updated.status === 'disetujui'
        ? 'Disetujui'
        : 'Draft';
  emitAppNotification({
    title: `Status Gaji ${statusLabel}`,
    message: `Slip periode ${updated.yearMonth} untuk karyawan #${updated.employeeId} diperbarui ke ${statusLabel}.`,
    module: 'gaji',
    severity: updated.status === 'dibayar' ? 'success' : 'info',
    actionType: 'update_payroll_status',
    targetNav: 'rekap-gaji',
  });
  return updated;
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

  emitAppNotification({
    title: 'Backup Penggajian Diekspor',
    message: `File karyapresensi-gaji-rahasia-${stamp}.json berhasil diunduh.`,
    module: 'gaji',
    severity: 'info',
    actionType: 'download_payroll_backup',
    targetNav: 'rekap-gaji',
  });
}

export async function restorePayrollBackup(
  token: string,
  backupPayload: unknown
): Promise<PayrollDatabaseState> {
  const restored = await runPayrollApi(
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
  emitAppNotification({
    title: 'Restore Data Penggajian Berhasil',
    message: `${restored.profiles.length} profil gaji & ${restored.adjustments.length} penyesuaian dipulihkan.`,
    module: 'gaji',
    severity: 'success',
    actionType: 'restore_payroll_backup',
    targetNav: 'rekap-gaji',
  });
  return restored;
}
