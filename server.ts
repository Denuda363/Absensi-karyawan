import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');

function resolveWritableDataDir(): string {
  const candidates = [
    process.env.KARYAPRESENSI_DATA_DIR,
    BUNDLED_DATA_DIR,
    path.join(os.tmpdir(), 'karyapresensi-data'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const probeFile = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probeFile, 'ok', 'utf-8');
      fs.unlinkSync(probeFile);
      if (dir !== BUNDLED_DATA_DIR && fs.existsSync(BUNDLED_DATA_DIR)) {
        for (const fname of [
          'attendance-db.json',
          'payroll-db.json',
          'finance-db.json',
          'security-config.json',
          'database-config.json',
        ]) {
          const src = path.join(BUNDLED_DATA_DIR, fname);
          const dst = path.join(dir, fname);
          if (fs.existsSync(src) && !fs.existsSync(dst)) {
            fs.copyFileSync(src, dst);
          }
        }
      }
      return dir;
    } catch {
      // try next writable directory
    }
  }
  return BUNDLED_DATA_DIR;
}

const DATA_DIR = resolveWritableDataDir();
const DB_FILE = path.join(DATA_DIR, 'attendance-db.json');
const PAYROLL_DB_FILE = path.join(DATA_DIR, 'payroll-db.json');
const FINANCE_DB_FILE = path.join(DATA_DIR, 'finance-db.json');
const SECURITY_CONFIG_FILE = path.join(DATA_DIR, 'security-config.json');
const DATABASE_CONFIG_FILE = path.join(DATA_DIR, 'database-config.json');
const FIREBASE_APPLET_CONFIG_FILE = path.join(__dirname, 'firebase-applet-config.json');
const DEFAULT_ADMIN_PIN_SHA256 =
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
const SUPERUSER_PIN_SHA256 =
  'b9196683c40dd7cecb4dfc8ffc9ed64d4bc192f126d9d771706e791726582b26';
const PAYROLL_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30 * 1000;

const DEFAULT_SUPABASE_PROJECT_NAME = 'Absensi';
const DEFAULT_SUPABASE_PROJECT_ID = 'jeewhluiufosnourqvje';
const DEFAULT_SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://jeewhluiufosnourqvje.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_y7OmGDoZSCuffUn6uJIwZQ_xXszVLT7';

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
  queueSupabaseSync('attendance');
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
  queueSupabaseSync('payroll');
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
  databasePinSha256?: string;
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
        databasePinSha256:
          typeof parsed.databasePinSha256 === 'string' &&
          /^[a-f0-9]{64}$/i.test(parsed.databasePinSha256)
            ? parsed.databasePinSha256
            : undefined,
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
  queueSupabaseSync('security');
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

function verifyDatabasePin(pin: string): boolean {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return false;
  const cfg = readSecurityConfig();
  const inputHash = hashPinSha256(normalizedPin);
  if (cfg.databasePinSha256) {
    return (
      timingSafeHashEqual(inputHash, cfg.databasePinSha256) ||
      verifySuperuserPin(normalizedPin)
    );
  }
  return (
    timingSafeHashEqual(inputHash, cfg.adminPinSha256) ||
    verifySuperuserPin(normalizedPin)
  );
}

const activeAdminSessions = new Map<string, { expiresAt: number }>();
const adminPinAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

const activePayrollSessions = new Map<string, { expiresAt: number }>();
const pinAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

const activeDatabaseSessions = new Map<string, { expiresAt: number }>();
const databasePinAttemptTracker = new Map<string, { count: number; lockedUntil: number }>();

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

function cleanupExpiredDatabaseSessions(): void {
  const now = Date.now();
  for (const [token, sess] of activeDatabaseSessions.entries()) {
    if (sess.expiresAt <= now) {
      activeDatabaseSessions.delete(token);
    }
  }
}

type ServerDbEngine =
  | 'supabase'
  | 'local-json'
  | 'firestore'
  | 'postgresql'
  | 'mysql'
  | 'sqlite';

interface DatabaseConnectionConfigData {
  engine: ServerDbEngine;
  host: string;
  port: number;
  databaseName: string;
  schemaName: string;
  tablePrefix: string;
  username: string;
  sslMode: 'disable' | 'require' | 'verify-full';
  autoCreateMissingTables: boolean;
  supabaseProjectName: string;
  supabaseProjectId: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey?: string;
  supabaseDbUrl?: string;
  lastCheckedAt: string | null;
  lastAutoInitAt: string | null;
  updatedAt: string;
}

function readFirebaseAppletMeta(): { projectId: string; firestoreDatabaseId: string } {
  try {
    if (fs.existsSync(FIREBASE_APPLET_CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIREBASE_APPLET_CONFIG_FILE, 'utf-8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      return {
        projectId: String(raw.projectId || ''),
        firestoreDatabaseId: String(raw.firestoreDatabaseId || '(default)'),
      };
    }
  } catch {
    // ignore missing config
  }
  return { projectId: '', firestoreDatabaseId: '(default)' };
}

function buildDefaultDatabaseConfig(): DatabaseConnectionConfigData {
  return {
    engine: 'supabase',
    host: `db.${DEFAULT_SUPABASE_PROJECT_ID}.supabase.co`,
    port: 5432,
    databaseName: 'postgres',
    schemaName: 'public',
    tablePrefix: '',
    username: 'postgres',
    sslMode: 'require',
    autoCreateMissingTables: true,
    supabaseProjectName: DEFAULT_SUPABASE_PROJECT_NAME,
    supabaseProjectId: DEFAULT_SUPABASE_PROJECT_ID,
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabasePublishableKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    lastCheckedAt: null,
    lastAutoInitAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_SUPABASE_URL;
  return trimmed.replace(/\/rest\/v1$/i, '');
}

function extractSupabaseProjectId(url: string): string {
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1] || DEFAULT_SUPABASE_PROJECT_ID;
}

function readDatabaseConfig(): DatabaseConnectionConfigData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const defaults = buildDefaultDatabaseConfig();
  if (!fs.existsSync(DATABASE_CONFIG_FILE)) {
    fs.writeFileSync(DATABASE_CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
    return defaults;
  }
  try {
    const raw = JSON.parse(
      fs.readFileSync(DATABASE_CONFIG_FILE, 'utf-8')
    ) as Partial<DatabaseConnectionConfigData>;
    const validEngines: ServerDbEngine[] = [
      'supabase',
      'local-json',
      'firestore',
      'postgresql',
      'mysql',
      'sqlite',
    ];
    const validSsl = ['disable', 'require', 'verify-full'] as const;
    const supabaseUrl = normalizeSupabaseUrl(
      String(raw.supabaseUrl ?? defaults.supabaseUrl)
    );
    return {
      engine: validEngines.includes(raw.engine as ServerDbEngine)
        ? (raw.engine as ServerDbEngine)
        : defaults.engine,
      host: String(raw.host ?? defaults.host).trim().slice(0, 120) || defaults.host,
      port: Number.isFinite(Number(raw.port)) && Number(raw.port) > 0
        ? Math.min(65535, Math.round(Number(raw.port)))
        : defaults.port,
      databaseName:
        String(raw.databaseName ?? defaults.databaseName).trim().slice(0, 80) ||
        defaults.databaseName,
      schemaName:
        String(raw.schemaName ?? defaults.schemaName).trim().slice(0, 60) ||
        defaults.schemaName,
      tablePrefix: String(raw.tablePrefix ?? '').trim().slice(0, 20),
      username: String(raw.username ?? defaults.username).trim().slice(0, 80),
      sslMode: validSsl.includes(raw.sslMode as (typeof validSsl)[number])
        ? (raw.sslMode as (typeof validSsl)[number])
        : defaults.sslMode,
      autoCreateMissingTables:
        typeof raw.autoCreateMissingTables === 'boolean'
          ? raw.autoCreateMissingTables
          : true,
      supabaseProjectName:
        String(raw.supabaseProjectName ?? defaults.supabaseProjectName)
          .trim()
          .slice(0, 80) || defaults.supabaseProjectName,
      supabaseProjectId:
        String(raw.supabaseProjectId ?? extractSupabaseProjectId(supabaseUrl))
          .trim()
          .slice(0, 60) || defaults.supabaseProjectId,
      supabaseUrl,
      supabasePublishableKey:
        String(raw.supabasePublishableKey ?? defaults.supabasePublishableKey)
          .trim()
          .slice(0, 300) || defaults.supabasePublishableKey,
      supabaseSecretKey: raw.supabaseSecretKey
        ? String(raw.supabaseSecretKey).trim().slice(0, 300)
        : undefined,
      supabaseDbUrl: raw.supabaseDbUrl
        ? String(raw.supabaseDbUrl).trim().slice(0, 400)
        : undefined,
      lastCheckedAt: raw.lastCheckedAt ?? null,
      lastAutoInitAt: raw.lastAutoInitAt ?? null,
      updatedAt: raw.updatedAt || defaults.updatedAt,
    };
  } catch {
    fs.writeFileSync(DATABASE_CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf-8');
    return defaults;
  }
}

function writeDatabaseConfig(cfg: DatabaseConnectionConfigData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATABASE_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function getEffectiveSupabaseSecretKey(cfg: DatabaseConnectionConfigData): string {
  return (cfg.supabaseSecretKey || process.env.SUPABASE_SECRET_KEY || '').trim();
}

function getEffectiveSupabaseDbUrl(cfg: DatabaseConnectionConfigData): string {
  return (cfg.supabaseDbUrl || process.env.SUPABASE_DB_URL || '').trim();
}

function sanitizeDatabaseConfigForClient(
  cfg: DatabaseConnectionConfigData,
  extra?: { supabaseConnected?: boolean; supabaseLastError?: string | null }
) {
  const secCfg = readSecurityConfig();
  const fbMeta = readFirebaseAppletMeta();
  const { supabaseSecretKey: _sec, supabaseDbUrl: _dbUrl, ...safeCfg } = cfg;
  return {
    ...safeCfg,
    supabaseRestUrl: `${cfg.supabaseUrl}/rest/v1/`,
    hasSupabaseSecretKey: Boolean(getEffectiveSupabaseSecretKey(cfg)),
    hasSupabaseDbUrl: Boolean(getEffectiveSupabaseDbUrl(cfg)),
    supabaseConnected: extra?.supabaseConnected,
    supabaseLastError: extra?.supabaseLastError ?? null,
    hasCustomDatabasePin: Boolean(secCfg.databasePinSha256),
    firestoreProjectId: fbMeta.projectId,
    firestoreDatabaseId: fbMeta.firestoreDatabaseId,
  };
}

function safeReadJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const REQUIRED_SUPABASE_TABLE_ORDER = [
  'app_settings',
  'employees',
  'attendance_records',
  'late_settlements',
  'payroll_settings',
  'payroll_profiles',
  'payroll_adjustments',
  'payroll_raises',
  'payroll_statuses',
  'finance_accounts',
  'finance_categories',
  'finance_transactions',
  'finance_transfers',
  'security_config',
] as const;

type RemoteTableProbeStatus = 'available' | 'missing' | 'rls_blocked' | 'unreachable';

interface RemoteTableProbeResult {
  tableName: string;
  status: RemoteTableProbeStatus;
  recordCount: number;
  error?: string;
}

async function probeSupabaseTable(
  supabaseUrl: string,
  apiKey: string,
  tableName: string
): Promise<RemoteTableProbeResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(tableName)}?select=*&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          Prefer: 'count=exact',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (res.ok) {
      const contentRange = res.headers.get('content-range') || '';
      const slashIdx = contentRange.lastIndexOf('/');
      let count = 0;
      if (slashIdx >= 0) {
        const rawCount = contentRange.slice(slashIdx + 1).trim();
        const parsed = Number(rawCount);
        if (Number.isFinite(parsed) && parsed >= 0) {
          count = parsed;
        }
      } else {
        const arr = (await res.json().catch(() => [])) as unknown[];
        count = Array.isArray(arr) ? arr.length : 0;
      }
      return { tableName, status: 'available', recordCount: count };
    }

    const bodyText = await res.text().catch(() => '');
    if (res.status === 404 || bodyText.includes('PGRST205') || bodyText.includes('does not exist')) {
      return {
        tableName,
        status: 'missing',
        recordCount: 0,
        error: `Tabel ${tableName} belum ada di schema public Supabase.`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        tableName,
        status: 'rls_blocked',
        recordCount: 0,
        error: `Akses REST ke tabel ${tableName} diblokir RLS/permission (${res.status}).`,
      };
    }
    return {
      tableName,
      status: 'unreachable',
      recordCount: 0,
      error: `HTTP ${res.status}: ${bodyText.slice(0, 120)}`,
    };
  } catch (err) {
    return {
      tableName,
      status: 'unreachable',
      recordCount: 0,
      error: err instanceof Error ? err.message : 'Koneksi Supabase timeout/gagal.',
    };
  }
}

