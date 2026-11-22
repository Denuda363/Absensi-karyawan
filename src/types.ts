export type AttendanceStatus =
  | 'hadir'
  | 'terlambat'
  | 'izin_terlambat'
  | 'izin'
  | 'sakit'
  | 'alpha'
  | 'libur';

export type NavSection =
  | 'ringkasan'
  | 'matriks'
  | 'jadwal-libur'
  | 'rekap'
  | 'keuangan'
  | 'rekap-gaji'
  | 'profil-perusahaan'
  | 'pengaturan';

export interface ShiftConfig {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lateToleranceMinutes: number;
}

export interface CompanyBranch {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  isHeadquarters: boolean;
}

export interface CompanyProfile {
  legalName: string;
  industry: string;
  taxId: string;
  nib: string;
  establishedYear: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  postalCode: string;
  directorName: string;
  hrManagerName: string;
  hrManagerTitle: string;
  workDaysSummary: string;
  vision: string;
  mission: string;
  logoDataUrl: string;
  branches: CompanyBranch[];
}

export interface AppSettings {
  companyName: string;
  companySubtitle: string;
  lateDeductionPerMinute?: number;
  shifts: ShiftConfig[];
  companyProfile?: CompanyProfile;
}

export type LateSettlementMethod = 'tambahan_jam_kerja' | 'potongan_gaji';

export interface LateSettlement {
  id: string;
  employeeId: string;
  employeeName: string;
  yearMonth: string; // YYYY-MM
  date: string; // YYYY-MM-DD
  method: LateSettlementMethod;
  minutesSettled: number;
  extraWorkStart?: string;
  extraWorkEnd?: string;
  deductionAmount?: number;
  notes: string;
  recordedBy: string;
  createdAt?: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  position: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  offDays: number[]; // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  customOffDates: string[]; // YYYY-MM-DD
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkIn: string; // HH:mm or ''
  checkOut: string; // HH:mm or ''
  overtimeHours: number;
  notes: string;
  latePermitReason?: string;
  latePermitEstimatedArrival?: string; // HH:mm
  latePermitApprovedBy?: string;
  recordedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PayrollPaymentMethod = 'transfer' | 'tunai';
export type PayrollRecordStatus = 'draft' | 'disetujui' | 'dibayar';
export type PayrollAdjustmentType = 'bonus' | 'tunjangan' | 'potongan';
export type SalaryRaiseMethod = 'nominal' | 'persentase';

export interface PayrollSettings {
  defaultOvertimeHourlyRate: number;
  defaultAlphaDeductionPerDay: number;
  defaultIzinDeductionPerDay: number;
  autoDeductRemainingLate: boolean;
  bpjsKesehatanPct: number;
  bpjsKetenagakerjaanPct: number;
  paydayDayOfMonth: number;
}

export interface EmployeeSalaryProfile {
  employeeId: string;
  baseSalary: number;
  positionAllowance: number;
  transportMealAllowance: number;
  otherAllowance?: number;
  overtimeHourlyRate?: number;
  paydayDay?: number; // 1-31 per karyawan
  paymentMethod: PayrollPaymentMethod;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  notes: string;
  updatedAt?: string;
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  employeeName: string;
  yearMonth: string; // YYYY-MM
  type: PayrollAdjustmentType;
  title: string;
  amount: number;
  date: string; // YYYY-MM-DD
  notes: string;
  createdAt?: string;
}

export interface SalaryRaiseRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  effectiveMonth: string; // YYYY-MM
  raiseDate: string; // YYYY-MM-DD
  method: SalaryRaiseMethod;
  percentIncrease?: number;
  previousBaseSalary: number;
  newBaseSalary: number;
  previousPositionAllowance: number;
  newPositionAllowance: number;
  previousTransportMealAllowance: number;
  newTransportMealAllowance: number;
  previousOtherAllowance: number;
  newOtherAllowance: number;
  reason: string;
  notes: string;
  appliedToProfile: boolean;
  createdAt?: string;
}

export interface PayrollMonthlyStatus {
  id: string;
  employeeId: string;
  yearMonth: string; // YYYY-MM
  status: PayrollRecordStatus;
  paidAt?: string;
  updatedAt?: string;
}

export interface PayrollDatabaseState {
  settings: PayrollSettings;
  profiles: EmployeeSalaryProfile[];
  adjustments: PayrollAdjustment[];
  salaryRaises: SalaryRaiseRecord[];
  statuses: PayrollMonthlyStatus[];
}

export type FinanceTransactionType = 'pendapatan' | 'pengeluaran';
export type FinancePaymentMethod = 'cash' | 'transfer';
export type FinanceAccountKind = 'cash' | 'rekening';

export interface FinanceAccount {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  bankName: string;
  accountNumber: string;
  holderName: string;
  openingBalance: number;
  createdAt?: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  type: FinanceTransactionType;
  description: string;
  createdAt?: string;
}

