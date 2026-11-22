import {
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
  CompanyProfile,
  Employee,
  LateSettlement,
  LateSettlementMethod,
  ShiftConfig,
} from '../types';
import { executeApiWithFallback } from './apiClient';
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
  return executeApiWithFallback(
    () =>
      fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateEmployee(payload)
  );
}

export async function updateEmployee(
  employeeId: string,
  payload: Partial<Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Employee> {
  return executeApiWithFallback(
    () =>
      fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateEmployee(employeeId, payload)
  );
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
}

export async function createAttendanceRecord(payload: {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  overtimeHours: number;
  notes: string;
  latePermitReason?: string;
  latePermitEstimatedArrival?: string;
  latePermitApprovedBy?: string;
}): Promise<AttendanceRecord> {
  return executeApiWithFallback(
    () =>
      fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateAttendanceRecord(payload)
  );
}

export async function updateAttendanceRecord(
  recordId: string,
  payload: {
    status?: AttendanceStatus;
    checkIn?: string;
    checkOut?: string;
    overtimeHours?: number;
    notes?: string;
    latePermitReason?: string;
    latePermitEstimatedArrival?: string;
    latePermitApprovedBy?: string;
  }
): Promise<AttendanceRecord> {
  return executeApiWithFallback(
    () =>
      fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateAttendanceRecord(recordId, payload)
  );
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
}

export async function bulkMarkScheduledOffDays(
  date: string
): Promise<{ createdCount: number }> {
  return executeApiWithFallback(
    () =>
      fetch('/api/attendance/bulk-off-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      }),
    () => clientBulkMarkScheduledOffDays(date)
  );
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
  return executeApiWithFallback(
    () =>
      fetch('/api/late-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientCreateLateSettlement(payload)
  );
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
}

export async function updateAppSettings(payload: {
  companyName?: string;
  companySubtitle?: string;
  lateDeductionPerMinute?: number;
  shifts?: ShiftConfig[];
  companyProfile?: Partial<CompanyProfile>;
  syncEmployees?: boolean;
}): Promise<AppSettings> {
  return executeApiWithFallback(
    () =>
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    () => clientUpdateAppSettings(payload)
  );
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
}

export async function restoreDatabaseBackup(
  backupPayload: unknown
): Promise<AppDatabaseState> {
  return executeApiWithFallback(
    () =>
      fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupPayload),
      }),
    () => clientRestoreDatabaseBackup(backupPayload)
  );
}