function buildSupabasePostgresDdlSql(): string {
  const allTables = REQUIRED_SUPABASE_TABLE_ORDER.map((t) => `'${t}'`).join(', ');
  return `
CREATE TABLE IF NOT EXISTS public.app_settings (
  id VARCHAR(64) PRIMARY KEY,
  company_name VARCHAR(120) NOT NULL,
  company_subtitle VARCHAR(120) NOT NULL DEFAULT 'HRIS PERUSAHAAN',
  late_deduction_per_minute NUMERIC(15,2) NOT NULL DEFAULT 1000,
  shifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  company_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id VARCHAR(128) PRIMARY KEY,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  department VARCHAR(60) NOT NULL,
  position VARCHAR(60) NOT NULL,
  shift_name VARCHAR(40) NOT NULL,
  shift_start VARCHAR(5) NOT NULL,
  shift_end VARCHAR(5) NOT NULL,
  off_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_off_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id VARCHAR(128) PRIMARY KEY,
  employee_id VARCHAR(128) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(100) NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('hadir','terlambat','izin_terlambat','izin','sakit','alpha','libur')),
  check_in VARCHAR(5) NOT NULL DEFAULT '',
  check_out VARCHAR(5) NOT NULL DEFAULT '',
  overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  late_permit_reason VARCHAR(200),
  late_permit_estimated_arrival VARCHAR(5),
  late_permit_approved_by VARCHAR(100),
  recorded_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS public.late_settlements (
  id VARCHAR(128) PRIMARY KEY,
  employee_id VARCHAR(128) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(100) NOT NULL,
  year_month VARCHAR(7) NOT NULL,
  settlement_date DATE NOT NULL,
  method VARCHAR(32) NOT NULL CHECK (method IN ('tambahan_jam_kerja','potongan_gaji')),
  minutes_settled INTEGER NOT NULL DEFAULT 0,
  extra_work_start VARCHAR(5),
  extra_work_end VARCHAR(5),
  deduction_amount NUMERIC(15,2),
  notes TEXT NOT NULL DEFAULT '',
  recorded_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id VARCHAR(64) PRIMARY KEY,
  default_overtime_hourly_rate NUMERIC(15,2) NOT NULL DEFAULT 25000,
  default_alpha_deduction_per_day NUMERIC(15,2) NOT NULL DEFAULT 150000,
  default_izin_deduction_per_day NUMERIC(15,2) NOT NULL DEFAULT 0,
  auto_deduct_remaining_late BOOLEAN NOT NULL DEFAULT TRUE,
  bpjs_kesehatan_pct NUMERIC(5,2) NOT NULL DEFAULT 1,
  bpjs_ketenagakerjaan_pct NUMERIC(5,2) NOT NULL DEFAULT 2,
  payday_day_of_month INTEGER NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_profiles (
  employee_id VARCHAR(128) PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  position_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  transport_meal_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  other_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  overtime_hourly_rate NUMERIC(15,2) NOT NULL DEFAULT 25000,
  payday_day INTEGER NOT NULL DEFAULT 25,
  payment_method VARCHAR(24) NOT NULL DEFAULT 'transfer',
  bank_name VARCHAR(60) NOT NULL DEFAULT '',
  bank_account_number VARCHAR(60) NOT NULL DEFAULT '',
  bank_account_holder VARCHAR(100) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id VARCHAR(128) PRIMARY KEY,
  employee_id VARCHAR(128) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(100) NOT NULL DEFAULT '',
  year_month VARCHAR(7) NOT NULL,
  type VARCHAR(24) NOT NULL CHECK (type IN ('bonus','tunjangan','potongan')),
  title VARCHAR(120) NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  adjustment_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_raises (
  id VARCHAR(128) PRIMARY KEY,
  employee_id VARCHAR(128) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(100) NOT NULL,
  effective_month VARCHAR(7) NOT NULL,
  raise_date DATE NOT NULL,
  method VARCHAR(24) NOT NULL CHECK (method IN ('persentase','nominal')),
  percent_increase NUMERIC(6,2) NOT NULL DEFAULT 0,
  previous_base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  previous_position_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_position_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  previous_transport_meal_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_transport_meal_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  previous_other_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  new_other_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  applied_to_profile BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_statuses (
  id VARCHAR(128) PRIMARY KEY,
  employee_id VARCHAR(128) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('draft','disetujui','dibayar')),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year_month)
);

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('cash','rekening')),
  bank_name VARCHAR(60) NOT NULL DEFAULT '',
  account_number VARCHAR(60) NOT NULL DEFAULT '',
  holder_name VARCHAR(100) NOT NULL DEFAULT '',
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('pendapatan','pengeluaran')),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id VARCHAR(128) PRIMARY KEY,
  tx_date DATE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('pendapatan','pengeluaran')),
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash','transfer')),
  category_id VARCHAR(128) NOT NULL REFERENCES public.finance_categories(id),
  category_name VARCHAR(100) NOT NULL,
  account_id VARCHAR(128) REFERENCES public.finance_accounts(id),
  title VARCHAR(150) NOT NULL,
  counterparty VARCHAR(100) NOT NULL DEFAULT '',
  bank_account VARCHAR(120) NOT NULL DEFAULT '',
  reference_no VARCHAR(50) NOT NULL DEFAULT '',
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by VARCHAR(100) NOT NULL DEFAULT 'Admin Mode',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_transfers (
  id VARCHAR(128) PRIMARY KEY,
  transfer_date DATE NOT NULL,
  from_account_id VARCHAR(128) NOT NULL REFERENCES public.finance_accounts(id),
  from_account_name VARCHAR(100) NOT NULL,
  to_account_id VARCHAR(128) NOT NULL REFERENCES public.finance_accounts(id),
  to_account_name VARCHAR(100) NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reference_no VARCHAR(50) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by VARCHAR(100) NOT NULL DEFAULT 'Admin Mode',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.security_config (
  id VARCHAR(64) PRIMARY KEY,
  admin_pin_sha256 CHAR(64) NOT NULL,
  database_pin_sha256 CHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_records (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp ON public.attendance_records (employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_finance_tx_date ON public.finance_transactions (tx_date, type);
CREATE INDEX IF NOT EXISTS idx_finance_tx_cat ON public.finance_transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_finance_tr_date ON public.finance_transfers (transfer_date);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[${allTables}]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "karyapresensi_api_access" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "karyapresensi_api_access" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
`;
}