export interface FinanceTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: FinanceTransactionType;
  method: FinancePaymentMethod;
  categoryId: string;
  categoryName: string;
  accountId?: string;
  title: string;
  counterparty: string; // Pelanggan / Sumber / Vendor / Penerima
  bankAccount: string; // Rekening / Bank (untuk transfer) atau Kas Tunai
  referenceNo: string; // No Bukti / Invoice / Kwitansi
  amount: number;
  notes: string;
  recordedBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceTransfer {
  id: string;
  date: string; // YYYY-MM-DD
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  referenceNo: string;
  notes: string;
  recordedBy: string;
  createdAt?: string;
}

export interface FinanceDatabaseState {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  transfers: FinanceTransfer[];
}

export const HARI_WEEKDAYS: { index: number; label: string; short: string }[] = [
  { index: 1, label: 'Senin', short: 'Sen' },
  { index: 2, label: 'Selasa', short: 'Sel' },
  { index: 3, label: 'Rabu', short: 'Rab' },
  { index: 4, label: 'Kamis', short: 'Kam' },
  { index: 5, label: 'Jumat', short: 'Jum' },
  { index: 6, label: 'Sabtu', short: 'Sab' },
  { index: 0, label: 'Minggu', short: 'Min' },
];

export const HARI_MAP: Record<number, { label: string; short: string }> = {
  0: { label: 'Minggu', short: 'Min' },
  1: { label: 'Senin', short: 'Sen' },
  2: { label: 'Selasa', short: 'Sel' },
  3: { label: 'Rabu', short: 'Rab' },
  4: { label: 'Kamis', short: 'Kam' },
  5: { label: 'Jumat', short: 'Jum' },
  6: { label: 'Sabtu', short: 'Sab' },
};

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; colorClass: string; bgClass: string; borderClass: string }
> = {
  hadir: {
    label: 'Hadir',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  terlambat: {
    label: 'Terlambat',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  izin_terlambat: {
    label: 'Izin Terlambat',
    colorClass: 'text-teal-700',
    bgClass: 'bg-teal-50',
    borderClass: 'border-teal-200',
  },
  izin: {
    label: 'Izin',
    colorClass: 'text-sky-700',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  sakit: {
    label: 'Sakit',
    colorClass: 'text-indigo-700',
    bgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-200',
  },
  alpha: {
    label: 'Alpha',
    colorClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
  libur: {
    label: 'Libur',
    colorClass: 'text-slate-700',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-200',
  },
};

export const LATE_PERMIT_REASON_PRESETS: string[] = [
  'Urusan Keluarga',
  'Kendala Transportasi / Macet',
  'Kontrol Kesehatan Pagi',
  'Tugas Luar / Kunjungan Klien',
  'Administrasi / Bank / Pemerintahan',
];

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLastNDates(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - i);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
  }
  return result;
}

export function getCurrentYearMonth(): string {
  return getTodayDateStr().slice(0, 7);
}

export function getCurrentTimeStr(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getCurrentFullTimeStr(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.getDay();
}

export function isEmployeeOffDay(employee: Employee, dateStr: string): {
  isOff: boolean;
  reason: 'mingguan' | 'khusus' | null;
} {
  if (employee.customOffDates?.includes(dateStr)) {
    return { isOff: true, reason: 'khusus' };
  }
  const dayIdx = getDayOfWeekFromDateStr(dateStr);
  if (employee.offDays?.includes(dayIdx)) {
    return { isOff: true, reason: 'mingguan' };
  }
  return { isOff: false, reason: null };
}

export function formatOffDaysSummary(offDays: number[]): string {
  if (!offDays || offDays.length === 0) return 'Belum diatur';
  const order = [1, 2, 3, 4, 5, 6, 0];
  return [...offDays]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((d) => HARI_MAP[d]?.label ?? '')
    .filter(Boolean)
    .join(', ');
}

export function formatIndonesianDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDateLabel(dateStr: string): string {
  const dow = getDayOfWeekFromDateStr(dateStr);
  const shortDay = HARI_MAP[dow]?.short ?? '';
  const dayNum = dateStr.slice(8, 10);
  return `${shortDay} ${dayNum}`;
}

export function formatIndonesianMonth(yearMonth: string): string {
  const parts = yearMonth.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return yearMonth;
  const dt = new Date(parts[0], parts[1] - 1, 1);
  return dt.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

export function calculateDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return 0;
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }
  const diffHours = (endMin - startMin) / 60;
  return Math.round(diffHours * 10) / 10;
}

export function calculateWorkDurationLabel(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return '—';
  const hours = calculateDurationHours(checkIn, checkOut);
  if (hours <= 0 || hours > 20) return '—';
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  if (mins === 0) return `${whole}j 00m`;
  return `${whole}j ${String(mins).padStart(2, '0')}m`;
}

export function calculateLatenessMinutes(checkIn: string, shiftStart: string): number {
  if (!checkIn || !shiftStart) return 0;
  const [ih, im] = checkIn.split(':').map(Number);
  const [sh, sm] = shiftStart.split(':').map(Number);
  if ([ih, im, sh, sm].some(isNaN)) return 0;
  const diff = ih * 60 + im - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

export function getEmployeeShiftTolerance(
  employee: Employee,
  shifts?: ShiftConfig[]
): number {
  if (!shifts || shifts.length === 0) return 0;
  const match = shifts.find(
    (s) => s.name.toLowerCase() === employee.shiftName.toLowerCase()
  );
  return match ? match.lateToleranceMinutes : 0;
}

export function evaluateLateness(
  checkIn: string,
  shiftStart: string,
  toleranceMinutes = 0
): { rawLateMinutes: number; isLate: boolean } {
  const rawLateMinutes = calculateLatenessMinutes(checkIn, shiftStart);
  return {
    rawLateMinutes,
    isLate: rawLateMinutes > toleranceMinutes,
  };
}

export function getDaysInMonth(yearMonth: string): string[] {
  const parts = yearMonth.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return [];
  const year = parts[0];
  const month = parts[1];
  const totalDays = new Date(year, month, 0).getDate();
  const result: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    result.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return result;
}

export function getMonthEffectiveWorkDays(employee: Employee, yearMonth: string): number {
  const dates = getDaysInMonth(yearMonth);
  return dates.filter((dt) => !isEmployeeOffDay(employee, dt).isOff).length;
}

export type MatrixCellCode = 'h' | 'i' | 's' | 'a' | '';

export function statusToMatrixCode(status: AttendanceStatus): MatrixCellCode {
  switch (status) {
    case 'hadir':
    case 'terlambat':
    case 'izin_terlambat':
      return 'h';
    case 'izin':
      return 'i';
    case 'sakit':
      return 's';
    case 'alpha':
      return 'a';
    case 'libur':
    default:
      return '';
  }
}

export function getDayNameIndonesian(dateStr: string): string {
  const dow = getDayOfWeekFromDateStr(dateStr);
  return HARI_MAP[dow]?.label ?? '';
}

export function getMonthMetadata(yearMonth: string): {
  year: number;
  monthNumber: number;
  monthName: string;
  totalDays: number;
  startDateLabel: string;
  endDateLabel: string;
} {
  const parts = yearMonth.split('-').map(Number);
  const year = parts[0] || new Date().getFullYear();
  const monthNumber = parts[1] || new Date().getMonth() + 1;
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const dt = new Date(year, monthNumber - 1, 1);
  const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
  const formattedMonth =
    monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return {
    year,
    monthNumber,
    monthName: formattedMonth,
    totalDays,
    startDateLabel: `1/${monthNumber}/${year}`,
    endDateLabel: `${totalDays}/${monthNumber}/${year}`,
  };
}

export type DatabaseEngineType =
  | 'supabase'
  | 'local-json'
  | 'firestore'
  | 'postgresql'
  | 'mysql'
  | 'sqlite';

export interface DatabaseConnectionConfig {
  engine: DatabaseEngineType;
  host: string;
  port: number;
  databaseName: string;
  schemaName: string;
  tablePrefix: string;
  username: string;
  sslMode: 'disable' | 'require' | 'verify-full';
  autoCreateMissingTables: boolean;
  hasCustomDatabasePin: boolean;
  firestoreProjectId: string;
  firestoreDatabaseId: string;
  supabaseProjectName?: string;
  supabaseProjectId?: string;
  supabaseUrl?: string;
  supabaseRestUrl?: string;
  supabasePublishableKey?: string;
  hasSupabaseSecretKey?: boolean;
  hasSupabaseDbUrl?: boolean;
  supabaseConnected?: boolean;
  supabaseLastError?: string | null;
  lastCheckedAt: string | null;
  lastAutoInitAt: string | null;
  updatedAt: string;
}

export interface DatabaseTableStatus {
  tableName: string;
  firestoreCollection: string;
  module: 'Absensi' | 'Pengaturan' | 'Penggajian' | 'Keuangan' | 'Keamanan';
  description: string;
  storageFile: string;
  exists: boolean;
  recordCount: number;
  localRecordCount?: number;
  remoteStatus?: 'available' | 'missing' | 'rls_blocked' | 'unreachable' | 'local';
  requiredColumns: string[];
}

export interface DatabaseSchemaStatusResponse {
  config: DatabaseConnectionConfig;
  tables: DatabaseTableStatus[];
  summary: {
    totalRequired: number;
    existingCount: number;
    missingCount: number;
    totalRecords: number;
  };
}

export interface DatabaseAutoInitResult {
  createdTables: string[];
  alreadyExistingTables: string[];
  message: string;
  requiresManualSql?: boolean;
  status: DatabaseSchemaStatusResponse;
}

export interface SupabaseTestResult {
  ok: boolean;
  reachable: boolean;
  latencyMs: number;
  projectName: string;
  projectId: string;
  projectUrl: string;
  restUrl: string;
  existingTablesCount: number;
  missingTablesCount: number;
  rlsBlockedCount: number;
  hasDbUrl: boolean;
  message: string;
  status: DatabaseSchemaStatusResponse;
}

export interface SupabaseSyncResult {
  ok: boolean;
  direction: 'push' | 'pull';
  syncedTables: { tableName: string; rowCount: number }[];
  failedTables: { tableName: string; error: string }[];
  message: string;
  status: DatabaseSchemaStatusResponse;
}
