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

export interface AppDatabaseState {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  settings: AppSettings;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // ignore json parse failure
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export async function fetchDatabaseState(): Promise<AppDatabaseState> {
  const res = await fetch('/api/state');
  return handleResponse<AppDatabaseState>(res);
}

export async function createEmployee(
  payload: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Employee> {
  const res = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Employee>(res);
}

export async function updateEmployee(
  employeeId: string,
  payload: Partial<Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Employee> {
  const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<Employee>(res);
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
  });
  await handleResponse<{ ok: boolean }>(res);
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
  const res = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<AttendanceRecord>(res);
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
  const res = await fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<AttendanceRecord>(res);
}

export async function deleteAttendanceRecord(recordId: string): Promise<void> {
  const res = await fetch(`/api/attendance/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
  });
  await handleResponse<{ ok: boolean }>(res);
}

export async function bulkMarkScheduledOffDays(
  date: string
): Promise<{ createdCount: number }> {
  const res = await fetch('/api/attendance/bulk-off-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
  return handleResponse<{ createdCount: number }>(res);
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
  const res = await fetch('/api/late-settlements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<LateSettlement>(res);
}

export async function deleteLateSettlement(settlementId: string): Promise<void> {
  const res = await fetch(`/api/late-settlements/${encodeURIComponent(settlementId)}`, {
    method: 'DELETE',
  });
  await handleResponse<{ ok: boolean }>(res);
}

export async function updateAppSettings(payload: {
  companyName?: string;
  companySubtitle?: string;
  lateDeductionPerMinute?: number;
  shifts?: ShiftConfig[];
  companyProfile?: Partial<CompanyProfile>;
  syncEmployees?: boolean;
}): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<AppSettings>(res);
}

export async function downloadBackupJson(): Promise<void> {
  const res = await fetch('/api/backup');
  const data = await handleResponse<Record<string, unknown>>(res);
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
  const res = await fetch('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupPayload),
  });
  return handleResponse<AppDatabaseState>(res);
}