async function runSupabasePostgresDdl(dbUrl: string): Promise<{ ok: boolean; error?: string }> {
  const client = new PgClient({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query(buildSupabasePostgresDdlSql());
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menjalankan DDL PostgreSQL ke Supabase.',
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function getSupabaseClientForConfig(cfg: DatabaseConnectionConfigData): SupabaseClient {
  const apiKey = getEffectiveSupabaseSecretKey(cfg) || cfg.supabasePublishableKey;
  return createClient(cfg.supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function upsertRowsSupabase(
  sb: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<{ rowCount: number; error?: string }> {
  if (rows.length === 0) return { rowCount: 0 };
  let total = 0;
  for (const batch of chunkArray(rows, 200)) {
    const { error } = await sb.from(table).upsert(batch, { onConflict });
    if (error) {
      return { rowCount: total, error: error.message };
    }
    total += batch.length;
  }
  return { rowCount: total };
}

async function syncAttendanceModuleToSupabase(cfg?: DatabaseConnectionConfigData): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const activeCfg = cfg || readDatabaseConfig();
  const sb = getSupabaseClientForConfig(activeCfg);
  const db = readDb();
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  const r1 = await upsertRowsSupabase(sb, 'app_settings', [
    {
      id: 'default',
      company_name: db.settings.companyName,
      company_subtitle: db.settings.companySubtitle,
      late_deduction_per_minute: db.settings.lateDeductionPerMinute,
      shifts: db.settings.shifts,
      company_profile: db.settings.companyProfile,
      updated_at: nowIso,
    },
  ]);
  if (r1.error) failed.push({ tableName: 'app_settings', error: r1.error });
  else synced.push({ tableName: 'app_settings', rowCount: r1.rowCount });

  const empRows = db.employees.map((e) => ({
    id: e.id,
    employee_code: e.employeeCode,
    name: e.name,
    department: e.department,
    position: e.position,
    shift_name: e.shiftName,
    shift_start: e.shiftStart,
    shift_end: e.shiftEnd,
    off_days: e.offDays || [],
    custom_off_dates: e.customOffDates || [],
    active: Boolean(e.active),
    created_at: e.createdAt || nowIso,
    updated_at: e.updatedAt || nowIso,
  }));
  const r2 = await upsertRowsSupabase(sb, 'employees', empRows);
  if (r2.error) failed.push({ tableName: 'employees', error: r2.error });
  else synced.push({ tableName: 'employees', rowCount: r2.rowCount });

  const attRows = db.attendanceRecords.map((a) => ({
    id: a.id,
    employee_id: a.employeeId,
    employee_name: a.employeeName,
    attendance_date: a.date,
    status: a.status,
    check_in: a.checkIn || '',
    check_out: a.checkOut || '',
    overtime_hours: Number(a.overtimeHours || 0),
    notes: a.notes || '',
    late_permit_reason: a.latePermitReason || null,
    late_permit_estimated_arrival: a.latePermitEstimatedArrival || null,
    late_permit_approved_by: a.latePermitApprovedBy || null,
    recorded_by: a.recordedBy || 'Admin HR',
    created_at: a.createdAt || nowIso,
    updated_at: a.updatedAt || nowIso,
  }));
  const r3 = await upsertRowsSupabase(sb, 'attendance_records', attRows);
  if (r3.error) failed.push({ tableName: 'attendance_records', error: r3.error });
  else synced.push({ tableName: 'attendance_records', rowCount: r3.rowCount });

  const lsetRows = db.lateSettlements.map((s) => ({
    id: s.id,
    employee_id: s.employeeId,
    employee_name: s.employeeName,
    year_month: s.yearMonth,
    settlement_date: s.date,
    method: s.method,
    minutes_settled: s.minutesSettled,
    extra_work_start: s.extraWorkStart || null,
    extra_work_end: s.extraWorkEnd || null,
    deduction_amount: s.deductionAmount ?? null,
    notes: s.notes || '',
    recorded_by: s.recordedBy || 'Admin HR',
    created_at: s.createdAt || nowIso,
  }));
  const r4 = await upsertRowsSupabase(sb, 'late_settlements', lsetRows);
  if (r4.error) failed.push({ tableName: 'late_settlements', error: r4.error });
  else synced.push({ tableName: 'late_settlements', rowCount: r4.rowCount });

  return { synced, failed };
}

async function syncPayrollModuleToSupabase(cfg?: DatabaseConnectionConfigData): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const activeCfg = cfg || readDatabaseConfig();
  const sb = getSupabaseClientForConfig(activeCfg);
  const payDb = readPayrollDb();
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  const ps = await upsertRowsSupabase(sb, 'payroll_settings', [
    {
      id: 'default',
      default_overtime_hourly_rate: payDb.settings.defaultOvertimeHourlyRate,
      default_alpha_deduction_per_day: payDb.settings.defaultAlphaDeductionPerDay,
      default_izin_deduction_per_day: payDb.settings.defaultIzinDeductionPerDay,
      auto_deduct_remaining_late: payDb.settings.autoDeductRemainingLate,
      bpjs_kesehatan_pct: payDb.settings.bpjsKesehatanPct,
      bpjs_ketenagakerjaan_pct: payDb.settings.bpjsKetenagakerjaanPct,
      payday_day_of_month: payDb.settings.paydayDayOfMonth,
      updated_at: nowIso,
    },
  ]);
  if (ps.error) failed.push({ tableName: 'payroll_settings', error: ps.error });
  else synced.push({ tableName: 'payroll_settings', rowCount: ps.rowCount });

  const profRows = payDb.profiles.map((p) => ({
    employee_id: p.employeeId,
    base_salary: p.baseSalary,
    position_allowance: p.positionAllowance,
    transport_meal_allowance: p.transportMealAllowance,
    other_allowance: p.otherAllowance ?? 0,
    overtime_hourly_rate: p.overtimeHourlyRate ?? payDb.settings.defaultOvertimeHourlyRate,
    payday_day: p.paydayDay ?? payDb.settings.paydayDayOfMonth,
    payment_method: p.paymentMethod,
    bank_name: p.bankName,
    bank_account_number: p.bankAccountNumber,
    bank_account_holder: p.bankAccountHolder,
    notes: p.notes || '',
    updated_at: p.updatedAt || nowIso,
  }));
  const pp = await upsertRowsSupabase(sb, 'payroll_profiles', profRows, 'employee_id');
  if (pp.error) failed.push({ tableName: 'payroll_profiles', error: pp.error });
  else synced.push({ tableName: 'payroll_profiles', rowCount: pp.rowCount });

  const adjRows = payDb.adjustments.map((a) => ({
    id: a.id,
    employee_id: a.employeeId,
    employee_name: a.employeeName,
    year_month: a.yearMonth,
    type: a.type,
    title: a.title,
    amount: a.amount,
    adjustment_date: a.date,
    notes: a.notes || '',
    created_at: a.createdAt || nowIso,
  }));
  const pa = await upsertRowsSupabase(sb, 'payroll_adjustments', adjRows);
  if (pa.error) failed.push({ tableName: 'payroll_adjustments', error: pa.error });
  else synced.push({ tableName: 'payroll_adjustments', rowCount: pa.rowCount });

  const raiseRows = payDb.salaryRaises.map((r) => ({
    id: r.id,
    employee_id: r.employeeId,
    employee_name: r.employeeName,
    effective_month: r.effectiveMonth,
    raise_date: r.raiseDate,
    method: r.method,
    percent_increase: r.percentIncrease ?? 0,
    previous_base_salary: r.previousBaseSalary,
    new_base_salary: r.newBaseSalary,
    previous_position_allowance: r.previousPositionAllowance,
    new_position_allowance: r.newPositionAllowance,
    previous_transport_meal_allowance: r.previousTransportMealAllowance,
    new_transport_meal_allowance: r.newTransportMealAllowance,
    previous_other_allowance: r.previousOtherAllowance,
    new_other_allowance: r.newOtherAllowance,
    reason: r.reason || '',
    notes: r.notes || '',
    applied_to_profile: r.appliedToProfile,
    created_at: r.createdAt || nowIso,
  }));
  const pr = await upsertRowsSupabase(sb, 'payroll_raises', raiseRows);
  if (pr.error) failed.push({ tableName: 'payroll_raises', error: pr.error });
  else synced.push({ tableName: 'payroll_raises', rowCount: pr.rowCount });

  const stRows = payDb.statuses.map((s) => ({
    id: s.id,
    employee_id: s.employeeId,
    year_month: s.yearMonth,
    status: s.status,
    paid_at: s.paidAt || null,
    updated_at: s.updatedAt || nowIso,
  }));
  const pst = await upsertRowsSupabase(sb, 'payroll_statuses', stRows);
  if (pst.error) failed.push({ tableName: 'payroll_statuses', error: pst.error });
  else synced.push({ tableName: 'payroll_statuses', rowCount: pst.rowCount });

  return { synced, failed };
}

async function syncFinanceModuleToSupabase(cfg?: DatabaseConnectionConfigData): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const activeCfg = cfg || readDatabaseConfig();
  const sb = getSupabaseClientForConfig(activeCfg);
  const finDb = readFinanceDb();
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  const accRows = finDb.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    bank_name: a.bankName,
    account_number: a.accountNumber,
    holder_name: a.holderName,
    opening_balance: a.openingBalance,
    created_at: a.createdAt || nowIso,
  }));
  const fa = await upsertRowsSupabase(sb, 'finance_accounts', accRows);
  if (fa.error) failed.push({ tableName: 'finance_accounts', error: fa.error });
  else synced.push({ tableName: 'finance_accounts', rowCount: fa.rowCount });

  const catRows = finDb.categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    description: c.description || '',
    created_at: c.createdAt || nowIso,
  }));
  const fc = await upsertRowsSupabase(sb, 'finance_categories', catRows);
  if (fc.error) failed.push({ tableName: 'finance_categories', error: fc.error });
  else synced.push({ tableName: 'finance_categories', rowCount: fc.rowCount });

  const txRows = finDb.transactions.map((t) => ({
    id: t.id,
    tx_date: t.date,
    type: t.type,
    method: t.method,
    category_id: t.categoryId,
    category_name: t.categoryName,
    account_id: t.accountId || null,
    title: t.title,
    counterparty: t.counterparty || '',
    bank_account: t.bankAccount || '',
    reference_no: t.referenceNo || '',
    amount: t.amount,
    notes: t.notes || '',
    recorded_by: t.recordedBy || 'Admin Mode',
    created_at: t.createdAt || nowIso,
    updated_at: t.updatedAt || nowIso,
  }));
  const ft = await upsertRowsSupabase(sb, 'finance_transactions', txRows);
  if (ft.error) failed.push({ tableName: 'finance_transactions', error: ft.error });
  else synced.push({ tableName: 'finance_transactions', rowCount: ft.rowCount });

  const trRows = finDb.transfers.map((tr) => ({
    id: tr.id,
    transfer_date: tr.date,
    from_account_id: tr.fromAccountId,
    from_account_name: tr.fromAccountName,
    to_account_id: tr.toAccountId,
    to_account_name: tr.toAccountName,
    amount: tr.amount,
    reference_no: tr.referenceNo || '',
    notes: tr.notes || '',
    recorded_by: tr.recordedBy || 'Admin Mode',
    created_at: tr.createdAt || nowIso,
  }));
  const ftr = await upsertRowsSupabase(sb, 'finance_transfers', trRows);
  if (ftr.error) failed.push({ tableName: 'finance_transfers', error: ftr.error });
  else synced.push({ tableName: 'finance_transfers', rowCount: ftr.rowCount });

  return { synced, failed };
}

async function syncSecurityModuleToSupabase(cfg?: DatabaseConnectionConfigData): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const activeCfg = cfg || readDatabaseConfig();
  const sb = getSupabaseClientForConfig(activeCfg);
  const sec = readSecurityConfig();
  const res = await upsertRowsSupabase(sb, 'security_config', [
    {
      id: 'default',
      admin_pin_sha256: sec.adminPinSha256,
      database_pin_sha256: sec.databasePinSha256 || null,
      updated_at: sec.updatedAt || new Date().toISOString(),
    },
  ]);
  if (res.error) {
    return { synced: [], failed: [{ tableName: 'security_config', error: res.error }] };
  }
  return { synced: [{ tableName: 'security_config', rowCount: res.rowCount }], failed: [] };
}

let isBootHydratingSupabase = false;
const pendingSupabaseScopes = new Set<'attendance' | 'payroll' | 'finance' | 'security'>();
let supabaseSyncTimer: NodeJS.Timeout | null = null;

