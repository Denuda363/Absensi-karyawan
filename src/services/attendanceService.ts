import {
  AppSettings,
  ATTENDANCE_STATUS_META,
  AttendanceRecord,
  AttendanceStatus,
  CompanyProfile,
  Employee,
  LateSettlement,
  LateSettlementMethod,
  ResetDataMode,
  ResetDataResult,
  ShiftConfig,
} from '../types';
import { executeApiWithFallback } from './apiClient';
import {
  deleteAttendanceFirestore,
  deleteEmployeeFirestore,
  deleteLateSettlementFirestore,
  pushAllLocalStateToFirestore,
  resetFirestoreData,
  syncAppSettingsToFirestore,
  upsertAttendanceFirestore,
  upsertEmployeeFirestore,
  upsertLateSettlementFirestore,
} from './firebaseClient';
import { isFirestoreEngineActive, notifyLocalScopeMutation } from './realtimeService';
import {
  emitAppNotification,
  formatRupiahNotif,
} from './notificationCenterService';
import {
  clientBulkMarkScheduledOffDays,
  clientCreateAttendanceRecord,
  clientCreateEmployee,
  clientCreateLateSettlement,
  clientDeleteAttendanceRecord,
  clientDeleteEmployee,
  clientDeleteLateSettlement,
  clientFetchDatabaseState,
  clientGetBackupPayload,
  clientResetApplicationData,
  clientRestoreDatabaseBackup,
  clientUpdateAppSettings,
  clientUpdateAttendanceRecord,
  clientUpdateEmployee,
} from './clientFallbackStore';

export interface AppDatabaseState {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  settings: AppSettings;
}

export async function fetchDatabaseState(): Promise<AppDatabaseState> {
  return executeApiWithFallback(
    () => fetch('/api/state'),
    () => clientFetchDatabaseState()
  );
}

export async function createEmployee(
  payload: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Employee> {
  const created = await executeApiWithFallback(
    () =>
      fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateEmployee(payload)
  );
  notifyLocalScopeMutation('attendance', 'create_employee');
  if (isFirestoreEngineActive()) {
    void upsertEmployeeFirestore(created).catch(() => undefined);
  }
  emitAppNotification({
    title: 'Karyawan Baru Ditambahkan',
    message: `${created.name} (${created.position} · ${created.department}) · Shift ${created.shiftName}`,
    module: 'sdm',
    severity: 'success',
    actionType: 'create_employee',
    targetLabel: created.name,
    targetNav: 'matriks',
  });
  return created;
}

export async function updateEmployee(
  employeeId: string,
  payload: Partial<Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Employee> {
  const updated = await executeApiWithFallback(
    () =>
      fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateEmployee(employeeId, payload)
  );
  notifyLocalScopeMutation('attendance', 'update_employee');
  if (isFirestoreEngineActive()) {
    void upsertEmployeeFirestore(updated).catch(() => undefined);
  }
  const isScheduleOnly =
    ('offDays' in payload || 'customOffDates' in payload) &&
    !('name' in payload) &&
    !('position' in payload);
  emitAppNotification({
    title: isScheduleOnly
      ? 'Jadwal Libur Karyawan Diperbarui'
      : 'Data Karyawan Diperbarui',
    message: `${updated.name} (${updated.position} · ${updated.department})`,
    module: isScheduleOnly ? 'jadwal' : 'sdm',
    severity: 'info',
    actionType: isScheduleOnly ? 'update_employee_off_schedule' : 'update_employee',
    targetLabel: updated.name,
    targetNav: isScheduleOnly ? 'jadwal-libur' : 'matriks',
  });
  return updated;
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  await executeApiWithFallback<{ ok: boolean }>(
    () =>
      fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
        method: 'DELETE',
      }),
    async () => {
      await clientDeleteEmployee(employeeId);
      return { ok: true };
    }
  );
  notifyLocalScopeMutation('attendance', 'delete_employee');
  if (isFirestoreEngineActive()) {
    void deleteEmployeeFirestore(employeeId).catch(() => undefined);
  }
  emitAppNotification({
    title: 'Data Karyawan Dihapus',
    message: `Profil karyawan dengan ID ${employeeId} telah dihapus dari daftar aktif.`,
    module: 'sdm',
    severity: 'warning',
    actionType: 'delete_employee',
    targetNav: 'matriks',
  });
}

