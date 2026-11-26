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
  | 'jadwal-shift'
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
  dailyMemberIds?: Record<string, string[]>;
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

export interface MatrixColorPair {
  bg: string;
  text: string;
}

export interface MatrixColorSettings {
  hadir: MatrixColorPair;
  terlambat: MatrixColorPair;
  izinTerlambat: MatrixColorPair;
  izin: MatrixColorPair;
  sakit: MatrixColorPair;
  alpha: MatrixColorPair;
  libur: MatrixColorPair;
  brandHeader: MatrixColorPair;
  groupHeader: MatrixColorPair;
  tableHeader: MatrixColorPair;
}

export const DEFAULT_MATRIX_COLORS: MatrixColorSettings = {
  hadir: { bg: '#548235', text: '#FFFFFF' },
  terlambat: { bg: '#D97706', text: '#FFFFFF' },
  izinTerlambat: { bg: '#0F766E', text: '#FFFFFF' },
  izin: { bg: '#FFF2CC', text: '#833C0C' },
  sakit: { bg: '#4338CA', text: '#FFFFFF' },
  alpha: { bg: '#C00000', text: '#FFFFFF' },
  libur: { bg: '#D9D9D9', text: '#1E293B' },
  brandHeader: { bg: '#FFC000', text: '#0F172A' },
  groupHeader: { bg: '#D9E1F2', text: '#0F172A' },
  tableHeader: { bg: '#1F4E78', text: '#FFFFFF' },
};

function sanitizeHexColor(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return /^#[0-9A-F]{6}$/.test(s) ? s : fallback;
}

export function normalizeMatrixColors(
  raw?: Partial<MatrixColorSettings> | null
): MatrixColorSettings {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pickPair = (
    pair: Partial<MatrixColorPair> | undefined,
    def: MatrixColorPair
  ): MatrixColorPair => ({
    bg: sanitizeHexColor(pair?.bg, def.bg),
    text: sanitizeHexColor(pair?.text, def.text),
  });

  return {
    hadir: pickPair(src.hadir, DEFAULT_MATRIX_COLORS.hadir),
    terlambat: pickPair(src.terlambat, DEFAULT_MATRIX_COLORS.terlambat),
    izinTerlambat: pickPair(src.izinTerlambat, DEFAULT_MATRIX_COLORS.izinTerlambat),
    izin: pickPair(src.izin, DEFAULT_MATRIX_COLORS.izin),
    sakit: pickPair(src.sakit, DEFAULT_MATRIX_COLORS.sakit),
    alpha: pickPair(src.alpha, DEFAULT_MATRIX_COLORS.alpha),
    libur: pickPair(src.libur, DEFAULT_MATRIX_COLORS.libur),
    brandHeader: pickPair(src.brandHeader, DEFAULT_MATRIX_COLORS.brandHeader),
    groupHeader: pickPair(src.groupHeader, DEFAULT_MATRIX_COLORS.groupHeader),
    tableHeader: pickPair(src.tableHeader, DEFAULT_MATRIX_COLORS.tableHeader),
  };
}

export function pickContrastTextColor(bgHex: string): string {
  const hex = sanitizeHexColor(bgHex, '#FFFFFF').slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
}