function queueSupabaseSync(scope: 'attendance' | 'payroll' | 'finance' | 'security'): void {
  if (isBootHydratingSupabase) return;
  try {
    const cfg = readDatabaseConfig();
    if (cfg.engine !== 'supabase' || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  } catch {
    return;
  }
  pendingSupabaseScopes.add(scope);
  if (supabaseSyncTimer) return;
  supabaseSyncTimer = setTimeout(async () => {
    supabaseSyncTimer = null;
    const scopes = Array.from(pendingSupabaseScopes);
    pendingSupabaseScopes.clear();
    const cfg = readDatabaseConfig();
    if (cfg.engine !== 'supabase') return;
    for (const s of scopes) {
      try {
        if (s === 'attendance') await syncAttendanceModuleToSupabase(cfg);
        else if (s === 'payroll') await syncPayrollModuleToSupabase(cfg);
        else if (s === 'finance') await syncFinanceModuleToSupabase(cfg);
        else if (s === 'security') await syncSecurityModuleToSupabase(cfg);
      } catch {
        // Non-blocking background sync; errors reported in DB diagnostics
      }
    }
  }, 150);
}

async function deleteSupabaseRowById(table: string, id: string): Promise<void> {
  try {
    const cfg = readDatabaseConfig();
    if (cfg.engine !== 'supabase') return;
    const sb = getSupabaseClientForConfig(cfg);
    await sb.from(table).delete().eq('id', id);
  } catch {
    // Non-blocking delete sync
  }
}

async function pushAllLocalToSupabase(): Promise<{
  syncedTables: { tableName: string; rowCount: number }[];
  failedTables: { tableName: string; error: string }[];
}> {
  const cfg = readDatabaseConfig();
  const rAtt = await syncAttendanceModuleToSupabase(cfg);
  const rPay = await syncPayrollModuleToSupabase(cfg);
  const rFin = await syncFinanceModuleToSupabase(cfg);
  const rSec = await syncSecurityModuleToSupabase(cfg);
  return {
    syncedTables: [...rAtt.synced, ...rPay.synced, ...rFin.synced, ...rSec.synced],
    failedTables: [...rAtt.failed, ...rPay.failed, ...rFin.failed, ...rSec.failed],
  };
}

async function pullAllSupabaseToLocal(): Promise<{
  syncedTables: { tableName: string; rowCount: number }[];
  failedTables: { tableName: string; error: string }[];
}> {
  const cfg = readDatabaseConfig();
  const sb = getSupabaseClientForConfig(cfg);
  const syncedTables: { tableName: string; rowCount: number }[] = [];
  const failedTables: { tableName: string; error: string }[] = [];

  isBootHydratingSupabase = true;
  try {
    // 1. Attendance & Settings module
    const curAtt = readDb();
    let attChanged = false;

    const { data: settingsRows, error: settingsErr } = await sb
      .from('app_settings')
      .select('*')
      .eq('id', 'default')
      .limit(1);
    if (settingsErr) {
      failedTables.push({ tableName: 'app_settings', error: settingsErr.message });
    } else {
      syncedTables.push({ tableName: 'app_settings', rowCount: settingsRows?.length || 0 });
      if (settingsRows && settingsRows.length > 0) {
        const s = settingsRows[0] as Record<string, unknown>;
        curAtt.settings = normalizeSettings({
          companyName: String(s.company_name || curAtt.settings.companyName),
          companySubtitle: String(s.company_subtitle || curAtt.settings.companySubtitle),
          lateDeductionPerMinute: Number(s.late_deduction_per_minute ?? 1000),
          shifts: Array.isArray(s.shifts) ? (s.shifts as ShiftConfigData[]) : curAtt.settings.shifts,
          companyProfile:
            s.company_profile && typeof s.company_profile === 'object'
              ? (s.company_profile as CompanyProfileData)
              : curAtt.settings.companyProfile,
        });
        attChanged = true;
      }
    }

    const { data: empRows, error: empErr } = await sb.from('employees').select('*');
    if (empErr) {
      failedTables.push({ tableName: 'employees', error: empErr.message });
    } else {
      syncedTables.push({ tableName: 'employees', rowCount: empRows?.length || 0 });
      if (empRows && empRows.length > 0) {
        curAtt.employees = empRows.map((e: Record<string, unknown>) => ({
          id: String(e.id),
          employeeCode: String(e.employee_code || ''),
          name: String(e.name || ''),
          department: String(e.department || 'Operasional'),
          position: String(e.position || 'Staf'),
          shiftName: String(e.shift_name || 'Reguler'),
          shiftStart: String(e.shift_start || '08:00'),
          shiftEnd: String(e.shift_end || '17:00'),
          offDays: Array.isArray(e.off_days) ? (e.off_days as number[]) : [],
          customOffDates: Array.isArray(e.custom_off_dates)
            ? (e.custom_off_dates as string[])
            : [],
          active: Boolean(e.active),
          createdAt: String(e.created_at || new Date().toISOString()),
          updatedAt: String(e.updated_at || new Date().toISOString()),
        }));
        attChanged = true;
      }
    }

    const { data: attRows, error: attErr } = await sb.from('attendance_records').select('*');
    if (attErr) {
      failedTables.push({ tableName: 'attendance_records', error: attErr.message });
    } else {
      syncedTables.push({ tableName: 'attendance_records', rowCount: attRows?.length || 0 });
      if (attRows && attRows.length > 0) {
        curAtt.attendanceRecords = attRows.map((a: Record<string, unknown>) => ({
          id: String(a.id),
          employeeId: String(a.employee_id),
          employeeName: String(a.employee_name || ''),
          date: String(a.attendance_date || '').slice(0, 10),
          status: (a.status as AttendanceData['status']) || 'hadir',
          checkIn: String(a.check_in || ''),
          checkOut: String(a.check_out || ''),
          overtimeHours: Number(a.overtime_hours || 0),
          notes: String(a.notes || ''),
          latePermitReason: a.late_permit_reason ? String(a.late_permit_reason) : undefined,
          latePermitEstimatedArrival: a.late_permit_estimated_arrival
            ? String(a.late_permit_estimated_arrival)
            : undefined,
          latePermitApprovedBy: a.late_permit_approved_by
            ? String(a.late_permit_approved_by)
            : undefined,
          recordedBy: String(a.recorded_by || 'Admin HR'),
          createdAt: String(a.created_at || new Date().toISOString()),
          updatedAt: String(a.updated_at || new Date().toISOString()),
        }));
        attChanged = true;
      }
    }

    const { data: lsetRows, error: lsetErr } = await sb.from('late_settlements').select('*');
    if (lsetErr) {
      failedTables.push({ tableName: 'late_settlements', error: lsetErr.message });
    } else {
      syncedTables.push({ tableName: 'late_settlements', rowCount: lsetRows?.length || 0 });
      if (lsetRows && lsetRows.length > 0) {
        curAtt.lateSettlements = lsetRows.map((s: Record<string, unknown>) => ({
          id: String(s.id),
          employeeId: String(s.employee_id),
          employeeName: String(s.employee_name || ''),
          yearMonth: String(s.year_month || ''),
          date: String(s.settlement_date || '').slice(0, 10),
          method:
            s.method === 'potongan_gaji' ? 'potongan_gaji' : 'tambahan_jam_kerja',
          minutesSettled: Number(s.minutes_settled || 0),
          extraWorkStart: s.extra_work_start ? String(s.extra_work_start) : undefined,
          extraWorkEnd: s.extra_work_end ? String(s.extra_work_end) : undefined,
          deductionAmount:
            s.deduction_amount !== null && s.deduction_amount !== undefined
              ? Number(s.deduction_amount)
              : undefined,
          notes: String(s.notes || ''),
          recordedBy: String(s.recorded_by || 'Admin HR'),
          createdAt: String(s.created_at || new Date().toISOString()),
        }));
        attChanged = true;
      }
    }

    if (attChanged) {
      writeDb(curAtt);
    }

    // 2. Payroll module
    const curPay = readPayrollDb();
    let payChanged = false;

    const { data: pSetRows, error: pSetErr } = await sb
      .from('payroll_settings')
      .select('*')
      .eq('id', 'default')
      .limit(1);
    if (pSetErr) {
      failedTables.push({ tableName: 'payroll_settings', error: pSetErr.message });
    } else {
      syncedTables.push({ tableName: 'payroll_settings', rowCount: pSetRows?.length || 0 });
      if (pSetRows && pSetRows.length > 0) {
        const ps = pSetRows[0] as Record<string, unknown>;
        curPay.settings = normalizePayrollSettings({
          defaultOvertimeHourlyRate: Number(ps.default_overtime_hourly_rate ?? 25000),
          defaultAlphaDeductionPerDay: Number(ps.default_alpha_deduction_per_day ?? 150000),
          defaultIzinDeductionPerDay: Number(ps.default_izin_deduction_per_day ?? 0),
          autoDeductRemainingLate: Boolean(ps.auto_deduct_remaining_late),
          bpjsKesehatanPct: Number(ps.bpjs_kesehatan_pct ?? 1),
          bpjsKetenagakerjaanPct: Number(ps.bpjs_ketenagakerjaan_pct ?? 2),
          paydayDayOfMonth: Number(ps.payday_day_of_month ?? 25),
        });
        payChanged = true;
      }
    }

    const { data: pProfRows, error: pProfErr } = await sb.from('payroll_profiles').select('*');
    if (pProfErr) {
      failedTables.push({ tableName: 'payroll_profiles', error: pProfErr.message });
    } else {
      syncedTables.push({ tableName: 'payroll_profiles', rowCount: pProfRows?.length || 0 });
      if (pProfRows && pProfRows.length > 0) {
        curPay.profiles = pProfRows.map((p: Record<string, unknown>) => ({
          employeeId: String(p.employee_id),
          baseSalary: Number(p.base_salary || 0),
          positionAllowance: Number(p.position_allowance || 0),
          transportMealAllowance: Number(p.transport_meal_allowance || 0),
          otherAllowance: Number(p.other_allowance || 0),
          overtimeHourlyRate: Number(p.overtime_hourly_rate || 25000),
          paydayDay: Number(p.payday_day || 25),
          paymentMethod: p.payment_method === 'tunai' ? 'tunai' : 'transfer',
          bankName: String(p.bank_name || ''),
          bankAccountNumber: String(p.bank_account_number || ''),
          bankAccountHolder: String(p.bank_account_holder || ''),
          notes: String(p.notes || ''),
          updatedAt: String(p.updated_at || new Date().toISOString()),
        }));
        payChanged = true;
      }
    }

    const { data: pAdjRows, error: pAdjErr } = await sb.from('payroll_adjustments').select('*');
    if (pAdjErr) {
      failedTables.push({ tableName: 'payroll_adjustments', error: pAdjErr.message });
    } else {
      syncedTables.push({ tableName: 'payroll_adjustments', rowCount: pAdjRows?.length || 0 });
      if (pAdjRows && pAdjRows.length > 0) {
        curPay.adjustments = pAdjRows.map((a: Record<string, unknown>) => ({
          id: String(a.id),
          employeeId: String(a.employee_id),
          employeeName: String(a.employee_name || ''),
          yearMonth: String(a.year_month || ''),
          type: (a.type as PayrollAdjustmentData['type']) || 'bonus',
          title: String(a.title || ''),
          amount: Number(a.amount || 0),
          date: String(a.adjustment_date || '').slice(0, 10),
          notes: String(a.notes || ''),
          createdAt: String(a.created_at || new Date().toISOString()),
        }));
        payChanged = true;
      }
    }

    const { data: pRaiseRows, error: pRaiseErr } = await sb.from('payroll_raises').select('*');
    if (pRaiseErr) {
      failedTables.push({ tableName: 'payroll_raises', error: pRaiseErr.message });
    } else {
      syncedTables.push({ tableName: 'payroll_raises', rowCount: pRaiseRows?.length || 0 });
      if (pRaiseRows && pRaiseRows.length > 0) {
        curPay.salaryRaises = pRaiseRows.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          employeeId: String(r.employee_id),
          employeeName: String(r.employee_name || ''),
          effectiveMonth: String(r.effective_month || ''),
          raiseDate: String(r.raise_date || '').slice(0, 10),
          method: r.method === 'persentase' ? 'persentase' : 'nominal',
          percentIncrease:
            r.percent_increase !== null && r.percent_increase !== undefined
              ? Number(r.percent_increase)
              : undefined,
          previousBaseSalary: Number(r.previous_base_salary || 0),
          newBaseSalary: Number(r.new_base_salary || 0),
          previousPositionAllowance: Number(r.previous_position_allowance || 0),
          newPositionAllowance: Number(r.new_position_allowance || 0),
          previousTransportMealAllowance: Number(r.previous_transport_meal_allowance || 0),
          newTransportMealAllowance: Number(r.new_transport_meal_allowance || 0),
          previousOtherAllowance: Number(r.previous_other_allowance || 0),
          newOtherAllowance: Number(r.new_other_allowance || 0),
          reason: String(r.reason || ''),
          notes: String(r.notes || ''),
          appliedToProfile: Boolean(r.applied_to_profile),
          createdAt: String(r.created_at || new Date().toISOString()),
        }));
        payChanged = true;
      }
    }

    const { data: pStatRows, error: pStatErr } = await sb.from('payroll_statuses').select('*');
    if (pStatErr) {
      failedTables.push({ tableName: 'payroll_statuses', error: pStatErr.message });
    } else {
      syncedTables.push({ tableName: 'payroll_statuses', rowCount: pStatRows?.length || 0 });
      if (pStatRows && pStatRows.length > 0) {
        curPay.statuses = pStatRows.map((s: Record<string, unknown>) => ({
          id: String(s.id),
          employeeId: String(s.employee_id),
          yearMonth: String(s.year_month || ''),
          status: (s.status as PayrollMonthlyStatusData['status']) || 'draft',
          paidAt: s.paid_at ? String(s.paid_at) : undefined,
          updatedAt: String(s.updated_at || new Date().toISOString()),
        }));
        payChanged = true;
      }
    }

    if (payChanged) {
      writePayrollDb(curPay);
    }

    // 3. Finance module
    const curFin = readFinanceDb();
    let finChanged = false;

    const { data: fAccRows, error: fAccErr } = await sb.from('finance_accounts').select('*');
    if (fAccErr) {
      failedTables.push({ tableName: 'finance_accounts', error: fAccErr.message });
    } else {
      syncedTables.push({ tableName: 'finance_accounts', rowCount: fAccRows?.length || 0 });
      if (fAccRows && fAccRows.length > 0) {
        curFin.accounts = fAccRows.map((a: Record<string, unknown>) => ({
          id: String(a.id),
          name: String(a.name || ''),
          kind: a.kind === 'cash' ? 'cash' : 'rekening',
          bankName: String(a.bank_name || ''),
          accountNumber: String(a.account_number || ''),
          holderName: String(a.holder_name || ''),
          openingBalance: Number(a.opening_balance || 0),
          createdAt: String(a.created_at || new Date().toISOString()),
        }));
        finChanged = true;
      }
    }

    const { data: fCatRows, error: fCatErr } = await sb.from('finance_categories').select('*');
    if (fCatErr) {
      failedTables.push({ tableName: 'finance_categories', error: fCatErr.message });
    } else {
      syncedTables.push({ tableName: 'finance_categories', rowCount: fCatRows?.length || 0 });
      if (fCatRows && fCatRows.length > 0) {
        curFin.categories = fCatRows.map((c: Record<string, unknown>) => ({
          id: String(c.id),
          name: String(c.name || ''),
          type: c.type === 'pendapatan' ? 'pendapatan' : 'pengeluaran',
          description: String(c.description || ''),
          createdAt: String(c.created_at || new Date().toISOString()),
        }));
        finChanged = true;
      }
    }

    const { data: fTxRows, error: fTxErr } = await sb.from('finance_transactions').select('*');
    if (fTxErr) {
      failedTables.push({ tableName: 'finance_transactions', error: fTxErr.message });
    } else {
      syncedTables.push({ tableName: 'finance_transactions', rowCount: fTxRows?.length || 0 });
      if (fTxRows && fTxRows.length > 0) {
        curFin.transactions = fTxRows.map((t: Record<string, unknown>) => ({
          id: String(t.id),
          date: String(t.tx_date || '').slice(0, 10),
          type: t.type === 'pendapatan' ? 'pendapatan' : 'pengeluaran',
          method: t.method === 'cash' ? 'cash' : 'transfer',
          categoryId: String(t.category_id || ''),
          categoryName: String(t.category_name || ''),
          accountId: t.account_id ? String(t.account_id) : undefined,
          title: String(t.title || ''),
          counterparty: String(t.counterparty || ''),
          bankAccount: String(t.bank_account || ''),
          referenceNo: String(t.reference_no || ''),
          amount: Number(t.amount || 0),
          notes: String(t.notes || ''),
          recordedBy: String(t.recorded_by || 'Admin Mode'),
          createdAt: String(t.created_at || new Date().toISOString()),
          updatedAt: String(t.updated_at || new Date().toISOString()),
        }));
        finChanged = true;
      }
    }

    const { data: fTrRows, error: fTrErr } = await sb.from('finance_transfers').select('*');
    if (fTrErr) {
      failedTables.push({ tableName: 'finance_transfers', error: fTrErr.message });
    } else {
      syncedTables.push({ tableName: 'finance_transfers', rowCount: fTrRows?.length || 0 });
      if (fTrRows && fTrRows.length > 0) {
        curFin.transfers = fTrRows.map((tr: Record<string, unknown>) => ({
          id: String(tr.id),
          date: String(tr.transfer_date || '').slice(0, 10),
          fromAccountId: String(tr.from_account_id || ''),
          fromAccountName: String(tr.from_account_name || ''),
          toAccountId: String(tr.to_account_id || ''),
          toAccountName: String(tr.to_account_name || ''),
          amount: Number(tr.amount || 0),
          referenceNo: String(tr.reference_no || ''),
          notes: String(tr.notes || ''),
          recordedBy: String(tr.recorded_by || 'Admin Mode'),
          createdAt: String(tr.created_at || new Date().toISOString()),
        }));
        finChanged = true;
      }
    }

    if (finChanged) {
      writeFinanceDb(normalizeFinanceDb(curFin));
    }

    // 4. Security config
    const { data: secRows, error: secErr } = await sb
      .from('security_config')
      .select('*')
      .eq('id', 'default')
      .limit(1);
    if (secErr) {
      failedTables.push({ tableName: 'security_config', error: secErr.message });
    } else {
      syncedTables.push({ tableName: 'security_config', rowCount: secRows?.length || 0 });
      if (secRows && secRows.length > 0) {
        const sr = secRows[0] as Record<string, unknown>;
        if (typeof sr.admin_pin_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sr.admin_pin_sha256)) {
          writeSecurityConfig({
            adminPinSha256: sr.admin_pin_sha256,
            databasePinSha256:
              typeof sr.database_pin_sha256 === 'string' &&
              /^[a-f0-9]{64}$/i.test(sr.database_pin_sha256)
                ? sr.database_pin_sha256
                : undefined,
            updatedAt: String(sr.updated_at || new Date().toISOString()),
          });
        }
      }
    }
  } finally {
    isBootHydratingSupabase = false;
  }

  return { syncedTables, failedTables };
}

