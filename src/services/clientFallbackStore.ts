import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
  CompanyBranch,
  CompanyProfile,
  DatabaseAutoInitResult,
  DatabaseConnectionConfig,
  DatabaseSchemaStatusResponse,
  DatabaseTableStatus,
  Employee,
  EmployeeSalaryProfile,
  FinanceAccount,
  FinanceAccountKind,
  FinanceCategory,
  FinanceDatabaseState,
  FinancePaymentMethod,
  FinanceTransaction,
  FinanceTransactionType,
  FinanceTransfer,
  LateSettlement,
  LateSettlementMethod,
  packNotesWithShift,
  PayrollAdjustment,
  PayrollAdjustmentType,
  PayrollDatabaseState,
  PayrollMonthlyStatus,
  PayrollRecordStatus,
  PayrollSettings,
  SalaryRaiseMethod,
  SalaryRaiseRecord,
  ShiftConfig,
  SupabaseSyncResult,
  SupabaseTestResult,
  unpackShiftFromNotes,
} from '../types';
import { FIREBASE_APPLET_META } from './firebaseClient';
import { HttpApiError } from './apiClient';

export interface ClientAppDatabaseState {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  settings: AppSettings;
}

interface SecurityConfigStore {
  adminPinSha256: string;
  databasePinSha256?: string;
  updatedAt: string;
}

interface SessionStoreMap {
  admin: Record<string, number>;
  payroll: Record<string, number>;
  database: Record<string, number>;
}

const DEFAULT_ADMIN_PIN_SHA256 =
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
const SUPERUSER_PIN_SHA256 =
  'b9196683c40dd7cecb4dfc8ffc9ed64d4bc192f126d9d771706e791726582b26';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const DEFAULT_SUPABASE_PROJECT_NAME = 'Absensi';
const DEFAULT_SUPABASE_PROJECT_ID = 'jeewhluiufosnourqvje';
const DEFAULT_SUPABASE_URL = 'https://jeewhluiufosnourqvje.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_y7OmGDoZSCuffUn6uJIwZQ_xXszVLT7';

const LS_ATTENDANCE_KEY = 'karyapresensi_client_db_v1';
const LS_PAYROLL_KEY = 'karyapresensi_client_payroll_v1';
const LS_FINANCE_KEY = 'karyapresensi_client_finance_v1';
const LS_SECURITY_KEY = 'karyapresensi_client_security_v1';
const LS_DBCFG_KEY = 'karyapresensi_client_dbcfg_v1';
const LS_SESSIONS_KEY = 'karyapresensi_client_sessions_v1';

const memoryStorageFallback = new Map<string, string>();

function readStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // ignore storage access failure
  }
  return memoryStorageFallback.get(key) ?? null;
}

function writeStorageItem(key: string, value: string): void {
  memoryStorageFallback.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore quota or privacy mode failure
  }
}