export async function createAttendanceRecord(payload: {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  shiftName?: string;
  checkIn: string;
  checkOut: string;
  overtimeHours: number;
  notes: string;
  latePermitReason?: string;
  latePermitEstimatedArrival?: string;
  latePermitApprovedBy?: string;
}): Promise<AttendanceRecord> {
  const rec = await executeApiWithFallback(
    () =>
      fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateAttendanceRecord(payload)
  );
  notifyLocalScopeMutation('attendance', 'create_attendance');
  if (isFirestoreEngineActive()) {
    void upsertAttendanceFirestore(rec).catch(() => undefined);
  }
  const statusLabel = ATTENDANCE_STATUS_META[rec.status]?.label ?? rec.status;
  const timeInfo = [
    rec.checkIn ? `Masuk ${rec.checkIn}` : '',
    rec.checkOut ? `Pulang ${rec.checkOut}` : '',
    rec.overtimeHours > 0 ? `Lembur ${rec.overtimeHours}j` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  emitAppNotification({
    title: `Absensi ${statusLabel}: ${rec.employeeName}`,
    message: `${rec.date}${rec.shiftName ? ` · Shift ${rec.shiftName}` : ''}${timeInfo ? ` · ${timeInfo}` : ''}`,
    module: 'absensi',
    severity:
      rec.status === 'alpha'
        ? 'danger'
        : rec.status === 'terlambat'
          ? 'warning'
          : 'success',
    actionType: 'create_attendance',
    targetLabel: rec.employeeName,
    targetNav: 'matriks',
  });
  return rec;
}

export async function updateAttendanceRecord(
  recordId: string,
  payload: {
    status?: AttendanceStatus;
    shiftName?: string;
    checkIn?: string;
    checkOut?: string;
    overtimeHours?: number;
    notes?: string;
    latePermitReason?: string;
    latePermitEstimatedArrival?: string;
    latePermitApprovedBy?: string;
  }
): Promise<AttendanceRecord> {
  const rec = await executeApiWithFallback(
    () =>
      fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateAttendanceRecord(recordId, payload)
  );
  notifyLocalScopeMutation('attendance', 'update_attendance');
  if (isFirestoreEngineActive()) {
    void upsertAttendanceFirestore(rec).catch(() => undefined);
  }
  const statusLabel = ATTENDANCE_STATUS_META[rec.status]?.label ?? rec.status;
  const timeInfo = [
    rec.checkIn ? `Masuk ${rec.checkIn}` : '',
    rec.checkOut ? `Pulang ${rec.checkOut}` : '',
    rec.overtimeHours > 0 ? `Lembur ${rec.overtimeHours}j` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  emitAppNotification({
    title: `Perubahan Absensi: ${rec.employeeName}`,
    message: `${rec.date} · Status ${statusLabel}${timeInfo ? ` · ${timeInfo}` : ''}`,
    module: 'absensi',
    severity:
      rec.status === 'alpha'
        ? 'danger'
        : rec.status === 'terlambat'
          ? 'warning'
          : 'info',
    actionType: 'update_attendance',
    targetLabel: rec.employeeName,
    targetNav: 'matriks',
  });
  return rec;
}

export async function deleteAttendanceRecord(recordId: string): Promise<void> {
  await executeApiWithFallback<{ ok: boolean }>(
    () =>
      fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
      }),
    async () => {
      await clientDeleteAttendanceRecord(recordId);
      return { ok: true };
    }
  );
  notifyLocalScopeMutation('attendance', 'delete_attendance');
  if (isFirestoreEngineActive()) {
    void deleteAttendanceFirestore(recordId).catch(() => undefined);
  }
  emitAppNotification({
    title: 'Catatan Absensi Dihapus',
    message: `Log kehadiran #${recordId} berhasil dihapus dari sistem.`,
    module: 'absensi',
    severity: 'warning',
    actionType: 'delete_attendance',
    targetNav: 'matriks',
  });
}