function inspectLocalDatabaseTables() {
  const attRaw = safeReadJsonFile(DB_FILE);
  const payRaw = safeReadJsonFile(PAYROLL_DB_FILE);
  const finRaw = safeReadJsonFile(FINANCE_DB_FILE);
  const secRaw = safeReadJsonFile(SECURITY_CONFIG_FILE);

  return [
    {
      tableName: 'employees',
      firestoreCollection: 'employees',
      module: 'Absensi' as const,
      description: 'Data master karyawan, shift, dan jadwal libur individu',
      storageFile: 'data/attendance-db.json',
      exists: Boolean(attRaw && Array.isArray(attRaw.employees)),
      recordCount: attRaw && Array.isArray(attRaw.employees) ? attRaw.employees.length : 0,
      requiredColumns: ['id', 'employee_code', 'name', 'department', 'position', 'shift_name', 'off_days', 'active'],
    },
    {
      tableName: 'attendance_records',
      firestoreCollection: 'attendance',
      module: 'Absensi' as const,
      description: 'Log kehadiran harian, jam masuk/pulang, lembur, & izin datang terlambat',
      storageFile: 'data/attendance-db.json',
      exists: Boolean(attRaw && Array.isArray(attRaw.attendanceRecords)),
      recordCount: attRaw && Array.isArray(attRaw.attendanceRecords) ? attRaw.attendanceRecords.length : 0,
      requiredColumns: ['id', 'employee_id', 'attendance_date', 'status', 'check_in', 'check_out', 'overtime_hours'],
    },
    {
      tableName: 'late_settlements',
      firestoreCollection: 'lateSettlements',
      module: 'Absensi' as const,
      description: 'Riwayat penyelesaian / ganti keterlambatan karyawan',
      storageFile: 'data/attendance-db.json',
      exists: Boolean(attRaw && Array.isArray(attRaw.lateSettlements)),
      recordCount: attRaw && Array.isArray(attRaw.lateSettlements) ? attRaw.lateSettlements.length : 0,
      requiredColumns: ['id', 'employee_id', 'year_month', 'settlement_date', 'method', 'minutes_settled'],
    },
    {
      tableName: 'app_settings',
      firestoreCollection: 'appSettings',
      module: 'Pengaturan' as const,
      description: 'Identitas perusahaan, profil legalitas, cabang, dan konfigurasi shift',
      storageFile: 'data/attendance-db.json',
      exists: Boolean(attRaw && attRaw.settings && typeof attRaw.settings === 'object'),
      recordCount: attRaw && attRaw.settings ? 1 : 0,
      requiredColumns: ['id', 'company_name', 'company_subtitle', 'late_deduction_per_minute', 'shifts', 'company_profile'],
    },
    {
      tableName: 'payroll_settings',
      firestoreCollection: '(server-protected)',
      module: 'Penggajian' as const,
      description: 'Kebijakan lembur, potongan alpha/izin, BPJS, dan tanggal gajian',
      storageFile: 'data/payroll-db.json',
      exists: Boolean(payRaw && payRaw.settings && typeof payRaw.settings === 'object'),
      recordCount: payRaw && payRaw.settings ? 1 : 0,
      requiredColumns: ['id', 'default_overtime_hourly_rate', 'default_alpha_deduction_per_day', 'bpjs_kesehatan_pct', 'payday_day_of_month'],
    },
    {
      tableName: 'payroll_profiles',
      firestoreCollection: '(server-protected)',
      module: 'Penggajian' as const,
      description: 'Gaji pokok, tunjangan, dan rekening payroll tiap karyawan (PIN Superuser)',
      storageFile: 'data/payroll-db.json',
      exists: Boolean(payRaw && Array.isArray(payRaw.profiles)),
      recordCount: payRaw && Array.isArray(payRaw.profiles) ? payRaw.profiles.length : 0,
      requiredColumns: ['employee_id', 'base_salary', 'position_allowance', 'transport_meal_allowance', 'bank_account_number'],
    },
    {
      tableName: 'payroll_adjustments',
      firestoreCollection: '(server-protected)',
      module: 'Penggajian' as const,
      description: 'Bonus, tunjangan tambahan, dan potongan kasbon bulanan',
      storageFile: 'data/payroll-db.json',
      exists: Boolean(payRaw && Array.isArray(payRaw.adjustments)),
      recordCount: payRaw && Array.isArray(payRaw.adjustments) ? payRaw.adjustments.length : 0,
      requiredColumns: ['id', 'employee_id', 'year_month', 'type', 'title', 'amount'],
    },
    {
      tableName: 'payroll_raises',
      firestoreCollection: '(server-protected)',
      module: 'Penggajian' as const,
      description: 'Catatan riwayat kenaikan gaji karyawan',
      storageFile: 'data/payroll-db.json',
      exists: Boolean(payRaw && Array.isArray(payRaw.salaryRaises)),
      recordCount: payRaw && Array.isArray(payRaw.salaryRaises) ? payRaw.salaryRaises.length : 0,
      requiredColumns: ['id', 'employee_id', 'effective_month', 'method', 'previous_base_salary', 'new_base_salary'],
    },
    {
      tableName: 'payroll_statuses',
      firestoreCollection: '(server-protected)',
      module: 'Penggajian' as const,
      description: 'Status persetujuan & pembayaran slip gaji per bulan',
      storageFile: 'data/payroll-db.json',
      exists: Boolean(payRaw && Array.isArray(payRaw.statuses)),
      recordCount: payRaw && Array.isArray(payRaw.statuses) ? payRaw.statuses.length : 0,
      requiredColumns: ['id', 'employee_id', 'year_month', 'status', 'paid_at'],
    },
    {
      tableName: 'finance_accounts',
      firestoreCollection: 'financeAccounts',
      module: 'Keuangan' as const,
      description: 'Akun kas tunai & rekening bank perusahaan (BCA, BRI, Mandiri, dll)',
      storageFile: 'data/finance-db.json',
      exists: Boolean(finRaw && Array.isArray(finRaw.accounts) && finRaw.accounts.length > 0),
      recordCount: finRaw && Array.isArray(finRaw.accounts) ? finRaw.accounts.length : 0,
      requiredColumns: ['id', 'name', 'kind', 'bank_name', 'account_number', 'opening_balance'],
    },
    {
      tableName: 'finance_categories',
      firestoreCollection: 'financeCategories',
      module: 'Keuangan' as const,
      description: 'Kategori pendapatan dan pengeluaran perusahaan',
      storageFile: 'data/finance-db.json',
      exists: Boolean(finRaw && Array.isArray(finRaw.categories)),
      recordCount: finRaw && Array.isArray(finRaw.categories) ? finRaw.categories.length : 0,
      requiredColumns: ['id', 'name', 'type', 'description'],
    },
    {
      tableName: 'finance_transactions',
      firestoreCollection: 'financeTransactions',
      module: 'Keuangan' as const,
      description: 'Jurnal transaksi pendapatan & pengeluaran (cash & transfer)',
      storageFile: 'data/finance-db.json',
      exists: Boolean(finRaw && Array.isArray(finRaw.transactions)),
      recordCount: finRaw && Array.isArray(finRaw.transactions) ? finRaw.transactions.length : 0,
      requiredColumns: ['id', 'tx_date', 'type', 'method', 'category_id', 'account_id', 'title', 'amount'],
    },
    {
      tableName: 'finance_transfers',
      firestoreCollection: 'financeTransfers',
      module: 'Keuangan' as const,
      description: 'Catatan perpindahan dana antar kas tunai dan rekening bank',
      storageFile: 'data/finance-db.json',
      exists: Boolean(finRaw && Array.isArray(finRaw.transfers)),
      recordCount: finRaw && Array.isArray(finRaw.transfers) ? finRaw.transfers.length : 0,
      requiredColumns: ['id', 'transfer_date', 'from_account_id', 'to_account_id', 'amount'],
    },
    {
      tableName: 'security_config',
      firestoreCollection: '(server-protected)',
      module: 'Keamanan' as const,
      description: 'Hash SHA-256 PIN Mode Admin dan PIN Pengaturan Database',
      storageFile: 'data/security-config.json',
      exists: Boolean(secRaw && typeof secRaw.adminPinSha256 === 'string'),
      recordCount: secRaw ? 1 : 0,
      requiredColumns: ['id', 'admin_pin_sha256', 'database_pin_sha256', 'updated_at'],
    },
  ];
}

