import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AppSettings,
  AttendanceRecord,
  CompanyProfile,
  Employee,
  EmployeeSalaryProfile,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransfer,
  LateSettlement,
  packNotesWithShift,
  PayrollAdjustment,
  PayrollMonthlyStatus,
  PayrollSettings,
  SalaryRaiseRecord,
  ShiftConfig,
  unpackShiftFromNotes,
} from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const FIREBASE_APPLET_META = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
};

export const BOOTSTRAPPED_ADMIN_EMAIL = 'assyfachanel99@gmail.com';
export const DEFAULT_ADMIN_PIN_SHA256 =
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{
  ok: boolean;
  offline: boolean;
  exists: boolean;
  message: string;
}> {
  try {
    const snap = await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      ok: true,
      offline: false,
      exists: snap.exists(),
      message: snap.exists()
        ? 'Koneksi Cloud Firestore aktif dan dokumen uji tersedia.'
        : 'Koneksi Cloud Firestore aktif (dokumen uji siap dibuat).',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return {
        ok: false,
        offline: true,
        exists: false,
        message: 'Klien Firestore sedang offline. Periksa konfigurasi Firebase atau jaringan.',
      };
    }
    return {
      ok: false,
      offline: false,
      exists: false,
      message: msg,
    };
  }
}

void testConnection();

export function subscribeFirebaseAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function signInFirebaseWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  await ensureFirebaseUserProfile(cred.user);
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export interface FirestoreCollectionCheck {
  collectionName: string;
  exists: boolean;
  sampleCount: number;
  error?: string;
}

export const INSPECTABLE_COLLECTIONS = [
  'test',
  'users',
  'appSettings',
  'employees',
  'attendance',
  'lateSettlements',
  'payrollSettings',
  'payrollProfiles',
  'payrollAdjustments',
  'payrollRaises',
  'payrollStatuses',
  'financeAccounts',
  'financeCategories',
  'financeTransactions',
  'financeTransfers',
  'securityConfig',
] as const;

export function sanitizeFirestoreId(raw: string, fallback = 'doc'): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `${fallback}_${Date.now()}`;
}