function sha256PureJs(ascii: string): string {
  const bytes = new TextEncoder().encode(ascii);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - (bitLen % 32)));
  const totalWords = (((bitLen + 64) >> 9) + 1) << 4;
  while (words.length < totalWords) words.push(0);
  words[totalWords - 2] = Math.floor(bitLen / 0x100000000);
  words[totalWords - 1] = bitLen >>> 0;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const rrot = (val: number, n: number) => (val >>> n) | (val << (32 - n));

  const w = new Array<number>(64);
  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, hh] = h;
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] || 0;
      } else {
        const s0 = rrot(w[j - 15], 7) ^ rrot(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rrot(w[j - 2], 17) ^ rrot(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  return h.map((val) => (val >>> 0).toString(16).padStart(8, '0')).join('');
}

async function sha256Hex(raw: string): Promise<string> {
  const normalized = String(raw || '').trim();
  try {
    if (typeof globalThis.crypto?.subtle?.digest === 'function') {
      const encoded = new TextEncoder().encode(normalized);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback to pure JS sha256
  }
  return sha256PureJs(normalized);
}

function generateClientToken(prefix: string): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}_${rand}`;
}

function formatDateLocal(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDefaultCompanyProfile(): CompanyProfile {
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

function buildDefaultSettings(): AppSettings {
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

function normalizeCompanyProfile(
  rawProfile: Partial<CompanyProfile> | undefined
): CompanyProfile {
  const def = buildDefaultCompanyProfile();
  if (!rawProfile || typeof rawProfile !== 'object') return def;
  const rawLogo = typeof rawProfile.logoDataUrl === 'string' ? rawProfile.logoDataUrl : '';
  const safeLogo =
    rawLogo === '' || (rawLogo.startsWith('data:image/') && rawLogo.length <= 750000)
      ? rawLogo
      : def.logoDataUrl;
  const branches: CompanyBranch[] = Array.isArray(rawProfile.branches)
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

function normalizeSettings(rawSettings: Partial<AppSettings> | undefined): AppSettings {
  const defaults = buildDefaultSettings();
  if (!rawSettings || typeof rawSettings !== 'object') return defaults;
  const normalizeDailyMembers = (
    rawMap: unknown
  ): Record<string, string[]> | undefined => {
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return undefined;
    const out: Record<string, string[]> = {};
    let hasKeys = false;
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(k) || !Array.isArray(v)) continue;
      out[k] = Array.from(
        new Set(v.map((id) => String(id || '').trim()).filter(Boolean))
      ).slice(0, 500);
      hasKeys = true;
    }
    return hasKeys ? out : undefined;
  };

  const shifts: ShiftConfig[] =
    Array.isArray(rawSettings.shifts) && rawSettings.shifts.length > 0
      ? rawSettings.shifts.map((s, idx) => {
          const dailyMemberIds = normalizeDailyMembers(s.dailyMemberIds);
          return {
            id: String(s.id || `shift_${idx + 1}`),
            name: String(s.name || `Shift ${idx + 1}`).trim().slice(0, 40),
            startTime: String(s.startTime || '08:00'),
            endTime: String(s.endTime || '17:00'),
            lateToleranceMinutes: Math.max(0, Math.min(120, Number(s.lateToleranceMinutes ?? 10))),
            ...(dailyMemberIds ? { dailyMemberIds } : {}),
          };
        })
      : defaults.shifts;

  return {
    companyName:
      String(rawSettings.companyName || defaults.companyName).trim().slice(0, 60) ||
      defaults.companyName,
    companySubtitle:
      String(rawSettings.companySubtitle || defaults.companySubtitle).trim().slice(0, 60) ||
      defaults.companySubtitle,
    lateDeductionPerMinute: Math.max(
      0,
      Math.min(1000000, Number(rawSettings.lateDeductionPerMinute ?? defaults.lateDeductionPerMinute))
    ),
    shifts,
    companyProfile: normalizeCompanyProfile(rawSettings.companyProfile),
  };
}

function buildSeedDatabase(): ClientAppDatabaseState {
  const now = new Date();
  const nowIso = now.toISOString();
  const employees: Employee[] = [
    {
      id: 'emp_rina_putri',
      employeeCode: 'KRY-101',
      name: 'Rina Putri Maharani',
      department: 'Layanan Pelanggan',
      position: 'Koordinator CS',
      shiftName: 'Shift Pagi',
      shiftStart: '08:00',
      shiftEnd: '17:00',
      offDays: [1],
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
      offDays: [2],
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
      offDays: [3],
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
      offDays: [4],
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
      offDays: [5],
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
      offDays: [6],
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
      offDays: [0, 6],
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
      offDays: [0],
      customOffDates: [],
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const attendanceRecords: AttendanceRecord[] = [];
  let seq = 1;
  for (let offset = 6; offset >= 0; offset--) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - offset);
    const dateStr = formatDateLocal(dt);
    const dow = dt.getDay();

    employees.forEach((emp, idx) => {
      const isOff = emp.offDays.includes(dow);
      if (offset === 0 && !isOff && idx >= 4) return;
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
        attendanceRecords.push({
          id: `att_seed_${seq++}`,
          employeeId: emp.id,
          employeeName: emp.name,
          date: dateStr,
          status: 'hadir',
          checkIn: emp.shiftStart,
          checkOut:
            offset === 0
              ? ''
              : `${String(outHour).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
          overtimeHours: otHours,
          notes:
            otHours > 0
              ? `Lembur manual ${otHours} jam (tutup buku/inventaris)`
              : 'Hadir sesuai jadwal shift',
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

function buildDefaultPayrollSettings(): PayrollSettings {
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
  raw: Partial<PayrollSettings> | undefined
): PayrollSettings {
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

function buildInitialPayrollDb(employees: Employee[]): PayrollDatabaseState {
  const nowIso = new Date().toISOString();
  const profiles: EmployeeSalaryProfile[] = employees.map((emp, idx) => {
    const posLower = emp.position.toLowerCase();
    let base = 4400000;
    let posAllowance = 450000;
    if (
      posLower.includes('supervisor') ||
      posLower.includes('koordinator') ||
      posLower.includes('kepala')
    ) {
      base = 5600000;
      posAllowance = 950000;
    } else if (
      posLower.includes('teknisi') ||
      posLower.includes('payroll') ||
      posLower.includes('spesialis')
    ) {
      base = 4900000;
      posAllowance = 650000;
    }
    const banks = ['BCA', 'Mandiri', 'BNI', 'BRI'];
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
      bankName: banks[idx % banks.length],
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

function formatFinanceAccountDisplay(acc: FinanceAccount): string {
  if (acc.kind === 'cash') return acc.name;
  const parts = [
    acc.bankName,
    acc.accountNumber && acc.accountNumber !== '-' ? acc.accountNumber : '',
  ]
    .filter(Boolean)
    .join(' ');
  return parts ? `${acc.name} (${parts})` : acc.name;
}

function buildDefaultFinanceAccounts(nowIso: string): FinanceAccount[] {
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

function normalizeFinanceDb(parsed: Partial<FinanceDatabaseState>): FinanceDatabaseState {
  const nowIso = new Date().toISOString();
  const accounts: FinanceAccount[] =
    Array.isArray(parsed.accounts) && parsed.accounts.length > 0
      ? parsed.accounts
      : buildDefaultFinanceAccounts(nowIso);
  const defaultCashAcc = accounts.find((a) => a.kind === 'cash') || accounts[0];
  const defaultBankAcc = accounts.find((a) => a.kind === 'rekening') || accounts[0];

  const transactions: FinanceTransaction[] = Array.isArray(parsed.transactions)
    ? parsed.transactions.map((tx) => {
        if (tx.accountId && accounts.some((a) => a.id === tx.accountId)) return tx;
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
              (label.includes(a.bankName.toLowerCase()) || label.includes(a.name.toLowerCase()))
          ) || defaultBankAcc;
        return {
          ...tx,
          accountId: matchedAcc?.id,
          bankAccount:
            tx.bankAccount || (matchedAcc ? formatFinanceAccountDisplay(matchedAcc) : 'Transfer Bank'),
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

function buildDefaultFinanceDb(): FinanceDatabaseState {
  const now = new Date();
  const nowIso = now.toISOString();
  const ym = formatDateLocal(now).slice(0, 7);
  const accounts = buildDefaultFinanceAccounts(nowIso);
  const categories: FinanceCategory[] = [
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
  const transactions: FinanceTransaction[] = [
    {
      id: 'ftx_seed_1',
      date: `${ym}-02`,
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
      date: `${ym}-05`,
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
      date: `${ym}-08`,
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
      date: `${ym}-12`,
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
      date: `${ym}-15`,
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
      date: formatDateLocal(now),
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

function buildDefaultDatabaseConfig(): DatabaseConnectionConfig {
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
    hasCustomDatabasePin: false,
    firestoreProjectId: FIREBASE_APPLET_META.projectId,
    firestoreDatabaseId: FIREBASE_APPLET_META.firestoreDatabaseId,
    supabaseProjectName: DEFAULT_SUPABASE_PROJECT_NAME,
    supabaseProjectId: DEFAULT_SUPABASE_PROJECT_ID,
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseRestUrl: `${DEFAULT_SUPABASE_URL}/rest/v1/`,
    supabasePublishableKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    hasSupabaseSecretKey: false,
    hasSupabaseDbUrl: false,
    lastCheckedAt: null,
    lastAutoInitAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function readDbConfig(): DatabaseConnectionConfig {
  const def = buildDefaultDatabaseConfig();
  const raw = readStorageItem(LS_DBCFG_KEY);
  if (!raw) {
    writeStorageItem(LS_DBCFG_KEY, JSON.stringify(def));
    return def;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DatabaseConnectionConfig>;
    return {
      ...def,
      ...parsed,
      supabaseUrl: (parsed.supabaseUrl || def.supabaseUrl || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, ''),
      supabaseRestUrl: `${(parsed.supabaseUrl || def.supabaseUrl || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '')}/rest/v1/`,
      supabasePublishableKey: parsed.supabasePublishableKey || def.supabasePublishableKey,
      firestoreProjectId: FIREBASE_APPLET_META.projectId,
      firestoreDatabaseId: FIREBASE_APPLET_META.firestoreDatabaseId,
    };
  } catch {
    return def;
  }
}

function writeDbConfig(cfg: DatabaseConnectionConfig): void {
  writeStorageItem(LS_DBCFG_KEY, JSON.stringify(cfg));
}

function readSecurityCfg(): SecurityConfigStore {
  const raw = readStorageItem(LS_SECURITY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<SecurityConfigStore>;
      if (typeof parsed.adminPinSha256 === 'string' && /^[a-f0-9]{64}$/i.test(parsed.adminPinSha256)) {
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
      // fall through
    }
  }
  const init: SecurityConfigStore = {
    adminPinSha256: DEFAULT_ADMIN_PIN_SHA256,
    updatedAt: new Date().toISOString(),
  };
  writeStorageItem(LS_SECURITY_KEY, JSON.stringify(init));
  return init;
}

function writeSecurityCfg(cfg: SecurityConfigStore): void {
  writeStorageItem(LS_SECURITY_KEY, JSON.stringify(cfg));
  void syncSecurityToSupabaseBrowser(cfg);
}

function readSessions(): SessionStoreMap {
  const empty: SessionStoreMap = { admin: {}, payroll: {}, database: {} };
  const raw = readStorageItem(LS_SESSIONS_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionStoreMap>;
    const now = Date.now();
    const prune = (m?: Record<string, number>) => {
      const out: Record<string, number> = {};
      if (!m || typeof m !== 'object') return out;
      for (const [k, exp] of Object.entries(m)) {
        if (typeof exp === 'number' && exp > now) out[k] = exp;
      }
      return out;
    };
    return {
      admin: prune(parsed.admin),
      payroll: prune(parsed.payroll),
      database: prune(parsed.database),
    };
  } catch {
    return empty;
  }
}

function writeSessions(s: SessionStoreMap): void {
  writeStorageItem(LS_SESSIONS_KEY, JSON.stringify(s));
}

function issueClientSession(scope: keyof SessionStoreMap, prefix: string): {
  token: string;
  expiresAt: number;
} {
  const sessions = readSessions();
  const token = generateClientToken(prefix);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions[scope][token] = expiresAt;
  writeSessions(sessions);
  return { token, expiresAt };
}

function revokeClientSession(scope: keyof SessionStoreMap, token: string): void {
  if (!token) return;
  const sessions = readSessions();
  delete sessions[scope][token];
  writeSessions(sessions);
}

function requireClientSession(
  scope: keyof SessionStoreMap,
  token: string,
  missingMsg: string,
  expiredMsg: string
): void {
  if (!token) {
    throw new HttpApiError(401, missingMsg);
  }
  const sessions = readSessions();
  const exp = sessions[scope][token];
  if (!exp || exp <= Date.now()) {
    delete sessions[scope][token];
    writeSessions(sessions);
    throw new HttpApiError(401, expiredMsg);
  }
  sessions[scope][token] = Date.now() + SESSION_TTL_MS;
  writeSessions(sessions);
}

function readAttendanceDbSync(): ClientAppDatabaseState {
  const raw = readStorageItem(LS_ATTENDANCE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ClientAppDatabaseState>;
      if (Array.isArray(parsed.employees) && Array.isArray(parsed.attendanceRecords)) {
        return {
          employees: parsed.employees,
          attendanceRecords: parsed.attendanceRecords,
          lateSettlements: Array.isArray(parsed.lateSettlements) ? parsed.lateSettlements : [],
          settings: normalizeSettings(parsed.settings),
        };
      }
    } catch {
      // fall back to seed
    }
  }
  const seed = buildSeedDatabase();
  writeStorageItem(LS_ATTENDANCE_KEY, JSON.stringify(seed));
  return seed;
}

let attendanceSyncQueue: Promise<void> = Promise.resolve();

function writeAttendanceDbSync(db: ClientAppDatabaseState): void {
  writeStorageItem(LS_ATTENDANCE_KEY, JSON.stringify(db));
  attendanceSyncQueue = attendanceSyncQueue
    .then(async () => {
      const latest = readAttendanceDbSync();
      await syncAttendanceToSupabaseBrowser(latest);
    })
    .catch(() => {
      // non-blocking serialized sync
    });
}

function readPayrollDbSync(): PayrollDatabaseState {
  const raw = readStorageItem(LS_PAYROLL_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PayrollDatabaseState>;
      return {
        settings: normalizePayrollSettings(parsed.settings),
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
        salaryRaises: Array.isArray(parsed.salaryRaises) ? parsed.salaryRaises : [],
        statuses: Array.isArray(parsed.statuses) ? parsed.statuses : [],
      };
    } catch {
      // fall through
    }
  }
  const mainDb = readAttendanceDbSync();
  const seed = buildInitialPayrollDb(mainDb.employees);
  writeStorageItem(LS_PAYROLL_KEY, JSON.stringify(seed));
  return seed;
}

function writePayrollDbSync(db: PayrollDatabaseState): void {
  writeStorageItem(LS_PAYROLL_KEY, JSON.stringify(db));
  void syncPayrollToSupabaseBrowser(db);
}

function readFinanceDbSync(): FinanceDatabaseState {
  const raw = readStorageItem(LS_FINANCE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<FinanceDatabaseState>;
      if (Array.isArray(parsed.categories) && Array.isArray(parsed.transactions)) {
        return normalizeFinanceDb(parsed);
      }
    } catch {
      // fall through
    }
  }
  const seed = buildDefaultFinanceDb();
  writeStorageItem(LS_FINANCE_KEY, JSON.stringify(seed));
  return seed;
}

function writeFinanceDbSync(db: FinanceDatabaseState): void {
  writeStorageItem(LS_FINANCE_KEY, JSON.stringify(db));
  void syncFinanceToSupabaseBrowser(db);
}

function getBrowserSupabaseClient(cfg?: DatabaseConnectionConfig): SupabaseClient | null {
  const activeCfg = cfg || readDbConfig();
  if (activeCfg.engine !== 'supabase' || !activeCfg.supabaseUrl || !activeCfg.supabasePublishableKey) {
    return null;
  }
  return createClient(activeCfg.supabaseUrl, activeCfg.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertBrowserSupabase(
  sb: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<{ rowCount: number; error?: string }> {
  if (rows.length === 0) return { rowCount: 0 };
  let total = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await sb.from(table).upsert(batch, { onConflict });
    if (error) {
      return { rowCount: total, error: error.message };
    }
    total += batch.length;
  }
  return { rowCount: total };
}

async function deleteBrowserSupabaseRow(table: string, id: string): Promise<void> {
  try {
    const sb = getBrowserSupabaseClient();
    if (!sb) return;
    await sb.from(table).delete().eq('id', id);
  } catch {
    // non-blocking remote delete
  }
}

async function syncAttendanceToSupabaseBrowser(db: ClientAppDatabaseState): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const sb = getBrowserSupabaseClient();
  if (!sb) return { synced: [], failed: [] };
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  try {
    const r1 = await upsertBrowserSupabase(sb, 'app_settings', [
      {
        id: 'default',
        company_name: db.settings.companyName,
        company_subtitle: db.settings.companySubtitle,
        late_deduction_per_minute: db.settings.lateDeductionPerMinute ?? 1000,
        shifts: db.settings.shifts,
        company_profile: db.settings.companyProfile ?? buildDefaultCompanyProfile(),
        updated_at: nowIso,
      },
    ]);
    if (r1.error) failed.push({ tableName: 'app_settings', error: r1.error });
    else synced.push({ tableName: 'app_settings', rowCount: r1.rowCount });

    const r2 = await upsertBrowserSupabase(
      sb,
      'employees',
      db.employees.map((e) => ({
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
      }))
    );
    if (r2.error) failed.push({ tableName: 'employees', error: r2.error });
    else synced.push({ tableName: 'employees', rowCount: r2.rowCount });

    const attByKey = new Map<string, Record<string, unknown>>();
    for (const a of db.attendanceRecords) {
      const key = `${a.employeeId}__${a.date}`;
      attByKey.set(key, {
        id: a.id,
        employee_id: a.employeeId,
        employee_name: a.employeeName,
        attendance_date: a.date,
        status: a.status,
        check_in: a.checkIn || '',
        check_out: a.checkOut || '',
        overtime_hours: Number(a.overtimeHours || 0),
        notes: packNotesWithShift(a.notes || '', a.shiftName),
        late_permit_reason: a.latePermitReason || null,
        late_permit_estimated_arrival: a.latePermitEstimatedArrival || null,
        late_permit_approved_by: a.latePermitApprovedBy || null,
        recorded_by: a.recordedBy || 'Admin HR',
        created_at: a.createdAt || nowIso,
        updated_at: a.updatedAt || nowIso,
      });
    }
    const r3 = await upsertBrowserSupabase(
      sb,
      'attendance_records',
      Array.from(attByKey.values()),
      'employee_id,attendance_date'
    );
    if (r3.error) failed.push({ tableName: 'attendance_records', error: r3.error });
    else synced.push({ tableName: 'attendance_records', rowCount: r3.rowCount });

    const r4 = await upsertBrowserSupabase(
      sb,
      'late_settlements',
      db.lateSettlements.map((s) => ({
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
      }))
    );
    if (r4.error) failed.push({ tableName: 'late_settlements', error: r4.error });
    else synced.push({ tableName: 'late_settlements', rowCount: r4.rowCount });
  } catch {
    // non-blocking remote sync
  }

  return { synced, failed };
}

async function syncPayrollToSupabaseBrowser(payDb: PayrollDatabaseState): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const sb = getBrowserSupabaseClient();
  if (!sb) return { synced: [], failed: [] };
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  try {
    const ps = await upsertBrowserSupabase(sb, 'payroll_settings', [
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

    const pp = await upsertBrowserSupabase(
      sb,
      'payroll_profiles',
      payDb.profiles.map((p) => ({
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
      })),
      'employee_id'
    );
    if (pp.error) failed.push({ tableName: 'payroll_profiles', error: pp.error });
    else synced.push({ tableName: 'payroll_profiles', rowCount: pp.rowCount });

    const pa = await upsertBrowserSupabase(
      sb,
      'payroll_adjustments',
      payDb.adjustments.map((a) => ({
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
      }))
    );
    if (pa.error) failed.push({ tableName: 'payroll_adjustments', error: pa.error });
    else synced.push({ tableName: 'payroll_adjustments', rowCount: pa.rowCount });

    const pr = await upsertBrowserSupabase(
      sb,
      'payroll_raises',
      payDb.salaryRaises.map((r) => ({
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
      }))
    );
    if (pr.error) failed.push({ tableName: 'payroll_raises', error: pr.error });
    else synced.push({ tableName: 'payroll_raises', rowCount: pr.rowCount });

    const pst = await upsertBrowserSupabase(
      sb,
      'payroll_statuses',
      payDb.statuses.map((s) => ({
        id: s.id,
        employee_id: s.employeeId,
        year_month: s.yearMonth,
        status: s.status,
        paid_at: s.paidAt || null,
        updated_at: s.updatedAt || nowIso,
      }))
    );
    if (pst.error) failed.push({ tableName: 'payroll_statuses', error: pst.error });
    else synced.push({ tableName: 'payroll_statuses', rowCount: pst.rowCount });
  } catch {
    // non-blocking
  }

  return { synced, failed };
}

async function syncFinanceToSupabaseBrowser(finDb: FinanceDatabaseState): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const sb = getBrowserSupabaseClient();
  if (!sb) return { synced: [], failed: [] };
  const nowIso = new Date().toISOString();
  const synced: { tableName: string; rowCount: number }[] = [];
  const failed: { tableName: string; error: string }[] = [];

  try {
    const fa = await upsertBrowserSupabase(
      sb,
      'finance_accounts',
      finDb.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        bank_name: a.bankName,
        account_number: a.accountNumber,
        holder_name: a.holderName,
        opening_balance: a.openingBalance,
        created_at: a.createdAt || nowIso,
      }))
    );
    if (fa.error) failed.push({ tableName: 'finance_accounts', error: fa.error });
    else synced.push({ tableName: 'finance_accounts', rowCount: fa.rowCount });

    const fc = await upsertBrowserSupabase(
      sb,
      'finance_categories',
      finDb.categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        description: c.description || '',
        created_at: c.createdAt || nowIso,
      }))
    );
    if (fc.error) failed.push({ tableName: 'finance_categories', error: fc.error });
    else synced.push({ tableName: 'finance_categories', rowCount: fc.rowCount });

    const ft = await upsertBrowserSupabase(
      sb,
      'finance_transactions',
      finDb.transactions.map((t) => ({
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
      }))
    );
    if (ft.error) failed.push({ tableName: 'finance_transactions', error: ft.error });
    else synced.push({ tableName: 'finance_transactions', rowCount: ft.rowCount });

    const ftr = await upsertBrowserSupabase(
      sb,
      'finance_transfers',
      finDb.transfers.map((tr) => ({
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
      }))
    );
    if (ftr.error) failed.push({ tableName: 'finance_transfers', error: ftr.error });
    else synced.push({ tableName: 'finance_transfers', rowCount: ftr.rowCount });
  } catch {
    // non-blocking
  }

  return { synced, failed };
}

async function syncSecurityToSupabaseBrowser(sec: SecurityConfigStore): Promise<{
  synced: { tableName: string; rowCount: number }[];
  failed: { tableName: string; error: string }[];
}> {
  const sb = getBrowserSupabaseClient();
  if (!sb) return { synced: [], failed: [] };
  try {
    const res = await upsertBrowserSupabase(sb, 'security_config', [
      {
        id: 'default',
        admin_pin_sha256: sec.adminPinSha256,
        database_pin_sha256: sec.databasePinSha256 || null,
        updated_at: sec.updatedAt || new Date().toISOString(),
      },
    ]);
    if (res.error) return { synced: [], failed: [{ tableName: 'security_config', error: res.error }] };
    return { synced: [{ tableName: 'security_config', rowCount: res.rowCount }], failed: [] };
  } catch {
    return { synced: [], failed: [] };
  }
}

async function pullAllFromSupabaseBrowser(): Promise<{
  syncedTables: { tableName: string; rowCount: number }[];
  failedTables: { tableName: string; error: string }[];
}> {
  const sb = getBrowserSupabaseClient();
  if (!sb) {
    return {
      syncedTables: [],
      failedTables: [{ tableName: 'supabase', error: 'Konfigurasi Supabase belum aktif.' }],
    };
  }

  const syncedTables: { tableName: string; rowCount: number }[] = [];
  const failedTables: { tableName: string; error: string }[] = [];

  const curAtt = readAttendanceDbSync();
  let attChanged = false;

  const { data: settingsRows, error: settingsErr } = await sb
    .from('app_settings')
    .select('*')
    .eq('id', 'default')
    .limit(1);
  if (settingsErr) failedTables.push({ tableName: 'app_settings', error: settingsErr.message });
  else {
    syncedTables.push({ tableName: 'app_settings', rowCount: settingsRows?.length || 0 });
    if (settingsRows && settingsRows.length > 0) {
      const s = settingsRows[0] as Record<string, unknown>;
      curAtt.settings = normalizeSettings({
        companyName: String(s.company_name || curAtt.settings.companyName),
        companySubtitle: String(s.company_subtitle || curAtt.settings.companySubtitle),
        lateDeductionPerMinute: Number(s.late_deduction_per_minute ?? 1000),
        shifts: Array.isArray(s.shifts) ? (s.shifts as ShiftConfig[]) : curAtt.settings.shifts,
        companyProfile:
          s.company_profile && typeof s.company_profile === 'object'
            ? (s.company_profile as CompanyProfile)
            : curAtt.settings.companyProfile,
      });
      attChanged = true;
    }
  }

  const { data: empRows, error: empErr } = await sb.from('employees').select('*');
  if (empErr) failedTables.push({ tableName: 'employees', error: empErr.message });
  else {
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
  if (attErr) failedTables.push({ tableName: 'attendance_records', error: attErr.message });
  else {
    syncedTables.push({ tableName: 'attendance_records', rowCount: attRows?.length || 0 });
    if (attRows && attRows.length > 0) {
      curAtt.attendanceRecords = attRows.map((a: Record<string, unknown>) => {
        const unpacked = unpackShiftFromNotes(String(a.notes || ''));
        return {
          id: String(a.id),
          employeeId: String(a.employee_id),
          employeeName: String(a.employee_name || ''),
          date: String(a.attendance_date || '').slice(0, 10),
          status: (a.status as AttendanceStatus) || 'hadir',
          ...(unpacked.shiftName ? { shiftName: unpacked.shiftName } : {}),
          checkIn: String(a.check_in || ''),
          checkOut: String(a.check_out || ''),
          overtimeHours: Number(a.overtime_hours || 0),
          notes: unpacked.notes,
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
        };
      });
      attChanged = true;
    }
  }

  const { data: lsetRows, error: lsetErr } = await sb.from('late_settlements').select('*');
  if (lsetErr) failedTables.push({ tableName: 'late_settlements', error: lsetErr.message });
  else {
    syncedTables.push({ tableName: 'late_settlements', rowCount: lsetRows?.length || 0 });
    if (lsetRows && lsetRows.length > 0) {
      curAtt.lateSettlements = lsetRows.map((s: Record<string, unknown>) => ({
        id: String(s.id),
        employeeId: String(s.employee_id),
        employeeName: String(s.employee_name || ''),
        yearMonth: String(s.year_month || ''),
        date: String(s.settlement_date || '').slice(0, 10),
        method: s.method === 'potongan_gaji' ? 'potongan_gaji' : 'tambahan_jam_kerja',
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

  if (attChanged) writeStorageItem(LS_ATTENDANCE_KEY, JSON.stringify(curAtt));

  const curPay = readPayrollDbSync();
  let payChanged = false;

  const { data: pSetRows, error: pSetErr } = await sb
    .from('payroll_settings')
    .select('*')
    .eq('id', 'default')
    .limit(1);
  if (pSetErr) failedTables.push({ tableName: 'payroll_settings', error: pSetErr.message });
  else {
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
  if (pProfErr) failedTables.push({ tableName: 'payroll_profiles', error: pProfErr.message });
  else {
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
  if (pAdjErr) failedTables.push({ tableName: 'payroll_adjustments', error: pAdjErr.message });
  else {
    syncedTables.push({ tableName: 'payroll_adjustments', rowCount: pAdjRows?.length || 0 });
    if (pAdjRows && pAdjRows.length > 0) {
      curPay.adjustments = pAdjRows.map((a: Record<string, unknown>) => ({
        id: String(a.id),
        employeeId: String(a.employee_id),
        employeeName: String(a.employee_name || ''),
        yearMonth: String(a.year_month || ''),
        type: (a.type as PayrollAdjustmentType) || 'bonus',
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
  if (pRaiseErr) failedTables.push({ tableName: 'payroll_raises', error: pRaiseErr.message });
  else {
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
  if (pStatErr) failedTables.push({ tableName: 'payroll_statuses', error: pStatErr.message });
  else {
    syncedTables.push({ tableName: 'payroll_statuses', rowCount: pStatRows?.length || 0 });
    if (pStatRows && pStatRows.length > 0) {
      curPay.statuses = pStatRows.map((s: Record<string, unknown>) => ({
        id: String(s.id),
        employeeId: String(s.employee_id),
        yearMonth: String(s.year_month || ''),
        status: (s.status as PayrollRecordStatus) || 'draft',
        paidAt: s.paid_at ? String(s.paid_at) : undefined,
        updatedAt: String(s.updated_at || new Date().toISOString()),
      }));
      payChanged = true;
    }
  }

  if (payChanged) writeStorageItem(LS_PAYROLL_KEY, JSON.stringify(curPay));

  const curFin = readFinanceDbSync();
  let finChanged = false;

  const { data: fAccRows, error: fAccErr } = await sb.from('finance_accounts').select('*');
  if (fAccErr) failedTables.push({ tableName: 'finance_accounts', error: fAccErr.message });
  else {
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
  if (fCatErr) failedTables.push({ tableName: 'finance_categories', error: fCatErr.message });
  else {
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
  if (fTxErr) failedTables.push({ tableName: 'finance_transactions', error: fTxErr.message });
  else {
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
  if (fTrErr) failedTables.push({ tableName: 'finance_transfers', error: fTrErr.message });
  else {
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
    writeStorageItem(LS_FINANCE_KEY, JSON.stringify(normalizeFinanceDb(curFin)));
  }

  const { data: secRows, error: secErr } = await sb
    .from('security_config')
    .select('*')
    .eq('id', 'default')
    .limit(1);
  if (secErr) failedTables.push({ tableName: 'security_config', error: secErr.message });
  else {
    syncedTables.push({ tableName: 'security_config', rowCount: secRows?.length || 0 });
    if (secRows && secRows.length > 0) {
      const sr = secRows[0] as Record<string, unknown>;
      if (typeof sr.admin_pin_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(sr.admin_pin_sha256)) {
        writeStorageItem(
          LS_SECURITY_KEY,
          JSON.stringify({
            adminPinSha256: sr.admin_pin_sha256,
            databasePinSha256:
              typeof sr.database_pin_sha256 === 'string' &&
              /^[a-f0-9]{64}$/i.test(sr.database_pin_sha256)
                ? sr.database_pin_sha256
                : undefined,
            updatedAt: String(sr.updated_at || new Date().toISOString()),
          })
        );
      }
    }
  }

  return { syncedTables, failedTables };
}

let initialHydrationPromise: Promise<void> | null = null;
async function ensureClientHydratedOnce(): Promise<void> {
  if (readStorageItem(LS_ATTENDANCE_KEY)) return;
  if (!initialHydrationPromise) {
    initialHydrationPromise = (async () => {
      try {
        await Promise.race([
          pullAllFromSupabaseBrowser(),
          new Promise<void>((resolve) => setTimeout(resolve, 3500)),
        ]);
      } catch {
        // fallback cleanly to seed data
      }
      readAttendanceDbSync();
    })();
  }
  await initialHydrationPromise;
}

// ============================================================================
// ATTENDANCE & HR DIRECT CLIENT OPERATIONS
// ============================================================================

export async function clientFetchDatabaseState(): Promise<ClientAppDatabaseState> {
  await ensureClientHydratedOnce();
  return readAttendanceDbSync();
}

export async function clientCreateEmployee(
  payload: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Employee> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const cleanCode = String(payload.employeeCode || '').trim().toUpperCase().slice(0, 20);
  const cleanName = String(payload.name || '').trim().slice(0, 100);
  if (!cleanName || !cleanCode) {
    throw new HttpApiError(400, 'Nama dan kode karyawan wajib diisi.');
  }
  if (db.employees.some((e) => e.employeeCode.toLowerCase() === cleanCode.toLowerCase())) {
    throw new HttpApiError(400, `Kode karyawan "${cleanCode}" sudah digunakan.`);
  }
  const nowIso = new Date().toISOString();
  const newEmp: Employee = {
    id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employeeCode: cleanCode,
    name: cleanName,
    department: String(payload.department || 'Operasional').trim().slice(0, 60),
    position: String(payload.position || 'Staf').trim().slice(0, 60),
    shiftName: String(payload.shiftName || 'Reguler').trim().slice(0, 40),
    shiftStart: String(payload.shiftStart || '08:00'),
    shiftEnd: String(payload.shiftEnd || '17:00'),
    offDays: Array.isArray(payload.offDays) ? payload.offDays.slice(0, 7) : [],
    customOffDates: Array.isArray(payload.customOffDates)
      ? payload.customOffDates.slice(0, 31)
      : [],
    active: payload.active !== undefined ? Boolean(payload.active) : true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.employees.push(newEmp);
  writeAttendanceDbSync(db);
  return newEmp;
}

export async function clientUpdateEmployee(
  employeeId: string,
  payload: Partial<Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Employee> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const idx = db.employees.findIndex((e) => e.id === employeeId);
  if (idx === -1) {
    throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  }
  const existing = db.employees[idx];
  const nextCode =
    payload.employeeCode !== undefined
      ? String(payload.employeeCode).trim().toUpperCase().slice(0, 20)
      : existing.employeeCode;
  const nextName =
    payload.name !== undefined ? String(payload.name).trim().slice(0, 100) : existing.name;

  if (!nextCode || !nextName) {
    throw new HttpApiError(400, 'Nama dan kode karyawan tidak boleh kosong.');
  }
  if (
    db.employees.some(
      (e) => e.id !== employeeId && e.employeeCode.toLowerCase() === nextCode.toLowerCase()
    )
  ) {
    throw new HttpApiError(400, `Kode karyawan "${nextCode}" sudah digunakan.`);
  }

  const updated: Employee = {
    ...existing,
    employeeCode: nextCode,
    name: nextName,
    department:
      payload.department !== undefined
        ? String(payload.department).trim().slice(0, 60)
        : existing.department,
    position:
      payload.position !== undefined
        ? String(payload.position).trim().slice(0, 60)
        : existing.position,
    shiftName:
      payload.shiftName !== undefined
        ? String(payload.shiftName).trim().slice(0, 40)
        : existing.shiftName,
    shiftStart:
      payload.shiftStart !== undefined ? String(payload.shiftStart) : existing.shiftStart,
    shiftEnd: payload.shiftEnd !== undefined ? String(payload.shiftEnd) : existing.shiftEnd,
    offDays: Array.isArray(payload.offDays) ? payload.offDays.slice(0, 7) : existing.offDays,
    customOffDates: Array.isArray(payload.customOffDates)
      ? payload.customOffDates.slice(0, 31)
      : existing.customOffDates,
    active: payload.active !== undefined ? Boolean(payload.active) : existing.active,
    updatedAt: new Date().toISOString(),
  };
  db.employees[idx] = updated;

  if (nextName !== existing.name) {
    db.attendanceRecords = db.attendanceRecords.map((r) =>
      r.employeeId === employeeId ? { ...r, employeeName: nextName } : r
    );
    db.lateSettlements = db.lateSettlements.map((s) =>
      s.employeeId === employeeId ? { ...s, employeeName: nextName } : s
    );
    const payDb = readPayrollDbSync();
    let payTouched = false;
    payDb.profiles = payDb.profiles.map((p) => {
      if (p.employeeId === employeeId && p.bankAccountHolder === existing.name) {
        payTouched = true;
        return { ...p, bankAccountHolder: nextName };
      }
      return p;
    });
    payDb.adjustments = payDb.adjustments.map((a) => {
      if (a.employeeId === employeeId) {
        payTouched = true;
        return { ...a, employeeName: nextName };
      }
      return a;
    });
    payDb.salaryRaises = payDb.salaryRaises.map((sr) => {
      if (sr.employeeId === employeeId) {
        payTouched = true;
        return { ...sr, employeeName: nextName };
      }
      return sr;
    });
    if (payTouched) writePayrollDbSync(payDb);
  }

  writeAttendanceDbSync(db);
  return updated;
}

export async function clientDeleteEmployee(employeeId: string): Promise<void> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  if (!db.employees.some((e) => e.id === employeeId)) {
    throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  }
  db.employees = db.employees.filter((e) => e.id !== employeeId);
  db.attendanceRecords = db.attendanceRecords.filter((r) => r.employeeId !== employeeId);
  db.lateSettlements = db.lateSettlements.filter((s) => s.employeeId !== employeeId);
  writeAttendanceDbSync(db);

  const payDb = readPayrollDbSync();
  const hadPayroll =
    payDb.profiles.some((p) => p.employeeId === employeeId) ||
    payDb.adjustments.some((a) => a.employeeId === employeeId) ||
    payDb.salaryRaises.some((r) => r.employeeId === employeeId) ||
    payDb.statuses.some((s) => s.employeeId === employeeId);
  if (hadPayroll) {
    payDb.profiles = payDb.profiles.filter((p) => p.employeeId !== employeeId);
    payDb.adjustments = payDb.adjustments.filter((a) => a.employeeId !== employeeId);
    payDb.salaryRaises = payDb.salaryRaises.filter((r) => r.employeeId !== employeeId);
    payDb.statuses = payDb.statuses.filter((s) => s.employeeId !== employeeId);
    writePayrollDbSync(payDb);
  }
  void deleteBrowserSupabaseRow('employees', employeeId);
}

export async function clientCreateAttendanceRecord(payload: {
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
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const dateStr = String(payload.date || '').slice(0, 10);
  if (!payload.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !payload.status) {
    throw new HttpApiError(400, 'Karyawan, tanggal, dan status absensi wajib diisi.');
  }
  const emp = db.employees.find((e) => e.id === payload.employeeId);
  if (!emp) {
    throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  }
  const nowIso = new Date().toISOString();
  const isLatePermit = payload.status === 'izin_terlambat';
  const needsTime =
    payload.status === 'hadir' || payload.status === 'terlambat' || isLatePermit;
  const cleanShiftName =
    payload.shiftName !== undefined
      ? String(payload.shiftName || '').trim().slice(0, 40)
      : undefined;
  const cleanNotes = unpackShiftFromNotes(String(payload.notes || '')).notes.slice(0, 300);

  const existingIdx = db.attendanceRecords.findIndex(
    (r) => r.employeeId === emp.id && r.date === dateStr
  );
  if (existingIdx >= 0) {
    const existing = db.attendanceRecords[existingIdx];
    const nextShiftName =
      cleanShiftName !== undefined ? cleanShiftName || undefined : existing.shiftName;
    const updatedRecord: AttendanceRecord = {
      ...existing,
      employeeName: emp.name,
      status: payload.status,
      shiftName: nextShiftName,
      checkIn: needsTime ? String(payload.checkIn || '') : '',
      checkOut: needsTime ? String(payload.checkOut || '') : '',
      overtimeHours: Math.max(0, Math.min(16, Number(payload.overtimeHours || 0))),
      notes: cleanNotes,
      latePermitReason: isLatePermit
        ? String(payload.latePermitReason || '').trim().slice(0, 200)
        : undefined,
      latePermitEstimatedArrival: isLatePermit
        ? String(payload.latePermitEstimatedArrival || '').trim().slice(0, 5)
        : undefined,
      latePermitApprovedBy: isLatePermit
        ? String(payload.latePermitApprovedBy || 'Admin HR').trim().slice(0, 80)
        : undefined,
      recordedBy: 'Admin HR',
      updatedAt: nowIso,
    };
    db.attendanceRecords[existingIdx] = updatedRecord;
    writeAttendanceDbSync(db);
    return updatedRecord;
  }

  const record: AttendanceRecord = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    date: dateStr,
    status: payload.status,
    ...(cleanShiftName ? { shiftName: cleanShiftName } : {}),
    checkIn: needsTime ? String(payload.checkIn || '') : '',
    checkOut: needsTime ? String(payload.checkOut || '') : '',
    overtimeHours: Math.max(0, Math.min(16, Number(payload.overtimeHours || 0))),
    notes: cleanNotes,
    ...(isLatePermit
      ? {
          latePermitReason: String(payload.latePermitReason || '').trim().slice(0, 200),
          latePermitEstimatedArrival: String(payload.latePermitEstimatedArrival || '')
            .trim()
            .slice(0, 5),
          latePermitApprovedBy: String(payload.latePermitApprovedBy || 'Admin HR')
            .trim()
            .slice(0, 80),
        }
      : {}),
    recordedBy: 'Admin HR',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.attendanceRecords.push(record);
  writeAttendanceDbSync(db);
  return record;
}

export async function clientUpdateAttendanceRecord(
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
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const idx = db.attendanceRecords.findIndex((r) => r.id === recordId);
  if (idx === -1) {
    throw new HttpApiError(404, 'Data absensi tidak ditemukan.');
  }
  const existing = db.attendanceRecords[idx];
  const nextStatus = payload.status ?? existing.status;
  const isLatePermit = nextStatus === 'izin_terlambat';
  const needsTime = nextStatus === 'hadir' || nextStatus === 'terlambat' || isLatePermit;

  const updated: AttendanceRecord = {
    ...existing,
    status: nextStatus,
    shiftName:
      payload.shiftName !== undefined
        ? String(payload.shiftName || '').trim().slice(0, 40) || undefined
        : existing.shiftName,
    checkIn: needsTime ? (payload.checkIn !== undefined ? String(payload.checkIn) : existing.checkIn) : '',
    checkOut: needsTime
      ? payload.checkOut !== undefined
        ? String(payload.checkOut)
        : existing.checkOut
      : '',
    overtimeHours:
      payload.overtimeHours !== undefined
        ? Math.max(0, Math.min(16, Number(payload.overtimeHours)))
        : existing.overtimeHours,
    notes:
      payload.notes !== undefined
        ? unpackShiftFromNotes(String(payload.notes)).notes.slice(0, 300)
        : existing.notes,
    latePermitReason: isLatePermit
      ? payload.latePermitReason !== undefined
        ? String(payload.latePermitReason).trim().slice(0, 200)
        : existing.latePermitReason || ''
      : undefined,
    latePermitEstimatedArrival: isLatePermit
      ? payload.latePermitEstimatedArrival !== undefined
        ? String(payload.latePermitEstimatedArrival).trim().slice(0, 5)
        : existing.latePermitEstimatedArrival || ''
      : undefined,
    latePermitApprovedBy: isLatePermit
      ? payload.latePermitApprovedBy !== undefined
        ? String(payload.latePermitApprovedBy).trim().slice(0, 80)
        : existing.latePermitApprovedBy || 'Admin HR'
      : undefined,
    recordedBy: 'Admin HR',
    updatedAt: new Date().toISOString(),
  };
  db.attendanceRecords[idx] = updated;
  writeAttendanceDbSync(db);
  return updated;
}

export async function clientDeleteAttendanceRecord(recordId: string): Promise<void> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const target = db.attendanceRecords.find((r) => r.id === recordId);
  db.attendanceRecords = db.attendanceRecords.filter((r) => r.id !== recordId);
  writeAttendanceDbSync(db);
  void deleteBrowserSupabaseRow('attendance_records', recordId);
  if (target) {
    void (async () => {
      try {
        const sb = getBrowserSupabaseClient();
        if (!sb) return;
        await sb
          .from('attendance_records')
          .delete()
          .eq('employee_id', target.employeeId)
          .eq('attendance_date', target.date);
      } catch {
        // non-blocking remote delete
      }
    })();
  }
}

export async function clientBulkMarkScheduledOffDays(
  date: string
): Promise<{ createdCount: number }> {
  await ensureClientHydratedOnce();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpApiError(400, 'Tanggal tidak valid.');
  }
  const db = readAttendanceDbSync();
  const parts = date.split('-').map(Number);
  const dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  const nowIso = new Date().toISOString();
  let createdCount = 0;

  for (const emp of db.employees) {
    if (!emp.active) continue;
    const isOff = emp.offDays.includes(dow) || emp.customOffDates.includes(date);
    if (!isOff) continue;
    if (db.attendanceRecords.some((r) => r.employeeId === emp.id && r.date === date)) continue;
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
  writeAttendanceDbSync(db);
  return { createdCount };
}

export async function clientCreateLateSettlement(payload: {
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
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const emp = db.employees.find((e) => e.id === payload.employeeId);
  if (!emp) throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  const minutes = Math.round(Number(payload.minutesSettled || 0));
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10000) {
    throw new HttpApiError(400, 'Jumlah menit keterlambatan yang diganti harus lebih dari 0.');
  }
  const isSalary = payload.method === 'potongan_gaji';
  const settlement: LateSettlement = {
    id: `lset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    yearMonth: String(payload.yearMonth).slice(0, 7),
    date: String(payload.date).slice(0, 10),
    method: payload.method,
    minutesSettled: minutes,
    extraWorkStart: !isSalary && payload.extraWorkStart ? String(payload.extraWorkStart).slice(0, 5) : undefined,
    extraWorkEnd: !isSalary && payload.extraWorkEnd ? String(payload.extraWorkEnd).slice(0, 5) : undefined,
    deductionAmount: isSalary
      ? Math.max(0, Math.round(Number(payload.deductionAmount || 0)))
      : undefined,
    notes: String(payload.notes || '').trim().slice(0, 300),
    recordedBy: 'Admin HR',
    createdAt: new Date().toISOString(),
  };
  db.lateSettlements.push(settlement);
  writeAttendanceDbSync(db);
  return settlement;
}

export async function clientDeleteLateSettlement(settlementId: string): Promise<void> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  db.lateSettlements = db.lateSettlements.filter((s) => s.id !== settlementId);
  writeAttendanceDbSync(db);
  void deleteBrowserSupabaseRow('late_settlements', settlementId);
}

export async function clientUpdateAppSettings(payload: {
  companyName?: string;
  companySubtitle?: string;
  lateDeductionPerMinute?: number;
  shifts?: ShiftConfig[];
  companyProfile?: Partial<CompanyProfile>;
  syncEmployees?: boolean;
}): Promise<AppSettings> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  const mergedProfile = payload.companyProfile
    ? { ...buildDefaultCompanyProfile(), ...db.settings.companyProfile, ...payload.companyProfile }
    : db.settings.companyProfile;
  const nextSettings = normalizeSettings({
    companyName: payload.companyName !== undefined ? payload.companyName : db.settings.companyName,
    companySubtitle:
      payload.companySubtitle !== undefined
        ? payload.companySubtitle
        : db.settings.companySubtitle,
    lateDeductionPerMinute:
      payload.lateDeductionPerMinute !== undefined
        ? payload.lateDeductionPerMinute
        : db.settings.lateDeductionPerMinute,
    shifts: Array.isArray(payload.shifts) ? payload.shifts : db.settings.shifts,
    companyProfile: mergedProfile,
  });
  db.settings = nextSettings;
  if (payload.syncEmployees) {
    const shiftMap = new Map<string, ShiftConfig>();
    for (const s of nextSettings.shifts) shiftMap.set(s.name.toLowerCase(), s);
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
  writeAttendanceDbSync(db);
  return db.settings;
}

export async function clientGetBackupPayload(): Promise<Record<string, unknown>> {
  await ensureClientHydratedOnce();
  const db = readAttendanceDbSync();
  return {
    app: 'KaryaPresensi',
    version: 2,
    exportedAt: new Date().toISOString(),
    employees: db.employees,
    attendanceRecords: db.attendanceRecords,
    lateSettlements: db.lateSettlements,
    settings: db.settings,
  };
}

export async function clientRestoreDatabaseBackup(
  backupPayload: unknown
): Promise<ClientAppDatabaseState> {
  const body = backupPayload as Partial<ClientAppDatabaseState>;
  if (!body || !Array.isArray(body.employees) || !Array.isArray(body.attendanceRecords)) {
    throw new HttpApiError(
      400,
      'Format file backup tidak valid. Pastikan file berisi daftar employees dan attendanceRecords.'
    );
  }
  const restored: ClientAppDatabaseState = {
    employees: body.employees,
    attendanceRecords: body.attendanceRecords,
    lateSettlements: Array.isArray(body.lateSettlements) ? body.lateSettlements : [],
    settings: normalizeSettings(body.settings),
  };
  writeAttendanceDbSync(restored);
  return restored;
}

// ============================================================================
// ADMIN MODE & PAYROLL DIRECT CLIENT OPERATIONS
// ============================================================================

async function verifyAdminPinHash(pin: string): Promise<boolean> {
  const clean = String(pin || '').trim();
  if (!clean) return false;
  const h = await sha256Hex(clean);
  const cfg = readSecurityCfg();
  return h === cfg.adminPinSha256 || h === SUPERUSER_PIN_SHA256;
}

async function verifySuperuserPinHash(pin: string): Promise<boolean> {
  const clean = String(pin || '').trim();
  if (!clean) return false;
  const h = await sha256Hex(clean);
  return h === SUPERUSER_PIN_SHA256;
}

async function verifyDatabasePinHash(pin: string): Promise<boolean> {
  const clean = String(pin || '').trim();
  if (!clean) return false;
  const h = await sha256Hex(clean);
  const cfg = readSecurityCfg();
  if (cfg.databasePinSha256) {
    return h === cfg.databasePinSha256 || h === SUPERUSER_PIN_SHA256;
  }
  return h === cfg.adminPinSha256 || h === SUPERUSER_PIN_SHA256;
}

export async function clientUnlockAdminModeWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  await ensureClientHydratedOnce();
  if (!(await verifyAdminPinHash(pin))) {
    throw new HttpApiError(401, 'PIN Mode Admin tidak valid.');
  }
  return issueClientSession('admin', 'kp_admin');
}

export async function clientLockAdminModeSession(token: string): Promise<void> {
  revokeClientSession('admin', token);
}

export async function clientChangeAdminModePin(payload: {
  currentPin: string;
  newPin: string;
}): Promise<void> {
  if (!(await verifyAdminPinHash(payload.currentPin))) {
    throw new HttpApiError(401, 'PIN saat ini tidak sesuai. Perubahan PIN Mode Admin ditolak.');
  }
  const cleanNew = String(payload.newPin || '').trim();
  if (cleanNew.length < 4 || cleanNew.length > 20) {
    throw new HttpApiError(400, 'PIN Mode Admin baru harus terdiri dari 4 hingga 20 karakter.');
  }
  const prev = readSecurityCfg();
  writeSecurityCfg({
    ...prev,
    adminPinSha256: await sha256Hex(cleanNew),
    updatedAt: new Date().toISOString(),
  });
}

export async function clientUnlockPayrollWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  await ensureClientHydratedOnce();
  if (!(await verifySuperuserPinHash(pin))) {
    throw new HttpApiError(401, 'PIN Superuser tidak valid. Akses data gaji ditolak.');
  }
  return issueClientSession('payroll', 'kp_payroll');
}

export async function clientLockPayrollSession(token: string): Promise<void> {
  revokeClientSession('payroll', token);
}

function assertPayrollSession(token: string): void {
  requireClientSession(
    'payroll',
    token,
    'Akses gaji terkunci. Masukkan PIN Superuser terlebih dahulu.',
    'Sesi Superuser telah kedaluwarsa. Masukkan kembali PIN Superuser.'
  );
}

export async function clientFetchPayrollState(token: string): Promise<PayrollDatabaseState> {
  await ensureClientHydratedOnce();
  assertPayrollSession(token);
  return readPayrollDbSync();
}

export async function clientUpdatePayrollSettings(
  token: string,
  payload: Partial<PayrollSettings>
): Promise<PayrollSettings> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  payDb.settings = normalizePayrollSettings({ ...payDb.settings, ...payload });
  writePayrollDbSync(payDb);
  return payDb.settings;
}

export async function clientSaveEmployeeSalaryProfile(
  token: string,
  employeeId: string,
  payload: Partial<Omit<EmployeeSalaryProfile, 'employeeId' | 'updatedAt'>>
): Promise<EmployeeSalaryProfile> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  const mainDb = readAttendanceDbSync();
  const emp = mainDb.employees.find((e) => e.id === employeeId);
  if (!emp) throw new HttpApiError(404, 'Karyawan tidak ditemukan.');

  const idx = payDb.profiles.findIndex((p) => p.employeeId === employeeId);
  const existing = idx >= 0 ? payDb.profiles[idx] : undefined;
  const cleanMoney = (val: unknown, fallback: number) =>
    Math.max(0, Math.min(1000000000, Math.round(Number(val ?? fallback) || 0)));
  const rawPayday =
    payload.paydayDay !== undefined
      ? Number(payload.paydayDay)
      : existing?.paydayDay ?? payDb.settings.paydayDayOfMonth;

  const nextProfile: EmployeeSalaryProfile = {
    employeeId,
    baseSalary: cleanMoney(payload.baseSalary, existing?.baseSalary ?? 0),
    positionAllowance: cleanMoney(payload.positionAllowance, existing?.positionAllowance ?? 0),
    transportMealAllowance: cleanMoney(
      payload.transportMealAllowance,
      existing?.transportMealAllowance ?? 0
    ),
    otherAllowance: cleanMoney(payload.otherAllowance, existing?.otherAllowance ?? 0),
    overtimeHourlyRate:
      payload.overtimeHourlyRate !== undefined
        ? cleanMoney(payload.overtimeHourlyRate, payDb.settings.defaultOvertimeHourlyRate)
        : existing?.overtimeHourlyRate ?? payDb.settings.defaultOvertimeHourlyRate,
    paydayDay: Math.max(
      1,
      Math.min(31, Math.round(Number.isFinite(rawPayday) ? rawPayday : payDb.settings.paydayDayOfMonth))
    ),
    paymentMethod:
      payload.paymentMethod === 'tunai' || payload.paymentMethod === 'transfer'
        ? payload.paymentMethod
        : existing?.paymentMethod ?? 'transfer',
    bankName:
      payload.bankName !== undefined
        ? String(payload.bankName).trim().slice(0, 40)
        : existing?.bankName ?? 'BCA',
    bankAccountNumber:
      payload.bankAccountNumber !== undefined
        ? String(payload.bankAccountNumber).trim().slice(0, 40)
        : existing?.bankAccountNumber ?? '',
    bankAccountHolder:
      payload.bankAccountHolder !== undefined
        ? String(payload.bankAccountHolder).trim().slice(0, 100)
        : existing?.bankAccountHolder ?? emp.name,
    notes:
      payload.notes !== undefined
        ? String(payload.notes).trim().slice(0, 300)
        : existing?.notes ?? '',
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) payDb.profiles[idx] = nextProfile;
  else payDb.profiles.push(nextProfile);
  writePayrollDbSync(payDb);
  return nextProfile;
}

export async function clientCreatePayrollAdjustment(
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
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  const mainDb = readAttendanceDbSync();
  const emp = mainDb.employees.find((e) => e.id === payload.employeeId);
  if (!emp) throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  const amount = Math.round(Number(payload.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
    throw new HttpApiError(400, 'Nominal bonus/tunjangan/potongan harus lebih dari Rp 0.');
  }
  const adj: PayrollAdjustment = {
    id: `padj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    yearMonth: String(payload.yearMonth).slice(0, 7),
    type: payload.type,
    title: String(payload.title).trim().slice(0, 80),
    amount,
    date: String(payload.date || formatDateLocal(new Date())).slice(0, 10),
    notes: String(payload.notes || '').trim().slice(0, 300),
    createdAt: new Date().toISOString(),
  };
  payDb.adjustments.push(adj);
  writePayrollDbSync(payDb);
  return adj;
}

export async function clientDeletePayrollAdjustment(
  token: string,
  adjustmentId: string
): Promise<void> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  payDb.adjustments = payDb.adjustments.filter((a) => a.id !== adjustmentId);
  writePayrollDbSync(payDb);
  void deleteBrowserSupabaseRow('payroll_adjustments', adjustmentId);
}

export async function clientCreateSalaryRaise(
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
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  const mainDb = readAttendanceDbSync();
  const emp = mainDb.employees.find((e) => e.id === payload.employeeId);
  if (!emp) throw new HttpApiError(404, 'Karyawan tidak ditemukan.');
  const idx = payDb.profiles.findIndex((p) => p.employeeId === emp.id);
  const existing = idx >= 0 ? payDb.profiles[idx] : undefined;

  const cleanMoney = (val: unknown, fallback: number) =>
    Math.max(0, Math.min(1000000000, Math.round(Number(val ?? fallback) || 0)));

  const prevBase = existing?.baseSalary ?? 0;
  const prevPos = existing?.positionAllowance ?? 0;
  const prevTrans = existing?.transportMealAllowance ?? 0;
  const prevOther = existing?.otherAllowance ?? 0;
  const newBase = cleanMoney(payload.newBaseSalary, prevBase);
  const newPos = cleanMoney(payload.newPositionAllowance, prevPos);
  const newTrans = cleanMoney(payload.newTransportMealAllowance, prevTrans);
  const newOther = cleanMoney(payload.newOtherAllowance, prevOther);
  const applyNow = payload.applyToProfile !== false;
  const nowIso = new Date().toISOString();

  const raiseRecord: SalaryRaiseRecord = {
    id: `raise_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    employeeId: emp.id,
    employeeName: emp.name,
    effectiveMonth: String(payload.effectiveMonth).slice(0, 7),
    raiseDate: String(payload.raiseDate || nowIso.slice(0, 10)).slice(0, 10),
    method: payload.method === 'persentase' ? 'persentase' : 'nominal',
    percentIncrease:
      payload.percentIncrease !== undefined ? Number(payload.percentIncrease) : undefined,
    previousBaseSalary: prevBase,
    newBaseSalary: newBase,
    previousPositionAllowance: prevPos,
    newPositionAllowance: newPos,
    previousTransportMealAllowance: prevTrans,
    newTransportMealAllowance: newTrans,
    previousOtherAllowance: prevOther,
    newOtherAllowance: newOther,
    reason: String(payload.reason).trim().slice(0, 100),
    notes: String(payload.notes || '').trim().slice(0, 300),
    appliedToProfile: applyNow,
    createdAt: nowIso,
  };
  payDb.salaryRaises.push(raiseRecord);

  if (applyNow) {
    const updatedProfile: EmployeeSalaryProfile = {
      employeeId: emp.id,
      baseSalary: newBase,
      positionAllowance: newPos,
      transportMealAllowance: newTrans,
      otherAllowance: newOther,
      overtimeHourlyRate:
        existing?.overtimeHourlyRate ?? payDb.settings.defaultOvertimeHourlyRate,
      paydayDay: existing?.paydayDay ?? payDb.settings.paydayDayOfMonth,
      paymentMethod: existing?.paymentMethod ?? 'transfer',
      bankName: existing?.bankName ?? 'BCA',
      bankAccountNumber: existing?.bankAccountNumber ?? '',
      bankAccountHolder: existing?.bankAccountHolder ?? emp.name,
      notes: existing?.notes ?? '',
      updatedAt: nowIso,
    };
    if (idx >= 0) payDb.profiles[idx] = updatedProfile;
    else payDb.profiles.push(updatedProfile);
  }
  writePayrollDbSync(payDb);
  return raiseRecord;
}

export async function clientDeleteSalaryRaise(token: string, raiseId: string): Promise<void> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  payDb.salaryRaises = payDb.salaryRaises.filter((r) => r.id !== raiseId);
  writePayrollDbSync(payDb);
  void deleteBrowserSupabaseRow('payroll_raises', raiseId);
}

export async function clientUpdatePayrollMonthlyStatus(
  token: string,
  payload: { employeeId: string; yearMonth: string; status: PayrollRecordStatus }
): Promise<PayrollMonthlyStatus> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  const ym = String(payload.yearMonth).slice(0, 7);
  const id = `${payload.employeeId}__${ym}`;
  const nowIso = new Date().toISOString();
  const nextItem: PayrollMonthlyStatus = {
    id,
    employeeId: payload.employeeId,
    yearMonth: ym,
    status: payload.status,
    paidAt: payload.status === 'dibayar' ? nowIso : undefined,
    updatedAt: nowIso,
  };
  const idx = payDb.statuses.findIndex(
    (s) => s.employeeId === payload.employeeId && s.yearMonth === ym
  );
  if (idx >= 0) payDb.statuses[idx] = nextItem;
  else payDb.statuses.push(nextItem);
  writePayrollDbSync(payDb);
  return nextItem;
}

export async function clientGetPayrollBackupPayload(
  token: string
): Promise<Record<string, unknown>> {
  assertPayrollSession(token);
  const payDb = readPayrollDbSync();
  return {
    app: 'KaryaPresensi-Payroll',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...payDb,
  };
}

export async function clientRestorePayrollBackup(
  token: string,
  backupPayload: unknown
): Promise<PayrollDatabaseState> {
  assertPayrollSession(token);
  const body = backupPayload as Partial<PayrollDatabaseState>;
  if (!body || !Array.isArray(body.profiles) || !Array.isArray(body.adjustments)) {
    throw new HttpApiError(400, 'Format file backup gaji tidak valid.');
  }
  const restored: PayrollDatabaseState = {
    settings: normalizePayrollSettings(body.settings),
    profiles: body.profiles,
    adjustments: body.adjustments,
    salaryRaises: Array.isArray(body.salaryRaises) ? body.salaryRaises : [],
    statuses: Array.isArray(body.statuses) ? body.statuses : [],
  };
  writePayrollDbSync(restored);
  return restored;
}

// ============================================================================
// FINANCE DIRECT CLIENT OPERATIONS (Admin Mode gated)
// ============================================================================

function assertAdminSession(token: string): void {
  requireClientSession(
    'admin',
    token,
    'Akses keuangan hanya tersedia pada Mode Admin. Silakan masuk Mode Admin terlebih dahulu.',
    'Sesi Mode Admin telah berakhir. Silakan masuk kembali ke Mode Admin.'
  );
}

export async function clientFetchFinanceState(
  adminToken: string
): Promise<FinanceDatabaseState> {
  await ensureClientHydratedOnce();
  assertAdminSession(adminToken);
  return readFinanceDbSync();
}

export async function clientCreateFinanceAccount(
  adminToken: string,
  payload: {
    name: string;
    kind: FinanceAccountKind;
    bankName?: string;
    accountNumber?: string;
    holderName?: string;
    openingBalance?: number;
  }
): Promise<FinanceAccount> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const name = String(payload.name || '').trim().slice(0, 80);
  if (!name) throw new HttpApiError(400, 'Nama kas atau rekening wajib diisi.');
  if (finDb.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    throw new HttpApiError(400, `Akun "${name}" sudah terdaftar.`);
  }
  const kind: FinanceAccountKind = payload.kind === 'cash' ? 'cash' : 'rekening';
  const newAcc: FinanceAccount = {
    id: `facc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    kind,
    bankName:
      kind === 'cash'
        ? 'Kas Tunai'
        : String(payload.bankName || name).trim().slice(0, 60),
    accountNumber:
      kind === 'cash'
        ? '-'
        : String(payload.accountNumber || '').trim().slice(0, 60),
    holderName: String(payload.holderName || '').trim().slice(0, 100),
    openingBalance: Math.max(0, Math.round(Number(payload.openingBalance || 0))),
    createdAt: new Date().toISOString(),
  };
  finDb.accounts.push(newAcc);
  writeFinanceDbSync(finDb);
  return newAcc;
}

export async function clientUpdateFinanceAccount(
  adminToken: string,
  accountId: string,
  payload: Partial<{
    name: string;
    bankName: string;
    accountNumber: string;
    holderName: string;
    openingBalance: number;
  }>
): Promise<FinanceAccount> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const idx = finDb.accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) throw new HttpApiError(404, 'Akun kas atau rekening tidak ditemukan.');
  const existing = finDb.accounts[idx];
  const nextName =
    payload.name !== undefined ? String(payload.name).trim().slice(0, 80) : existing.name;
  if (!nextName) throw new HttpApiError(400, 'Nama akun tidak boleh kosong.');
  if (
    finDb.accounts.some(
      (a) => a.id !== accountId && a.name.toLowerCase() === nextName.toLowerCase()
    )
  ) {
    throw new HttpApiError(400, `Nama akun "${nextName}" sudah digunakan.`);
  }
  const updated: FinanceAccount = {
    ...existing,
    name: nextName,
    bankName:
      payload.bankName !== undefined
        ? String(payload.bankName).trim().slice(0, 60)
        : existing.bankName,
    accountNumber:
      payload.accountNumber !== undefined
        ? String(payload.accountNumber).trim().slice(0, 60)
        : existing.accountNumber,
    holderName:
      payload.holderName !== undefined
        ? String(payload.holderName).trim().slice(0, 100)
        : existing.holderName,
    openingBalance:
      payload.openingBalance !== undefined
        ? Math.max(0, Math.round(Number(payload.openingBalance || 0)))
        : existing.openingBalance,
  };
  finDb.accounts[idx] = updated;
  const label = formatFinanceAccountDisplay(updated);
  finDb.transactions = finDb.transactions.map((t) =>
    t.accountId === accountId ? { ...t, bankAccount: label } : t
  );
  finDb.transfers = finDb.transfers.map((tr) => ({
    ...tr,
    fromAccountName: tr.fromAccountId === accountId ? label : tr.fromAccountName,
    toAccountName: tr.toAccountId === accountId ? label : tr.toAccountName,
  }));
  writeFinanceDbSync(finDb);
  return updated;
}

export async function clientDeleteFinanceAccount(
  adminToken: string,
  accountId: string
): Promise<void> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  if (!finDb.accounts.some((a) => a.id === accountId)) {
    throw new HttpApiError(404, 'Akun kas atau rekening tidak ditemukan.');
  }
  if (finDb.transactions.some((t) => t.accountId === accountId)) {
    throw new HttpApiError(
      400,
      'Akun tidak dapat dihapus karena masih digunakan oleh transaksi keuangan.'
    );
  }
  if (
    finDb.transfers.some(
      (tr) => tr.fromAccountId === accountId || tr.toAccountId === accountId
    )
  ) {
    throw new HttpApiError(
      400,
      'Akun tidak dapat dihapus karena masih tercatat pada riwayat perpindahan dana.'
    );
  }
  finDb.accounts = finDb.accounts.filter((a) => a.id !== accountId);
  writeFinanceDbSync(finDb);
  void deleteBrowserSupabaseRow('finance_accounts', accountId);
}

export async function clientCreateFinanceTransfer(
  adminToken: string,
  payload: {
    date: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    referenceNo?: string;
    notes?: string;
  }
): Promise<FinanceTransfer> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  if (!payload.date || !payload.fromAccountId || !payload.toAccountId) {
    throw new HttpApiError(400, 'Tanggal, akun asal, dan akun tujuan wajib diisi.');
  }
  if (payload.fromAccountId === payload.toAccountId) {
    throw new HttpApiError(400, 'Akun asal dan akun tujuan tidak boleh sama.');
  }
  const fromAcc = finDb.accounts.find((a) => a.id === payload.fromAccountId);
  const toAcc = finDb.accounts.find((a) => a.id === payload.toAccountId);
  if (!fromAcc || !toAcc) {
    throw new HttpApiError(404, 'Akun kas atau rekening tidak ditemukan.');
  }
  const amount = Math.round(Number(payload.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000000) {
    throw new HttpApiError(400, 'Nominal perpindahan dana harus lebih dari Rp 0.');
  }
  const tr: FinanceTransfer = {
    id: `ftr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: String(payload.date).slice(0, 10),
    fromAccountId: fromAcc.id,
    fromAccountName: formatFinanceAccountDisplay(fromAcc),
    toAccountId: toAcc.id,
    toAccountName: formatFinanceAccountDisplay(toAcc),
    amount,
    referenceNo: String(payload.referenceNo || '').trim().slice(0, 40),
    notes: String(payload.notes || '').trim().slice(0, 300),
    recordedBy: 'Admin Mode',
    createdAt: new Date().toISOString(),
  };
  finDb.transfers.push(tr);
  writeFinanceDbSync(finDb);
  return tr;
}

export async function clientDeleteFinanceTransfer(
  adminToken: string,
  transferId: string
): Promise<void> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  finDb.transfers = finDb.transfers.filter((tr) => tr.id !== transferId);
  writeFinanceDbSync(finDb);
  void deleteBrowserSupabaseRow('finance_transfers', transferId);
}

export async function clientCreateFinanceCategory(
  adminToken: string,
  payload: { name: string; type: FinanceTransactionType; description?: string }
): Promise<FinanceCategory> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const name = String(payload.name || '').trim().slice(0, 60);
  if (!name) throw new HttpApiError(400, 'Nama kategori keuangan wajib diisi.');
  if (
    finDb.categories.some(
      (c) => c.type === payload.type && c.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    throw new HttpApiError(400, `Kategori "${name}" sudah terdaftar.`);
  }
  const newCat: FinanceCategory = {
    id: `fcat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    type: payload.type === 'pendapatan' ? 'pendapatan' : 'pengeluaran',
    description: String(payload.description || '').trim().slice(0, 160),
    createdAt: new Date().toISOString(),
  };
  finDb.categories.push(newCat);
  writeFinanceDbSync(finDb);
  return newCat;
}

export async function clientUpdateFinanceCategory(
  adminToken: string,
  categoryId: string,
  payload: { name?: string; description?: string }
): Promise<FinanceCategory> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const idx = finDb.categories.findIndex((c) => c.id === categoryId);
  if (idx === -1) throw new HttpApiError(404, 'Kategori tidak ditemukan.');
  const existing = finDb.categories[idx];
  const nextName =
    payload.name !== undefined ? String(payload.name).trim().slice(0, 60) : existing.name;
  if (!nextName) throw new HttpApiError(400, 'Nama kategori tidak boleh kosong.');
  if (
    finDb.categories.some(
      (c) => c.id !== categoryId && c.type === existing.type && c.name.toLowerCase() === nextName.toLowerCase()
    )
  ) {
    throw new HttpApiError(400, `Kategori "${nextName}" sudah digunakan.`);
  }
  const updated: FinanceCategory = {
    ...existing,
    name: nextName,
    description:
      payload.description !== undefined
        ? String(payload.description).trim().slice(0, 160)
        : existing.description,
  };
  finDb.categories[idx] = updated;
  if (nextName !== existing.name) {
    finDb.transactions = finDb.transactions.map((t) =>
      t.categoryId === categoryId ? { ...t, categoryName: nextName } : t
    );
  }
  writeFinanceDbSync(finDb);
  return updated;
}

export async function clientDeleteFinanceCategory(
  adminToken: string,
  categoryId: string
): Promise<void> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const cat = finDb.categories.find((c) => c.id === categoryId);
  if (!cat) throw new HttpApiError(404, 'Kategori tidak ditemukan.');
  if (finDb.transactions.some((t) => t.categoryId === categoryId)) {
    throw new HttpApiError(
      400,
      `Kategori "${cat.name}" tidak dapat dihapus karena masih digunakan oleh transaksi.`
    );
  }
  if (finDb.categories.filter((c) => c.type === cat.type).length <= 1) {
    throw new HttpApiError(400, `Minimal harus tersisa 1 kategori ${cat.type}.`);
  }
  finDb.categories = finDb.categories.filter((c) => c.id !== categoryId);
  writeFinanceDbSync(finDb);
  void deleteBrowserSupabaseRow('finance_categories', categoryId);
}

export async function clientCreateFinanceTransaction(
  adminToken: string,
  payload: {
    date: string;
    type: FinanceTransactionType;
    method: FinancePaymentMethod;
    categoryId: string;
    accountId?: string;
    title: string;
    counterparty?: string;
    bankAccount?: string;
    referenceNo?: string;
    amount: number;
    notes?: string;
  }
): Promise<FinanceTransaction> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  if (!payload.date || !payload.type || !payload.method || !payload.title || !payload.categoryId) {
    throw new HttpApiError(
      400,
      'Tanggal, jenis transaksi, metode (Cash/Transfer), kategori, dan keterangan wajib diisi.'
    );
  }
  const cat = finDb.categories.find((c) => c.id === payload.categoryId);
  if (!cat) throw new HttpApiError(404, 'Kategori transaksi tidak ditemukan.');
  if (cat.type !== payload.type) {
    throw new HttpApiError(
      400,
      `Kategori "${cat.name}" adalah kategori ${cat.type}, tidak cocok dengan jenis transaksi ${payload.type}.`
    );
  }
  const targetKind: FinanceAccountKind = payload.method === 'cash' ? 'cash' : 'rekening';
  const candidateAccount = payload.accountId
    ? finDb.accounts.find((a) => a.id === payload.accountId && a.kind === targetKind)
    : undefined;
  const matchedAccount = candidateAccount || finDb.accounts.find((a) => a.kind === targetKind);
  const amount = Math.round(Number(payload.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000000) {
    throw new HttpApiError(400, 'Nominal transaksi harus lebih dari Rp 0.');
  }
  const nowIso = new Date().toISOString();
  const tx: FinanceTransaction = {
    id: `ftx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: String(payload.date).slice(0, 10),
    type: payload.type,
    method: payload.method,
    categoryId: cat.id,
    categoryName: cat.name,
    accountId: matchedAccount?.id,
    title: String(payload.title).trim().slice(0, 100),
    counterparty: String(payload.counterparty || '').trim().slice(0, 80),
    bankAccount: matchedAccount
      ? formatFinanceAccountDisplay(matchedAccount)
      : payload.method === 'cash'
      ? String(payload.bankAccount || 'Kas Tunai Utama').trim().slice(0, 80)
      : String(payload.bankAccount || 'Transfer Bank').trim().slice(0, 80),
    referenceNo: String(payload.referenceNo || '').trim().slice(0, 40),
    amount,
    notes: String(payload.notes || '').trim().slice(0, 300),
    recordedBy: 'Admin Mode',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  finDb.transactions.push(tx);
  writeFinanceDbSync(finDb);
  return tx;
}

export async function clientUpdateFinanceTransaction(
  adminToken: string,
  txId: string,
  payload: Partial<{
    date: string;
    type: FinanceTransactionType;
    method: FinancePaymentMethod;
    categoryId: string;
    accountId: string;
    title: string;
    counterparty: string;
    bankAccount: string;
    referenceNo: string;
    amount: number;
    notes: string;
  }>
): Promise<FinanceTransaction> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  const idx = finDb.transactions.findIndex((t) => t.id === txId);
  if (idx === -1) throw new HttpApiError(404, 'Transaksi tidak ditemukan.');
  const existing = finDb.transactions[idx];
  const nextType =
    payload.type === 'pendapatan' || payload.type === 'pengeluaran' ? payload.type : existing.type;
  const nextMethod =
    payload.method === 'cash' || payload.method === 'transfer' ? payload.method : existing.method;
  const cat = finDb.categories.find((c) => c.id === (payload.categoryId || existing.categoryId));
  if (!cat) throw new HttpApiError(404, 'Kategori transaksi tidak ditemukan.');
  if (cat.type !== nextType) {
    throw new HttpApiError(
      400,
      `Kategori "${cat.name}" adalah kategori ${cat.type}, tidak sesuai dengan jenis ${nextType}.`
    );
  }
  const nextAmount =
    payload.amount !== undefined ? Math.round(Number(payload.amount || 0)) : existing.amount;
  if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > 100000000000) {
    throw new HttpApiError(400, 'Nominal transaksi harus lebih dari Rp 0.');
  }
  const targetKind: FinanceAccountKind = nextMethod === 'cash' ? 'cash' : 'rekening';
  const nextAccId = payload.accountId !== undefined ? payload.accountId : existing.accountId;
  const candidateAccount = nextAccId
    ? finDb.accounts.find((a) => a.id === nextAccId)
    : undefined;
  const matchedAccount =
    candidateAccount && candidateAccount.kind === targetKind
      ? candidateAccount
      : finDb.accounts.find((a) => a.kind === targetKind);

  const updated: FinanceTransaction = {
    ...existing,
    date: payload.date ? String(payload.date).slice(0, 10) : existing.date,
    type: nextType,
    method: nextMethod,
    categoryId: cat.id,
    categoryName: cat.name,
    accountId: matchedAccount?.id,
    title: payload.title !== undefined ? String(payload.title).trim().slice(0, 100) : existing.title,
    counterparty:
      payload.counterparty !== undefined
        ? String(payload.counterparty).trim().slice(0, 80)
        : existing.counterparty,
    bankAccount: matchedAccount
      ? formatFinanceAccountDisplay(matchedAccount)
      : payload.bankAccount !== undefined
      ? String(payload.bankAccount).trim().slice(0, 80)
      : existing.bankAccount,
    referenceNo:
      payload.referenceNo !== undefined
        ? String(payload.referenceNo).trim().slice(0, 40)
        : existing.referenceNo,
    amount: nextAmount,
    notes: payload.notes !== undefined ? String(payload.notes).trim().slice(0, 300) : existing.notes,
    updatedAt: new Date().toISOString(),
  };
  finDb.transactions[idx] = updated;
  writeFinanceDbSync(finDb);
  return updated;
}

export async function clientDeleteFinanceTransaction(
  adminToken: string,
  txId: string
): Promise<void> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  finDb.transactions = finDb.transactions.filter((t) => t.id !== txId);
  writeFinanceDbSync(finDb);
  void deleteBrowserSupabaseRow('finance_transactions', txId);
}

export async function clientGetFinanceBackupPayload(
  adminToken: string
): Promise<Record<string, unknown>> {
  assertAdminSession(adminToken);
  const finDb = readFinanceDbSync();
  return {
    app: 'KaryaPresensi-Finance',
    version: 2,
    exportedAt: new Date().toISOString(),
    ...finDb,
  };
}

export async function clientRestoreFinanceBackup(
  adminToken: string,
  backupPayload: unknown
): Promise<FinanceDatabaseState> {
  assertAdminSession(adminToken);
  const body = backupPayload as Partial<FinanceDatabaseState>;
  if (!body || !Array.isArray(body.categories) || !Array.isArray(body.transactions)) {
    throw new HttpApiError(400, 'Format file backup keuangan tidak valid.');
  }
  const restored = normalizeFinanceDb(body);
  writeFinanceDbSync(restored);
  return restored;
}

// ============================================================================
// DATABASE SETTINGS & SUPABASE DIAGNOSTICS DIRECT CLIENT OPERATIONS
// ============================================================================

function assertDatabaseSession(token: string): void {
  requireClientSession(
    'database',
    token,
    'Akses pengaturan database terkunci. Masukkan PIN terlebih dahulu.',
    'Sesi pengaturan database telah berakhir. Masukkan kembali PIN.'
  );
}

export async function clientUnlockDatabaseWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  await ensureClientHydratedOnce();
  if (!(await verifyDatabasePinHash(pin))) {
    throw new HttpApiError(401, 'PIN pengaturan database tidak valid.');
  }
  return issueClientSession('database', 'kp_db');
}

export async function clientLockDatabaseSession(token: string): Promise<void> {
  revokeClientSession('database', token);
}

export async function clientChangeDatabasePin(
  token: string,
  payload: { currentPin: string; newPin: string }
): Promise<void> {
  assertDatabaseSession(token);
  if (!(await verifyDatabasePinHash(payload.currentPin))) {
    throw new HttpApiError(401, 'PIN database saat ini tidak sesuai.');
  }
  const cleanNew = String(payload.newPin || '').trim();
  if (cleanNew.length < 4 || cleanNew.length > 20) {
    throw new HttpApiError(400, 'PIN database baru harus terdiri dari 4 hingga 20 karakter.');
  }
  const prev = readSecurityCfg();
  writeSecurityCfg({
    ...prev,
    databasePinSha256: await sha256Hex(cleanNew),
    updatedAt: new Date().toISOString(),
  });
}

const CLIENT_REQUIRED_TABLES: {
  tableName: string;
  firestoreCollection: string;
  module: DatabaseTableStatus['module'];
  description: string;
  requiredColumns: string[];
  getLocalCount: () => number;
}[] = [
  {
    tableName: 'employees',
    firestoreCollection: 'employees',
    module: 'Absensi',
    description: 'Data master karyawan, shift, dan jadwal libur individu',
    requiredColumns: ['id', 'employee_code', 'name', 'department', 'position', 'shift_name', 'off_days', 'active'],
    getLocalCount: () => readAttendanceDbSync().employees.length,
  },
  {
    tableName: 'attendance_records',
    firestoreCollection: 'attendance',
    module: 'Absensi',
    description: 'Log kehadiran harian, jam masuk/pulang, lembur, & izin datang terlambat',
    requiredColumns: ['id', 'employee_id', 'attendance_date', 'status', 'check_in', 'check_out', 'overtime_hours'],
    getLocalCount: () => readAttendanceDbSync().attendanceRecords.length,
  },
  {
    tableName: 'late_settlements',
    firestoreCollection: 'lateSettlements',
    module: 'Absensi',
    description: 'Riwayat penyelesaian / ganti keterlambatan karyawan',
    requiredColumns: ['id', 'employee_id', 'year_month', 'settlement_date', 'method', 'minutes_settled'],
    getLocalCount: () => readAttendanceDbSync().lateSettlements.length,
  },
  {
    tableName: 'app_settings',
    firestoreCollection: 'appSettings',
    module: 'Pengaturan',
    description: 'Identitas perusahaan, profil legalitas, cabang, dan konfigurasi shift',
    requiredColumns: ['id', 'company_name', 'company_subtitle', 'late_deduction_per_minute', 'shifts', 'company_profile'],
    getLocalCount: () => 1,
  },
  {
    tableName: 'payroll_settings',
    firestoreCollection: '(server-protected)',
    module: 'Penggajian',
    description: 'Kebijakan lembur, potongan alpha/izin, BPJS, dan tanggal gajian',
    requiredColumns: ['id', 'default_overtime_hourly_rate', 'default_alpha_deduction_per_day', 'bpjs_kesehatan_pct', 'payday_day_of_month'],
    getLocalCount: () => 1,
  },
  {
    tableName: 'payroll_profiles',
    firestoreCollection: '(server-protected)',
    module: 'Penggajian',
    description: 'Gaji pokok, tunjangan, dan rekening payroll tiap karyawan (PIN Superuser)',
    requiredColumns: ['employee_id', 'base_salary', 'position_allowance', 'transport_meal_allowance', 'bank_account_number'],
    getLocalCount: () => readPayrollDbSync().profiles.length,
  },
  {
    tableName: 'payroll_adjustments',
    firestoreCollection: '(server-protected)',
    module: 'Penggajian',
    description: 'Bonus, tunjangan tambahan, dan potongan kasbon bulanan',
    requiredColumns: ['id', 'employee_id', 'year_month', 'type', 'title', 'amount'],
    getLocalCount: () => readPayrollDbSync().adjustments.length,
  },
  {
    tableName: 'payroll_raises',
    firestoreCollection: '(server-protected)',
    module: 'Penggajian',
    description: 'Catatan riwayat kenaikan gaji karyawan',
    requiredColumns: ['id', 'employee_id', 'effective_month', 'method', 'previous_base_salary', 'new_base_salary'],
    getLocalCount: () => readPayrollDbSync().salaryRaises.length,
  },
  {
    tableName: 'payroll_statuses',
    firestoreCollection: '(server-protected)',
    module: 'Penggajian',
    description: 'Status persetujuan & pembayaran slip gaji per bulan',
    requiredColumns: ['id', 'employee_id', 'year_month', 'status', 'paid_at'],
    getLocalCount: () => readPayrollDbSync().statuses.length,
  },
  {
    tableName: 'finance_accounts',
    firestoreCollection: 'financeAccounts',
    module: 'Keuangan',
    description: 'Akun kas tunai & rekening bank perusahaan (BCA, BRI, Mandiri, dll)',
    requiredColumns: ['id', 'name', 'kind', 'bank_name', 'account_number', 'opening_balance'],
    getLocalCount: () => readFinanceDbSync().accounts.length,
  },
  {
    tableName: 'finance_categories',
    firestoreCollection: 'financeCategories',
    module: 'Keuangan',
    description: 'Kategori pendapatan dan pengeluaran perusahaan',
    requiredColumns: ['id', 'name', 'type', 'description'],
    getLocalCount: () => readFinanceDbSync().categories.length,
  },
  {
    tableName: 'finance_transactions',
    firestoreCollection: 'financeTransactions',
    module: 'Keuangan',
    description: 'Jurnal transaksi pendapatan & pengeluaran (cash & transfer)',
    requiredColumns: ['id', 'tx_date', 'type', 'method', 'category_id', 'account_id', 'title', 'amount'],
    getLocalCount: () => readFinanceDbSync().transactions.length,
  },
  {
    tableName: 'finance_transfers',
    firestoreCollection: 'financeTransfers',
    module: 'Keuangan',
    description: 'Catatan perpindahan dana antar kas tunai dan rekening bank',
    requiredColumns: ['id', 'transfer_date', 'from_account_id', 'to_account_id', 'amount'],
    getLocalCount: () => readFinanceDbSync().transfers.length,
  },
  {
    tableName: 'security_config',
    firestoreCollection: '(server-protected)',
    module: 'Keamanan',
    description: 'Hash SHA-256 PIN Mode Admin dan PIN Pengaturan Database',
    requiredColumns: ['id', 'admin_pin_sha256', 'database_pin_sha256', 'updated_at'],
    getLocalCount: () => 1,
  },
];

async function probeSupabaseTableBrowser(
  supabaseUrl: string,
  apiKey: string,
  tableName: string
): Promise<{
  tableName: string;
  status: 'available' | 'missing' | 'rls_blocked' | 'unreachable';
  recordCount: number;
  error?: string;
}> {
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
        const parsed = Number(contentRange.slice(slashIdx + 1).trim());
        if (Number.isFinite(parsed) && parsed >= 0) count = parsed;
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
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      tableName,
      status: 'unreachable',
      recordCount: 0,
      error: err instanceof Error ? err.message : 'Koneksi Supabase gagal.',
    };
  }
}

async function inspectDatabaseTablesClient(): Promise<DatabaseSchemaStatusResponse> {
  const cfg = readDbConfig();
  const sec = readSecurityCfg();
  if (cfg.engine !== 'supabase' || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    const tables: DatabaseTableStatus[] = CLIENT_REQUIRED_TABLES.map((t) => {
      const count = t.getLocalCount();
      return {
        tableName: t.tableName,
        firestoreCollection: t.firestoreCollection,
        module: t.module,
        description: t.description,
        storageFile: `localStorage://${t.tableName}`,
        exists: true,
        recordCount: count,
        localRecordCount: count,
        remoteStatus: 'local',
        requiredColumns: t.requiredColumns,
      };
    });
    return {
      config: { ...cfg, hasCustomDatabasePin: Boolean(sec.databasePinSha256) },
      tables,
      summary: {
        totalRequired: tables.length,
        existingCount: tables.length,
        missingCount: 0,
        totalRecords: tables.reduce((s, t) => s + t.recordCount, 0),
      },
    };
  }

  const probes = await Promise.all(
    CLIENT_REQUIRED_TABLES.map((t) =>
      probeSupabaseTableBrowser(
        cfg.supabaseUrl || DEFAULT_SUPABASE_URL,
        cfg.supabasePublishableKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
        t.tableName
      )
    )
  );
  const probeMap = new Map(probes.map((p) => [p.tableName, p]));
  const anyReachable = probes.some((p) => p.status !== 'unreachable');
  const firstErr = probes.find((p) => p.error)?.error ?? null;

  const tables: DatabaseTableStatus[] = CLIENT_REQUIRED_TABLES.map((t) => {
    const probe = probeMap.get(t.tableName);
    const remoteAvailable = probe?.status === 'available';
    const localCount = t.getLocalCount();
    return {
      tableName: t.tableName,
      firestoreCollection: t.firestoreCollection,
      module: t.module,
      description: t.description,
      storageFile: `supabase://${cfg.supabaseProjectId}/public/${t.tableName}`,
      exists: remoteAvailable,
      recordCount: remoteAvailable ? probe.recordCount : 0,
      localRecordCount: localCount,
      remoteStatus: probe?.status ?? 'unreachable',
      requiredColumns: t.requiredColumns,
    };
  });

  const existingCount = tables.filter((t) => t.exists).length;
  const totalRecords = tables.reduce((s, t) => s + t.recordCount, 0);

  return {
    config: {
      ...cfg,
      hasCustomDatabasePin: Boolean(sec.databasePinSha256),
      supabaseConnected: anyReachable && existingCount === tables.length,
      supabaseLastError: existingCount === tables.length ? null : firstErr,
    },
    tables,
    summary: {
      totalRequired: tables.length,
      existingCount,
      missingCount: tables.length - existingCount,
      totalRecords,
    },
  };
}

export async function clientFetchDatabaseSchemaStatus(
  token: string
): Promise<DatabaseSchemaStatusResponse> {
  assertDatabaseSession(token);
  const cfg = readDbConfig();
  writeDbConfig({ ...cfg, lastCheckedAt: new Date().toISOString() });
  return inspectDatabaseTablesClient();
}

export async function clientAutoCreateMissingTables(
  token: string
): Promise<DatabaseAutoInitResult> {
  assertDatabaseSession(token);
  const before = await inspectDatabaseTablesClient();
  const missingNames = before.tables.filter((t) => !t.exists).map((t) => t.tableName);
  const existingNames = before.tables.filter((t) => t.exists).map((t) => t.tableName);
  const cfg = readDbConfig();
  const nowIso = new Date().toISOString();

  if (cfg.engine === 'supabase' && missingNames.length > 0) {
    writeDbConfig({ ...cfg, lastCheckedAt: nowIso, updatedAt: nowIso });
    return {
      createdTables: [],
      alreadyExistingTables: existingNames,
      requiresManualSql: true,
      message: `Terdeteksi ${missingNames.length} tabel belum tersedia di Supabase (${cfg.supabaseProjectName}). Silakan buka tab "Copy Script Setting Tabel" -> pilih "Supabase" lalu jalankan di Supabase SQL Editor.`,
      status: before,
    };
  }

  if (cfg.engine === 'supabase') {
    await syncAttendanceToSupabaseBrowser(readAttendanceDbSync());
    await syncPayrollToSupabaseBrowser(readPayrollDbSync());
    await syncFinanceToSupabaseBrowser(readFinanceDbSync());
    await syncSecurityToSupabaseBrowser(readSecurityCfg());
  }

  writeDbConfig({
    ...cfg,
    lastCheckedAt: nowIso,
    lastAutoInitAt: nowIso,
    updatedAt: nowIso,
  });
  const after = await inspectDatabaseTablesClient();
  return {
    createdTables: [],
    alreadyExistingTables: existingNames,
    requiresManualSql: false,
    message: 'Seluruh 14 tabel tersedia dan data berhasil disinkronkan.',
    status: after,
  };
}

export async function clientSaveDatabaseConfig(
  token: string,
  payload: Record<string, unknown>
): Promise<DatabaseConnectionConfig> {
  assertDatabaseSession(token);
  const current = readDbConfig();
  const rawUrl =
    typeof payload.supabaseUrl === 'string' && payload.supabaseUrl.trim()
      ? payload.supabaseUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '')
      : current.supabaseUrl || DEFAULT_SUPABASE_URL;
  const match = rawUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const nextProjectId =
    typeof payload.supabaseProjectId === 'string' && payload.supabaseProjectId.trim()
      ? payload.supabaseProjectId.trim()
      : payload.supabaseUrl !== undefined
      ? match?.[1] || current.supabaseProjectId || DEFAULT_SUPABASE_PROJECT_ID
      : current.supabaseProjectId || DEFAULT_SUPABASE_PROJECT_ID;

  const nextCfg: DatabaseConnectionConfig = {
    ...current,
    engine: (payload.engine as DatabaseConnectionConfig['engine']) || current.engine,
    host: typeof payload.host === 'string' ? payload.host.trim() || current.host : current.host,
    port: typeof payload.port === 'number' && payload.port > 0 ? payload.port : current.port,
    databaseName:
      typeof payload.databaseName === 'string'
        ? payload.databaseName.trim() || current.databaseName
        : current.databaseName,
    schemaName:
      typeof payload.schemaName === 'string'
        ? payload.schemaName.trim() || current.schemaName
        : current.schemaName,
    tablePrefix:
      typeof payload.tablePrefix === 'string'
        ? payload.tablePrefix.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20)
        : current.tablePrefix,
    username:
      typeof payload.username === 'string' ? payload.username.trim() : current.username,
    sslMode: (payload.sslMode as DatabaseConnectionConfig['sslMode']) || current.sslMode,
    autoCreateMissingTables:
      typeof payload.autoCreateMissingTables === 'boolean'
        ? payload.autoCreateMissingTables
        : current.autoCreateMissingTables,
    supabaseProjectName:
      typeof payload.supabaseProjectName === 'string'
        ? payload.supabaseProjectName.trim() || current.supabaseProjectName
        : current.supabaseProjectName,
    supabaseProjectId: nextProjectId,
    supabaseUrl: rawUrl,
    supabaseRestUrl: `${rawUrl}/rest/v1/`,
    supabasePublishableKey:
      typeof payload.supabasePublishableKey === 'string' && payload.supabasePublishableKey.trim()
        ? payload.supabasePublishableKey.trim()
        : current.supabasePublishableKey,
    updatedAt: new Date().toISOString(),
  };
  writeDbConfig(nextCfg);
  const live = await inspectDatabaseTablesClient();
  return live.config;
}

export async function clientTestSupabaseConnection(
  token: string
): Promise<SupabaseTestResult> {
  assertDatabaseSession(token);
  const startedAt = Date.now();
  const cfg = readDbConfig();
  const status = await inspectDatabaseTablesClient();
  const latencyMs = Date.now() - startedAt;

  const existingTablesCount = status.summary.existingCount;
  const missingTablesCount = status.tables.filter((t) => t.remoteStatus === 'missing').length;
  const rlsBlockedCount = status.tables.filter((t) => t.remoteStatus === 'rls_blocked').length;
  const reachable = status.tables.some((t) => t.remoteStatus !== 'unreachable');

  let message = '';
  if (!reachable) {
    message = `Tidak dapat menjangkau endpoint Supabase (${cfg.supabaseUrl}). Periksa URL dan koneksi internet.`;
  } else if (existingTablesCount === status.summary.totalRequired) {
    message = `Terhubung langsung ke Supabase Project "${cfg.supabaseProjectName}" (${cfg.supabaseProjectId}) dalam ${latencyMs} ms — seluruh 14 tabel siap digunakan.`;
  } else if (rlsBlockedCount > 0) {
    message = `Supabase terjangkau (${latencyMs} ms), namun ${rlsBlockedCount} tabel terblokir RLS/policy dan ${missingTablesCount} tabel belum ada.`;
  } else {
    message = `Koneksi ke Supabase (${cfg.supabaseProjectName}) berhasil (${latencyMs} ms), namun ${missingTablesCount} dari 14 tabel belum dibuat di schema public.`;
  }

  return {
    ok: reachable && existingTablesCount === status.summary.totalRequired,
    reachable,
    latencyMs,
    projectName: cfg.supabaseProjectName || DEFAULT_SUPABASE_PROJECT_NAME,
    projectId: cfg.supabaseProjectId || DEFAULT_SUPABASE_PROJECT_ID,
    projectUrl: cfg.supabaseUrl || DEFAULT_SUPABASE_URL,
    restUrl: cfg.supabaseRestUrl || `${DEFAULT_SUPABASE_URL}/rest/v1/`,
    existingTablesCount,
    missingTablesCount,
    rlsBlockedCount,
    hasDbUrl: false,
    message,
    status,
  };
}

export async function clientSyncSupabaseDatabase(
  token: string,
  direction: 'push' | 'pull'
): Promise<SupabaseSyncResult> {
  assertDatabaseSession(token);
  let syncedTables: { tableName: string; rowCount: number }[] = [];
  let failedTables: { tableName: string; error: string }[] = [];

  if (direction === 'pull') {
    const res = await pullAllFromSupabaseBrowser();
    syncedTables = res.syncedTables;
    failedTables = res.failedTables;
  } else {
    const rAtt = await syncAttendanceToSupabaseBrowser(readAttendanceDbSync());
    const rPay = await syncPayrollToSupabaseBrowser(readPayrollDbSync());
    const rFin = await syncFinanceToSupabaseBrowser(readFinanceDbSync());
    const rSec = await syncSecurityToSupabaseBrowser(readSecurityCfg());
    syncedTables = [...rAtt.synced, ...rPay.synced, ...rFin.synced, ...rSec.synced];
    failedTables = [...rAtt.failed, ...rPay.failed, ...rFin.failed, ...rSec.failed];
  }

  const status = await inspectDatabaseTablesClient();
  const ok = failedTables.length === 0;
  const totalSyncedRows = syncedTables.reduce((s, t) => s + t.rowCount, 0);
  const message = ok
    ? direction === 'push'
      ? `Sinkronisasi Push berhasil: ${syncedTables.length} tabel (${totalSyncedRows} baris) tersimpan ke Supabase.`
      : `Sinkronisasi Pull berhasil: data terbaru dari ${syncedTables.length} tabel Supabase dimuat.`
    : `Sinkronisasi ${direction.toUpperCase()} sebagian gagal pada ${failedTables.length} tabel (${failedTables[0]?.tableName}: ${failedTables[0]?.error}).`;

  return {
    ok,
    direction,
    syncedTables,
    failedTables,
    message,
    status,
  };
}