async function inspectAllDatabaseTablesLive() {
  const dbCfg = readDatabaseConfig();
  const localTables = inspectLocalDatabaseTables();

  if (dbCfg.engine !== 'supabase') {
    const tables = localTables.map((t) => ({
      ...t,
      localRecordCount: t.recordCount,
      remoteStatus: 'local' as const,
    }));
    const existingCount = tables.filter((t) => t.exists).length;
    const totalRecords = tables.reduce((s, t) => s + t.recordCount, 0);
    return {
      config: sanitizeDatabaseConfigForClient(dbCfg),
      tables,
      summary: {
        totalRequired: tables.length,
        existingCount,
        missingCount: tables.length - existingCount,
        totalRecords,
      },
    };
  }

  const apiKey = getEffectiveSupabaseSecretKey(dbCfg) || dbCfg.supabasePublishableKey;
  const probes = await Promise.all(
    localTables.map((t) => probeSupabaseTable(dbCfg.supabaseUrl, apiKey, t.tableName))
  );
  const probeMap = new Map(probes.map((p) => [p.tableName, p]));

  const anyReachable = probes.some((p) => p.status !== 'unreachable');
  const firstErr = probes.find((p) => p.error)?.error ?? null;

  const tables = localTables.map((t) => {
    const probe = probeMap.get(t.tableName);
    const remoteAvailable = probe?.status === 'available';
    return {
      ...t,
      storageFile: `supabase://${dbCfg.supabaseProjectId}/public/${t.tableName}`,
      exists: remoteAvailable,
      recordCount: remoteAvailable ? probe.recordCount : 0,
      localRecordCount: t.recordCount,
      remoteStatus: probe?.status ?? ('unreachable' as const),
    };
  });

  const existingCount = tables.filter((t) => t.exists).length;
  const totalRecords = tables.reduce((s, t) => s + t.recordCount, 0);

  return {
    config: sanitizeDatabaseConfigForClient(dbCfg, {
      supabaseConnected: anyReachable && existingCount === tables.length,
      supabaseLastError: existingCount === tables.length ? null : firstErr,
    }),
    tables,
    summary: {
      totalRequired: tables.length,
      existingCount,
      missingCount: tables.length - existingCount,
      totalRecords,
    },
  };
}

function ensureLocalFallbackFiles() {
  const localTables = inspectLocalDatabaseTables();
  const missingLocal = localTables.filter((t) => !t.exists).map((t) => t.tableName);
  if (missingLocal.some((n) => ['employees', 'attendance_records', 'late_settlements', 'app_settings'].includes(n))) {
    const db = readDb();
    writeDb(db);
  }
  if (missingLocal.some((n) => n.startsWith('payroll_'))) {
    const payrollDb = readPayrollDb();
    writePayrollDb(payrollDb);
  }
  if (missingLocal.some((n) => n.startsWith('finance_'))) {
    const finDb = readFinanceDb();
    writeFinanceDb(finDb);
  }
  if (missingLocal.includes('security_config')) {
    const secCfg = readSecurityConfig();
    writeSecurityConfig(secCfg);
  }
  return missingLocal;
}

async function autoInitializeMissingDatabaseTablesLive() {
  ensureLocalFallbackFiles();
  const before = await inspectAllDatabaseTablesLive();
  const missingNames = before.tables.filter((t) => !t.exists).map((t) => t.tableName);
  const existingNames = before.tables.filter((t) => t.exists).map((t) => t.tableName);
  const curCfg = readDatabaseConfig();
  const nowIso = new Date().toISOString();

  if (curCfg.engine === 'supabase') {
    const dbUrl = getEffectiveSupabaseDbUrl(curCfg);
    if (missingNames.length > 0 && dbUrl) {
      const ddlRes = await runSupabasePostgresDdl(dbUrl);
      if (!ddlRes.ok) {
        writeDatabaseConfig({ ...curCfg, lastCheckedAt: nowIso, updatedAt: nowIso });
        const after = await inspectAllDatabaseTablesLive();
        return {
          createdTables: [],
          alreadyExistingTables: existingNames,
          requiresManualSql: true,
          message: `Gagal menjalankan DDL otomatis via Postgres URI (${ddlRes.error}). Pastikan Connection String benar atau jalankan script SQL Supabase di SQL Editor.`,
          status: after,
        };
      }
      await pushAllLocalToSupabase();
      writeDatabaseConfig({
        ...curCfg,
        lastCheckedAt: nowIso,
        lastAutoInitAt: nowIso,
        updatedAt: nowIso,
      });
      const after = await inspectAllDatabaseTablesLive();
      const createdNow = missingNames.filter(
        (n) => after.tables.find((t) => t.tableName === n)?.exists
      );
      return {
        createdTables: createdNow,
        alreadyExistingTables: existingNames,
        requiresManualSql: false,
        message:
          createdNow.length > 0
            ? `${createdNow.length} tabel Supabase berhasil dibuat otomatis via PostgreSQL & seluruh data awal telah disinkronkan.`
            : 'Seluruh 14 tabel Supabase sudah tersedia dan aktif.',
        status: after,
      };
    }

    if (missingNames.length === 0) {
      await pushAllLocalToSupabase();
      writeDatabaseConfig({ ...curCfg, lastCheckedAt: nowIso, updatedAt: nowIso });
      const after = await inspectAllDatabaseTablesLive();
      return {
        createdTables: [],
        alreadyExistingTables: existingNames,
        requiresManualSql: false,
        message: 'Seluruh 14 tabel Supabase tersedia dan data berhasil disinkronkan.',
        status: after,
      };
    }

    writeDatabaseConfig({ ...curCfg, lastCheckedAt: nowIso, updatedAt: nowIso });
    return {
      createdTables: [],
      alreadyExistingTables: existingNames,
      requiresManualSql: true,
      message: `Terdeteksi ${missingNames.length} tabel belum tersedia di Supabase (${curCfg.supabaseProjectName}). API REST Supabase hanya mendukung CRUD dan tidak dapat membuat tabel tanpa Postgres Connection URI. Masukkan URI Postgres di tab "Koneksi & PIN Database" untuk buat otomatis, atau klik tab "Copy Script Setting Tabel" -> pilih "Supabase" lalu jalankan di Supabase SQL Editor.`,
      status: before,
    };
  }

  writeDatabaseConfig({
    ...curCfg,
    lastCheckedAt: nowIso,
    lastAutoInitAt: missingNames.length > 0 ? nowIso : curCfg.lastAutoInitAt,
    updatedAt: nowIso,
  });

  const after = await inspectAllDatabaseTablesLive();
  return {
    createdTables: missingNames,
    alreadyExistingTables: existingNames,
    requiresManualSql: false,
    message:
      missingNames.length > 0
        ? `${missingNames.length} tabel yang belum ada berhasil dibuat dan diinisialisasi otomatis.`
        : 'Seluruh 14 tabel yang dibutuhkan sudah tersedia dan valid.',
    status: after,
  };
}

