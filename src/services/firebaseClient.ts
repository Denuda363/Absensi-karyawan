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
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AppSettings,
  AttendanceRecord,
  Employee,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransfer,
  LateSettlement,
} from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const FIREBASE_APPLET_META = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
};

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
  const path = 'test/connection';
  try {
    const snap = await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      ok: true,
      offline: false,
      exists: snap.exists(),
      message: snap.exists()
        ? 'Koneksi Cloud Firestore aktif dan dokumen uji tersedia.'
        : 'Koneksi Cloud Firestore aktif (dokumen uji belum dibuat).',
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

const INSPECTABLE_COLLECTIONS = [
  'test',
  'appSettings',
  'employees',
  'attendance',
  'lateSettlements',
  'financeAccounts',
  'financeCategories',
  'financeTransactions',
  'financeTransfers',
] as const;

export async function inspectFirestoreCollections(): Promise<FirestoreCollectionCheck[]> {
  if (!auth.currentUser) {
    throw new Error('Silakan masuk dengan akun Google Admin terlebih dahulu untuk memeriksa Cloud Firestore.');
  }

  const results: FirestoreCollectionCheck[] = [];
  for (const colName of INSPECTABLE_COLLECTIONS) {
    try {
      const q = query(collection(db, colName), limit(5));
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

function sanitizeFirestoreId(raw: string): string {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.slice(0, 120) || `doc_${Date.now()}`;
}

export async function autoInitializeFirestoreCollections(payload: {
  settings: AppSettings;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  financeAccounts?: FinanceAccount[];
  financeCategories?: FinanceCategory[];
  financeTransactions?: FinanceTransaction[];
  financeTransfers?: FinanceTransfer[];
}): Promise<{
  createdCollections: string[];
  syncedDocsCount: number;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Silakan login dengan akun Google Admin terlebih dahulu sebelum inisialisasi Firestore.');
  }

  const createdCollections: string[] = [];
  let syncedDocsCount = 0;

  // 1. Ensure test/connection exists
  try {
    const connRef = doc(db, 'test', 'connection');
    const connSnap = await getDocFromServer(connRef);
    if (!connSnap.exists()) {
      await setDoc(connRef, {
        id: 'connection',
        status: 'connected',
        updatedAt: serverTimestamp(),
      });
      createdCollections.push('test');
      syncedDocsCount += 1;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'test/connection');
  }

  // 2. Ensure appSettings/primary exists
  try {
    const setSnap = await getDocs(query(collection(db, 'appSettings'), limit(1)));
    if (setSnap.empty) {
      await setDoc(doc(db, 'appSettings', 'primary'), {
        id: 'primary',
        companyName: String(payload.settings.companyName || 'KARYAPRESENSI').slice(0, 120),
        companySubtitle: String(payload.settings.companySubtitle || 'HRIS PERUSAHAAN').slice(0, 120),
        lateDeductionPerMinute: Number(payload.settings.lateDeductionPerMinute || 0),
        shiftCount: Array.isArray(payload.settings.shifts) ? payload.settings.shifts.length : 0,
        updatedAt: serverTimestamp(),
      });
      createdCollections.push('appSettings');
      syncedDocsCount += 1;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'appSettings/primary');
  }

  // 3. Employees
  try {
    const empSnap = await getDocs(query(collection(db, 'employees'), limit(1)));
    if (empSnap.empty && payload.employees.length > 0) {
      const batch = writeBatch(db);
      for (const emp of payload.employees.slice(0, 200)) {
        const docId = sanitizeFirestoreId(emp.id);
        batch.set(doc(db, 'employees', docId), {
          id: docId,
          userId: user.uid,
          employeeCode: String(emp.employeeCode || 'EMP001')
            .toUpperCase()
            .replace(/[^A-Z0-9-]/g, '')
            .slice(0, 20) || 'EMP001',
          name: String(emp.name || 'Karyawan').slice(0, 100),
          department: String(emp.department || 'Operasional').slice(0, 60),
          position: String(emp.position || 'Staf').slice(0, 60),
          shiftName: String(emp.shiftName || 'Reguler').slice(0, 40),
          shiftStart: /^\d{2}:\d{2}$/.test(emp.shiftStart) ? emp.shiftStart : '08:00',
          shiftEnd: /^\d{2}:\d{2}$/.test(emp.shiftEnd) ? emp.shiftEnd : '17:00',
          offDays: Array.isArray(emp.offDays) ? emp.offDays.slice(0, 7) : [],
          customOffDates: Array.isArray(emp.customOffDates)
            ? emp.customOffDates.slice(0, 31)
            : [],
          active: emp.active !== false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        syncedDocsCount += 1;
      }
      await batch.commit();
      createdCollections.push('employees');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'employees');
  }

  // 4. Attendance
  try {
    const attSnap = await getDocs(query(collection(db, 'attendance'), limit(1)));
    if (attSnap.empty && payload.attendanceRecords.length > 0) {
      const batch = writeBatch(db);
      for (const rec of payload.attendanceRecords.slice(0, 200)) {
        const docId = sanitizeFirestoreId(rec.id);
        const empId = sanitizeFirestoreId(rec.employeeId);
        batch.set(doc(db, 'attendance', docId), {
          id: docId,
          employeeId: empId,
          employeeName: String(rec.employeeName || 'Karyawan').slice(0, 100),
          userId: user.uid,
          date: /^\d{4}-\d{2}-\d{2}$/.test(rec.date) ? rec.date : '2026-01-01',
          status: rec.status,
          checkIn: /^([01]\d|2[0-3]):[0-5]\d$/.test(rec.checkIn) ? rec.checkIn : '',
          checkOut: /^([01]\d|2[0-3]):[0-5]\d$/.test(rec.checkOut) ? rec.checkOut : '',
          entryType: 'manual_admin',
          notes: String(rec.notes || '').slice(0, 300),
          recordedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        syncedDocsCount += 1;
      }
      await batch.commit();
      createdCollections.push('attendance');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }

  // 5. Late Settlements
  try {
    const lsSnap = await getDocs(query(collection(db, 'lateSettlements'), limit(1)));
    if (lsSnap.empty && payload.lateSettlements.length > 0) {
      const batch = writeBatch(db);
      for (const ls of payload.lateSettlements.slice(0, 200)) {
        const docId = sanitizeFirestoreId(ls.id);
        batch.set(doc(db, 'lateSettlements', docId), {
          id: docId,
          employeeId: sanitizeFirestoreId(ls.employeeId),
          employeeName: String(ls.employeeName || 'Karyawan').slice(0, 100),
          yearMonth: /^\d{4}-\d{2}$/.test(ls.yearMonth) ? ls.yearMonth : '2026-11',
          date: /^\d{4}-\d{2}-\d{2}$/.test(ls.date) ? ls.date : '2026-11-01',
          method: ls.method,
          minutesSettled: Number(ls.minutesSettled || 0),
          notes: String(ls.notes || '').slice(0, 300),
          recordedBy: user.uid,
          createdAt: serverTimestamp(),
        });
        syncedDocsCount += 1;
      }
      await batch.commit();
      createdCollections.push('lateSettlements');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'lateSettlements');
  }

  // 6. Finance Accounts
  if (payload.financeAccounts && payload.financeAccounts.length > 0) {
    try {
      const faSnap = await getDocs(query(collection(db, 'financeAccounts'), limit(1)));
      if (faSnap.empty) {
        const batch = writeBatch(db);
        for (const acc of payload.financeAccounts.slice(0, 100)) {
          const docId = sanitizeFirestoreId(acc.id);
          batch.set(doc(db, 'financeAccounts', docId), {
            id: docId,
            name: String(acc.name || 'Akun').slice(0, 100),
            kind: acc.kind,
            bankName: String(acc.bankName || '').slice(0, 60),
            accountNumber: String(acc.accountNumber || '').slice(0, 60),
            holderName: String(acc.holderName || '').slice(0, 100),
            openingBalance: Number(acc.openingBalance || 0),
            updatedAt: serverTimestamp(),
          });
          syncedDocsCount += 1;
        }
        await batch.commit();
        createdCollections.push('financeAccounts');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeAccounts');
    }
  }

  // 7. Finance Categories
  if (payload.financeCategories && payload.financeCategories.length > 0) {
    try {
      const fcSnap = await getDocs(query(collection(db, 'financeCategories'), limit(1)));
      if (fcSnap.empty) {
        const batch = writeBatch(db);
        for (const cat of payload.financeCategories.slice(0, 100)) {
          const docId = sanitizeFirestoreId(cat.id);
          batch.set(doc(db, 'financeCategories', docId), {
            id: docId,
            name: String(cat.name || 'Kategori').slice(0, 100),
            type: cat.type,
            description: String(cat.description || '').slice(0, 300),
            updatedAt: serverTimestamp(),
          });
          syncedDocsCount += 1;
        }
        await batch.commit();
        createdCollections.push('financeCategories');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeCategories');
    }
  }

  // 8. Finance Transactions
  if (payload.financeTransactions && payload.financeTransactions.length > 0) {
    try {
      const ftSnap = await getDocs(query(collection(db, 'financeTransactions'), limit(1)));
      if (ftSnap.empty) {
        const batch = writeBatch(db);
        for (const tx of payload.financeTransactions.slice(0, 200)) {
          const docId = sanitizeFirestoreId(tx.id);
          batch.set(doc(db, 'financeTransactions', docId), {
            id: docId,
            date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? tx.date : '2026-11-01',
            type: tx.type,
            method: tx.method,
            categoryId: sanitizeFirestoreId(tx.categoryId),
            categoryName: String(tx.categoryName || 'Umum').slice(0, 100),
            accountId: sanitizeFirestoreId(tx.accountId || 'acc_cash_main'),
            title: String(tx.title || 'Transaksi').slice(0, 150),
            amount: Math.max(0, Number(tx.amount || 0)),
            notes: String(tx.notes || '').slice(0, 300),
            updatedAt: serverTimestamp(),
          });
          syncedDocsCount += 1;
        }
        await batch.commit();
        createdCollections.push('financeTransactions');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeTransactions');
    }
  }

  // 9. Finance Transfers
  if (payload.financeTransfers && payload.financeTransfers.length > 0) {
    try {
      const ftrSnap = await getDocs(query(collection(db, 'financeTransfers'), limit(1)));
      if (ftrSnap.empty) {
        const batch = writeBatch(db);
        for (const tr of payload.financeTransfers.slice(0, 200)) {
          const docId = sanitizeFirestoreId(tr.id);
          batch.set(doc(db, 'financeTransfers', docId), {
            id: docId,
            date: /^\d{4}-\d{2}-\d{2}$/.test(tr.date) ? tr.date : '2026-11-01',
            fromAccountId: sanitizeFirestoreId(tr.fromAccountId),
            fromAccountName: String(tr.fromAccountName || 'Akun Asal').slice(0, 100),
            toAccountId: sanitizeFirestoreId(tr.toAccountId),
            toAccountName: String(tr.toAccountName || 'Akun Tujuan').slice(0, 100),
            amount: Math.max(1, Number(tr.amount || 1)),
            notes: String(tr.notes || '').slice(0, 300),
            updatedAt: serverTimestamp(),
          });
          syncedDocsCount += 1;
        }
        await batch.commit();
        createdCollections.push('financeTransfers');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'financeTransfers');
    }
  }

  return { createdCollections, syncedDocsCount };
}