export async function bulkMarkScheduledOffDays(
  date: string
): Promise<{ createdCount: number }> {
  const res = await executeApiWithFallback(
    () =>
      fetch('/api/attendance/bulk-off-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      }),
    () => clientBulkMarkScheduledOffDays(date)
  );
  notifyLocalScopeMutation('attendance', 'bulk_mark_off_days');
  if (res.createdCount > 0) {
    if (isFirestoreEngineActive()) {
      void fetchDatabaseState()
        .then((st) =>
          pushAllLocalStateToFirestore({
            settings: st.settings,
            employees: st.employees,
            attendanceRecords: st.attendanceRecords,
            lateSettlements: st.lateSettlements,
          })
        )
        .catch(() => undefined);
    }
    emitAppNotification({
      title: 'Penandaan Libur Massal Selesai',
      message: `${res.createdCount} karyawan sesuai jadwal libur otomatis ditandai Libur pada ${date}.`,
      module: 'absensi',
      severity: 'info',
      actionType: 'bulk_mark_off_days',
      targetNav: 'matriks',
    });
  }
  return res;
}

export async function createLateSettlement(payload: {
  employeeId: string;
  yearMonth: string;
  date: string;
  method: LateSettlementMethod;
  minutesSettled: number;
  extraWorkStart?: string;
  extraWorkEnd?: string;
  deductionAmount?: number;
  notes: string;
}): Promise<LateSettlement> {
  const created = await executeApiWithFallback(
    () =>
      fetch('/api/late-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateLateSettlement(payload)
  );
  notifyLocalScopeMutation('attendance', 'create_late_settlement');
  if (isFirestoreEngineActive()) {
    void upsertLateSettlementFirestore(created).catch(() => undefined);
  }
  const methodLabel =
    created.method === 'potongan_gaji' ? 'Potongan Gaji' : 'Tambahan Jam Kerja';
  emitAppNotification({
    title: `Kompensasi Terlambat: ${created.employeeName}`,
    message: `${created.date} · ${created.minutesSettled} menit via ${methodLabel}`,
    module: 'absensi',
    severity: created.method === 'potongan_gaji' ? 'warning' : 'success',
    actionType: 'create_late_settlement',
    ...(created.deductionAmount && created.deductionAmount > 0
      ? {
          amountValue: created.deductionAmount,
          amountLabel: formatRupiahNotif(created.deductionAmount),
        }
      : {}),
    targetLabel: created.employeeName,
    targetNav: 'rekap',
  });
  return created;
}

export async function deleteLateSettlement(settlementId: string): Promise<void> {
  await executeApiWithFallback<{ ok: boolean }>(
    () =>
      fetch(`/api/late-settlements/${encodeURIComponent(settlementId)}`, {
        method: 'DELETE',
      }),
    async () => {
      await clientDeleteLateSettlement(settlementId);
      return { ok: true };
    }
  );
  notifyLocalScopeMutation('attendance', 'delete_late_settlement');
  if (isFirestoreEngineActive()) {
    void deleteLateSettlementFirestore(settlementId).catch(() => undefined);
  }
  emitAppNotification({
    title: 'Kompensasi Terlambat Dihapus',
    message: `Catatan penyelesaian keterlambatan #${settlementId} dihapus.`,
    module: 'absensi',
    severity: 'warning',
    actionType: 'delete_late_settlement',
    targetNav: 'rekap',
  });
}

export async function updateAppSettings(payload: {
  companyName?: string;
  companySubtitle?: string;
  lateDeductionPerMinute?: number;
  shifts?: ShiftConfig[];
  companyProfile?: Partial<CompanyProfile>;
  syncEmployees?: boolean;
}): Promise<AppSettings> {
  const updated = await executeApiWithFallback(
    () =>
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateAppSettings(payload)
  );
  notifyLocalScopeMutation('attendance', 'update_settings');
  if (isFirestoreEngineActive()) {
    void syncAppSettingsToFirestore(updated).catch(() => undefined);
    if (payload.syncEmployees) {
      void fetchDatabaseState()
        .then((st) =>
          pushAllLocalStateToFirestore({
            settings: st.settings,
            employees: st.employees,
            attendanceRecords: st.attendanceRecords,
            lateSettlements: st.lateSettlements,
          })
        )
        .catch(() => undefined);
    }
  }

  if (payload.shifts) {
    emitAppNotification({
      title: 'Jadwal & Master Shift Diperbarui',
      message: `${updated.shifts.length} konfigurasi shift untuk ${updated.companyName} telah disimpan.`,
      module: 'jadwal',
      severity: 'success',
      actionType: 'update_shift_settings',
      targetNav: 'jadwal-shift',
    });
  } else if (payload.companyProfile) {
    emitAppNotification({
      title: 'Profil Perusahaan Disimpan',
      message: `Identitas resmi & struktur perusahaan ${updated.companyName} berhasil diperbarui.`,
      module: 'sistem',
      severity: 'success',
      actionType: 'update_company_profile',
      targetNav: 'profil-perusahaan',
    });
  } else {
    emitAppNotification({
      title: 'Pengaturan Sistem Disimpan',
      message: `Konfigurasi operasional ${updated.companyName} telah diperbarui.`,
      module: 'sistem',
      severity: 'info',
      actionType: 'update_app_settings',
      targetNav: 'pengaturan',
    });
  }

  return updated;
}

export async function downloadBackupJson(): Promise<void> {
  const data = await executeApiWithFallback<Record<string, unknown>>(
    () => fetch('/api/backup'),
    () => clientGetBackupPayload()
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
  link.download = `karyapresensi-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  emitAppNotification({
    title: 'Backup Database Diekspor',
    message: `File karyapresensi-backup-${stamp}.json berhasil diunduh ke perangkat.`,
    module: 'sistem',
    severity: 'info',
    actionType: 'download_backup',
    targetNav: 'pengaturan',
  });
}

export async function restoreDatabaseBackup(
  backupPayload: unknown
): Promise<AppDatabaseState> {
  const restored = await executeApiWithFallback(
    () =>
      fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupPayload),
      }),
    () => clientRestoreDatabaseBackup(backupPayload)
  );
  notifyLocalScopeMutation('attendance', 'restore_database');
  if (isFirestoreEngineActive()) {
    void pushAllLocalStateToFirestore({
      settings: restored.settings,
      employees: restored.employees,
      attendanceRecords: restored.attendanceRecords,
      lateSettlements: restored.lateSettlements,
      forceOverwrite: true,
    }).catch(() => undefined);
  }
  emitAppNotification({
    title: 'Restore Database Berhasil',
    message: `${restored.employees.length} karyawan & ${restored.attendanceRecords.length} log absensi dipulihkan.`,
    module: 'sistem',
    severity: 'success',
    actionType: 'restore_database',
    targetNav: 'pengaturan',
  });
  return restored;
}

export async function resetApplicationData(
  adminToken: string,
  payload: { mode: ResetDataMode; pin: string }
): Promise<ResetDataResult> {
  const result = await executeApiWithFallback<ResetDataResult>(
    () =>
      fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify(payload),
      }),
    () => clientResetApplicationData(adminToken, payload)
  );

  notifyLocalScopeMutation('attendance', 'reset_data');
  if (payload.mode !== 'attendance') {
    notifyLocalScopeMutation('payroll', 'reset_data');
    notifyLocalScopeMutation('finance', 'reset_data');
  }

  if (isFirestoreEngineActive()) {
    try {
      await resetFirestoreData(payload.mode, {
        settings: result.state.settings,
        employees: result.state.employees,
        financeAccounts: result.financeAccounts,
        financeCategories: result.financeCategories,
      });
    } catch {
      // Non-blocking Firestore sync if not signed in or rules restrict optional cleanup
    }
  }

  emitAppNotification({
    title: 'Reset Data Sistem Dijalankan',
    message: result.message,
    module: 'sistem',
    severity: 'danger',
    actionType: `reset_data_${payload.mode}`,
    targetNav: 'pengaturan',
  });

  return result;
}