function normalizeTime(val: string | undefined, fallback = ''): string {
  const v = String(val || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}

function normalizeDate(val: string | undefined, fallback = '2026-11-01'): string {
  const v = String(val || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}

function normalizeYearMonth(val: string | undefined, fallback = '2026-11'): string {
  const v = String(val || '').trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : fallback;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val;
  }
  return new Date().toISOString();
}

function buildAppSettingsDocData(settings: AppSettings) {
  const shifts: ShiftConfig[] = Array.isArray(settings.shifts)
    ? settings.shifts.slice(0, 20).map((s, idx) => ({
        id: sanitizeFirestoreId(s.id || `shift_${idx + 1}`),
        name: String(s.name || `Shift ${idx + 1}`).slice(0, 40),
        startTime: normalizeTime(s.startTime, '08:00'),
        endTime: normalizeTime(s.endTime, '17:00'),
        lateToleranceMinutes: Math.max(0, Math.min(180, Number(s.lateToleranceMinutes ?? 10))),
      }))
    : [];

  const cp: Partial<CompanyProfile> = settings.companyProfile || {};
  const logoRaw = String(cp.logoDataUrl || '');
  const safeLogo = logoRaw.length <= 280000 ? logoRaw : '';

  const companyProfile: CompanyProfile = {
    legalName: String(cp.legalName || settings.companyName || 'KARYAPRESENSI').slice(0, 120),
    industry: String(cp.industry || '').slice(0, 120),
    taxId: String(cp.taxId || '').slice(0, 60),
    nib: String(cp.nib || '').slice(0, 60),
    establishedYear: String(cp.establishedYear || '').slice(0, 10),
    phone: String(cp.phone || '').slice(0, 40),
    email: String(cp.email || '').slice(0, 100),
    website: String(cp.website || '').slice(0, 150),
    address: String(cp.address || '').slice(0, 250),
    city: String(cp.city || '').slice(0, 80),
    postalCode: String(cp.postalCode || '').slice(0, 20),
    directorName: String(cp.directorName || '').slice(0, 100),
    hrManagerName: String(cp.hrManagerName || '').slice(0, 100),
    hrManagerTitle: String(cp.hrManagerTitle || '').slice(0, 100),
    workDaysSummary: String(cp.workDaysSummary || '').slice(0, 120),
    vision: String(cp.vision || '').slice(0, 400),
    mission: String(cp.mission || '').slice(0, 600),
    logoDataUrl: safeLogo,
    branches: Array.isArray(cp.branches)
      ? cp.branches.slice(0, 30).map((b, idx) => ({
          id: sanitizeFirestoreId(b.id || `branch_${idx + 1}`),
          name: String(b.name || 'Cabang').slice(0, 100),
          city: String(b.city || '').slice(0, 80),
          address: String(b.address || '').slice(0, 200),
          phone: String(b.phone || '').slice(0, 40),
          isHeadquarters: Boolean(b.isHeadquarters),
        }))
      : [],
  };

  return {
    id: 'primary',
    companyName: String(settings.companyName || 'KARYAPRESENSI').trim().slice(0, 120) || 'KARYAPRESENSI',
    companySubtitle: String(settings.companySubtitle || 'HRIS PERUSAHAAN').trim().slice(0, 120),
    lateDeductionPerMinute: Math.max(0, Number(settings.lateDeductionPerMinute || 0)),
    shiftCount: shifts.length,
    shifts,
    companyProfile,
    updatedAt: serverTimestamp(),
  };
}

function buildEmployeeDocData(emp: Employee, ownerUid: string, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(emp.id, 'emp');
  const empCode =
    String(emp.employeeCode || 'EMP001')
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 20) || 'EMP001';
  return {
    id: docId,
    userId: ownerUid,
    employeeCode: empCode.length >= 2 ? empCode : `${empCode}01`.slice(0, 20),
    name: (String(emp.name || 'Karyawan').trim() || 'Karyawan').slice(0, 100),
    department: (String(emp.department || 'Operasional').trim() || 'Operasional').slice(0, 60),
    position: (String(emp.position || 'Staf').trim() || 'Staf').slice(0, 60),
    shiftName: (String(emp.shiftName || 'Reguler').trim() || 'Reguler').slice(0, 40),
    shiftStart: normalizeTime(emp.shiftStart, '08:00'),
    shiftEnd: normalizeTime(emp.shiftEnd, '17:00'),
    offDays: Array.isArray(emp.offDays)
      ? emp.offDays
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          .slice(0, 7)
      : [],
    customOffDates: Array.isArray(emp.customOffDates)
      ? emp.customOffDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 31)
      : [],
    active: emp.active !== false,
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildAttendanceDocData(rec: AttendanceRecord, ownerUid: string, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(rec.id, 'att');
  const empId = sanitizeFirestoreId(rec.employeeId, 'emp');
  const empName = (String(rec.employeeName || 'Karyawan').trim() || 'Karyawan').slice(0, 100);
  return {
    id: docId,
    employeeId: empId,
    employeeName: empName.length >= 2 ? empName : `${empName} `,
    userId: ownerUid,
    date: normalizeDate(rec.date),
    status: rec.status,
    checkIn: normalizeTime(rec.checkIn, ''),
    checkOut: normalizeTime(rec.checkOut, ''),
    overtimeHours: Math.max(0, Math.min(24, Number(rec.overtimeHours || 0))),
    entryType: 'manual_admin' as const,
    notes: packNotesWithShift(String(rec.notes || ''), rec.shiftName),
    latePermitReason: String(rec.latePermitReason || '').slice(0, 200),
    latePermitEstimatedArrival: normalizeTime(rec.latePermitEstimatedArrival, ''),
    latePermitApprovedBy: String(rec.latePermitApprovedBy || '').slice(0, 100),
    recordedBy: String(rec.recordedBy || 'Admin HR').trim().slice(0, 128) || 'Admin HR',
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildLateSettlementDocData(ls: LateSettlement, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(ls.id, 'ls');
  return {
    id: docId,
    employeeId: sanitizeFirestoreId(ls.employeeId, 'emp'),
    employeeName: (String(ls.employeeName || 'Karyawan').trim() || 'Karyawan').slice(0, 100),
    yearMonth: normalizeYearMonth(ls.yearMonth),
    date: normalizeDate(ls.date),
    method: ls.method,
    minutesSettled: Math.max(0, Number(ls.minutesSettled || 0)),
    extraWorkStart: normalizeTime(ls.extraWorkStart, ''),
    extraWorkEnd: normalizeTime(ls.extraWorkEnd, ''),
    deductionAmount: Math.max(0, Number(ls.deductionAmount || 0)),
    notes: String(ls.notes || '').slice(0, 300),
    recordedBy: String(ls.recordedBy || 'Admin HR').trim().slice(0, 128) || 'Admin HR',
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildPayrollSettingsDocData(ps: PayrollSettings) {
  return {
    id: 'primary',
    defaultOvertimeHourlyRate: Math.max(0, Number(ps.defaultOvertimeHourlyRate || 0)),
    defaultAlphaDeductionPerDay: Math.max(0, Number(ps.defaultAlphaDeductionPerDay || 0)),
    defaultIzinDeductionPerDay: Math.max(0, Number(ps.defaultIzinDeductionPerDay || 0)),
    autoDeductRemainingLate: Boolean(ps.autoDeductRemainingLate),
    bpjsKesehatanPct: Math.max(0, Math.min(20, Number(ps.bpjsKesehatanPct || 0))),
    bpjsKetenagakerjaanPct: Math.max(0, Math.min(20, Number(ps.bpjsKetenagakerjaanPct || 0))),
    paydayDayOfMonth: Math.max(1, Math.min(31, Math.round(Number(ps.paydayDayOfMonth || 25)))),
    updatedAt: serverTimestamp(),
  };
}

function buildPayrollProfileDocData(p: EmployeeSalaryProfile) {
  const empId = sanitizeFirestoreId(p.employeeId, 'emp');
  return {
    employeeId: empId,
    baseSalary: Math.max(0, Number(p.baseSalary || 0)),
    positionAllowance: Math.max(0, Number(p.positionAllowance || 0)),
    transportMealAllowance: Math.max(0, Number(p.transportMealAllowance || 0)),
    otherAllowance: Math.max(0, Number(p.otherAllowance || 0)),
    overtimeHourlyRate: Math.max(0, Number(p.overtimeHourlyRate ?? 25000)),
    paydayDay: Math.max(1, Math.min(31, Math.round(Number(p.paydayDay ?? 25)))),
    paymentMethod: p.paymentMethod === 'tunai' ? 'tunai' : 'transfer',
    bankName: String(p.bankName || '').slice(0, 60),
    bankAccountNumber: String(p.bankAccountNumber || '').slice(0, 60),
    bankAccountHolder: String(p.bankAccountHolder || '').slice(0, 100),
    notes: String(p.notes || '').slice(0, 300),
    updatedAt: serverTimestamp(),
  };
}

function buildPayrollAdjustmentDocData(a: PayrollAdjustment, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(a.id, 'padj');
  return {
    id: docId,
    employeeId: sanitizeFirestoreId(a.employeeId, 'emp'),
    employeeName: (String(a.employeeName || 'Karyawan').trim() || 'Karyawan').slice(0, 100),
    yearMonth: normalizeYearMonth(a.yearMonth),
    type: a.type,
    title: (String(a.title || 'Penyesuaian').trim() || 'Penyesuaian').slice(0, 120),
    amount: Math.max(0, Number(a.amount || 0)),
    date: normalizeDate(a.date),
    notes: String(a.notes || '').slice(0, 300),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildPayrollRaiseDocData(r: SalaryRaiseRecord, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(r.id, 'praise');
  return {
    id: docId,
    employeeId: sanitizeFirestoreId(r.employeeId, 'emp'),
    employeeName: (String(r.employeeName || 'Karyawan').trim() || 'Karyawan').slice(0, 100),
    effectiveMonth: normalizeYearMonth(r.effectiveMonth),
    raiseDate: normalizeDate(r.raiseDate),
    method: r.method === 'persentase' ? 'persentase' : 'nominal',
    percentIncrease: Math.max(0, Number(r.percentIncrease || 0)),
    previousBaseSalary: Math.max(0, Number(r.previousBaseSalary || 0)),
    newBaseSalary: Math.max(0, Number(r.newBaseSalary || 0)),
    previousPositionAllowance: Math.max(0, Number(r.previousPositionAllowance || 0)),
    newPositionAllowance: Math.max(0, Number(r.newPositionAllowance || 0)),
    previousTransportMealAllowance: Math.max(0, Number(r.previousTransportMealAllowance || 0)),
    newTransportMealAllowance: Math.max(0, Number(r.newTransportMealAllowance || 0)),
    previousOtherAllowance: Math.max(0, Number(r.previousOtherAllowance || 0)),
    newOtherAllowance: Math.max(0, Number(r.newOtherAllowance || 0)),
    reason: String(r.reason || '').slice(0, 200),
    notes: String(r.notes || '').slice(0, 300),
    appliedToProfile: Boolean(r.appliedToProfile),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildPayrollStatusDocData(s: PayrollMonthlyStatus) {
  const docId = sanitizeFirestoreId(s.id, `${s.employeeId}_${s.yearMonth}`);
  return {
    id: docId,
    employeeId: sanitizeFirestoreId(s.employeeId, 'emp'),
    yearMonth: normalizeYearMonth(s.yearMonth),
    status: s.status,
    paidAt: String(s.paidAt || '').slice(0, 40),
    updatedAt: serverTimestamp(),
  };
}

function buildFinanceAccountDocData(acc: FinanceAccount, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(acc.id, 'facc');
  return {
    id: docId,
    name: (String(acc.name || 'Akun').trim() || 'Akun').slice(0, 100),
    kind: acc.kind === 'rekening' ? 'rekening' : 'cash',
    bankName: String(acc.bankName || '').slice(0, 60),
    accountNumber: String(acc.accountNumber || '').slice(0, 60),
    holderName: String(acc.holderName || '').slice(0, 100),
    openingBalance: Number(acc.openingBalance || 0),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildFinanceCategoryDocData(cat: FinanceCategory, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(cat.id, 'fcat');
  return {
    id: docId,
    name: (String(cat.name || 'Kategori').trim() || 'Kategori').slice(0, 100),
    type: cat.type === 'pengeluaran' ? 'pengeluaran' : 'pendapatan',
    description: String(cat.description || '').slice(0, 300),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildFinanceTransactionDocData(tx: FinanceTransaction, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(tx.id, 'ftx');
  return {
    id: docId,
    date: normalizeDate(tx.date),
    type: tx.type === 'pengeluaran' ? 'pengeluaran' : 'pendapatan',
    method: tx.method === 'transfer' ? 'transfer' : 'cash',
    categoryId: sanitizeFirestoreId(tx.categoryId, 'fcat'),
    categoryName: (String(tx.categoryName || 'Umum').trim() || 'Umum').slice(0, 100),
    accountId: sanitizeFirestoreId(tx.accountId || 'acc_cash_main', 'acc_cash_main'),
    title: (String(tx.title || 'Transaksi').trim() || 'Transaksi').slice(0, 150),
    counterparty: String(tx.counterparty || '').slice(0, 100),
    bankAccount: String(tx.bankAccount || '').slice(0, 120),
    referenceNo: String(tx.referenceNo || '').slice(0, 50),
    amount: Math.max(0, Number(tx.amount || 0)),
    notes: String(tx.notes || '').slice(0, 300),
    recordedBy: (String(tx.recordedBy || 'Admin Mode').trim() || 'Admin Mode').slice(0, 100),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildFinanceTransferDocData(tr: FinanceTransfer, existingCreatedAt?: unknown) {
  const docId = sanitizeFirestoreId(tr.id, 'ftr');
  return {
    id: docId,
    date: normalizeDate(tr.date),
    fromAccountId: sanitizeFirestoreId(tr.fromAccountId, 'acc_cash_main'),
    fromAccountName: (String(tr.fromAccountName || 'Akun Asal').trim() || 'Akun Asal').slice(0, 100),
    toAccountId: sanitizeFirestoreId(tr.toAccountId, 'acc_bank_bca'),
    toAccountName: (String(tr.toAccountName || 'Akun Tujuan').trim() || 'Akun Tujuan').slice(0, 100),
    amount: Math.max(1, Number(tr.amount || 1)),
    referenceNo: String(tr.referenceNo || '').slice(0, 50),
    notes: String(tr.notes || '').slice(0, 300),
    recordedBy: (String(tr.recordedBy || 'Admin Mode').trim() || 'Admin Mode').slice(0, 100),
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function ensureFirebaseUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(ref);
    const isAdminEmail =
      String(user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: String(user.email || 'admin@karyapresensi.co.id').slice(0, 150),
        displayName:
          String(user.displayName || user.email || 'Admin Karyapresensi').trim().slice(0, 100) ||
          'Admin Karyapresensi',
        role: isAdminEmail ? 'admin' : 'employee',
        employeeId: sanitizeFirestoreId(`usr_${user.uid}`, 'usr'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = existingSnap.data();
      await setDoc(ref, {
        uid: user.uid,
        email: String(user.email || data.email || 'admin@karyapresensi.co.id').slice(0, 150),
        displayName:
          String(user.displayName || data.displayName || 'Admin Karyapresensi').trim().slice(0, 100) ||
          'Admin Karyapresensi',
        role: isAdminEmail ? 'admin' : data.role === 'admin' ? 'admin' : 'employee',
        employeeId: sanitizeFirestoreId(data.employeeId || `usr_${user.uid}`, 'usr'),
        createdAt: data.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function inspectFirestoreCollections(): Promise<FirestoreCollectionCheck[]> {
  if (!auth.currentUser) {
    throw new Error(
      'Silakan masuk dengan akun Google Admin terlebih dahulu untuk memeriksa Cloud Firestore.'
    );
  }

  const results: FirestoreCollectionCheck[] = [];
  for (const colName of INSPECTABLE_COLLECTIONS) {
    try {
      const q = query(collection(db, colName), limit(25));
      const snap = await getDocs(q);
      results.push({
        collectionName: colName,
        exists: !snap.empty,
        sampleCount: snap.size,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
        handleFirestoreError(error, OperationType.LIST, colName);
      }
      results.push({
        collectionName: colName,
        exists: false,
        sampleCount: 0,
        error: msg,
      });
    }
  }
  return results;
}

async function commitBatchedWrites(
  ops: { collectionName: string; docId: string; data: DocumentData }[]
): Promise<number> {
  let count = 0;
  for (let i = 0; i < ops.length; i += 350) {
    const chunk = ops.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(doc(db, op.collectionName, op.docId), op.data);
      count += 1;
    }
    await batch.commit();
  }
  return count;
}

export interface AutoInitFirestorePayload {
  settings: AppSettings;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  payrollSettings?: PayrollSettings;
  payrollProfiles?: EmployeeSalaryProfile[];
  payrollAdjustments?: PayrollAdjustment[];
  payrollRaises?: SalaryRaiseRecord[];
  payrollStatuses?: PayrollMonthlyStatus[];
  financeAccounts?: FinanceAccount[];
  financeCategories?: FinanceCategory[];
  financeTransactions?: FinanceTransaction[];
  financeTransfers?: FinanceTransfer[];
  securityConfig?: {
    adminPinSha256: string;
    databasePinSha256?: string;
  };
  forceOverwrite?: boolean;
}

export async function autoInitializeFirestoreCollections(
  payload: AutoInitFirestorePayload
): Promise<{
  createdCollections: string[];
  syncedDocsCount: number;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Silakan login dengan akun Google Admin terlebih dahulu sebelum inisialisasi Firestore.'
    );
  }

  const createdCollections: string[] = [];
  let syncedDocsCount = 0;
  const force = Boolean(payload.forceOverwrite);

  // 0. Ensure user profile doc exists first
  await ensureFirebaseUserProfile(user);

  // 1. Ensure test/connection
  try {
    const connRef = doc(db, 'test', 'connection');
    const connSnap = await getDocFromServer(connRef);
    if (!connSnap.exists() || force) {
      await setDoc(connRef, {
        id: 'connection',
        status: 'connected',
        updatedAt: serverTimestamp(),
      });
      if (!connSnap.exists()) createdCollections.push('test');
      syncedDocsCount += 1;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'test/connection');
  }

  // 2. Ensure appSettings/primary
  try {
    const setRef = doc(db, 'appSettings', 'primary');
    const setSnap = await getDoc(setRef);
    if (!setSnap.exists() || force) {
      await setDoc(setRef, buildAppSettingsDocData(payload.settings));
      if (!setSnap.exists()) createdCollections.push('appSettings');
      syncedDocsCount += 1;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'appSettings/primary');
  }

  // 3. Employees (must be committed before attendance, lateSettlements, payroll*)
  const validEmployeeIds = new Set<string>();
  try {
    const empSnap = await getDocs(collection(db, 'employees'));
    const existingMap = new Map<string, DocumentData>();
    for (const d of empSnap.docs) {
      existingMap.set(d.id, d.data());
      validEmployeeIds.add(d.id);
    }
    if ((empSnap.empty || force) && payload.employees.length > 0) {
      const ops = payload.employees.map((emp) => {
        const docId = sanitizeFirestoreId(emp.id, 'emp');
        validEmployeeIds.add(docId);
        return {
          collectionName: 'employees',
          docId,
          data: buildEmployeeDocData(emp, user.uid, existingMap.get(docId)?.createdAt),
        };
      });
      syncedDocsCount += await commitBatchedWrites(ops);
      if (empSnap.empty) createdCollections.push('employees');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'employees');
  }

  // 4. Attendance
  try {
    const attSnap = await getDocs(collection(db, 'attendance'));
    const existingMap = new Map<string, DocumentData>();
    for (const d of attSnap.docs) existingMap.set(d.id, d.data());
    if ((attSnap.empty || force) && payload.attendanceRecords.length > 0) {
      const ops = payload.attendanceRecords
        .filter((r) => validEmployeeIds.has(sanitizeFirestoreId(r.employeeId, 'emp')))
        .map((rec) => {
          const docId = sanitizeFirestoreId(rec.id, 'att');
          return {
            collectionName: 'attendance',
            docId,
            data: buildAttendanceDocData(rec, user.uid, existingMap.get(docId)?.createdAt),
          };
        });
      if (ops.length > 0) {
        syncedDocsCount += await commitBatchedWrites(ops);
        if (attSnap.empty) createdCollections.push('attendance');
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }

  // 5. Late Settlements
  try {
    const lsSnap = await getDocs(collection(db, 'lateSettlements'));
    const existingMap = new Map<string, DocumentData>();
    for (const d of lsSnap.docs) existingMap.set(d.id, d.data());
    if ((lsSnap.empty || force) && payload.lateSettlements.length > 0) {
      const ops = payload.lateSettlements
        .filter((s) => validEmployeeIds.has(sanitizeFirestoreId(s.employeeId, 'emp')))
        .map((ls) => {
          const docId = sanitizeFirestoreId(ls.id, 'ls');
          return {
            collectionName: 'lateSettlements',
            docId,
            data: buildLateSettlementDocData(ls, existingMap.get(docId)?.createdAt),
          };
        });
      if (ops.length > 0) {
        syncedDocsCount += await commitBatchedWrites(ops);
        if (lsSnap.empty) createdCollections.push('lateSettlements');
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'lateSettlements');
  }

  // 6. Payroll Settings
  if (payload.payrollSettings) {
    try {
      const psRef = doc(db, 'payrollSettings', 'primary');
      const psSnap = await getDoc(psRef);
      if (!psSnap.exists() || force) {
        await setDoc(psRef, buildPayrollSettingsDocData(payload.payrollSettings));
        if (!psSnap.exists()) createdCollections.push('payrollSettings');
        syncedDocsCount += 1;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payrollSettings/primary');
    }
  }

  // 7. Payroll Profiles
  if (payload.payrollProfiles && payload.payrollProfiles.length > 0) {
    try {
      const ppSnap = await getDocs(query(collection(db, 'payrollProfiles'), limit(1)));
      if (ppSnap.empty || force) {
        const ops = payload.payrollProfiles
          .filter((p) => validEmployeeIds.has(sanitizeFirestoreId(p.employeeId, 'emp')))
          .map((p) => ({
            collectionName: 'payrollProfiles',
            docId: sanitizeFirestoreId(p.employeeId, 'emp'),
            data: buildPayrollProfileDocData(p),
          }));
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (ppSnap.empty) createdCollections.push('payrollProfiles');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payrollProfiles');
    }
  }

  // 8. Payroll Adjustments
  if (payload.payrollAdjustments && payload.payrollAdjustments.length > 0) {
    try {
      const paSnap = await getDocs(collection(db, 'payrollAdjustments'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of paSnap.docs) existingMap.set(d.id, d.data());
      if (paSnap.empty || force) {
        const ops = payload.payrollAdjustments
          .filter((a) => validEmployeeIds.has(sanitizeFirestoreId(a.employeeId, 'emp')))
          .map((a) => {
            const docId = sanitizeFirestoreId(a.id, 'padj');
            return {
              collectionName: 'payrollAdjustments',
              docId,
              data: buildPayrollAdjustmentDocData(a, existingMap.get(docId)?.createdAt),
            };
          });
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (paSnap.empty) createdCollections.push('payrollAdjustments');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payrollAdjustments');
    }
  }

  // 9. Payroll Raises
  if (payload.payrollRaises && payload.payrollRaises.length > 0) {
    try {
      const prSnap = await getDocs(collection(db, 'payrollRaises'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of prSnap.docs) existingMap.set(d.id, d.data());
      if (prSnap.empty || force) {
        const ops = payload.payrollRaises
          .filter((r) => validEmployeeIds.has(sanitizeFirestoreId(r.employeeId, 'emp')))
          .map((r) => {
            const docId = sanitizeFirestoreId(r.id, 'praise');
            return {
              collectionName: 'payrollRaises',
              docId,
              data: buildPayrollRaiseDocData(r, existingMap.get(docId)?.createdAt),
            };
          });
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (prSnap.empty) createdCollections.push('payrollRaises');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payrollRaises');
    }
  }

  // 10. Payroll Statuses
  if (payload.payrollStatuses && payload.payrollStatuses.length > 0) {
    try {
      const pstSnap = await getDocs(query(collection(db, 'payrollStatuses'), limit(1)));
      if (pstSnap.empty || force) {
        const ops = payload.payrollStatuses
          .filter((s) => validEmployeeIds.has(sanitizeFirestoreId(s.employeeId, 'emp')))
          .map((s) => ({
            collectionName: 'payrollStatuses',
            docId: sanitizeFirestoreId(s.id, `${s.employeeId}_${s.yearMonth}`),
            data: buildPayrollStatusDocData(s),
          }));
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (pstSnap.empty) createdCollections.push('payrollStatuses');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payrollStatuses');
    }
  }

  // 11. Finance Accounts (must be committed before financeTransfers)
  const validAccountIds = new Set<string>();
  if (payload.financeAccounts && payload.financeAccounts.length > 0) {
    try {
      const faSnap = await getDocs(collection(db, 'financeAccounts'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of faSnap.docs) {
        existingMap.set(d.id, d.data());
        validAccountIds.add(d.id);
      }
      if (faSnap.empty || force) {
        const ops = payload.financeAccounts.map((acc) => {
          const docId = sanitizeFirestoreId(acc.id, 'facc');
          validAccountIds.add(docId);
          return {
            collectionName: 'financeAccounts',
            docId,
            data: buildFinanceAccountDocData(acc, existingMap.get(docId)?.createdAt),
          };
        });
        syncedDocsCount += await commitBatchedWrites(ops);
        if (faSnap.empty) createdCollections.push('financeAccounts');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeAccounts');
    }
  }

  // 12. Finance Categories (must be committed before financeTransactions)
  const validCategoryIds = new Set<string>();
  if (payload.financeCategories && payload.financeCategories.length > 0) {
    try {
      const fcSnap = await getDocs(collection(db, 'financeCategories'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of fcSnap.docs) {
        existingMap.set(d.id, d.data());
        validCategoryIds.add(d.id);
      }
      if (fcSnap.empty || force) {
        const ops = payload.financeCategories.map((cat) => {
          const docId = sanitizeFirestoreId(cat.id, 'fcat');
          validCategoryIds.add(docId);
          return {
            collectionName: 'financeCategories',
            docId,
            data: buildFinanceCategoryDocData(cat, existingMap.get(docId)?.createdAt),
          };
        });
        syncedDocsCount += await commitBatchedWrites(ops);
        if (fcSnap.empty) createdCollections.push('financeCategories');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeCategories');
    }
  }

  // 13. Finance Transactions
  if (payload.financeTransactions && payload.financeTransactions.length > 0) {
    try {
      const ftSnap = await getDocs(collection(db, 'financeTransactions'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of ftSnap.docs) existingMap.set(d.id, d.data());
      if (ftSnap.empty || force) {
        const ops = payload.financeTransactions
          .filter((tx) => validCategoryIds.has(sanitizeFirestoreId(tx.categoryId, 'fcat')))
          .map((tx) => {
            const docId = sanitizeFirestoreId(tx.id, 'ftx');
            return {
              collectionName: 'financeTransactions',
              docId,
              data: buildFinanceTransactionDocData(tx, existingMap.get(docId)?.createdAt),
            };
          });
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (ftSnap.empty) createdCollections.push('financeTransactions');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeTransactions');
    }
  }

  // 14. Finance Transfers
  if (payload.financeTransfers && payload.financeTransfers.length > 0) {
    try {
      const ftrSnap = await getDocs(collection(db, 'financeTransfers'));
      const existingMap = new Map<string, DocumentData>();
      for (const d of ftrSnap.docs) existingMap.set(d.id, d.data());
      if (ftrSnap.empty || force) {
        const ops = payload.financeTransfers
          .filter(
            (tr) =>
              validAccountIds.has(sanitizeFirestoreId(tr.fromAccountId, 'acc_cash_main')) &&
              validAccountIds.has(sanitizeFirestoreId(tr.toAccountId, 'acc_bank_bca')) &&
              sanitizeFirestoreId(tr.fromAccountId, '') !== sanitizeFirestoreId(tr.toAccountId, '')
          )
          .map((tr) => {
            const docId = sanitizeFirestoreId(tr.id, 'ftr');
            return {
              collectionName: 'financeTransfers',
              docId,
              data: buildFinanceTransferDocData(tr, existingMap.get(docId)?.createdAt),
            };
          });
        if (ops.length > 0) {
          syncedDocsCount += await commitBatchedWrites(ops);
          if (ftrSnap.empty) createdCollections.push('financeTransfers');
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeTransfers');
    }
  }

  // 15. Security Config
  try {
    const secRef = doc(db, 'securityConfig', 'primary');
    const secSnap = await getDoc(secRef);
    if (!secSnap.exists() || force) {
      const adminPin =
        payload.securityConfig?.adminPinSha256 &&
        /^[a-f0-9]{64}$/i.test(payload.securityConfig.adminPinSha256)
          ? payload.securityConfig.adminPinSha256.toLowerCase()
          : DEFAULT_ADMIN_PIN_SHA256;
      const dbPin =
        payload.securityConfig?.databasePinSha256 &&
        /^[a-f0-9]{64}$/i.test(payload.securityConfig.databasePinSha256)
          ? payload.securityConfig.databasePinSha256.toLowerCase()
          : '';
      await setDoc(secRef, {
        id: 'primary',
        adminPinSha256: adminPin,
        databasePinSha256: dbPin,
        updatedAt: serverTimestamp(),
      });
      if (!secSnap.exists()) createdCollections.push('securityConfig');
      syncedDocsCount += 1;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'securityConfig/primary');
  }

  return { createdCollections, syncedDocsCount };
}

export async function pushAllLocalStateToFirestore(payload: AutoInitFirestorePayload) {
  return autoInitializeFirestoreCollections({ ...payload, forceOverwrite: true });
}

export interface PulledFirestoreState {
  settings: Partial<AppSettings> | null;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  payrollSettings: PayrollSettings | null;
  payrollProfiles: EmployeeSalaryProfile[];
  payrollAdjustments: PayrollAdjustment[];
  payrollRaises: SalaryRaiseRecord[];
  payrollStatuses: PayrollMonthlyStatus[];
  financeAccounts: FinanceAccount[];
  financeCategories: FinanceCategory[];
  financeTransactions: FinanceTransaction[];
  financeTransfers: FinanceTransfer[];
  securityConfig: { adminPinSha256: string; databasePinSha256?: string } | null;
}

export async function fetchAllStateFromFirestore(): Promise<PulledFirestoreState> {
  if (!auth.currentUser) {
    throw new Error('Silakan masuk dengan akun Google Admin terlebih dahulu.');
  }

  let settings: Partial<AppSettings> | null = null;
  try {
    const snap = await getDoc(doc(db, 'appSettings', 'primary'));
    if (snap.exists()) {
      const d = snap.data();
      settings = {
        companyName: String(d.companyName || 'KARYAPRESENSI'),
        companySubtitle: String(d.companySubtitle || 'HRIS PERUSAHAAN'),
        lateDeductionPerMinute: Number(d.lateDeductionPerMinute || 1000),
        shifts: Array.isArray(d.shifts) ? (d.shifts as ShiftConfig[]) : [],
        companyProfile: d.companyProfile ? (d.companyProfile as CompanyProfile) : undefined,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'appSettings/primary');
  }

  let employees: Employee[] = [];
  try {
    const snap = await getDocs(collection(db, 'employees'));
    employees = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        employeeCode: String(x.employeeCode || 'EMP001'),
        name: String(x.name || ''),
        department: String(x.department || ''),
        position: String(x.position || ''),
        shiftName: String(x.shiftName || 'Reguler'),
        shiftStart: String(x.shiftStart || '08:00'),
        shiftEnd: String(x.shiftEnd || '17:00'),
        offDays: Array.isArray(x.offDays) ? x.offDays.map(Number) : [],
        customOffDates: Array.isArray(x.customOffDates) ? x.customOffDates.map(String) : [],
        active: x.active !== false,
        createdAt: timestampToIso(x.createdAt),
        updatedAt: timestampToIso(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'employees');
  }

  let attendanceRecords: AttendanceRecord[] = [];
  try {
    const snap = await getDocs(collection(db, 'attendance'));
    attendanceRecords = snap.docs.map((d) => {
      const x = d.data();
      const unpacked = unpackShiftFromNotes(String(x.notes || ''));
      return {
        id: String(x.id || d.id),
        employeeId: String(x.employeeId || ''),
        employeeName: String(x.employeeName || ''),
        date: String(x.date || ''),
        status: x.status,
        ...(unpacked.shiftName ? { shiftName: unpacked.shiftName } : {}),
        checkIn: String(x.checkIn || ''),
        checkOut: String(x.checkOut || ''),
        overtimeHours: Number(x.overtimeHours || 0),
        notes: unpacked.notes,
        latePermitReason: x.latePermitReason ? String(x.latePermitReason) : undefined,
        latePermitEstimatedArrival: x.latePermitEstimatedArrival
          ? String(x.latePermitEstimatedArrival)
          : undefined,
        latePermitApprovedBy: x.latePermitApprovedBy ? String(x.latePermitApprovedBy) : undefined,
        recordedBy: String(x.recordedBy || 'Admin HR'),
        createdAt: timestampToIso(x.createdAt),
        updatedAt: timestampToIso(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attendance');
  }

  let lateSettlements: LateSettlement[] = [];
  try {
    const snap = await getDocs(collection(db, 'lateSettlements'));
    lateSettlements = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        employeeId: String(x.employeeId || ''),
        employeeName: String(x.employeeName || ''),
        yearMonth: String(x.yearMonth || ''),
        date: String(x.date || ''),
        method: x.method,
        minutesSettled: Number(x.minutesSettled || 0),
        extraWorkStart: x.extraWorkStart ? String(x.extraWorkStart) : undefined,
        extraWorkEnd: x.extraWorkEnd ? String(x.extraWorkEnd) : undefined,
        deductionAmount: x.deductionAmount ? Number(x.deductionAmount) : undefined,
        notes: String(x.notes || ''),
        recordedBy: String(x.recordedBy || 'Admin HR'),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'lateSettlements');
  }

  let payrollSettings: PayrollSettings | null = null;
  try {
    const snap = await getDoc(doc(db, 'payrollSettings', 'primary'));
    if (snap.exists()) {
      const x = snap.data();
      payrollSettings = {
        defaultOvertimeHourlyRate: Number(x.defaultOvertimeHourlyRate ?? 25000),
        defaultAlphaDeductionPerDay: Number(x.defaultAlphaDeductionPerDay ?? 150000),
        defaultIzinDeductionPerDay: Number(x.defaultIzinDeductionPerDay ?? 0),
        autoDeductRemainingLate: Boolean(x.autoDeductRemainingLate ?? true),
        bpjsKesehatanPct: Number(x.bpjsKesehatanPct ?? 1),
        bpjsKetenagakerjaanPct: Number(x.bpjsKetenagakerjaanPct ?? 2),
        paydayDayOfMonth: Number(x.paydayDayOfMonth ?? 25),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'payrollSettings/primary');
  }

  let payrollProfiles: EmployeeSalaryProfile[] = [];
  try {
    const snap = await getDocs(collection(db, 'payrollProfiles'));
    payrollProfiles = snap.docs.map((d) => {
      const x = d.data();
      return {
        employeeId: String(x.employeeId || d.id),
        baseSalary: Number(x.baseSalary || 0),
        positionAllowance: Number(x.positionAllowance || 0),
        transportMealAllowance: Number(x.transportMealAllowance || 0),
        otherAllowance: Number(x.otherAllowance || 0),
        overtimeHourlyRate: Number(x.overtimeHourlyRate ?? 25000),
        paydayDay: Number(x.paydayDay ?? 25),
        paymentMethod: x.paymentMethod === 'tunai' ? 'tunai' : 'transfer',
        bankName: String(x.bankName || ''),
        bankAccountNumber: String(x.bankAccountNumber || ''),
        bankAccountHolder: String(x.bankAccountHolder || ''),
        notes: String(x.notes || ''),
        updatedAt: timestampToIso(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payrollProfiles');
  }

  let payrollAdjustments: PayrollAdjustment[] = [];
  try {
    const snap = await getDocs(collection(db, 'payrollAdjustments'));
    payrollAdjustments = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        employeeId: String(x.employeeId || ''),
        employeeName: String(x.employeeName || ''),
        yearMonth: String(x.yearMonth || ''),
        type: x.type,
        title: String(x.title || ''),
        amount: Number(x.amount || 0),
        date: String(x.date || ''),
        notes: String(x.notes || ''),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payrollAdjustments');
  }

  let payrollRaises: SalaryRaiseRecord[] = [];
  try {
    const snap = await getDocs(collection(db, 'payrollRaises'));
    payrollRaises = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        employeeId: String(x.employeeId || ''),
        employeeName: String(x.employeeName || ''),
        effectiveMonth: String(x.effectiveMonth || ''),
        raiseDate: String(x.raiseDate || ''),
        method: x.method === 'persentase' ? 'persentase' : 'nominal',
        percentIncrease: Number(x.percentIncrease || 0),
        previousBaseSalary: Number(x.previousBaseSalary || 0),
        newBaseSalary: Number(x.newBaseSalary || 0),
        previousPositionAllowance: Number(x.previousPositionAllowance || 0),
        newPositionAllowance: Number(x.newPositionAllowance || 0),
        previousTransportMealAllowance: Number(x.previousTransportMealAllowance || 0),
        newTransportMealAllowance: Number(x.newTransportMealAllowance || 0),
        previousOtherAllowance: Number(x.previousOtherAllowance || 0),
        newOtherAllowance: Number(x.newOtherAllowance || 0),
        reason: String(x.reason || ''),
        notes: String(x.notes || ''),
        appliedToProfile: Boolean(x.appliedToProfile),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payrollRaises');
  }

  let payrollStatuses: PayrollMonthlyStatus[] = [];
  try {
    const snap = await getDocs(collection(db, 'payrollStatuses'));
    payrollStatuses = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        employeeId: String(x.employeeId || ''),
        yearMonth: String(x.yearMonth || ''),
        status: x.status,
        paidAt: x.paidAt ? String(x.paidAt) : undefined,
        updatedAt: timestampToIso(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payrollStatuses');
  }

  let financeAccounts: FinanceAccount[] = [];
  try {
    const snap = await getDocs(collection(db, 'financeAccounts'));
    financeAccounts = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        name: String(x.name || ''),
        kind: x.kind === 'rekening' ? 'rekening' : 'cash',
        bankName: String(x.bankName || ''),
        accountNumber: String(x.accountNumber || ''),
        holderName: String(x.holderName || ''),
        openingBalance: Number(x.openingBalance || 0),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'financeAccounts');
  }

  let financeCategories: FinanceCategory[] = [];
  try {
    const snap = await getDocs(collection(db, 'financeCategories'));
    financeCategories = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        name: String(x.name || ''),
        type: x.type === 'pengeluaran' ? 'pengeluaran' : 'pendapatan',
        description: String(x.description || ''),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'financeCategories');
  }

  let financeTransactions: FinanceTransaction[] = [];
  try {
    const snap = await getDocs(collection(db, 'financeTransactions'));
    financeTransactions = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        date: String(x.date || ''),
        type: x.type === 'pengeluaran' ? 'pengeluaran' : 'pendapatan',
        method: x.method === 'transfer' ? 'transfer' : 'cash',
        categoryId: String(x.categoryId || ''),
        categoryName: String(x.categoryName || ''),
        accountId: x.accountId ? String(x.accountId) : undefined,
        title: String(x.title || ''),
        counterparty: String(x.counterparty || ''),
        bankAccount: String(x.bankAccount || ''),
        referenceNo: String(x.referenceNo || ''),
        amount: Number(x.amount || 0),
        notes: String(x.notes || ''),
        recordedBy: String(x.recordedBy || 'Admin Mode'),
        createdAt: timestampToIso(x.createdAt),
        updatedAt: timestampToIso(x.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'financeTransactions');
  }

  let financeTransfers: FinanceTransfer[] = [];
  try {
    const snap = await getDocs(collection(db, 'financeTransfers'));
    financeTransfers = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        date: String(x.date || ''),
        fromAccountId: String(x.fromAccountId || ''),
        fromAccountName: String(x.fromAccountName || ''),
        toAccountId: String(x.toAccountId || ''),
        toAccountName: String(x.toAccountName || ''),
        amount: Number(x.amount || 0),
        referenceNo: String(x.referenceNo || ''),
        notes: String(x.notes || ''),
        recordedBy: String(x.recordedBy || 'Admin Mode'),
        createdAt: timestampToIso(x.createdAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'financeTransfers');
  }

  let securityConfig: { adminPinSha256: string; databasePinSha256?: string } | null = null;
  try {
    const snap = await getDoc(doc(db, 'securityConfig', 'primary'));
    if (snap.exists()) {
      const x = snap.data();
      if (typeof x.adminPinSha256 === 'string' && /^[a-f0-9]{64}$/i.test(x.adminPinSha256)) {
        securityConfig = {
          adminPinSha256: x.adminPinSha256,
          databasePinSha256:
            typeof x.databasePinSha256 === 'string' && /^[a-f0-9]{64}$/i.test(x.databasePinSha256)
              ? x.databasePinSha256
              : undefined,
        };
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'securityConfig/primary');
  }

  return {
    settings,
    employees,
    attendanceRecords,
    lateSettlements,
    payrollSettings,
    payrollProfiles,
    payrollAdjustments,
    payrollRaises,
    payrollStatuses,
    financeAccounts,
    financeCategories,
    financeTransactions,
    financeTransfers,
    securityConfig,
  };
}

// ============================================================================
// GRANULAR REALTIME FIRESTORE SYNC HELPERS (NON-BLOCKING BACKGROUND WHEN AUTHED)
// ============================================================================

function getVerifiedCurrentUser(): User | null {
  const u = auth.currentUser;
  if (!u || !u.emailVerified) return null;
  return u;
}

async function upsertDocWithImmutableCreatedAt(
  colName: string,
  docId: string,
  buildFn: (existingCreatedAt?: unknown) => DocumentData
): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const path = `${colName}/${docId}`;
  try {
    const ref = doc(db, colName, docId);
    const snap = await getDoc(ref);
    const existingCreatedAt = snap.exists() ? snap.data()?.createdAt : undefined;
    await setDoc(ref, buildFn(existingCreatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function removeDocIfAuthed(colName: string, docId: string): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const path = `${colName}/${docId}`;
  try {
    await deleteDoc(doc(db, colName, docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncAppSettingsToFirestore(settings: AppSettings): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const path = 'appSettings/primary';
  try {
    await setDoc(doc(db, 'appSettings', 'primary'), buildAppSettingsDocData(settings));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertEmployeeFirestore(emp: Employee): Promise<void> {
  const u = getVerifiedCurrentUser();
  if (!u) return;
  const docId = sanitizeFirestoreId(emp.id, 'emp');
  await upsertDocWithImmutableCreatedAt('employees', docId, (createdAt) =>
    buildEmployeeDocData(emp, u.uid, createdAt)
  );
}

export async function deleteEmployeeFirestore(employeeId: string): Promise<void> {
  await removeDocIfAuthed('employees', sanitizeFirestoreId(employeeId, 'emp'));
}

export async function upsertAttendanceFirestore(rec: AttendanceRecord): Promise<void> {
  const u = getVerifiedCurrentUser();
  if (!u) return;
  const docId = sanitizeFirestoreId(rec.id, 'att');
  await upsertDocWithImmutableCreatedAt('attendance', docId, (createdAt) =>
    buildAttendanceDocData(rec, u.uid, createdAt)
  );
}

export async function deleteAttendanceFirestore(recordId: string): Promise<void> {
  await removeDocIfAuthed('attendance', sanitizeFirestoreId(recordId, 'att'));
}

export async function upsertLateSettlementFirestore(ls: LateSettlement): Promise<void> {
  const docId = sanitizeFirestoreId(ls.id, 'ls');
  await upsertDocWithImmutableCreatedAt('lateSettlements', docId, (createdAt) =>
    buildLateSettlementDocData(ls, createdAt)
  );
}

export async function deleteLateSettlementFirestore(settlementId: string): Promise<void> {
  await removeDocIfAuthed('lateSettlements', sanitizeFirestoreId(settlementId, 'ls'));
}

export async function syncPayrollSettingsToFirestore(ps: PayrollSettings): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const path = 'payrollSettings/primary';
  try {
    await setDoc(doc(db, 'payrollSettings', 'primary'), buildPayrollSettingsDocData(ps));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertPayrollProfileToFirestore(
  p: EmployeeSalaryProfile
): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const docId = sanitizeFirestoreId(p.employeeId, 'emp');
  const path = `payrollProfiles/${docId}`;
  try {
    await setDoc(doc(db, 'payrollProfiles', docId), buildPayrollProfileDocData(p));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertPayrollAdjustmentToFirestore(a: PayrollAdjustment): Promise<void> {
  const docId = sanitizeFirestoreId(a.id, 'padj');
  await upsertDocWithImmutableCreatedAt('payrollAdjustments', docId, (createdAt) =>
    buildPayrollAdjustmentDocData(a, createdAt)
  );
}

export async function deletePayrollAdjustmentFromFirestore(adjustmentId: string): Promise<void> {
  await removeDocIfAuthed('payrollAdjustments', sanitizeFirestoreId(adjustmentId, 'padj'));
}

export async function upsertPayrollRaiseToFirestore(r: SalaryRaiseRecord): Promise<void> {
  const docId = sanitizeFirestoreId(r.id, 'praise');
  await upsertDocWithImmutableCreatedAt('payrollRaises', docId, (createdAt) =>
    buildPayrollRaiseDocData(r, createdAt)
  );
}

export async function deletePayrollRaiseFromFirestore(raiseId: string): Promise<void> {
  await removeDocIfAuthed('payrollRaises', sanitizeFirestoreId(raiseId, 'praise'));
}

export async function upsertPayrollStatusToFirestore(s: PayrollMonthlyStatus): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const docId = sanitizeFirestoreId(s.id, `${s.employeeId}_${s.yearMonth}`);
  const path = `payrollStatuses/${docId}`;
  try {
    await setDoc(doc(db, 'payrollStatuses', docId), buildPayrollStatusDocData(s));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertFinanceAccountToFirestore(acc: FinanceAccount): Promise<void> {
  const docId = sanitizeFirestoreId(acc.id, 'facc');
  await upsertDocWithImmutableCreatedAt('financeAccounts', docId, (createdAt) =>
    buildFinanceAccountDocData(acc, createdAt)
  );
}

export async function deleteFinanceAccountFromFirestore(accountId: string): Promise<void> {
  await removeDocIfAuthed('financeAccounts', sanitizeFirestoreId(accountId, 'facc'));
}

export async function upsertFinanceCategoryToFirestore(cat: FinanceCategory): Promise<void> {
  const docId = sanitizeFirestoreId(cat.id, 'fcat');
  await upsertDocWithImmutableCreatedAt('financeCategories', docId, (createdAt) =>
    buildFinanceCategoryDocData(cat, createdAt)
  );
}

export async function deleteFinanceCategoryFromFirestore(categoryId: string): Promise<void> {
  await removeDocIfAuthed('financeCategories', sanitizeFirestoreId(categoryId, 'fcat'));
}

export async function upsertFinanceTransactionToFirestore(tx: FinanceTransaction): Promise<void> {
  const docId = sanitizeFirestoreId(tx.id, 'ftx');
  await upsertDocWithImmutableCreatedAt('financeTransactions', docId, (createdAt) =>
    buildFinanceTransactionDocData(tx, createdAt)
  );
}

export async function deleteFinanceTransactionFromFirestore(txId: string): Promise<void> {
  await removeDocIfAuthed('financeTransactions', sanitizeFirestoreId(txId, 'ftx'));
}

export async function upsertFinanceTransferToFirestore(tr: FinanceTransfer): Promise<void> {
  const docId = sanitizeFirestoreId(tr.id, 'ftr');
  await upsertDocWithImmutableCreatedAt('financeTransfers', docId, (createdAt) =>
    buildFinanceTransferDocData(tr, createdAt)
  );
}

export async function deleteFinanceTransferFromFirestore(transferId: string): Promise<void> {
  await removeDocIfAuthed('financeTransfers', sanitizeFirestoreId(transferId, 'ftr'));
}

export async function syncSecurityConfigToFirestore(sec: {
  adminPinSha256: string;
  databasePinSha256?: string;
}): Promise<void> {
  if (!getVerifiedCurrentUser()) return;
  const path = 'securityConfig/primary';
  try {
    await setDoc(doc(db, 'securityConfig', 'primary'), {
      id: 'primary',
      adminPinSha256: sec.adminPinSha256,
      databasePinSha256: sec.databasePinSha256 || '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
