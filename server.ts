import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'attendance-db.json');
const PAYROLL_DB_FILE = path.join(DATA_DIR, 'payroll-db.json');
const FINANCE_DB_FILE = path.join(DATA_DIR, 'finance-db.json');
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, 'security-config.json');
const DEFAULT_ADMIN_PIN_SHA256 =
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
const SUPERUSER_PIN_SHA256 =
  'b9196683c40dd7cecb4dfc8ffc9ed64d4bc192f126d9d771706e791726582b26';
const PAYROLL_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30 * 1000;

interface EmployeeData {
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  position: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  offDays: number[];
  customOffDates: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AttendanceData {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: 'hadir' | 'terlambat' | 'izin_terlambat' | 'izin' | 'sakit' | 'alpha' | 'libur';
  checkIn: string;
  checkOut: string;
  overtimeHours: number;
  notes: string;
  latePermitReason?: string;
  latePermitEstimatedArrival?: string;
  latePermitApprovedBy?: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ShiftConfigData {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  lateToleranceMinutes: number;
}

interface CompanyBranchData {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  isHeadquarters: boolean;
}

interface CompanyProfileData {
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
  branches: CompanyBranchData[];
}

interface AppSettingsData {
  companyName: string;
  companySubtitle: string;
  lateDeductionPerMinute: number;
  shifts: ShiftConfigData[];
  companyProfile: CompanyProfileData;
}

interface LateSettlementData {
  id: string;
  employeeId: string;
  employeeName: string;
  yearMonth: string;
  date: string;
  method: 'tambahan_jam_kerja' | 'potongan_gaji';
  minutesSettled: number;
  extraWorkStart?: string;
  extraWorkEnd?: string;
  deductionAmount?: number;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

interface DatabaseSchema {
  employees: EmployeeData[];
  attendanceRecords: AttendanceData[];
  lateSettlements: LateSettlementData[];
  settings: AppSettingsData;
}

function buildDefaultCompanyProfile(): CompanyProfileData {
  return {
    legalName: 'PT KaryaPresensi Nusantara',
    industry: 'Distribusi, Ritel & Logistik Terpadu',
    taxId: '01.234.567.8-012.000',
    nib: '9120304050607',
    establishedYear: '2018',
    phone: '(021) 555-0192',
    email: 'hrd@karyapresensi.co.id',
    website: 'https://karyapresensi.co.id',
    address: 'Jl. Jenderal Sudirman Kav. 52–53, SCBD, Kebayoran Baru',
    city: 'Jakarta Selatan, DKI Jakarta',
    postalCode: '12190',
    directorName: 'Hendra Kusuma, S.E., M.M.',
    hrManagerName: 'Ratna Dewi Anggraini, S.Psi.',
    hrManagerTitle: 'Manajer Sumber Daya Manusia',
    workDaysSummary: 'Senin – Minggu (Sistem Shift & Libur Bergilir)',
    vision:
      'Menjadi perusahaan distribusi dan layanan operasional terdepan yang mengutamakan kedisiplinan kerja, keandalan rantai pasok, dan kesejahteraan sumber daya manusia.',
    mission:
      'Membangun budaya kerja yang akurat dan transparan, memberdayakan tim lintas divisi dengan standar operasional modern, serta menjaga kualitas pelayanan terbaik bagi seluruh mitra.',
    logoDataUrl: '',
    branches: [
      {
        id: 'branch_pusat',
        name: 'Kantor Pusat & Manajemen HRD',
        city: 'Jakarta Selatan',
        address: 'Jl. Jenderal Sudirman Kav. 52–53, SCBD, Kebayoran Baru',
        phone: '(021) 555-0192',
        isHeadquarters: true,
      },
      {
        id: 'branch_gudang_bekasi',
        name: 'Pusat Gudang & Logistik Timur',
        city: 'Bekasi',
        address: 'Kawasan Industri Jababeka Tahap II Blok C-14',
        phone: '(021) 8983-4410',
        isHeadquarters: false,
      },
    ],
  };
}

function buildDefaultSettings(): AppSettingsData {
  return {
    companyName: 'KARYAPRESENSI',
    companySubtitle: 'HRIS PERUSAHAAN',
    lateDeductionPerMinute: 1000,
    shifts: [
      {
        id: 'shift_pagi',
        name: 'Shift Pagi',
        startTime: '07:30',
        endTime: '16:30',
        lateToleranceMinutes: 10,
      },
      {
        id: 'shift_reguler',
        name: 'Reguler',
        startTime: '08:30',
        endTime: '17:30',
        lateToleranceMinutes: 15,
      },
      {
        id: 'shift_siang',
        name: 'Shift Siang',
        startTime: '11:00',
        endTime: '20:00',
        lateToleranceMinutes: 10,
      },
      {
        id: 'shift_malam',
        name: 'Shift Malam',
        startTime: '22:00',
        endTime: '06:00',
        lateToleranceMinutes: 10,
      },
    ],
    companyProfile: buildDefaultCompanyProfile(),
  };
}

function formatDateLocal(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSeedDatabase(): DatabaseSchema {
  const now = new Date();
  const nowIso = now.toISOString();

  const employees: EmployeeData[] = [
    {
      id: 'emp_rina_putri',
      employeeCode: 'KRY-101',
      name: 'Rina Putri Maharani',
      department: 'Layanan Pelanggan',
      position: 'Koordinator CS',
      shiftName: 'Shift Pagi',
      shiftStart: '08:00',
      shiftEnd: '17:00',
      offDays: [1], // Senin
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_dimas_pratama',
      employeeCode: 'KRY-102',
      name: 'Dimas Pratama',
      department: 'Gudang & Logistik',
      position: 'Supervisor Inventaris',
      shiftName: 'Shift Pagi',
      shiftStart: '07:30',
      shiftEnd: '16:30',
      offDays: [2], // Selasa
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_sari_wijaya',
      employeeCode: 'KRY-103',
      name: 'Sari Wijaya Kusuma',
      department: 'Operasional Toko',
      position: 'Kepala Kasir',
      shiftName: 'Shift Siang',
      shiftStart: '11:00',
      shiftEnd: '20:00',
      offDays: [3], // Rabu
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_bagus_santoso',
      employeeCode: 'KRY-104',
      name: 'Bagus Santoso',
      department: 'Teknologi Informasi',
      position: 'Teknisi Jaringan',
      shiftName: 'Shift Pagi',
      shiftStart: '08:30',
      shiftEnd: '17:30',
      offDays: [4], // Kamis
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_nadia_rahman',
      employeeCode: 'KRY-105',
      name: 'Nadia Rahman',
      department: 'Pemasaran',
      position: 'Spesialis Konten',
      shiftName: 'Reguler',
      shiftStart: '09:00',
      shiftEnd: '18:00',
      offDays: [5], // Jumat
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_hendra_wijaya',
      employeeCode: 'KRY-106',
      name: 'Hendra Wijaya',
      department: 'Gudang & Logistik',
      position: 'Staf Pengiriman',
      shiftName: 'Shift Pagi',
      shiftStart: '07:30',
      shiftEnd: '16:30',
      offDays: [6], // Sabtu
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_fajar_nugroho',
      employeeCode: 'KRY-107',
      name: 'Fajar Nugroho',
      department: 'Keuangan & Akuntansi',
      position: 'Staf Payroll',
      shiftName: 'Reguler',
      shiftStart: '08:30',
      shiftEnd: '17:30',
      offDays: [0, 6], // Sabtu & Minggu
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'emp_melati_kusuma',
      employeeCode: 'KRY-108',
      name: 'Melati Kusuma',
      department: 'Layanan Pelanggan',
      position: 'Staf Dukungan',
      shiftName: 'Shift Siang',
      shiftStart: '11:00',
      shiftEnd: '20:00',
      offDays: [0], // Minggu
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const attendanceRecords: AttendanceData[] = [];
  let seq = 1;

  // Seed last 6 days (full history) + partial entries for today
  for (let offset = 6; offset >= 0; offset--) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - offset);
    const dateStr = formatDateLocal(dt);
    const dow = dt.getDay();

    employees.forEach((emp, idx) => {
      const isOff = emp.offDays.includes(dow);

      // For today (offset === 0), leave a few working employees unlogged so Admin can use 1-click check-in
      if (offset === 0 && !isOff && idx >= 4) {
        return;
      }

      if (isOff) {
        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'libur',
          checkIn: '',
          checkOut: '',
          overtimeHours: 0,
          notes: 'Hari libur mingguan terjadwal',
          recordedBy: 'Admin HR',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        return;
      }

      // Deterministic variety across the 7-day window
      const pattern = (offset + idx) % 11;
      if (pattern === 9) {
        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'izin',
          checkIn: '',
          checkOut: '',
          overtimeHours: 0,
          notes: 'Izin keperluan keluarga (input admin)',
          recordedBy: 'Admin HR',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else if (pattern === 10) {
        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'sakit',
          checkIn: '',
          checkOut: '',
          overtimeHours: 0,
          notes: 'Surat keterangan istirahat 1 hari',
          recordedBy: 'Admin HR',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else if (pattern === 4 || (offset === 0 && idx === 1)) {
        const [sh, sm] = emp.shiftStart.split(':').map(Number);
        const lateMin = sm + 18;
        const lh = sh + Math.floor(lateMin / 60);
        const lm = lateMin % 60;
        const lateCheckIn = `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'terlambat',
          checkIn: lateCheckIn,
          checkOut: offset === 0 ? '' : emp.shiftEnd,
          overtimeHours: 0,
          notes: 'Terlambat masuk shift pagi',
          recordedBy: 'Admin HR',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        const otHours = pattern === 2 && offset > 0 ? 2 : 0;
        const [eh, em] = emp.shiftEnd.split(':').map(Number);
        const outHour = eh + otHours;
        const checkOutStr =
          offset === 0
            ? ''
            : `${String(outHour).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'hadir',
          checkIn: emp.shiftStart,
          checkOut: checkOutStr,
          overtimeHours: otHours,
          notes: otHours > 0 ? `Lembur manual ${otHours} jam (tutup buku/inventaris)` : 'Hadir sesuai jadwal shift',
          recordedBy: 'Admin HR',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    });
  }

  return {
    employees,
    attendanceRecords,
    lateSettlements: [],
    settings: buildDefaultSettings(),
  };
}

function normalizeCompanyProfile(
  rawProfile: Partial<CompanyProfileData> | undefined
): CompanyProfileData {
  const def = buildDefaultCompanyProfile();
  if (!rawProfile || typeof rawProfile !== 'object') return def;

  const rawLogo = typeof rawProfile.logoDataUrl === 'string' ? rawProfile.logoDataUrl : '';
  const safeLogo =
    rawLogo === '' || (rawLogo.startsWith('data:image/') && rawLogo.length <= 750000)
      ? rawLogo
      : def.logoDataUrl;

  const branches: CompanyBranchData[] = Array.isArray(rawProfile.branches)
    ? rawProfile.branches
        .slice(0, 30)
        .map((b, idx) => ({
          id: String(b.id || `branch_${idx + 1}`).slice(0, 50),
          name: String(b.name || 'Cabang').trim().slice(0, 80),
          city: String(b.city || '').trim().slice(0, 60),
          address: String(b.address || '').trim().slice(0, 200),
          phone: String(b.phone || '').trim().slice(0, 40),
          isHeadquarters: Boolean(b.isHeadquarters),
        }))
        .filter((b) => b.name.length > 0)
    : def.branches;

  const pickStr = (val: unknown, fallback: string, maxLen: number) =>
    val !== undefined && val !== null ? String(val).trim().slice(0, maxLen) : fallback;

  return {
    legalName: pickStr(rawProfile.legalName, def.legalName, 100),
    industry: pickStr(rawProfile.industry, def.industry, 100),
    taxId: pickStr(rawProfile.taxId, def.taxId, 40),
    nib: pickStr(rawProfile.nib, def.nib, 40),
    establishedYear: pickStr(rawProfile.establishedYear, def.establishedYear, 10),
    phone: pickStr(rawProfile.phone, def.phone, 40),
    email: pickStr(rawProfile.email, def.email, 80),
    website: pickStr(rawProfile.website, def.website, 100),
    address: pickStr(rawProfile.address, def.address, 250),
    city: pickStr(rawProfile.city, def.city, 80),
    postalCode: pickStr(rawProfile.postalCode, def.postalCode, 15),
    directorName: pickStr(rawProfile.directorName, def.directorName, 80),
    hrManagerName: pickStr(rawProfile.hrManagerName, def.hrManagerName, 80),
    hrManagerTitle: pickStr(rawProfile.hrManagerTitle, def.hrManagerTitle, 80),
    workDaysSummary: pickStr(rawProfile.workDaysSummary, def.workDaysSummary, 100),
    vision: pickStr(rawProfile.vision, def.vision, 500),
    mission: pickStr(rawProfile.mission, def.mission, 800),
    logoDataUrl: safeLogo,
    branches,
  };
}

function normalizeSettings(rawSettings: Partial<AppSettingsData> | undefined): AppSettingsData {
  const defaults = buildDefaultSettings();
  if (!rawSettings || typeof rawSettings !== 'object') return defaults;
  const shifts = Array.isArray(rawSettings.shifts) && rawSettings.shifts.length > 0
    ? rawSettings.shifts.map((s, idx) => ({
        id: String(s.id || `shift_${idx + 1}`),
        name: String(s.name || `Shift ${idx + 1}`).trim().slice(0, 40),
        startTime: String(s.startTime || '08:00'),
        endTime: String(s.endTime || '17:00'),
        lateToleranceMinutes: Math.max(0, Math.min(120, Number(s.lateToleranceMinutes ?? 10))),
      }))
    : defaults.shifts;

  return {
    companyName: String(rawSettings.companyName || defaults.companyName).trim().slice(0, 60) || defaults.companyName,
    companySubtitle: String(rawSettings.companySubtitle || defaults.companySubtitle).trim().slice(0, 60) || defaults.companySubtitle,
    lateDeductionPerMinute: Math.max(
      0,
      Math.min(1000000, Number(rawSettings.lateDeductionPerMinute ?? defaults.lateDeductionPerMinute))
    ),
    shifts,
    companyProfile: normalizeCompanyProfile(rawSettings.companyProfile),
  };
}

function readDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.attendanceRecords)) {
      const seed = buildSeedDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    const normalized: DatabaseSchema = {
      employees: parsed.employees,
      attendanceRecords: parsed.attendanceRecords,
      lateSettlements: Array.isArray(parsed.lateSettlements) ? parsed.lateSettlements : [],
      settings: normalizeSettings(parsed.settings),
    };
    if (!parsed.settings || !Array.isArray(parsed.lateSettlements)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  } catch {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function writeDb(data: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

interface PayrollSettingsData {
  defaultOvertimeHourlyRate: number;
  defaultAlphaDeductionPerDay: number;
  defaultIzinDeductionPerDay: number;
  autoDeductRemainingLate: boolean;
  bpjsKesehatanPct: number;
  bpjsKetenagakerjaanPct: number;
  paydayDayOfMonth: number;
}

interface EmployeeSalaryProfileData {
  employeeId: string;
  baseSalary: number;
  positionAllowance: number;
  transportMealAllowance: number;
  otherAllowance?: number;
  overtimeHourlyRate?: number;
  paydayDay?: number;
  paymentMethod: 'transfer' | 'tunai';
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  notes: string;
  updatedAt: string;
}

interface PayrollAdjustmentData {
  id: string;
  employeeId: string;
  employeeName: string;
  yearMonth: string;
  type: 'bonus' | 'tunjangan' | 'potongan';
  title: string;
  amount: number;
  date: string;
  notes: string;
  createdAt: string;
}

interface SalaryRaiseRecordData {
  id: string;
  employeeId: string;
  employeeName: string;
  effectiveMonth: string;
  raiseDate: string;
  method: 'nominal' | 'persentase';
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
  createdAt: string;
}

interface PayrollMonthlyStatusData {
  id: string;
  employeeId: string;
  yearMonth: string;
  status: 'draft' | 'disetujui' | 'dibayar';
  paidAt?: string;
  updatedAt: string;
}

interface PayrollDatabaseSchema {
  settings: PayrollSettingsData;
  profiles: EmployeeSalaryProfileData[];
  adjustments: PayrollAdjustmentData[];
  salaryRaises: SalaryRaiseRecordData[];
  statuses: PayrollMonthlyStatusData[];
}

function buildDefaultPayrollSettings(): PayrollSettingsData {
  return {
    defaultOvertimeHourlyRate: 25000,
    defaultAlphaDeductionPerDay: 150000,
    defaultIzinDeductionPerDay: 0,
    autoDeductRemainingLate: true,
    bpjsKesehatanPct: 1,
    bpjsKetenagakerjaanPct: 2,
    paydayDayOfMonth: 25,
  };
}

function normalizePayrollSettings(
  raw: Partial<PayrollSettingsData> | undefined
): PayrollSettingsData {
  const def = buildDefaultPayrollSettings();
  if (!raw || typeof raw !== 'object') return def;
  return {
    defaultOvertimeHourlyRate: Math.max(
      0,
      Math.min(10000000, Math.round(Number(raw.defaultOvertimeHourlyRate ?? def.defaultOvertimeHourlyRate)))
    ),
    defaultAlphaDeductionPerDay: Math.max(
      0,
      Math.min(10000000, Math.round(Number(raw.defaultAlphaDeductionPerDay ?? def.defaultAlphaDeductionPerDay)))
    ),
    defaultIzinDeductionPerDay: Math.max(
      0,
      Math.min(10000000, Math.round(Number(raw.defaultIzinDeductionPerDay ?? def.defaultIzinDeductionPerDay)))
    ),
    autoDeductRemainingLate:
      raw.autoDeductRemainingLate !== undefined
        ? Boolean(raw.autoDeductRemainingLate)
        : def.autoDeductRemainingLate,
    bpjsKesehatanPct: Math.max(
      0,
      Math.min(20, Number(raw.bpjsKesehatanPct ?? def.bpjsKesehatanPct))
    ),
    bpjsKetenagakerjaanPct: Math.max(
      0,
      Math.min(20, Number(raw.bpjsKetenagakerjaanPct ?? def.bpjsKetenagakerjaanPct))
    ),
    paydayDayOfMonth: Math.max(
      1,
      Math.min(31, Math.round(Number(raw.paydayDayOfMonth ?? def.paydayDayOfMonth)))
    ),
  };
}

function buildInitialPayrollDb(): PayrollDatabaseSchema {
  const mainDb = readDb();
  const nowIso = new Date().toISOString();
  const profiles: EmployeeSalaryProfileData[] = mainDb.employees.map((emp, idx) => {
    const posLower = emp.position.toLowerCase();
    let base = 4400000;
    let posAllowance = 450000;
    if (posLower.includes('supervisor') || posLower.includes('koordinator') || posLower.includes('kepala')) {
      base = 5600000;
      posAllowance = 950000;
    } else if (posLower.includes('teknisi') || posLower.includes('payroll') || posLower.includes('spesialis')) {
      base = 4900000;
      posAllowance = 650000;
    }
    const banks = ['BCA', 'Mandiri', 'BNI', 'BRI'];
    const bank = banks[idx % banks.length];
    const variedPaydays = [25, 28, 1, 5, 15, 25, 28, 1];
    return {
      employeeId: emp.id,
      baseSalary: base,
      positionAllowance: posAllowance,
      transportMealAllowance: 650000,
      otherAllowance: idx % 2 === 0 ? 250000 : 0,
      overtimeHourlyRate: 25000,
      paydayDay: variedPaydays[idx % variedPaydays.length],
      paymentMethod: 'transfer',
      bankName: bank,
      bankAccountNumber: `1080${String(421000 + idx * 137)}`,
      bankAccountHolder: emp.name,
      notes: 'Struktur gaji standar perusahaan',
      updatedAt: nowIso,
    };
  });

  return {
    settings: buildDefaultPayrollSettings(),
    profiles,
    adjustments: [],
    salaryRaises: [],
    statuses: [],
  };
}

function readPayrollDb(): PayrollDatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PAYROLL_DB_FILE)) {
    const seed = buildInitialPayrollDb();
    fs.writeFileSync(PAYROLL_DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(PAYROLL_DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PayrollDatabaseSchema>;
    const normalized: PayrollDatabaseSchema = {
      settings: normalizePayrollSettings(parsed.settings),
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
      salaryRaises: Array.isArray(parsed.salaryRaises) ? parsed.salaryRaises : [],
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses : [],
    };
    return normalized;
  } catch {
    const seed = buildInitialPayrollDb();
    fs.writeFileSync(PAYROLL_DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function writePayrollDb(data: PayrollDatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PAYROLL_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function hashPinSha256(pin: string): string {
  return crypto.createHash('sha256').update(String(pin || '').trim()).digest('hex');
}

function timingSafeHashEqual(actualHex: string, expectedHex: string): boolean {
  try {
    const actualBuf = Buffer.from(actualHex, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (actualBuf.length === 0 || actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

interface SecurityConfigData {
  adminPinSha256: string;
  updatedAt: string;
}

function readSecurityConfig(): SecurityConfigData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SECURITY_CONFIG_FILE)) {
    const initCfg: SecurityConfigData = {
      adminPinSha256: DEFAULT_ADMIN_PIN_SHA256,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(SECURITY_CONFIG_FILE, JSON.stringify(initCfg, null, 2), 'utf-8');
    return initCfg;
  }
  try {
    const raw = fs.readFileSync(SECURITY_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SecurityConfigData>;
    if (
      parsed &&
      typeof parsed.adminPinSha256 === 'string' &&
      /^[a-f0-9]{64}$/i.test(parsed.adminPinSha256)
    ) {
      return {
        adminPinSha256: parsed.adminPinSha256,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // fallback to default
  }
  const fallbackCfg: SecurityConfigData = {
    adminPinSha256: DEFAULT_ADMIN_PIN_SHA256,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(SECURITY_CONFIG_FILE, JSON.stringify(fallbackCfg, null, 2), 'utf-8');
  return fallbackCfg;
}

function writeSecurityConfig(cfg: SecurityConfigData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SECURITY_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function verifySuperuserPin(pin: string): boolean {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return false;
  const expectedHash = process.env.SUPERUSER_PAYROLL_PIN
    ? hashPinSha256(process.env.SUPERUSER_PAYROLL_PIN)
    : SUPERUSER_PIN_SHA256;
  return timingSafeHashEqual(hashPinSha256(normalizedPin), expectedHash);
}

function verifyAdminModePin(pin: string): boolean {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return false;
  const cfg = readSecurityConfig();
  const inputHash = hashPinSha256(normalizedPin);
  return (
    timingSafeHashEqual(inputHash, cfg.adminPinSha256) ||
    verifySuperuserPin(normalizedPin)
  );
}

const activeAdminSessions = new Map<string, { expiresAt: number }>();
const adminPinAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

const activePayrollSessions = new Map<string, { expiresAt: number }>();
const pinAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

function cleanupExpiredAdminSessions(): void {
  const now = Date.now();
  for (const [token, sess] of activeAdminSessions.entries()) {
    if (sess.expiresAt <= now) {
      activeAdminSessions.delete(token);
    }
  }
}

function cleanupExpiredPayrollSessions(): void {
  const now = Date.now();
  for (const [token, sess] of activePayrollSessions.entries()) {
    if (sess.expiresAt <= now) {
      activePayrollSessions.delete(token);
    }
  }
}

interface FinanceAccountData {
  id: string;
  name: string;
  kind: 'cash' | 'rekening';
  bankName: string;
  accountNumber: string;
  holderName: string;
  openingBalance: number;
  createdAt: string;
}

interface FinanceCategoryData {
  id: string;
  name: string;
  type: 'pendapatan' | 'pengeluaran';
  description: string;
  createdAt: string;
}

interface FinanceTransactionData {
  id: string;
  date: string;
  type: 'pendapatan' | 'pengeluaran';
  method: 'cash' | 'transfer';
  categoryId: string;
  categoryName: string;
  accountId?: string;
  title: string;
  counterparty: string;
  bankAccount: string;
  referenceNo: string;
  amount: number;
  notes: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface FinanceTransferData {
  id: string;
  date: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  referenceNo: string;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

interface FinanceDatabaseSchema {
  accounts: FinanceAccountData[];
  categories: FinanceCategoryData[];
  transactions: FinanceTransactionData[];
  transfers: FinanceTransferData[];
}

function formatFinanceAccountDisplay(acc: FinanceAccountData): string {
  if (acc.kind === 'cash') {
    return acc.name;
  }
  const parts = [acc.bankName, acc.accountNumber && acc.accountNumber !== '-' ? acc.accountNumber : '']
    .filter(Boolean)
    .join(' ');
  return parts ? `${acc.name} (${parts})` : acc.name;
}

function buildDefaultFinanceAccounts(nowIso: string): FinanceAccountData[] {
  return [
    {
      id: 'acc_cash_main',
      name: 'Kas Tunai Utama',
      kind: 'cash',
      bankName: 'Kas Tunai',
      accountNumber: '-',
      holderName: 'Kasir Operasional',
      openingBalance: 0,
      createdAt: nowIso,
    },
    {
      id: 'acc_bank_bca',
      name: 'BCA Corporate',
      kind: 'rekening',
      bankName: 'BCA',
      accountNumber: '001-889-2100',
      holderName: 'PT KaryaPresensi',
      openingBalance: 0,
      createdAt: nowIso,
    },
    {
      id: 'acc_bank_bri',
      name: 'BRI Bisnis',
      kind: 'rekening',
      bankName: 'BRI',
      accountNumber: '0234-01-009821-30-5',
      holderName: 'PT KaryaPresensi',
      openingBalance: 0,
      createdAt: nowIso,
    },
    {
      id: 'acc_bank_mandiri',
      name: 'Mandiri Bisnis',
      kind: 'rekening',
      bankName: 'Mandiri',
      accountNumber: '124-000-9912',
      holderName: 'PT KaryaPresensi',
      openingBalance: 0,
      createdAt: nowIso,
    },
  ];
}

function buildDefaultFinanceDb(): FinanceDatabaseSchema {
  const now = new Date();
  const nowIso = now.toISOString();
  const ym = formatDateLocal(now).slice(0, 7);
  const d1 = `${ym}-02`;
  const d2 = `${ym}-05`;
  const d3 = `${ym}-08`;
  const d4 = `${ym}-12`;
  const d5 = `${ym}-15`;
  const d6 = formatDateLocal(now);

  const accounts = buildDefaultFinanceAccounts(nowIso);

  const categories: FinanceCategoryData[] = [
    {
      id: 'fcat_inc_cash',
      name: 'Penjualan Tunai & Kas Harian',
      type: 'pendapatan',
      description: 'Penerimaan penjualan tunai / kas harian operasional',
      createdAt: nowIso,
    },
    {
      id: 'fcat_inc_transfer',
      name: 'Penjualan Transfer & Invoice',
      type: 'pendapatan',
      description: 'Pembayaran invoice klien dan transfer rekening bank perusahaan',
      createdAt: nowIso,
    },
    {
      id: 'fcat_inc_other',
      name: 'Pendapatan Lain-lain',
      type: 'pendapatan',
      description: 'Pendapatan jasa tambahan, komisi, atau pengembalian dana',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_operasional',
      name: 'Operasional & ATK Kantor',
      type: 'pengeluaran',
      description: 'Kebutuhan alat tulis kantor, perlengkapan toko, dan operasional harian',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_utilitas',
      name: 'Listrik, Air & Internet',
      type: 'pengeluaran',
      description: 'Tagihan listrik PLN, PDAM, telepon, dan jaringan internet kantor',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_logistik',
      name: 'Logistik, BBM & Pengiriman',
      type: 'pengeluaran',
      description: 'Biaya pengiriman barang, ekspedisi, BBM kurir, dan tol',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_stok',
      name: 'Pembelian Stok & Supplier',
      type: 'pengeluaran',
      description: 'Pengadaan barang dagang, bahan baku, dan pelunasan supplier',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_pemeliharaan',
      name: 'Sewa & Pemeliharaan Aset',
      type: 'pengeluaran',
      description: 'Perawatan gedung, AC, kendaraan operasional, dan perangkat IT',
      createdAt: nowIso,
    },
    {
      id: 'fcat_exp_pajak',
      name: 'Pajak, Iuran & Legalitas',
      type: 'pengeluaran',
      description: 'Pembayaran pajak perusahaan, retribusi, dan biaya perizinan',
      createdAt: nowIso,
    },
  ];

  const transactions: FinanceTransactionData[] = [
    {
      id: 'ftx_seed_1',
      date: d1,
      type: 'pendapatan',
      method: 'cash',
      categoryId: 'fcat_inc_cash',
      categoryName: 'Penjualan Tunai & Kas Harian',
      accountId: 'acc_cash_main',
      title: 'Setoran Penjualan Tunai Awal Bulan',
      counterparty: 'Kasir Operasional Toko',
      bankAccount: 'Kas Tunai Utama',
      referenceNo: 'KAS-001',
      amount: 14500000,
      notes: 'Rekap setoran penjualan tunai harian',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'ftx_seed_2',
      date: d2,
      type: 'pendapatan',
      method: 'transfer',
      categoryId: 'fcat_inc_transfer',
      categoryName: 'Penjualan Transfer & Invoice',
      accountId: 'acc_bank_bca',
      title: 'Pelunasan Invoice Mitra Distribusi #INV-204',
      counterparty: 'CV Maju Bersama',
      bankAccount: 'BCA Corporate (BCA 001-889-2100)',
      referenceNo: 'INV-204',
      amount: 38750000,
      notes: 'Transfer masuk rekening BCA perusahaan',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'ftx_seed_3',
      date: d3,
      type: 'pengeluaran',
      method: 'transfer',
      categoryId: 'fcat_exp_stok',
      categoryName: 'Pembelian Stok & Supplier',
      accountId: 'acc_bank_mandiri',
      title: 'Pelunasan Pengadaan Barang Gudang',
      counterparty: 'PT Sumber Makmur Logistik',
      bankAccount: 'Mandiri Bisnis (Mandiri 124-000-9912)',
      referenceNo: 'PO-118',
      amount: 18200000,
      notes: 'Pembelian stok batch bulanan',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'ftx_seed_4',
      date: d4,
      type: 'pengeluaran',
      method: 'cash',
      categoryId: 'fcat_exp_logistik',
      categoryName: 'Logistik, BBM & Pengiriman',
      accountId: 'acc_cash_main',
      title: 'Biaya BBM & Parkir Armada Pengiriman',
      counterparty: 'Tim Kurir & Gudang',
      bankAccount: 'Kas Tunai Utama',
      referenceNo: 'BKK-019',
      amount: 1450000,
      notes: 'Struk BBM dan tol pengiriman area Jabodetabek',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'ftx_seed_5',
      date: d5,
      type: 'pengeluaran',
      method: 'transfer',
      categoryId: 'fcat_exp_utilitas',
      categoryName: 'Listrik, Air & Internet',
      accountId: 'acc_bank_bca',
      title: 'Tagihan Listrik PLN, PDAM & Fiber Internet',
      counterparty: 'PLN & Telkom Indibiz',
      bankAccount: 'BCA Corporate (BCA 001-889-2100)',
      referenceNo: 'UTL-1126',
      amount: 3650000,
      notes: 'Pembayaran tagihan utilitas kantor pusat & gudang',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'ftx_seed_6',
      date: d6,
      type: 'pengeluaran',
      method: 'cash',
      categoryId: 'fcat_exp_operasional',
      categoryName: 'Operasional & ATK Kantor',
      accountId: 'acc_cash_main',
      title: 'Pembelian Kertas, Tinta Printer & Konsumsi Rapat',
      counterparty: 'Toko ATK Nusantara',
      bankAccount: 'Kas Tunai Utama',
      referenceNo: 'BKK-024',
      amount: 680000,
      notes: 'Pengisian ulang perlengkapan administrasi',
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  return { accounts, categories, transactions, transfers: [] };
}

function normalizeFinanceDb(parsed: Partial<FinanceDatabaseSchema>): FinanceDatabaseSchema {
  const nowIso = new Date().toISOString();
  const accounts: FinanceAccountData[] =
    Array.isArray(parsed.accounts) && parsed.accounts.length > 0
      ? parsed.accounts
      : buildDefaultFinanceAccounts(nowIso);

  const defaultCashAcc = accounts.find((a) => a.kind === 'cash') || accounts[0];
  const defaultBankAcc = accounts.find((a) => a.kind === 'rekening') || accounts[0];

  const transactions: FinanceTransactionData[] = Array.isArray(parsed.transactions)
    ? parsed.transactions.map((tx) => {
        if (tx.accountId && accounts.some((a) => a.id === tx.accountId)) {
          return tx;
        }
        if (tx.method === 'cash') {
          return {
            ...tx,
            accountId: defaultCashAcc?.id,
            bankAccount: tx.bankAccount || defaultCashAcc?.name || 'Kas Tunai Utama',
          };
        }
        const label = String(tx.bankAccount || '').toLowerCase();
        const matchedAcc =
          accounts.find(
            (a) =>
              a.kind === 'rekening' &&
              (label.includes(a.bankName.toLowerCase()) ||
                label.includes(a.name.toLowerCase()))
          ) || defaultBankAcc;
        return {
          ...tx,
          accountId: matchedAcc?.id,
          bankAccount: tx.bankAccount || (matchedAcc ? formatFinanceAccountDisplay(matchedAcc) : 'Transfer Bank'),
        };
      })
    : [];

  return {
    accounts,
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    transactions,
    transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
  };
}

function readFinanceDb(): FinanceDatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FINANCE_DB_FILE)) {
    const seed = buildDefaultFinanceDb();
    fs.writeFileSync(FINANCE_DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(FINANCE_DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FinanceDatabaseSchema>;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.transactions)) {
      const seed = buildDefaultFinanceDb();
      fs.writeFileSync(FINANCE_DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    const normalized = normalizeFinanceDb(parsed);
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.transfers)) {
      fs.writeFileSync(FINANCE_DB_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
    }
    return normalized;
  } catch {
    const seed = buildDefaultFinanceDb();
    fs.writeFileSync(FINANCE_DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function writeFinanceDb(data: FinanceDatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(FINANCE_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const requireAdminModeAuth: express.RequestHandler = (req, res, next) => {
    cleanupExpiredAdminSessions();
    const token = String(req.headers['x-admin-token'] || '');
    if (!token) {
      res.status(401).json({
        error: 'Akses keuangan hanya tersedia pada Mode Admin. Silakan masuk Mode Admin terlebih dahulu.',
      });
      return;
    }
    const session = activeAdminSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      activeAdminSessions.delete(token);
      res.status(401).json({
        error: 'Sesi Mode Admin telah berakhir. Silakan masuk kembali ke Mode Admin.',
      });
      return;
    }
    session.expiresAt = Date.now() + PAYROLL_TOKEN_TTL_MS;
    next();
  };

  const requirePayrollAuth: express.RequestHandler = (req, res, next) => {
    cleanupExpiredPayrollSessions();
    const token = String(req.headers['x-payroll-token'] || '');
    if (!token) {
      res.status(401).json({
        error: 'Akses gaji terkunci. Masukkan PIN Superuser terlebih dahulu.',
      });
      return;
    }
    const session = activePayrollSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      activePayrollSessions.delete(token);
      res.status(401).json({
        error: 'Sesi Superuser telah kedaluwarsa. Masukkan kembali PIN Superuser.',
      });
      return;
    }
    session.expiresAt = Date.now() + PAYROLL_TOKEN_TTL_MS;
    next();
  };

  // API Routes
  app.get('/api/state', (_req, res) => {
    const db = readDb();
    res.json(db);
  });

  app.put('/api/settings', (req, res) => {
    const db = readDb();
    const body = req.body as Partial<AppSettingsData> & { syncEmployees?: boolean };
    const mergedProfile = body.companyProfile
      ? { ...db.settings.companyProfile, ...body.companyProfile }
      : db.settings.companyProfile;

    const nextSettings = normalizeSettings({
      companyName: body.companyName !== undefined ? body.companyName : db.settings.companyName,
      companySubtitle:
        body.companySubtitle !== undefined ? body.companySubtitle : db.settings.companySubtitle,
      lateDeductionPerMinute:
        body.lateDeductionPerMinute !== undefined
          ? body.lateDeductionPerMinute
          : db.settings.lateDeductionPerMinute,
      shifts: Array.isArray(body.shifts) ? body.shifts : db.settings.shifts,
      companyProfile: mergedProfile,
    });

    db.settings = nextSettings;

    if (body.syncEmployees) {
      const shiftMap = new Map<string, ShiftConfigData>();
      for (const s of nextSettings.shifts) {
        shiftMap.set(s.name.toLowerCase(), s);
      }
      const nowIso = new Date().toISOString();
      db.employees = db.employees.map((emp) => {
        const matched = shiftMap.get(emp.shiftName.toLowerCase());
        if (!matched) return emp;
        return {
          ...emp,
          shiftName: matched.name,
          shiftStart: matched.startTime,
          shiftEnd: matched.endTime,
          updatedAt: nowIso,
        };
      });
    }

    writeDb(db);
    res.json(db.settings);
  });

  app.get('/api/backup', (_req, res) => {
    const db = readDb();
    res.json({
      app: 'KaryaPresensi',
      version: 2,
      exportedAt: new Date().toISOString(),
      employees: db.employees,
      attendanceRecords: db.attendanceRecords,
      lateSettlements: db.lateSettlements,
      settings: db.settings,
    });
  });

  app.post('/api/restore', (req, res) => {
    const body = req.body as Partial<DatabaseSchema>;
    if (!body || !Array.isArray(body.employees) || !Array.isArray(body.attendanceRecords)) {
      res.status(400).json({
        error: 'Format file backup tidak valid. Pastikan file berisi daftar employees dan attendanceRecords.',
      });
      return;
    }

    const restored: DatabaseSchema = {
      employees: body.employees,
      attendanceRecords: body.attendanceRecords,
      lateSettlements: Array.isArray(body.lateSettlements) ? body.lateSettlements : [],
      settings: normalizeSettings(body.settings),
    };
    writeDb(restored);
    res.json(restored);
  });

  app.post('/api/employees', (req, res) => {
    const db = readDb();
    const body = req.body as Partial<EmployeeData>;
    if (!body.name || !body.employeeCode) {
      res.status(400).json({ error: 'Nama dan kode karyawan wajib diisi.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const id = body.id || `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEmp: EmployeeData = {
      id,
      employeeCode: String(body.employeeCode).trim().toUpperCase().slice(0, 20),
      name: String(body.name).trim().slice(0, 100),
      department: String(body.department || 'Operasional').trim().slice(0, 60),
      position: String(body.position || 'Staf').trim().slice(0, 60),
      shiftName: String(body.shiftName || 'Reguler').trim().slice(0, 40),
      shiftStart: String(body.shiftStart || '08:00'),
      shiftEnd: String(body.shiftEnd || '17:00'),
      offDays: Array.isArray(body.offDays) ? body.offDays.slice(0, 7) : [],
      customOffDates: Array.isArray(body.customOffDates) ? body.customOffDates.slice(0, 31) : [],
      active: body.active !== undefined ? Boolean(body.active) : true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.employees.push(newEmp);
    writeDb(db);
    res.status(201).json(newEmp);
  });

  app.put('/api/employees/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    const idx = db.employees.findIndex((e) => e.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }
    const existing = db.employees[idx];
    const body = req.body as Partial<EmployeeData>;
    const updated: EmployeeData = {
      ...existing,
      employeeCode: body.employeeCode !== undefined ? String(body.employeeCode).trim().toUpperCase().slice(0, 20) : existing.employeeCode,
      name: body.name !== undefined ? String(body.name).trim().slice(0, 100) : existing.name,
      department: body.department !== undefined ? String(body.department).trim().slice(0, 60) : existing.department,
      position: body.position !== undefined ? String(body.position).trim().slice(0, 60) : existing.position,
      shiftName: body.shiftName !== undefined ? String(body.shiftName).trim().slice(0, 40) : existing.shiftName,
      shiftStart: body.shiftStart !== undefined ? String(body.shiftStart) : existing.shiftStart,
      shiftEnd: body.shiftEnd !== undefined ? String(body.shiftEnd) : existing.shiftEnd,
      offDays: Array.isArray(body.offDays) ? body.offDays.slice(0, 7) : existing.offDays,
      customOffDates: Array.isArray(body.customOffDates) ? body.customOffDates.slice(0, 31) : existing.customOffDates,
      active: body.active !== undefined ? Boolean(body.active) : existing.active,
      updatedAt: new Date().toISOString(),
    };
    db.employees[idx] = updated;
    writeDb(db);
    res.json(updated);
  });

  app.delete('/api/employees/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    db.employees = db.employees.filter((e) => e.id !== id);
    writeDb(db);
    res.json({ ok: true });
  });

  app.post('/api/attendance', (req, res) => {
    const db = readDb();
    const body = req.body as Partial<AttendanceData>;
    const validStatuses: AttendanceData['status'][] = [
      'hadir',
      'terlambat',
      'izin_terlambat',
      'izin',
      'sakit',
      'alpha',
      'libur',
    ];
    if (!body.employeeId || !body.date || !body.status) {
      res.status(400).json({ error: 'Karyawan, tanggal, dan status absensi wajib diisi.' });
      return;
    }
    if (!validStatuses.includes(body.status)) {
      res.status(400).json({ error: 'Status absensi tidak valid.' });
      return;
    }
    const emp = db.employees.find((e) => e.id === body.employeeId);
    if (!emp) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const isLatePermit = body.status === 'izin_terlambat';
    const needsTime = body.status === 'hadir' || body.status === 'terlambat' || isLatePermit;
    const record: AttendanceData = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      date: String(body.date),
      status: body.status,
      checkIn: needsTime ? String(body.checkIn || '') : '',
      checkOut: needsTime ? String(body.checkOut || '') : '',
      overtimeHours: Math.max(0, Math.min(16, Number(body.overtimeHours || 0))),
      notes: String(body.notes || '').trim().slice(0, 300),
      ...(isLatePermit
        ? {
            latePermitReason: String(body.latePermitReason || '').trim().slice(0, 200),
            latePermitEstimatedArrival: String(body.latePermitEstimatedArrival || '').trim().slice(0, 5),
            latePermitApprovedBy: String(body.latePermitApprovedBy || 'Admin HR').trim().slice(0, 80),
          }
        : {}),
      recordedBy: 'Admin HR',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.attendanceRecords.push(record);
    writeDb(db);
    res.status(201).json(record);
  });

  app.post('/api/attendance/bulk-off-days', (req, res) => {
    const db = readDb();
    const { date } = req.body as { date?: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Tanggal tidak valid.' });
      return;
    }
    const parts = date.split('-').map(Number);
    const dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    const nowIso = new Date().toISOString();
    let createdCount = 0;

    for (const emp of db.employees) {
      if (!emp.active) continue;
      const isOff = emp.offDays.includes(dow) || emp.customOffDates.includes(date);
      if (!isOff) continue;
      const alreadyHas = db.attendanceRecords.some(
        (r) => r.employeeId === emp.id && r.date === date
      );
      if (alreadyHas) continue;
      db.attendanceRecords.push({
        id: `att_off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date,
        status: 'libur',
        checkIn: '',
        checkOut: '',
        overtimeHours: 0,
        notes: emp.customOffDates.includes(date)
          ? 'Libur khusus terjadwal (otomatis admin)'
          : 'Libur mingguan terjadwal (otomatis admin)',
        recordedBy: 'Admin HR',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      createdCount += 1;
    }

    writeDb(db);
    res.json({ createdCount });
  });

  app.put('/api/attendance/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    const idx = db.attendanceRecords.findIndex((r) => r.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Data absensi tidak ditemukan.' });
      return;
    }
    const existing = db.attendanceRecords[idx];
    const body = req.body as Partial<AttendanceData>;
    const validStatuses: AttendanceData['status'][] = [
      'hadir',
      'terlambat',
      'izin_terlambat',
      'izin',
      'sakit',
      'alpha',
      'libur',
    ];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      res.status(400).json({ error: 'Status absensi tidak valid.' });
      return;
    }
    const nextStatus = body.status ?? existing.status;
    const isLatePermit = nextStatus === 'izin_terlambat';
    const needsTime = nextStatus === 'hadir' || nextStatus === 'terlambat' || isLatePermit;

    const updated: AttendanceData = {
      ...existing,
      status: nextStatus,
      checkIn: needsTime ? (body.checkIn !== undefined ? String(body.checkIn) : existing.checkIn) : '',
      checkOut: needsTime ? (body.checkOut !== undefined ? String(body.checkOut) : existing.checkOut) : '',
      overtimeHours:
        body.overtimeHours !== undefined
          ? Math.max(0, Math.min(16, Number(body.overtimeHours)))
          : existing.overtimeHours,
      notes: body.notes !== undefined ? String(body.notes).trim().slice(0, 300) : existing.notes,
      latePermitReason: isLatePermit
        ? body.latePermitReason !== undefined
          ? String(body.latePermitReason).trim().slice(0, 200)
          : existing.latePermitReason || ''
        : undefined,
      latePermitEstimatedArrival: isLatePermit
        ? body.latePermitEstimatedArrival !== undefined
          ? String(body.latePermitEstimatedArrival).trim().slice(0, 5)
          : existing.latePermitEstimatedArrival || ''
        : undefined,
      latePermitApprovedBy: isLatePermit
        ? body.latePermitApprovedBy !== undefined
          ? String(body.latePermitApprovedBy).trim().slice(0, 80)
          : existing.latePermitApprovedBy || 'Admin HR'
        : undefined,
      recordedBy: 'Admin HR',
      updatedAt: new Date().toISOString(),
    };

    db.attendanceRecords[idx] = updated;
    writeDb(db);
    res.json(updated);
  });

  app.delete('/api/attendance/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    db.attendanceRecords = db.attendanceRecords.filter((r) => r.id !== id);
    writeDb(db);
    res.json({ ok: true });
  });

  app.post('/api/late-settlements', (req, res) => {
    const db = readDb();
    const body = req.body as Partial<LateSettlementData>;
    if (!body.employeeId || !body.yearMonth || !body.date || !body.method) {
      res.status(400).json({
        error: 'Karyawan, periode bulan, tanggal, dan metode ganti keterlambatan wajib diisi.',
      });
      return;
    }
    if (body.method !== 'tambahan_jam_kerja' && body.method !== 'potongan_gaji') {
      res.status(400).json({ error: 'Metode penyelesaian keterlambatan tidak valid.' });
      return;
    }
    const minutes = Math.round(Number(body.minutesSettled || 0));
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10000) {
      res.status(400).json({ error: 'Jumlah menit keterlambatan yang diganti harus lebih dari 0.' });
      return;
    }
    const emp = db.employees.find((e) => e.id === body.employeeId);
    if (!emp) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }

    const isSalary = body.method === 'potongan_gaji';
    const settlement: LateSettlementData = {
      id: `lset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      yearMonth: String(body.yearMonth).slice(0, 7),
      date: String(body.date).slice(0, 10),
      method: body.method,
      minutesSettled: minutes,
      extraWorkStart: !isSalary && body.extraWorkStart ? String(body.extraWorkStart).slice(0, 5) : undefined,
      extraWorkEnd: !isSalary && body.extraWorkEnd ? String(body.extraWorkEnd).slice(0, 5) : undefined,
      deductionAmount: isSalary
        ? Math.max(0, Math.round(Number(body.deductionAmount || 0)))
        : undefined,
      notes: String(body.notes || '').trim().slice(0, 300),
      recordedBy: 'Admin HR',
      createdAt: new Date().toISOString(),
    };

    db.lateSettlements.push(settlement);
    writeDb(db);
    res.status(201).json(settlement);
  });

  app.delete('/api/late-settlements/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    db.lateSettlements = db.lateSettlements.filter((s) => s.id !== id);
    writeDb(db);
    res.json({ ok: true });
  });

  // Admin Mode Routes (PIN configurable in Settings; default 123456)
  app.post('/api/admin-mode/unlock', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const tracker = adminPinAttemptTracker.get(clientIp);
    if (tracker && tracker.lockedUntil > now) {
      const waitSeconds = Math.ceil((tracker.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `Terlalu banyak percobaan PIN Mode Admin salah. Coba lagi dalam ${waitSeconds} detik.`,
      });
      return;
    }

    const { pin } = (req.body || {}) as { pin?: string };
    if (!verifyAdminModePin(pin || '')) {
      const prevCount = tracker && tracker.lockedUntil <= now ? tracker.count : 0;
      const nextCount = prevCount + 1;
      if (nextCount >= MAX_PIN_ATTEMPTS) {
        adminPinAttemptTracker.set(clientIp, {
          count: 0,
          lockedUntil: now + PIN_LOCKOUT_MS,
        });
        res.status(429).json({
          error: 'PIN Mode Admin salah 5 kali. Coba lagi dalam 30 detik.',
        });
        return;
      }
      adminPinAttemptTracker.set(clientIp, { count: nextCount, lockedUntil: 0 });
      res.status(401).json({
        error: 'PIN Mode Admin tidak valid.',
      });
      return;
    }

    adminPinAttemptTracker.delete(clientIp);
    cleanupExpiredAdminSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + PAYROLL_TOKEN_TTL_MS;
    activeAdminSessions.set(token, { expiresAt });
    res.json({ token, expiresAt });
  });

  app.post('/api/admin-mode/lock', (req, res) => {
    const token = String(req.headers['x-admin-token'] || '');
    if (token) {
      activeAdminSessions.delete(token);
    }
    res.json({ ok: true });
  });

  app.put('/api/admin-mode/pin', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const tracker = adminPinAttemptTracker.get(clientIp);
    if (tracker && tracker.lockedUntil > now) {
      const waitSeconds = Math.ceil((tracker.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `Terlalu banyak percobaan PIN salah. Coba lagi dalam ${waitSeconds} detik.`,
      });
      return;
    }

    const { currentPin, newPin } = (req.body || {}) as {
      currentPin?: string;
      newPin?: string;
    };
    if (!verifyAdminModePin(currentPin || '')) {
      const prevCount = tracker && tracker.lockedUntil <= now ? tracker.count : 0;
      const nextCount = prevCount + 1;
      if (nextCount >= MAX_PIN_ATTEMPTS) {
        adminPinAttemptTracker.set(clientIp, {
          count: 0,
          lockedUntil: now + PIN_LOCKOUT_MS,
        });
        res.status(429).json({
          error: 'Terlalu banyak percobaan PIN salah. Akses ditahan 30 detik.',
        });
        return;
      }
      adminPinAttemptTracker.set(clientIp, { count: nextCount, lockedUntil: 0 });
      res.status(401).json({
        error: 'PIN saat ini tidak sesuai. Perubahan PIN Mode Admin ditolak.',
      });
      return;
    }
    adminPinAttemptTracker.delete(clientIp);
    const cleanNew = String(newPin || '').trim();
    if (cleanNew.length < 4 || cleanNew.length > 20) {
      res.status(400).json({
        error: 'PIN Mode Admin baru harus terdiri dari 4 hingga 20 karakter.',
      });
      return;
    }
    writeSecurityConfig({
      adminPinSha256: hashPinSha256(cleanNew),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  // Protected Superuser Payroll Routes
  app.post('/api/payroll/unlock', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const tracker = pinAttemptTracker.get(clientIp);
    if (tracker && tracker.lockedUntil > now) {
      const waitSeconds = Math.ceil((tracker.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `Terlalu banyak percobaan PIN salah. Silakan coba lagi dalam ${waitSeconds} detik.`,
      });
      return;
    }

    const { pin } = (req.body || {}) as { pin?: string };
    if (!verifySuperuserPin(pin || '')) {
      const prevCount = tracker && tracker.lockedUntil <= now ? tracker.count : 0;
      const nextCount = prevCount + 1;
      if (nextCount >= MAX_PIN_ATTEMPTS) {
        pinAttemptTracker.set(clientIp, {
          count: 0,
          lockedUntil: now + PIN_LOCKOUT_MS,
        });
        res.status(429).json({
          error: 'PIN Superuser salah 5 kali. Akses ditahan selama 30 detik.',
        });
        return;
      }
      pinAttemptTracker.set(clientIp, { count: nextCount, lockedUntil: 0 });
      res.status(401).json({
        error: 'PIN Superuser tidak valid. Akses data gaji ditolak.',
      });
      return;
    }

    pinAttemptTracker.delete(clientIp);
    cleanupExpiredPayrollSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + PAYROLL_TOKEN_TTL_MS;
    activePayrollSessions.set(token, { expiresAt });
    res.json({ token, expiresAt });
  });

  app.post('/api/payroll/lock', (req, res) => {
    const token = String(req.headers['x-payroll-token'] || '');
    if (token) {
      activePayrollSessions.delete(token);
    }
    res.json({ ok: true });
  });

  app.get('/api/payroll/state', requirePayrollAuth, (_req, res) => {
    const payrollDb = readPayrollDb();
    res.json(payrollDb);
  });

  app.put('/api/payroll/settings', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const body = req.body as Partial<PayrollSettingsData>;
    payrollDb.settings = normalizePayrollSettings({
      ...payrollDb.settings,
      ...body,
    });
    writePayrollDb(payrollDb);
    res.json(payrollDb.settings);
  });

  app.put('/api/payroll/profiles/:employeeId', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const { employeeId } = req.params;
    const mainDb = readDb();
    const emp = mainDb.employees.find((e) => e.id === employeeId);
    if (!emp) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<EmployeeSalaryProfileData>;
    const existingIdx = payrollDb.profiles.findIndex((p) => p.employeeId === employeeId);
    const existing = existingIdx >= 0 ? payrollDb.profiles[existingIdx] : undefined;

    const cleanMoney = (val: unknown, fallback: number) =>
      Math.max(0, Math.min(1000000000, Math.round(Number(val ?? fallback) || 0)));

    const rawPayday =
      body.paydayDay !== undefined
        ? Number(body.paydayDay)
        : existing?.paydayDay ?? payrollDb.settings.paydayDayOfMonth;
    const safePayday = Math.max(
      1,
      Math.min(31, Math.round(Number.isFinite(rawPayday) ? rawPayday : payrollDb.settings.paydayDayOfMonth))
    );

    const nextProfile: EmployeeSalaryProfileData = {
      employeeId,
      baseSalary: cleanMoney(body.baseSalary, existing?.baseSalary ?? 0),
      positionAllowance: cleanMoney(body.positionAllowance, existing?.positionAllowance ?? 0),
      transportMealAllowance: cleanMoney(
        body.transportMealAllowance,
        existing?.transportMealAllowance ?? 0
      ),
      otherAllowance: cleanMoney(
        body.otherAllowance,
        existing?.otherAllowance ?? 0
      ),
      overtimeHourlyRate:
        body.overtimeHourlyRate !== undefined
          ? cleanMoney(body.overtimeHourlyRate, payrollDb.settings.defaultOvertimeHourlyRate)
          : existing?.overtimeHourlyRate ?? payrollDb.settings.defaultOvertimeHourlyRate,
      paydayDay: safePayday,
      paymentMethod:
        body.paymentMethod === 'tunai' || body.paymentMethod === 'transfer'
          ? body.paymentMethod
          : existing?.paymentMethod ?? 'transfer',
      bankName:
        body.bankName !== undefined
          ? String(body.bankName).trim().slice(0, 40)
          : existing?.bankName ?? 'BCA',
      bankAccountNumber:
        body.bankAccountNumber !== undefined
          ? String(body.bankAccountNumber).trim().slice(0, 40)
          : existing?.bankAccountNumber ?? '',
      bankAccountHolder:
        body.bankAccountHolder !== undefined
          ? String(body.bankAccountHolder).trim().slice(0, 100)
          : existing?.bankAccountHolder ?? emp.name,
      notes:
        body.notes !== undefined
          ? String(body.notes).trim().slice(0, 300)
          : existing?.notes ?? '',
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      payrollDb.profiles[existingIdx] = nextProfile;
    } else {
      payrollDb.profiles.push(nextProfile);
    }
    writePayrollDb(payrollDb);
    res.json(nextProfile);
  });

  app.post('/api/payroll/adjustments', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const mainDb = readDb();
    const body = req.body as Partial<PayrollAdjustmentData>;

    if (!body.employeeId || !body.yearMonth || !body.type || !body.title) {
      res.status(400).json({
        error: 'Karyawan, periode bulan, jenis, dan keterangan penyesuaian gaji wajib diisi.',
      });
      return;
    }
    if (body.type !== 'bonus' && body.type !== 'tunjangan' && body.type !== 'potongan') {
      res.status(400).json({ error: 'Jenis penyesuaian gaji harus bonus, tunjangan, atau potongan.' });
      return;
    }
    const emp = mainDb.employees.find((e) => e.id === body.employeeId);
    if (!emp) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }
    const amount = Math.round(Number(body.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
      res.status(400).json({ error: 'Nominal bonus/tunjangan/potongan harus lebih dari Rp 0.' });
      return;
    }

    const adj: PayrollAdjustmentData = {
      id: `padj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      yearMonth: String(body.yearMonth).slice(0, 7),
      type: body.type,
      title: String(body.title).trim().slice(0, 80),
      amount,
      date: String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      notes: String(body.notes || '').trim().slice(0, 300),
      createdAt: new Date().toISOString(),
    };
    payrollDb.adjustments.push(adj);
    writePayrollDb(payrollDb);
    res.status(201).json(adj);
  });

  app.delete('/api/payroll/adjustments/:id', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const { id } = req.params;
    payrollDb.adjustments = payrollDb.adjustments.filter((a) => a.id !== id);
    writePayrollDb(payrollDb);
    res.json({ ok: true });
  });

  app.post('/api/payroll/raises', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const mainDb = readDb();
    const body = req.body as Partial<SalaryRaiseRecordData> & { applyToProfile?: boolean };

    if (!body.employeeId || !body.effectiveMonth || !body.reason) {
      res.status(400).json({
        error: 'Karyawan, bulan efektif, dan alasan kenaikan gaji wajib diisi.',
      });
      return;
    }
    const emp = mainDb.employees.find((e) => e.id === body.employeeId);
    if (!emp) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }

    const existingIdx = payrollDb.profiles.findIndex((p) => p.employeeId === emp.id);
    const existing = existingIdx >= 0 ? payrollDb.profiles[existingIdx] : undefined;

    const cleanMoney = (val: unknown, fallback: number) =>
      Math.max(0, Math.min(1000000000, Math.round(Number(val ?? fallback) || 0)));

    const prevBase = existing?.baseSalary ?? 0;
    const prevPos = existing?.positionAllowance ?? 0;
    const prevTrans = existing?.transportMealAllowance ?? 0;
    const prevOther = existing?.otherAllowance ?? 0;

    const newBase = cleanMoney(body.newBaseSalary, prevBase);
    const newPos = cleanMoney(body.newPositionAllowance, prevPos);
    const newTrans = cleanMoney(body.newTransportMealAllowance, prevTrans);
    const newOther = cleanMoney(body.newOtherAllowance, prevOther);

    const applyNow = body.applyToProfile !== false;
    const nowIso = new Date().toISOString();

    const raiseRecord: SalaryRaiseRecordData = {
      id: `raise_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      effectiveMonth: String(body.effectiveMonth).slice(0, 7),
      raiseDate: String(body.raiseDate || nowIso.slice(0, 10)).slice(0, 10),
      method: body.method === 'persentase' ? 'persentase' : 'nominal',
      percentIncrease:
        body.percentIncrease !== undefined ? Number(body.percentIncrease) : undefined,
      previousBaseSalary: prevBase,
      newBaseSalary: newBase,
      previousPositionAllowance: prevPos,
      newPositionAllowance: newPos,
      previousTransportMealAllowance: prevTrans,
      newTransportMealAllowance: newTrans,
      previousOtherAllowance: prevOther,
      newOtherAllowance: newOther,
      reason: String(body.reason).trim().slice(0, 100),
      notes: String(body.notes || '').trim().slice(0, 300),
      appliedToProfile: applyNow,
      createdAt: nowIso,
    };

    payrollDb.salaryRaises.push(raiseRecord);

    if (applyNow) {
      const updatedProfile: EmployeeSalaryProfileData = {
        employeeId: emp.id,
        baseSalary: newBase,
        positionAllowance: newPos,
        transportMealAllowance: newTrans,
        otherAllowance: newOther,
        overtimeHourlyRate:
          existing?.overtimeHourlyRate ?? payrollDb.settings.defaultOvertimeHourlyRate,
        paydayDay: existing?.paydayDay ?? payrollDb.settings.paydayDayOfMonth,
        paymentMethod: existing?.paymentMethod ?? 'transfer',
        bankName: existing?.bankName ?? 'BCA',
        bankAccountNumber: existing?.bankAccountNumber ?? '',
        bankAccountHolder: existing?.bankAccountHolder ?? emp.name,
        notes: existing?.notes ?? '',
        updatedAt: nowIso,
      };
      if (existingIdx >= 0) {
        payrollDb.profiles[existingIdx] = updatedProfile;
      } else {
        payrollDb.profiles.push(updatedProfile);
      }
    }

    writePayrollDb(payrollDb);
    res.status(201).json(raiseRecord);
  });

  app.delete('/api/payroll/raises/:id', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const { id } = req.params;
    payrollDb.salaryRaises = payrollDb.salaryRaises.filter((r) => r.id !== id);
    writePayrollDb(payrollDb);
    res.json({ ok: true });
  });

  app.put('/api/payroll/status', requirePayrollAuth, (req, res) => {
    const payrollDb = readPayrollDb();
    const body = req.body as {
      employeeId?: string;
      yearMonth?: string;
      status?: 'draft' | 'disetujui' | 'dibayar';
    };
    if (!body.employeeId || !body.yearMonth || !body.status) {
      res.status(400).json({ error: 'Data karyawan, bulan, dan status gaji wajib diisi.' });
      return;
    }
    if (!['draft', 'disetujui', 'dibayar'].includes(body.status)) {
      res.status(400).json({ error: 'Status pembayaran gaji tidak valid.' });
      return;
    }
    const ym = String(body.yearMonth).slice(0, 7);
    const id = `${body.employeeId}__${ym}`;
    const nowIso = new Date().toISOString();
    const nextItem: PayrollMonthlyStatusData = {
      id,
      employeeId: body.employeeId,
      yearMonth: ym,
      status: body.status,
      paidAt: body.status === 'dibayar' ? nowIso : undefined,
      updatedAt: nowIso,
    };

    const idx = payrollDb.statuses.findIndex(
      (s) => s.employeeId === body.employeeId && s.yearMonth === ym
    );
    if (idx >= 0) {
      payrollDb.statuses[idx] = nextItem;
    } else {
      payrollDb.statuses.push(nextItem);
    }
    writePayrollDb(payrollDb);
    res.json(nextItem);
  });

  app.get('/api/payroll/backup', requirePayrollAuth, (_req, res) => {
    const payrollDb = readPayrollDb();
    res.json({
      app: 'KaryaPresensi-Payroll',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...payrollDb,
    });
  });

  app.post('/api/payroll/restore', requirePayrollAuth, (req, res) => {
    const body = req.body as Partial<PayrollDatabaseSchema>;
    if (!body || !Array.isArray(body.profiles) || !Array.isArray(body.adjustments)) {
      res.status(400).json({
        error: 'Format file backup gaji tidak valid.',
      });
      return;
    }
    const restored: PayrollDatabaseSchema = {
      settings: normalizePayrollSettings(body.settings),
      profiles: body.profiles,
      adjustments: body.adjustments,
      salaryRaises: Array.isArray(body.salaryRaises) ? body.salaryRaises : [],
      statuses: Array.isArray(body.statuses) ? body.statuses : [],
    };
    writePayrollDb(restored);
    res.json(restored);
  });

  // Protected Company Finance Routes (Accessible ONLY in Mode Admin)
  app.get('/api/finance/state', requireAdminModeAuth, (_req, res) => {
    const finDb = readFinanceDb();
    res.json(finDb);
  });

  app.post('/api/finance/categories', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const body = req.body as Partial<FinanceCategoryData>;
    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) {
      res.status(400).json({ error: 'Nama kategori keuangan wajib diisi.' });
      return;
    }
    const type: 'pendapatan' | 'pengeluaran' =
      body.type === 'pendapatan' ? 'pendapatan' : 'pengeluaran';
    const duplicate = finDb.categories.some(
      (c) => c.type === type && c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      res.status(400).json({ error: `Kategori "${name}" sudah terdaftar.` });
      return;
    }
    const newCat: FinanceCategoryData = {
      id: `fcat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      type,
      description: String(body.description || '').trim().slice(0, 160),
      createdAt: new Date().toISOString(),
    };
    finDb.categories.push(newCat);
    writeFinanceDb(finDb);
    res.status(201).json(newCat);
  });

  app.put('/api/finance/categories/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    const idx = finDb.categories.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const existing = finDb.categories[idx];
    const body = req.body as Partial<FinanceCategoryData>;
    const nextName =
      body.name !== undefined ? String(body.name).trim().slice(0, 60) : existing.name;
    if (!nextName) {
      res.status(400).json({ error: 'Nama kategori tidak boleh kosong.' });
      return;
    }
    const duplicate = finDb.categories.some(
      (c) =>
        c.id !== id &&
        c.type === existing.type &&
        c.name.toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      res.status(400).json({ error: `Kategori "${nextName}" sudah digunakan.` });
      return;
    }
    const updated: FinanceCategoryData = {
      ...existing,
      name: nextName,
      description:
        body.description !== undefined
          ? String(body.description).trim().slice(0, 160)
          : existing.description,
    };
    finDb.categories[idx] = updated;
    finDb.transactions = finDb.transactions.map((t) =>
      t.categoryId === id ? { ...t, categoryName: nextName } : t
    );
    writeFinanceDb(finDb);
    res.json(updated);
  });

  app.delete('/api/finance/categories/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    const target = finDb.categories.find((c) => c.id === id);
    if (!target) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const sameTypeCount = finDb.categories.filter((c) => c.type === target.type).length;
    if (sameTypeCount <= 1) {
      res.status(400).json({
        error: `Minimal harus tersisa satu kategori ${target.type}.`,
      });
      return;
    }
    const usedCount = finDb.transactions.filter((t) => t.categoryId === id).length;
    if (usedCount > 0) {
      res.status(400).json({
        error: `Kategori "${target.name}" masih digunakan oleh ${usedCount} transaksi. Ubah kategori transaksi terkait terlebih dahulu sebelum menghapus.`,
      });
      return;
    }
    finDb.categories = finDb.categories.filter((c) => c.id !== id);
    writeFinanceDb(finDb);
    res.json({ ok: true });
  });

  // Bank & Cash Accounts Management (Mode Admin)
  app.post('/api/finance/accounts', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const body = req.body as Partial<FinanceAccountData>;
    const name = String(body.name || '').trim().slice(0, 60);
    const kind: 'cash' | 'rekening' = body.kind === 'cash' ? 'cash' : 'rekening';
    const bankName =
      kind === 'cash'
        ? 'Kas Tunai'
        : String(body.bankName || '').trim().slice(0, 40) || name;
    if (!name) {
      res.status(400).json({ error: 'Nama kas atau rekening wajib diisi.' });
      return;
    }
    const duplicate = finDb.accounts.some(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      res.status(400).json({ error: `Akun "${name}" sudah terdaftar.` });
      return;
    }
    const openingBalance = Math.max(
      0,
      Math.min(100000000000, Math.round(Number(body.openingBalance || 0)))
    );
    const newAcc: FinanceAccountData = {
      id: `facc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      kind,
      bankName,
      accountNumber:
        kind === 'cash'
          ? '-'
          : String(body.accountNumber || '').trim().slice(0, 40),
      holderName: String(body.holderName || '').trim().slice(0, 80),
      openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
      createdAt: new Date().toISOString(),
    };
    finDb.accounts.push(newAcc);
    writeFinanceDb(finDb);
    res.status(201).json(newAcc);
  });

  app.put('/api/finance/accounts/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    const idx = finDb.accounts.findIndex((a) => a.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Akun kas atau rekening tidak ditemukan.' });
      return;
    }
    const existing = finDb.accounts[idx];
    const body = req.body as Partial<FinanceAccountData>;
    const nextName =
      body.name !== undefined ? String(body.name).trim().slice(0, 60) : existing.name;
    if (!nextName) {
      res.status(400).json({ error: 'Nama akun tidak boleh kosong.' });
      return;
    }
    const duplicate = finDb.accounts.some(
      (a) => a.id !== id && a.name.toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      res.status(400).json({ error: `Nama akun "${nextName}" sudah digunakan.` });
      return;
    }
    const opening =
      body.openingBalance !== undefined
        ? Math.max(0, Math.min(100000000000, Math.round(Number(body.openingBalance || 0))))
        : existing.openingBalance;

    const updated: FinanceAccountData = {
      ...existing,
      name: nextName,
      bankName:
        existing.kind === 'cash'
          ? 'Kas Tunai'
          : body.bankName !== undefined
          ? String(body.bankName).trim().slice(0, 40)
          : existing.bankName,
      accountNumber:
        existing.kind === 'cash'
          ? '-'
          : body.accountNumber !== undefined
          ? String(body.accountNumber).trim().slice(0, 40)
          : existing.accountNumber,
      holderName:
        body.holderName !== undefined
          ? String(body.holderName).trim().slice(0, 80)
          : existing.holderName,
      openingBalance: Number.isFinite(opening) ? opening : existing.openingBalance,
    };

    const displayLabel = formatFinanceAccountDisplay(updated);
    finDb.accounts[idx] = updated;
    finDb.transactions = finDb.transactions.map((t) =>
      t.accountId === id ? { ...t, bankAccount: displayLabel } : t
    );
    finDb.transfers = finDb.transfers.map((tr) => ({
      ...tr,
      fromAccountName: tr.fromAccountId === id ? displayLabel : tr.fromAccountName,
      toAccountName: tr.toAccountId === id ? displayLabel : tr.toAccountName,
    }));
    writeFinanceDb(finDb);
    res.json(updated);
  });

  app.delete('/api/finance/accounts/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    const target = finDb.accounts.find((a) => a.id === id);
    if (!target) {
      res.status(404).json({ error: 'Akun kas atau rekening tidak ditemukan.' });
      return;
    }
    const sameKindCount = finDb.accounts.filter((a) => a.kind === target.kind).length;
    if (sameKindCount <= 1) {
      res.status(400).json({
        error: `Minimal harus tersisa satu akun ${
          target.kind === 'cash' ? 'Kas Tunai' : 'Rekening Bank'
        }.`,
      });
      return;
    }
    const txUsed = finDb.transactions.filter((t) => t.accountId === id).length;
    const trUsed = finDb.transfers.filter(
      (tr) => tr.fromAccountId === id || tr.toAccountId === id
    ).length;
    if (txUsed > 0 || trUsed > 0) {
      res.status(400).json({
        error: `Akun "${target.name}" masih digunakan oleh ${txUsed} transaksi dan ${trUsed} perpindahan dana.`,
      });
      return;
    }
    finDb.accounts = finDb.accounts.filter((a) => a.id !== id);
    writeFinanceDb(finDb);
    res.json({ ok: true });
  });

  // Internal Transfers (Cash <-> Rekening / Antar Rekening)
  app.post('/api/finance/transfers', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const body = req.body as Partial<FinanceTransferData>;
    if (!body.date || !body.fromAccountId || !body.toAccountId) {
      res.status(400).json({
        error: 'Tanggal, akun sumber, dan akun tujuan perpindahan dana wajib diisi.',
      });
      return;
    }
    if (body.fromAccountId === body.toAccountId) {
      res.status(400).json({
        error: 'Akun sumber dan akun tujuan perpindahan dana tidak boleh sama.',
      });
      return;
    }
    const fromAcc = finDb.accounts.find((a) => a.id === body.fromAccountId);
    const toAcc = finDb.accounts.find((a) => a.id === body.toAccountId);
    if (!fromAcc || !toAcc) {
      res.status(404).json({ error: 'Akun kas atau rekening tidak ditemukan.' });
      return;
    }
    const amount = Math.round(Number(body.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000000) {
      res.status(400).json({ error: 'Nominal perpindahan dana harus lebih dari Rp 0.' });
      return;
    }
    const tr: FinanceTransferData = {
      id: `ftr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: String(body.date).slice(0, 10),
      fromAccountId: fromAcc.id,
      fromAccountName: formatFinanceAccountDisplay(fromAcc),
      toAccountId: toAcc.id,
      toAccountName: formatFinanceAccountDisplay(toAcc),
      amount,
      referenceNo: String(body.referenceNo || '').trim().slice(0, 40),
      notes: String(body.notes || '').trim().slice(0, 300),
      recordedBy: 'Admin Mode',
      createdAt: new Date().toISOString(),
    };
    finDb.transfers.push(tr);
    writeFinanceDb(finDb);
    res.status(201).json(tr);
  });

  app.delete('/api/finance/transfers/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    finDb.transfers = finDb.transfers.filter((tr) => tr.id !== id);
    writeFinanceDb(finDb);
    res.json({ ok: true });
  });

  app.post('/api/finance/transactions', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const body = req.body as Partial<FinanceTransactionData>;
    if (!body.date || !body.type || !body.method || !body.title || !body.categoryId) {
      res.status(400).json({
        error: 'Tanggal, jenis transaksi, metode (Cash/Transfer), kategori, dan keterangan wajib diisi.',
      });
      return;
    }
    if (body.type !== 'pendapatan' && body.type !== 'pengeluaran') {
      res.status(400).json({ error: 'Jenis transaksi harus pendapatan atau pengeluaran.' });
      return;
    }
    if (body.method !== 'cash' && body.method !== 'transfer') {
      res.status(400).json({ error: 'Metode pembayaran harus cash atau transfer.' });
      return;
    }
    const cat = finDb.categories.find((c) => c.id === body.categoryId);
    if (!cat) {
      res.status(404).json({ error: 'Kategori transaksi tidak ditemukan.' });
      return;
    }
    const targetKind: 'cash' | 'rekening' = body.method === 'cash' ? 'cash' : 'rekening';
    const matchedAccount = body.accountId
      ? finDb.accounts.find((a) => a.id === body.accountId)
      : finDb.accounts.find((a) => a.kind === targetKind);
    const amount = Math.round(Number(body.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000000) {
      res.status(400).json({ error: 'Nominal transaksi harus lebih dari Rp 0.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const resolvedAccountLabel = matchedAccount
      ? formatFinanceAccountDisplay(matchedAccount)
      : body.method === 'cash'
      ? String(body.bankAccount || 'Kas Tunai Utama').trim().slice(0, 80)
      : String(body.bankAccount || 'Transfer Bank').trim().slice(0, 80);

    const tx: FinanceTransactionData = {
      id: `ftx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: String(body.date).slice(0, 10),
      type: body.type,
      method: body.method,
      categoryId: cat.id,
      categoryName: cat.name,
      accountId: matchedAccount?.id,
      title: String(body.title).trim().slice(0, 100),
      counterparty: String(body.counterparty || '').trim().slice(0, 80),
      bankAccount: resolvedAccountLabel,
      referenceNo: String(body.referenceNo || '').trim().slice(0, 40),
      amount,
      notes: String(body.notes || '').trim().slice(0, 300),
      recordedBy: 'Admin Mode',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    finDb.transactions.push(tx);
    writeFinanceDb(finDb);
    res.status(201).json(tx);
  });

  app.put('/api/finance/transactions/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    const idx = finDb.transactions.findIndex((t) => t.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      return;
    }
    const existing = finDb.transactions[idx];
    const body = req.body as Partial<FinanceTransactionData>;
    const nextType =
      body.type === 'pendapatan' || body.type === 'pengeluaran' ? body.type : existing.type;
    const nextMethod =
      body.method === 'cash' || body.method === 'transfer' ? body.method : existing.method;
    const nextCatId = body.categoryId || existing.categoryId;
    const cat = finDb.categories.find((c) => c.id === nextCatId);
    if (!cat) {
      res.status(404).json({ error: 'Kategori transaksi tidak ditemukan.' });
      return;
    }
    const nextAmount =
      body.amount !== undefined ? Math.round(Number(body.amount || 0)) : existing.amount;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > 100000000000) {
      res.status(400).json({ error: 'Nominal transaksi harus lebih dari Rp 0.' });
      return;
    }

    const nextAccountId =
      body.accountId !== undefined ? body.accountId : existing.accountId;
    const matchedAccount = nextAccountId
      ? finDb.accounts.find((a) => a.id === nextAccountId)
      : undefined;
    const nextBankAccount = matchedAccount
      ? formatFinanceAccountDisplay(matchedAccount)
      : body.bankAccount !== undefined
      ? String(body.bankAccount).trim().slice(0, 80)
      : existing.bankAccount;

    const updated: FinanceTransactionData = {
      ...existing,
      date: body.date ? String(body.date).slice(0, 10) : existing.date,
      type: nextType,
      method: nextMethod,
      categoryId: cat.id,
      categoryName: cat.name,
      accountId: matchedAccount?.id ?? existing.accountId,
      title: body.title !== undefined ? String(body.title).trim().slice(0, 100) : existing.title,
      counterparty:
        body.counterparty !== undefined
          ? String(body.counterparty).trim().slice(0, 80)
          : existing.counterparty,
      bankAccount: nextBankAccount,
      referenceNo:
        body.referenceNo !== undefined
          ? String(body.referenceNo).trim().slice(0, 40)
          : existing.referenceNo,
      amount: nextAmount,
      notes: body.notes !== undefined ? String(body.notes).trim().slice(0, 300) : existing.notes,
      updatedAt: new Date().toISOString(),
    };
    finDb.transactions[idx] = updated;
    writeFinanceDb(finDb);
    res.json(updated);
  });

  app.delete('/api/finance/transactions/:id', requireAdminModeAuth, (req, res) => {
    const finDb = readFinanceDb();
    const { id } = req.params;
    finDb.transactions = finDb.transactions.filter((t) => t.id !== id);
    writeFinanceDb(finDb);
    res.json({ ok: true });
  });

  app.get('/api/finance/backup', requireAdminModeAuth, (_req, res) => {
    const finDb = readFinanceDb();
    res.json({
      app: 'KaryaPresensi-Finance',
      version: 2,
      exportedAt: new Date().toISOString(),
      ...finDb,
    });
  });

  app.post('/api/finance/restore', requireAdminModeAuth, (req, res) => {
    const body = req.body as Partial<FinanceDatabaseSchema>;
    if (!body || !Array.isArray(body.categories) || !Array.isArray(body.transactions)) {
      res.status(400).json({ error: 'Format file backup keuangan tidak valid.' });
      return;
    }
    const restored = normalizeFinanceDb(body);
    writeFinanceDb(restored);
    res.json(restored);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KaryaPresensi server running at http://localhost:${PORT}`);
  });
}

startServer();