export interface AppSettings {
  companyName: string;
  companySubtitle: string;
  lateDeductionPerMinute?: number;
  shifts: ShiftConfig[];
  companyProfile?: CompanyProfile;
  matrixColors?: MatrixColorSettings;
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
  shiftName?: string;
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

export type BpjsDeductionMode =
  | 'default_pct'
  | 'custom_pct'
  | 'custom_nominal'
  | 'nonaktif';

export interface EmployeeFixedDeductionItem {
  id: string;
  title: string;
  amount: number;
}

export interface EmployeeSalaryProfile {
  employeeId: string;
  baseSalary: number;
  positionAllowance: number;
  transportMealAllowance: number;
  otherAllowance?: number;
  overtimeHourlyRate?: number;
  paydayDay?: number; // 1-31 per karyawan
  bpjsKesehatanMode?: BpjsDeductionMode;
  bpjsKesehatanValue?: number;
  bpjsTkMode?: BpjsDeductionMode;
  bpjsTkValue?: number;
  fixedDeductions?: EmployeeFixedDeductionItem[];
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

export function getActiveWeekDates(
  referenceDateStr: string = getTodayDateStr()
): Record<number, string> {
  const parts = referenceDateStr.split('-').map(Number);
  const baseDate =
    parts.length === 3 && !parts.some(isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date();
  const baseDow = baseDate.getDay();
  const mondayOffset = baseDow === 0 ? -6 : 1 - baseDow;
  const result: Record<number, string> = {};
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  weekdayOrder.forEach((dayIdx, offsetIdx) => {
    const dt = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + mondayOffset + offsetIdx
    );
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    result[dayIdx] = `${y}-${m}-${d}`;
  });
  return result;
}

export function isEmployeeOffOnShiftDay(
  employee: Employee,
  dayIndex: number,
  weekDateStr?: string
): {
  isOff: boolean;
  isRoutineOff: boolean;
  isCustomDateOff: boolean;
  reason: 'mingguan' | 'khusus' | 'keduanya' | null;
} {
  const isRoutineOff = Boolean(employee.offDays?.includes(dayIndex));
  const isCustomDateOff = Boolean(
    weekDateStr && employee.customOffDates?.includes(weekDateStr)
  );
  const isOff = isRoutineOff || isCustomDateOff;
  const reason =
    isRoutineOff && isCustomDateOff
      ? 'keduanya'
      : isCustomDateOff
        ? 'khusus'
        : isRoutineOff
          ? 'mingguan'
          : null;
  return { isOff, isRoutineOff, isCustomDateOff, reason };
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

export const UNASSIGNED_SHIFT_NAME = 'Belum Diatur';

export function isEmployeeShiftAssigned(shiftName?: string): boolean {
  const clean = String(shiftName || '').trim().toLowerCase();
  return Boolean(clean && clean !== 'belum diatur' && clean !== '-');
}

export function getEmployeeShiftTolerance(
  employee: Employee,
  shifts?: ShiftConfig[]
): number {
  if (!shifts || shifts.length === 0 || !isEmployeeShiftAssigned(employee.shiftName)) {
    return 0;
  }
  const match = shifts.find(
    (s) => s.name.toLowerCase() === employee.shiftName.toLowerCase()
  );
  return match ? match.lateToleranceMinutes : 0;
}

export function getShiftMembersForWeekday(
  shift: ShiftConfig,
  dayIndex: number,
  employees: Employee[]
): {
  members: Employee[];
  isCustomDayRoster: boolean;
} {
  const dayKey = String(dayIndex);
  const customIds = shift.dailyMemberIds?.[dayKey];
  if (Array.isArray(customIds)) {
    const empById = new Map<string, Employee>();
    for (const emp of employees) {
      if (emp.active) empById.set(emp.id, emp);
    }
    const members: Employee[] = [];
    const seen = new Set<string>();
    for (const id of customIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const found = empById.get(id);
      if (found && !found.offDays?.includes(dayIndex)) {
        members.push(found);
      }
    }
    return { members, isCustomDayRoster: true };
  }

  // Tidak ada shift default per karyawan: seluruh anggota shift diatur penuh melalui Jadwal Shift
  return { members: [], isCustomDayRoster: false };
}

export function getEmployeeScheduledShiftsForWeekday(
  employeeId: string,
  dayIndex: number,
  shifts?: ShiftConfig[]
): ShiftConfig[] {
  if (!shifts || shifts.length === 0 || !employeeId) return [];
  const dayKey = String(dayIndex);
  return shifts.filter((shift) => {
    const ids = shift.dailyMemberIds?.[dayKey];
    return Array.isArray(ids) && ids.includes(employeeId);
  });
}

export function getEmployeeWeeklyShiftSummary(
  employeeId: string,
  shifts?: ShiftConfig[]
): {
  dayEntries: { dayIndex: number; dayShort: string; shift: ShiftConfig | null }[];
  uniqueShiftNames: string[];
  scheduledDayCount: number;
} {
  const dayEntries = HARI_WEEKDAYS.map((day) => {
    const matched = getEmployeeScheduledShiftsForWeekday(employeeId, day.index, shifts);
    return {
      dayIndex: day.index,
      dayShort: day.short,
      shift: matched[0] ?? null,
    };
  });
  const uniqueShiftNames = Array.from(
    new Set(dayEntries.map((d) => d.shift?.name).filter((n): n is string => Boolean(n)))
  );
  const scheduledDayCount = dayEntries.filter((d) => d.shift !== null).length;
  return { dayEntries, uniqueShiftNames, scheduledDayCount };
}

export function resolveAttendanceShift(
  employee: Employee,
  shifts?: ShiftConfig[],
  overrideShiftName?: string
): {
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  lateToleranceMinutes: number;
} {
  const override = String(overrideShiftName || '').trim();
  if (override && isEmployeeShiftAssigned(override)) {
    const match = shifts?.find(
      (s) => s.name.toLowerCase() === override.toLowerCase()
    );
    if (match) {
      return {
        shiftName: match.name,
        shiftStart: match.startTime,
        shiftEnd: match.endTime,
        lateToleranceMinutes: match.lateToleranceMinutes,
      };
    }
    return {
      shiftName: override,
      shiftStart: isEmployeeShiftAssigned(employee.shiftName) ? employee.shiftStart : '',
      shiftEnd: isEmployeeShiftAssigned(employee.shiftName) ? employee.shiftEnd : '',
      lateToleranceMinutes: 0,
    };
  }

  if (isEmployeeShiftAssigned(employee.shiftName)) {
    const match = shifts?.find(
      (s) => s.name.toLowerCase() === employee.shiftName.toLowerCase()
    );
    if (match) {
      return {
        shiftName: match.name,
        shiftStart: match.startTime,
        shiftEnd: match.endTime,
        lateToleranceMinutes: match.lateToleranceMinutes,
      };
    }
    return {
      shiftName: employee.shiftName,
      shiftStart: employee.shiftStart,
      shiftEnd: employee.shiftEnd,
      lateToleranceMinutes: 0,
    };
  }

  return {
    shiftName: UNASSIGNED_SHIFT_NAME,
    shiftStart: '',
    shiftEnd: '',
    lateToleranceMinutes: 0,
  };
}

export function resolveEmployeeDefaultShiftForDate(
  employee: Employee,
  dateStr: string,
  shifts?: ShiftConfig[]
): {
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  lateToleranceMinutes: number;
  scheduledShiftNames: string[];
} {
  if (!shifts || shifts.length === 0) {
    return {
      shiftName: UNASSIGNED_SHIFT_NAME,
      shiftStart: '',
      shiftEnd: '',
      lateToleranceMinutes: 0,
      scheduledShiftNames: [],
    };
  }
  const dayIdx = getDayOfWeekFromDateStr(dateStr);
  const scheduledShifts = shifts.filter((shift) => {
    const { members } = getShiftMembersForWeekday(shift, dayIdx, [employee]);
    return members.some((m) => m.id === employee.id);
  });
  const scheduledShiftNames = scheduledShifts.map((s) => s.name);

  if (scheduledShifts.length > 0) {
    const preferred = scheduledShifts[0];
    return {
      shiftName: preferred.name,
      shiftStart: preferred.startTime,
      shiftEnd: preferred.endTime,
      lateToleranceMinutes: preferred.lateToleranceMinutes,
      scheduledShiftNames,
    };
  }

  return {
    shiftName: UNASSIGNED_SHIFT_NAME,
    shiftStart: '',
    shiftEnd: '',
    lateToleranceMinutes: 0,
    scheduledShiftNames: [],
  };
}

export function formatEmployeeShiftForDisplay(
  employee: Employee,
  dateStr: string,
  shifts?: ShiftConfig[]
): {
  hasSchedule: boolean;
  label: string;
  shortLabel: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
} {
  const scheduled = resolveEmployeeDefaultShiftForDate(employee, dateStr, shifts);
  if (scheduled.scheduledShiftNames.length > 0) {
    return {
      hasSchedule: true,
      label: `${scheduled.shiftName} (${scheduled.shiftStart}–${scheduled.shiftEnd})`,
      shortLabel: scheduled.shiftName,
      shiftName: scheduled.shiftName,
      shiftStart: scheduled.shiftStart,
      shiftEnd: scheduled.shiftEnd,
    };
  }
  const weekly = getEmployeeWeeklyShiftSummary(employee.id, shifts);
  if (weekly.scheduledDayCount > 0) {
    return {
      hasSchedule: false,
      label: `Tidak ada shift hari ini (${weekly.uniqueShiftNames.join('/')})`,
      shortLabel: 'Kosong hari ini',
      shiftName: '',
      shiftStart: '',
      shiftEnd: '',
    };
  }
  return {
    hasSchedule: false,
    label: 'Belum dijadwalkan (Atur di Jadwal Shift)',
    shortLabel: 'Belum diatur',
    shiftName: '',
    shiftStart: '',
    shiftEnd: '',
  };
}

export function packNotesWithShift(notes: string, shiftName?: string): string {
  const unpacked = unpackShiftFromNotes(notes);
  const cleanNotes = unpacked.notes;
  const cleanShift = String(shiftName || '')
    .trim()
    .replace(/[\[\]]/g, '')
    .slice(0, 40);
  if (!cleanShift) return cleanNotes.slice(0, 300);
  const tag = `[Shift: ${cleanShift}]`;
  if (!cleanNotes) return tag;
  const maxNoteLen = Math.max(0, 300 - tag.length - 1);
  return `${cleanNotes.slice(0, maxNoteLen)} ${tag}`.trim();
}

export function unpackShiftFromNotes(rawNotes: string): {
  notes: string;
  shiftName?: string;
} {
  const text = String(rawNotes || '');
  const match = text.match(/\s*\[Shift:\s*([^\]]+)\]\s*$/);
  if (!match) {
    return { notes: text.trim() };
  }
  const shiftName = match[1].trim().slice(0, 40);
  const notes = text.slice(0, match.index).trim();
  return {
    notes,
    ...(shiftName ? { shiftName } : {}),
  };
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

export type MatrixCellCode = 'H' | 'I' | 'S' | 'A' | 'L' | '';

export function statusToMatrixCode(status: AttendanceStatus): MatrixCellCode {
  switch (status) {
    case 'hadir':
    case 'terlambat':
    case 'izin_terlambat':
      return 'H';
    case 'izin':
      return 'I';
    case 'sakit':
      return 'S';
    case 'alpha':
      return 'A';
    case 'libur':
      return 'L';
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
  sqliteFilePath?: string;
  hasDatabasePassword?: boolean;
  hasConnectionUri?: boolean;
  autoCreateMissingTables: boolean;
  hasCustomDatabasePin: boolean;
  firestoreProjectId: string;
  firestoreDatabaseId: string;
  firestoreApiKey?: string;
  firestoreAuthDomain?: string;
  firestoreAppId?: string;
  firestoreStorageBucket?: string;
  firestoreMessagingSenderId?: string;
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

export interface DatabaseConnectionTestResult {
  ok: boolean;
  engine: DatabaseEngineType;
  latencyMs: number;
  endpoint: string;
  serverVersion?: string;
  details?: string;
  message: string;
  status?: DatabaseSchemaStatusResponse;
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

export type ResetDataMode = 'attendance' | 'except_employees' | 'all';

export interface ResetDataResult {
  ok: boolean;
  mode: ResetDataMode;
  message: string;
  summary: {
    employeesRemaining: number;
    attendanceRemaining: number;
    lateSettlementsRemaining: number;
    payrollProfilesRemaining: number;
    financeTransactionsRemaining: number;
  };
  state: {
    employees: Employee[];
    attendanceRecords: AttendanceRecord[];
    lateSettlements: LateSettlement[];
    settings: AppSettings;
  };
  financeAccounts?: FinanceAccount[];
  financeCategories?: FinanceCategory[];
}

export type NotificationModule =
  | 'absensi'
  | 'keuangan'
  | 'gaji'
  | 'jadwal'
  | 'sdm'
  | 'sistem';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'danger';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  module: NotificationModule;
  severity: NotificationSeverity;
  actionType: string;
  amountValue?: number;
  amountLabel?: string;
  targetLabel?: string;
  targetNav?: NavSection;
  timestamp: string;
  read: boolean;
  systemDelivered?: boolean;
}

export interface NotificationPreferences {
  systemNotificationsEnabled: boolean;
  soundEnabled: boolean;
  showToasts: boolean;
  mutedModules: NotificationModule[];
}

export interface PackedPayrollDeductionsConfig {
  bpjsKesehatanMode?: BpjsDeductionMode;
  bpjsKesehatanValue?: number;
  bpjsTkMode?: BpjsDeductionMode;
  bpjsTkValue?: number;
  fixedDeductions?: EmployeeFixedDeductionItem[];
}

const VALID_BPJS_MODES: readonly BpjsDeductionMode[] = [
  'default_pct',
  'custom_pct',
  'custom_nominal',
  'nonaktif',
];

export function normalizeBpjsMode(raw: unknown): BpjsDeductionMode {
  return typeof raw === 'string' && (VALID_BPJS_MODES as readonly string[]).includes(raw)
    ? (raw as BpjsDeductionMode)
    : 'default_pct';
}

export function sanitizeFixedDeductions(raw: unknown): EmployeeFixedDeductionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: EmployeeFixedDeductionItem[] = [];
  for (let i = 0; i < raw.length && out.length < 25; i++) {
    const item = raw[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title || '').trim().slice(0, 80);
    const amount = Math.max(0, Math.min(1000000000, Math.round(Number(item.amount || 0))));
    if (!title || !Number.isFinite(amount) || amount <= 0) continue;
    const id =
      String(item.id || '')
        .trim()
        .slice(0, 64) || `fd_${i + 1}`;
    out.push({ id, title, amount });
  }
  return out;
}

export function unpackPayrollProfileNotes(rawNotes: string): {
  notes: string;
  bpjsKesehatanMode: BpjsDeductionMode;
  bpjsKesehatanValue: number;
  bpjsTkMode: BpjsDeductionMode;
  bpjsTkValue: number;
  fixedDeductions: EmployeeFixedDeductionItem[];
} {
  const text = String(rawNotes || '');
  const marker = '[PAYROLL_DEDUCTIONS:';
  const idx = text.lastIndexOf(marker);
  if (idx < 0 || !text.trimEnd().endsWith(']')) {
    return {
      notes: text.trim(),
      bpjsKesehatanMode: 'default_pct',
      bpjsKesehatanValue: 0,
      bpjsTkMode: 'default_pct',
      bpjsTkValue: 0,
      fixedDeductions: [],
    };
  }
  const cleanNotes = text.slice(0, idx).trim();
  const trimmedEnd = text.trimEnd();
  const jsonPart = trimmedEnd.slice(idx + marker.length, -1);
  try {
    const parsed = JSON.parse(jsonPart) as {
      bk?: unknown;
      bkv?: unknown;
      bt?: unknown;
      btv?: unknown;
      fd?: unknown;
    };
    return {
      notes: cleanNotes,
      bpjsKesehatanMode: normalizeBpjsMode(parsed.bk),
      bpjsKesehatanValue: Math.max(0, Number(parsed.bkv || 0) || 0),
      bpjsTkMode: normalizeBpjsMode(parsed.bt),
      bpjsTkValue: Math.max(0, Number(parsed.btv || 0) || 0),
      fixedDeductions: sanitizeFixedDeductions(parsed.fd),
    };
  } catch {
    return {
      notes: text.trim(),
      bpjsKesehatanMode: 'default_pct',
      bpjsKesehatanValue: 0,
      bpjsTkMode: 'default_pct',
      bpjsTkValue: 0,
      fixedDeductions: [],
    };
  }
}

export function packPayrollProfileNotes(
  notes: string,
  config: PackedPayrollDeductionsConfig
): string {
  const cleanNotes = unpackPayrollProfileNotes(notes).notes.slice(0, 300);
  const bk = normalizeBpjsMode(config.bpjsKesehatanMode);
  const bkv = Math.max(0, Number(config.bpjsKesehatanValue || 0) || 0);
  const bt = normalizeBpjsMode(config.bpjsTkMode);
  const btv = Math.max(0, Number(config.bpjsTkValue || 0) || 0);
  const fd = sanitizeFixedDeductions(config.fixedDeductions);

  if (bk === 'default_pct' && bt === 'default_pct' && fd.length === 0) {
    return cleanNotes;
  }

  const tag = `[PAYROLL_DEDUCTIONS:${JSON.stringify({
    bk,
    bkv,
    bt,
    btv,
    fd,
  })}]`;
  return cleanNotes ? `${cleanNotes} ${tag}` : tag;
}