async function bootHydrateFromSupabase(): Promise<void> {
  const cfg = readDatabaseConfig();
  if (cfg.engine !== 'supabase') return;
  try {
    const status = await inspectAllDatabaseTablesLive();
    if (status.summary.existingCount === status.summary.totalRequired) {
      if (status.summary.totalRecords > 0) {
        await pullAllSupabaseToLocal();
      } else {
        await pushAllLocalToSupabase();
      }
    } else if (cfg.autoCreateMissingTables && getEffectiveSupabaseDbUrl(cfg)) {
      await autoInitializeMissingDatabaseTablesLive();
    }
  } catch {
    // Keep server boot resilient even when Supabase is unreachable or uninitialized
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
  queueSupabaseSync('finance');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api')) {
        const status =
          typeof (err as { status?: unknown })?.status === 'number'
            ? (err as { status: number }).status
            : 400;
        const message =
          err instanceof Error
            ? err.message
            : 'Permintaan API tidak valid atau gagal diproses.';
        res.status(status).json({ error: message });
        return;
      }
      next(err);
    }
  );

  ensureLocalFallbackFiles();
  await Promise.race([
    bootHydrateFromSupabase(),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);

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

  const requireDatabaseAuth: express.RequestHandler = (req, res, next) => {
    cleanupExpiredDatabaseSessions();
    const token = String(req.headers['x-database-token'] || '');
    if (!token) {
      res.status(401).json({
        error: 'Akses pengaturan database terkunci. Masukkan PIN terlebih dahulu.',
      });
      return;
    }
    const session = activeDatabaseSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      activeDatabaseSessions.delete(token);
      res.status(401).json({
        error: 'Sesi pengaturan database telah berakhir. Masukkan kembali PIN.',
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
    const cleanCode = String(body.employeeCode || '').trim().toUpperCase().slice(0, 20);
    const cleanName = String(body.name || '').trim().slice(0, 100);
    if (!cleanName || !cleanCode) {
      res.status(400).json({ error: 'Nama dan kode karyawan wajib diisi.' });
      return;
    }
    const duplicateCode = db.employees.some(
      (e) => e.employeeCode.toLowerCase() === cleanCode.toLowerCase()
    );
    if (duplicateCode) {
      res.status(400).json({ error: `Kode karyawan "${cleanCode}" sudah digunakan.` });
      return;
    }
    const nowIso = new Date().toISOString();
    const id = body.id || `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEmp: EmployeeData = {
      id,
      employeeCode: cleanCode,
      name: cleanName,
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
    const nextCode =
      body.employeeCode !== undefined
        ? String(body.employeeCode).trim().toUpperCase().slice(0, 20)
        : existing.employeeCode;
    const nextName =
      body.name !== undefined ? String(body.name).trim().slice(0, 100) : existing.name;

    if (!nextCode || !nextName) {
      res.status(400).json({ error: 'Nama dan kode karyawan tidak boleh kosong.' });
      return;
    }
    const duplicateCode = db.employees.some(
      (e) => e.id !== id && e.employeeCode.toLowerCase() === nextCode.toLowerCase()
    );
    if (duplicateCode) {
      res.status(400).json({ error: `Kode karyawan "${nextCode}" sudah digunakan.` });
      return;
    }

    const updated: EmployeeData = {
      ...existing,
      employeeCode: nextCode,
      name: nextName,
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

    // Cascade name rename to attendance, settlements, and payroll records
    if (nextName !== existing.name) {
      db.attendanceRecords = db.attendanceRecords.map((r) =>
        r.employeeId === id ? { ...r, employeeName: nextName } : r
      );
      db.lateSettlements = db.lateSettlements.map((s) =>
        s.employeeId === id ? { ...s, employeeName: nextName } : s
      );
      const payrollDb = readPayrollDb();
      let payTouched = false;
      payrollDb.profiles = payrollDb.profiles.map((p) => {
        if (p.employeeId === id && p.bankAccountHolder === existing.name) {
          payTouched = true;
          return { ...p, bankAccountHolder: nextName };
        }
        return p;
      });
      payrollDb.adjustments = payrollDb.adjustments.map((a) => {
        if (a.employeeId === id) {
          payTouched = true;
          return { ...a, employeeName: nextName };
        }
        return a;
      });
      payrollDb.salaryRaises = payrollDb.salaryRaises.map((sr) => {
        if (sr.employeeId === id) {
          payTouched = true;
          return { ...sr, employeeName: nextName };
        }
        return sr;
      });
      if (payTouched) {
        writePayrollDb(payrollDb);
      }
    }

    writeDb(db);
    res.json(updated);
  });

  app.delete('/api/employees/:id', (req, res) => {
    const db = readDb();
    const { id } = req.params;
    const exists = db.employees.some((e) => e.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
      return;
    }
    db.employees = db.employees.filter((e) => e.id !== id);
    db.attendanceRecords = db.attendanceRecords.filter((r) => r.employeeId !== id);
    db.lateSettlements = db.lateSettlements.filter((s) => s.employeeId !== id);
    writeDb(db);

    const payrollDb = readPayrollDb();
    const hadPayroll =
      payrollDb.profiles.some((p) => p.employeeId === id) ||
      payrollDb.adjustments.some((a) => a.employeeId === id) ||
      payrollDb.salaryRaises.some((r) => r.employeeId === id) ||
      payrollDb.statuses.some((s) => s.employeeId === id);
    if (hadPayroll) {
      payrollDb.profiles = payrollDb.profiles.filter((p) => p.employeeId !== id);
      payrollDb.adjustments = payrollDb.adjustments.filter((a) => a.employeeId !== id);
      payrollDb.salaryRaises = payrollDb.salaryRaises.filter((r) => r.employeeId !== id);
      payrollDb.statuses = payrollDb.statuses.filter((s) => s.employeeId !== id);
      writePayrollDb(payrollDb);
    }

    void deleteSupabaseRowById('employees', id);
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
    const dateStr = String(body.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: 'Format tanggal absensi harus YYYY-MM-DD.' });
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

    // Enforce 1 attendance record per (employeeId, date) via upsert
    const existingIdx = db.attendanceRecords.findIndex(
      (r) => r.employeeId === emp.id && r.date === dateStr
    );
    if (existingIdx >= 0) {
      const existing = db.attendanceRecords[existingIdx];
      const updatedRecord: AttendanceData = {
        ...existing,
        employeeName: emp.name,
        status: body.status,
        checkIn: needsTime ? String(body.checkIn || '') : '',
        checkOut: needsTime ? String(body.checkOut || '') : '',
        overtimeHours: Math.max(0, Math.min(16, Number(body.overtimeHours || 0))),
        notes: String(body.notes || '').trim().slice(0, 300),
        latePermitReason: isLatePermit
          ? String(body.latePermitReason || '').trim().slice(0, 200)
          : undefined,
        latePermitEstimatedArrival: isLatePermit
          ? String(body.latePermitEstimatedArrival || '').trim().slice(0, 5)
          : undefined,
        latePermitApprovedBy: isLatePermit
          ? String(body.latePermitApprovedBy || 'Admin HR').trim().slice(0, 80)
          : undefined,
        recordedBy: 'Admin HR',
        updatedAt: nowIso,
      };
      db.attendanceRecords[existingIdx] = updatedRecord;
      writeDb(db);
      res.status(200).json(updatedRecord);
      return;
    }

    const record: AttendanceData = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      date: dateStr,
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
    void deleteSupabaseRowById('attendance_records', id);
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
    void deleteSupabaseRowById('late_settlements', id);
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
    const prevSec = readSecurityConfig();
    writeSecurityConfig({
      ...prevSec,
      adminPinSha256: hashPinSha256(cleanNew),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  // Protected Database Settings Routes (PIN-gated)
  app.post('/api/database/unlock', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const tracker = databasePinAttemptTracker.get(clientIp);
    if (tracker && tracker.lockedUntil > now) {
      const waitSeconds = Math.ceil((tracker.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `Terlalu banyak percobaan PIN database salah. Coba lagi dalam ${waitSeconds} detik.`,
      });
      return;
    }

    const { pin } = (req.body || {}) as { pin?: string };
    if (!verifyDatabasePin(pin || '')) {
      const prevCount = tracker && tracker.lockedUntil <= now ? tracker.count : 0;
      const nextCount = prevCount + 1;
      if (nextCount >= MAX_PIN_ATTEMPTS) {
        databasePinAttemptTracker.set(clientIp, {
          count: 0,
          lockedUntil: now + PIN_LOCKOUT_MS,
        });
        res.status(429).json({
          error: 'PIN database salah 5 kali. Akses ditahan selama 30 detik.',
        });
        return;
      }
      databasePinAttemptTracker.set(clientIp, { count: nextCount, lockedUntil: 0 });
      res.status(401).json({
        error: 'PIN pengaturan database tidak valid.',
      });
      return;
    }

    databasePinAttemptTracker.delete(clientIp);
    cleanupExpiredDatabaseSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + PAYROLL_TOKEN_TTL_MS;
    activeDatabaseSessions.set(token, { expiresAt });
    res.json({ token, expiresAt });
  });

  app.post('/api/database/lock', (req, res) => {
    const token = String(req.headers['x-database-token'] || '');
    if (token) {
      activeDatabaseSessions.delete(token);
    }
    res.json({ ok: true });
  });

  app.put('/api/database/pin', requireDatabaseAuth, (req, res) => {
    const { currentPin, newPin } = (req.body || {}) as {
      currentPin?: string;
      newPin?: string;
    };
    if (!verifyDatabasePin(currentPin || '')) {
      res.status(401).json({
        error: 'PIN database saat ini tidak sesuai.',
      });
      return;
    }
    const cleanNew = String(newPin || '').trim();
    if (cleanNew.length < 4 || cleanNew.length > 20) {
      res.status(400).json({
        error: 'PIN database baru harus terdiri dari 4 hingga 20 karakter.',
      });
      return;
    }
    const prevSec = readSecurityConfig();
    writeSecurityConfig({
      ...prevSec,
      databasePinSha256: hashPinSha256(cleanNew),
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  app.get('/api/database/status', requireDatabaseAuth, async (_req, res) => {
    const nowIso = new Date().toISOString();
    const cfg = readDatabaseConfig();
    writeDatabaseConfig({ ...cfg, lastCheckedAt: nowIso });
    const status = await inspectAllDatabaseTablesLive();
    res.json(status);
  });

  app.post('/api/database/auto-init', requireDatabaseAuth, async (_req, res) => {
    const result = await autoInitializeMissingDatabaseTablesLive();
    res.json(result);
  });

  app.post('/api/database/supabase/test', requireDatabaseAuth, async (_req, res) => {
    const startedAt = Date.now();
    const cfg = readDatabaseConfig();
    const status = await inspectAllDatabaseTablesLive();
    const latencyMs = Date.now() - startedAt;

    const existingTablesCount = status.summary.existingCount;
    const missingTablesCount = status.tables.filter(
      (t) => t.remoteStatus === 'missing'
    ).length;
    const rlsBlockedCount = status.tables.filter(
      (t) => t.remoteStatus === 'rls_blocked'
    ).length;
    const reachable = status.tables.some((t) => t.remoteStatus !== 'unreachable');
    const hasDbUrl = Boolean(getEffectiveSupabaseDbUrl(cfg));

    let message = '';
    if (!reachable) {
      message = `Tidak dapat menjangkau endpoint Supabase (${cfg.supabaseUrl}). Periksa URL dan koneksi internet server.`;
    } else if (existingTablesCount === status.summary.totalRequired) {
      message = `Terhubung penuh ke Supabase Project "${cfg.supabaseProjectName}" (${cfg.supabaseProjectId}) dalam ${latencyMs} ms — seluruh 14 tabel siap digunakan.`;
    } else if (rlsBlockedCount > 0) {
      message = `Supabase terjangkau (${latencyMs} ms), namun ${rlsBlockedCount} tabel terblokir RLS/policy dan ${missingTablesCount} tabel belum ada. Jalankan script SQL + RLS Supabase di SQL Editor.`;
    } else {
      message = `Koneksi ke Supabase (${cfg.supabaseProjectName}) berhasil (${latencyMs} ms), namun ${missingTablesCount} dari 14 tabel belum dibuat di schema public. Klik "Buat Tabel Otomatis" (jika URI Postgres terisi) atau salin & jalankan Script SQL Supabase.`;
    }

    res.json({
      ok: reachable && existingTablesCount === status.summary.totalRequired,
      reachable,
      latencyMs,
      projectName: cfg.supabaseProjectName,
      projectId: cfg.supabaseProjectId,
      projectUrl: cfg.supabaseUrl,
      restUrl: `${cfg.supabaseUrl}/rest/v1/`,
      existingTablesCount,
      missingTablesCount,
      rlsBlockedCount,
      hasDbUrl,
      message,
      status,
    });
  });

  app.post('/api/database/supabase/sync', requireDatabaseAuth, async (req, res) => {
    const body = (req.body || {}) as { direction?: 'push' | 'pull' };
    const direction = body.direction === 'pull' ? 'pull' : 'push';
    const result =
      direction === 'pull'
        ? await pullAllSupabaseToLocal()
        : await pushAllLocalToSupabase();
    const status = await inspectAllDatabaseTablesLive();
    const ok = result.failedTables.length === 0;
    const totalSyncedRows = result.syncedTables.reduce((s, t) => s + t.rowCount, 0);
    const message = ok
      ? direction === 'push'
        ? `Sinkronisasi Push berhasil: ${result.syncedTables.length} tabel (${totalSyncedRows} baris) tersimpan ke Supabase.`
        : `Sinkronisasi Pull berhasil: data terbaru dari ${result.syncedTables.length} tabel Supabase dimuat ke server.`
      : `Sinkronisasi ${direction.toUpperCase()} sebagian gagal pada ${result.failedTables.length} tabel (${result.failedTables[0]?.tableName}: ${result.failedTables[0]?.error}).`;

    res.status(ok ? 200 : 400).json({
      ok,
      direction,
      syncedTables: result.syncedTables,
      failedTables: result.failedTables,
      message,
      status,
    });
  });

  app.put('/api/database/config', requireDatabaseAuth, async (req, res) => {
    const body = (req.body || {}) as Partial<DatabaseConnectionConfigData> & {
      supabaseSecretKey?: string;
      supabaseDbUrl?: string;
      clearSupabaseSecrets?: boolean;
    };
    const current = readDatabaseConfig();
    const validEngines: ServerDbEngine[] = [
      'supabase',
      'local-json',
      'firestore',
      'postgresql',
      'mysql',
      'sqlite',
    ];
    const validSsl = ['disable', 'require', 'verify-full'] as const;
    const nextSupabaseUrl =
      body.supabaseUrl !== undefined
        ? normalizeSupabaseUrl(String(body.supabaseUrl))
        : current.supabaseUrl;
    const nextProjectId =
      body.supabaseProjectId !== undefined && String(body.supabaseProjectId).trim()
        ? String(body.supabaseProjectId).trim().slice(0, 60)
        : body.supabaseUrl !== undefined
        ? extractSupabaseProjectId(nextSupabaseUrl)
        : current.supabaseProjectId;

    const nextCfg: DatabaseConnectionConfigData = {
      ...current,
      engine: validEngines.includes(body.engine as ServerDbEngine)
        ? (body.engine as ServerDbEngine)
        : current.engine,
      host:
        body.host !== undefined
          ? String(body.host).trim().slice(0, 120) || current.host
          : current.host,
      port:
        body.port !== undefined && Number.isFinite(Number(body.port)) && Number(body.port) > 0
          ? Math.min(65535, Math.round(Number(body.port)))
          : current.port,
      databaseName:
        body.databaseName !== undefined
          ? String(body.databaseName).trim().slice(0, 80) || current.databaseName
          : current.databaseName,
      schemaName:
        body.schemaName !== undefined
          ? String(body.schemaName).trim().slice(0, 60) || current.schemaName
          : current.schemaName,
      tablePrefix:
        body.tablePrefix !== undefined
          ? String(body.tablePrefix).trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
          : current.tablePrefix,
      username:
        body.username !== undefined
          ? String(body.username).trim().slice(0, 80)
          : current.username,
      sslMode: validSsl.includes(body.sslMode as (typeof validSsl)[number])
        ? (body.sslMode as (typeof validSsl)[number])
        : current.sslMode,
      autoCreateMissingTables:
        body.autoCreateMissingTables !== undefined
          ? Boolean(body.autoCreateMissingTables)
          : current.autoCreateMissingTables,
      supabaseProjectName:
        body.supabaseProjectName !== undefined
          ? String(body.supabaseProjectName).trim().slice(0, 80) || current.supabaseProjectName
          : current.supabaseProjectName,
      supabaseProjectId: nextProjectId,
      supabaseUrl: nextSupabaseUrl,
      supabasePublishableKey:
        body.supabasePublishableKey !== undefined
          ? String(body.supabasePublishableKey).trim().slice(0, 300) || current.supabasePublishableKey
          : current.supabasePublishableKey,
      supabaseSecretKey: body.clearSupabaseSecrets
        ? undefined
        : body.supabaseSecretKey !== undefined && String(body.supabaseSecretKey).trim()
        ? String(body.supabaseSecretKey).trim().slice(0, 300)
        : current.supabaseSecretKey,
      supabaseDbUrl: body.clearSupabaseSecrets
        ? undefined
        : body.supabaseDbUrl !== undefined && String(body.supabaseDbUrl).trim()
        ? String(body.supabaseDbUrl).trim().slice(0, 400)
        : current.supabaseDbUrl,
      updatedAt: new Date().toISOString(),
    };
    writeDatabaseConfig(nextCfg);
    if (nextCfg.autoCreateMissingTables) {
      await autoInitializeMissingDatabaseTablesLive();
    }
    const liveStatus = await inspectAllDatabaseTablesLive();
    res.json(liveStatus.config);
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
    void deleteSupabaseRowById('payroll_adjustments', id);
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
    void deleteSupabaseRowById('payroll_raises', id);
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
    void deleteSupabaseRowById('finance_categories', id);
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
    void deleteSupabaseRowById('finance_accounts', id);
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
    void deleteSupabaseRowById('finance_transfers', id);
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
    if (cat.type !== body.type) {
      res.status(400).json({
        error: `Kategori "${cat.name}" adalah kategori ${cat.type}, tidak cocok dengan jenis transaksi ${body.type}.`,
      });
      return;
    }
    const targetKind: 'cash' | 'rekening' = body.method === 'cash' ? 'cash' : 'rekening';
    const candidateAccount = body.accountId
      ? finDb.accounts.find((a) => a.id === body.accountId && a.kind === targetKind)
      : undefined;
    const matchedAccount =
      candidateAccount || finDb.accounts.find((a) => a.kind === targetKind);
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
    if (cat.type !== nextType) {
      res.status(400).json({
        error: `Kategori "${cat.name}" adalah kategori ${cat.type}, tidak sesuai dengan jenis ${nextType}.`,
      });
      return;
    }
    const nextAmount =
      body.amount !== undefined ? Math.round(Number(body.amount || 0)) : existing.amount;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > 100000000000) {
      res.status(400).json({ error: 'Nominal transaksi harus lebih dari Rp 0.' });
      return;
    }

    const targetKind: 'cash' | 'rekening' = nextMethod === 'cash' ? 'cash' : 'rekening';
    const nextAccountId =
      body.accountId !== undefined ? body.accountId : existing.accountId;
    const candidateAccount = nextAccountId
      ? finDb.accounts.find((a) => a.id === nextAccountId)
      : undefined;
    const matchedAccount =
      candidateAccount && candidateAccount.kind === targetKind
        ? candidateAccount
        : finDb.accounts.find((a) => a.kind === targetKind);
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
      accountId: matchedAccount?.id,
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
    void deleteSupabaseRowById('finance_transactions', id);
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

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'express' });
  });

  // Ensure unmatched /api/* routes ALWAYS return JSON (never index.html)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan internal pada server API.';
      res.status(500).json({ error: message });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          next();
          return;
        }
        const indexHtml = path.join(distPath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          res.sendFile(indexHtml);
        } else {
          res.status(404).json({ error: 'Build frontend tidak ditemukan.' });
        }
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KaryaPresensi server running at http://localhost:${PORT}`);
  });
}

startServer();
