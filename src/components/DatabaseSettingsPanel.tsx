import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  DatabaseConnectionConfig,
  DatabaseEngineType,
  DatabaseSchemaStatusResponse,
  Employee,
  LateSettlement,
  SupabaseSyncResult,
  SupabaseTestResult,
} from '../types';
import {
  autoCreateMissingTables,
  changeDatabasePin,
  DatabaseUnauthorizedError,
  fetchDatabaseSchemaStatus,
  lockDatabaseSession,
  saveDatabaseConfig,
  syncSupabaseDatabase,
  testSupabaseConnection,
  unlockDatabaseWithPin,
} from '../services/databaseService';
import { fetchFinanceState } from '../services/financeService';
import {
  autoInitializeFirestoreCollections,
  FIREBASE_APPLET_META,
  FirestoreCollectionCheck,
  inspectFirestoreCollections,
  signInFirebaseWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuth,
  testConnection,
} from '../services/firebaseClient';
import {
  generateDatabaseSetupScript,
  ScriptTargetEngine,
} from '../utils/databaseScripts';

interface DatabaseSettingsPanelProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements?: LateSettlement[];
  settings: AppSettings;
  adminToken?: string | null;
  databaseToken: string | null;
  onDatabaseTokenChange: (token: string | null) => void;
  onRefresh: () => Promise<void>;
}

type DatabaseInnerTab = 'tables' | 'scripts' | 'config';

export const DatabaseSettingsPanel: React.FC<DatabaseSettingsPanelProps> = ({
  employees,
  attendanceRecords,
  lateSettlements = [],
  settings,
  adminToken,
  databaseToken,
  onDatabaseTokenChange,
  onRefresh,
}) => {
  // PIN Gate Input State (token is lifted to SettingsView so sub-tab switches keep session unlocked)
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Inner Tabs & Server Status State
  const [innerTab, setInnerTab] = useState<DatabaseInnerTab>('tables');
  const [schemaStatus, setSchemaStatus] = useState<DatabaseSchemaStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);
  const [autoCreating, setAutoCreating] = useState<boolean>(false);
  const [requiresManualSql, setRequiresManualSql] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Supabase Live Test & Sync State
  const [testingSupabase, setTestingSupabase] = useState<boolean>(false);
  const [syncingSupabase, setSyncingSupabase] = useState<'push' | 'pull' | null>(null);
  const [supabaseTestResult, setSupabaseTestResult] = useState<SupabaseTestResult | null>(null);
  const [supabaseSyncResult, setSupabaseSyncResult] = useState<SupabaseSyncResult | null>(null);

  // Script Generator State
  const [scriptEngine, setScriptEngine] = useState<ScriptTargetEngine>('supabase');
  const [scriptSchemaName, setScriptSchemaName] = useState<string>('public');
  const [scriptPrefix, setScriptPrefix] = useState<string>('');
  const [includeIndexes, setIncludeIndexes] = useState<boolean>(true);
  const [includeSeedData, setIncludeSeedData] = useState<boolean>(true);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  // Connection Config Form State
  const [cfgEngine, setCfgEngine] = useState<DatabaseEngineType>('supabase');
  const [cfgHost, setCfgHost] = useState<string>('db.jeewhluiufosnourqvje.supabase.co');
  const [cfgPort, setCfgPort] = useState<number>(5432);
  const [cfgDbName, setCfgDbName] = useState<string>('postgres');
  const [cfgSchemaName, setCfgSchemaName] = useState<string>('public');
  const [cfgPrefix, setCfgPrefix] = useState<string>('');
  const [cfgUsername, setCfgUsername] = useState<string>('postgres');
  const [cfgSslMode, setCfgSslMode] = useState<'disable' | 'require' | 'verify-full'>('require');
  const [cfgAutoCreate, setCfgAutoCreate] = useState<boolean>(true);
  const [cfgSupabaseProjectName, setCfgSupabaseProjectName] = useState<string>('Absensi');
  const [cfgSupabaseProjectId, setCfgSupabaseProjectId] = useState<string>('jeewhluiufosnourqvje');
  const [cfgSupabaseUrl, setCfgSupabaseUrl] = useState<string>(
    'https://jeewhluiufosnourqvje.supabase.co'
  );
  const [cfgSupabasePublishableKey, setCfgSupabasePublishableKey] = useState<string>(
    'sb_publishable_y7OmGDoZSCuffUn6uJIwZQ_xXszVLT7'
  );
  const [cfgSupabaseSecretKey, setCfgSupabaseSecretKey] = useState<string>('');
  const [cfgSupabaseDbUrl, setCfgSupabaseDbUrl] = useState<string>('');
  const [showSupabaseSecrets, setShowSupabaseSecrets] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Change Database PIN State
  const [curDbPin, setCurDbPin] = useState<string>('');
  const [newDbPin, setNewDbPin] = useState<string>('');
  const [confirmDbPin, setConfirmDbPin] = useState<string>('');
  const [showChangePin, setShowChangePin] = useState<boolean>(false);
  const [savingDbPin, setSavingDbPin] = useState<boolean>(false);

  // Firebase Firestore Live State
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [fbConnResult, setFbConnResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [fbCollections, setFbCollections] = useState<FirestoreCollectionCheck[] | null>(null);
  const [fbBusy, setFbBusy] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeFirebaseAuth((user) => {
      setFbUser(user);
    });
    return () => unsub();
  }, []);

  const syncFormFromConfig = useCallback((cfg: DatabaseConnectionConfig) => {
    setCfgEngine(cfg.engine);
    setCfgHost(cfg.host);
    setCfgPort(cfg.port);
    setCfgDbName(cfg.databaseName);
    setCfgSchemaName(cfg.schemaName);
    setCfgPrefix(cfg.tablePrefix);
    setCfgUsername(cfg.username);
    setCfgSslMode(cfg.sslMode);
    setCfgAutoCreate(cfg.autoCreateMissingTables);
    setCfgSupabaseProjectName(cfg.supabaseProjectName || 'Absensi');
    setCfgSupabaseProjectId(cfg.supabaseProjectId || 'jeewhluiufosnourqvje');
    setCfgSupabaseUrl(cfg.supabaseUrl || 'https://jeewhluiufosnourqvje.supabase.co');
    setCfgSupabasePublishableKey(cfg.supabasePublishableKey || '');
    setScriptSchemaName(cfg.schemaName || 'public');
    setScriptPrefix(cfg.tablePrefix || '');
  }, []);

  const loadSchemaStatus = useCallback(
    async (token: string) => {
      setLoadingStatus(true);
      try {
        const res = await fetchDatabaseSchemaStatus(token);
        setSchemaStatus(res);
        syncFormFromConfig(res.config);
        setRequiresManualSql(
          res.config.engine === 'supabase' &&
            res.summary.missingCount > 0 &&
            !res.config.hasSupabaseDbUrl
        );
      } catch (err) {
        if (err instanceof DatabaseUnauthorizedError) {
          onDatabaseTokenChange(null);
          setSchemaStatus(null);
          setUnlockError(err.message);
          return;
        }
        setNotice({
          type: 'error',
          text: err instanceof Error ? err.message : 'Gagal memeriksa status tabel database.',
        });
      } finally {
        setLoadingStatus(false);
      }
    },
    [onDatabaseTokenChange, syncFormFromConfig]
  );

  useEffect(() => {
    if (databaseToken) {
      void loadSchemaStatus(databaseToken);
    }
  }, [databaseToken, loadSchemaStatus]);

  const handleUnlockDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      setUnlockError('Masukkan PIN Pengaturan Database terlebih dahulu.');
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      const { token } = await unlockDatabaseWithPin(pinInput.trim());
      onDatabaseTokenChange(token);
      setPinInput('');
      setNotice(null);
    } catch (err) {
      setUnlockError(
        err instanceof Error ? err.message : 'PIN pengaturan database tidak valid.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  const handleLockDatabase = async () => {
    const tokenToLock = databaseToken;
    onDatabaseTokenChange(null);
    setSchemaStatus(null);
    setSupabaseTestResult(null);
    setSupabaseSyncResult(null);
    setNotice(null);
    if (tokenToLock) {
      await lockDatabaseSession(tokenToLock);
    }
  };

  const handleAutoCreateMissingTables = async () => {
    if (!databaseToken) return;
    setAutoCreating(true);
    setNotice(null);
    try {
      const result = await autoCreateMissingTables(databaseToken);
      setSchemaStatus(result.status);
      syncFormFromConfig(result.status.config);
      setRequiresManualSql(Boolean(result.requiresManualSql));
      await onRefresh();
      setNotice({
        type: result.requiresManualSql ? 'error' : 'success',
        text:
          result.createdTables.length > 0
            ? `${result.message} Tabel dibuat: ${result.createdTables.join(', ')}.`
            : result.message,
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat tabel otomatis.',
      });
    } finally {
      setAutoCreating(false);
    }
  };

  const handleTestSupabase = async () => {
    if (!databaseToken) return;
    setTestingSupabase(true);
    setNotice(null);
    try {
      const result = await testSupabaseConnection(databaseToken);
      setSupabaseTestResult(result);
      setSchemaStatus(result.status);
      syncFormFromConfig(result.status.config);
      setRequiresManualSql(
        result.status.config.engine === 'supabase' &&
          result.missingTablesCount > 0 &&
          !result.hasDbUrl
      );
      setNotice({
        type: result.ok ? 'success' : 'error',
        text: result.message,
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menguji koneksi Supabase.',
      });
    } finally {
      setTestingSupabase(false);
    }
  };

  const handleSyncSupabase = async (direction: 'push' | 'pull') => {
    if (!databaseToken) return;
    setSyncingSupabase(direction);
    setNotice(null);
    try {
      const result = await syncSupabaseDatabase(databaseToken, direction);
      setSupabaseSyncResult(result);
      setSchemaStatus(result.status);
      syncFormFromConfig(result.status.config);
      await onRefresh();
      setNotice({
        type: result.ok ? 'success' : 'error',
        text: result.message,
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : direction === 'push'
            ? 'Gagal Push data lokal ke Supabase.'
            : 'Gagal Pull data dari Supabase.',
      });
    } finally {
      setSyncingSupabase(null);
    }
  };

  const handleSaveDatabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!databaseToken) return;
    setSavingConfig(true);
    setNotice(null);
    try {
      const updated = await saveDatabaseConfig(databaseToken, {
        engine: cfgEngine,
        host: cfgHost,
        port: cfgPort,
        databaseName: cfgDbName,
        schemaName: cfgSchemaName,
        tablePrefix: cfgPrefix,
        username: cfgUsername,
        sslMode: cfgSslMode,
        autoCreateMissingTables: cfgAutoCreate,
        supabaseProjectName: cfgSupabaseProjectName,
        supabaseProjectId: cfgSupabaseProjectId,
        supabaseUrl: cfgSupabaseUrl,
        supabasePublishableKey: cfgSupabasePublishableKey,
        ...(cfgSupabaseSecretKey.trim()
          ? { supabaseSecretKey: cfgSupabaseSecretKey.trim() }
          : {}),
        ...(cfgSupabaseDbUrl.trim() ? { supabaseDbUrl: cfgSupabaseDbUrl.trim() } : {}),
      });
      setCfgSupabaseSecretKey('');
      setCfgSupabaseDbUrl('');
      syncFormFromConfig(updated);
      await loadSchemaStatus(databaseToken);
      setNotice({
        type: 'success',
        text: cfgAutoCreate
          ? 'Konfigurasi database disimpan & pemeriksaan tabel otomatis telah dijalankan.'
          : 'Konfigurasi koneksi database berhasil disimpan.',
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi database.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleClearSupabaseSecrets = async () => {
    if (!databaseToken) return;
    setSavingConfig(true);
    setNotice(null);
    try {
      const updated = await saveDatabaseConfig(databaseToken, {
        clearSupabaseSecrets: true,
      });
      setCfgSupabaseSecretKey('');
      setCfgSupabaseDbUrl('');
      syncFormFromConfig(updated);
      await loadSchemaStatus(databaseToken);
      setNotice({
        type: 'success',
        text: 'Secret Key dan Postgres URI yang tersimpan di server telah dihapus.',
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus kredensial server.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleChangeDatabasePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!databaseToken) return;
    setNotice(null);
    if (!curDbPin.trim()) {
      setNotice({ type: 'error', text: 'Masukkan PIN database saat ini.' });
      return;
    }
    if (newDbPin.trim().length < 4 || newDbPin.trim().length > 20) {
      setNotice({
        type: 'error',
        text: 'PIN database baru minimal 4 karakter dan maksimal 20 karakter.',
      });
      return;
    }
    if (newDbPin.trim() !== confirmDbPin.trim()) {
      setNotice({ type: 'error', text: 'Konfirmasi PIN database baru tidak cocok.' });
      return;
    }

    setSavingDbPin(true);
    try {
      await changeDatabasePin(databaseToken, {
        currentPin: curDbPin.trim(),
        newPin: newDbPin.trim(),
      });
      setCurDbPin('');
      setNewDbPin('');
      setConfirmDbPin('');
      await loadSchemaStatus(databaseToken);
      setNotice({
        type: 'success',
        text: 'PIN khusus Pengaturan Database berhasil diperbarui.',
      });
    } catch (err) {
      if (err instanceof DatabaseUnauthorizedError) {
        onDatabaseTokenChange(null);
        setUnlockError(err.message);
        return;
      }
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah PIN database.',
      });
    } finally {
      setSavingDbPin(false);
    }
  };

  const handleFirebaseSignIn = async () => {
    setFbBusy(true);
    setNotice(null);
    try {
      await signInFirebaseWithGoogle();
      const conn = await testConnection();
      setFbConnResult({ ok: conn.ok, message: conn.message });
      const cols = await inspectFirestoreCollections();
      setFbCollections(cols);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal masuk ke akun Google Firebase.',
      });
    } finally {
      setFbBusy(false);
    }
  };

  const handleFirebaseSignOut = async () => {
    await signOutFirebase();
    setFbCollections(null);
    setFbConnResult(null);
  };

  const handleCheckFirestore = async () => {
    setFbBusy(true);
    setNotice(null);
    try {
      const conn = await testConnection();
      setFbConnResult({ ok: conn.ok, message: conn.message });
      if (fbUser) {
        const cols = await inspectFirestoreCollections();
        setFbCollections(cols);
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memeriksa koleksi Cloud Firestore.',
      });
    } finally {
      setFbBusy(false);
    }
  };

  const handleAutoInitFirestore = async () => {
    setFbBusy(true);
    setNotice(null);
    try {
      let financeAccounts = undefined;
      let financeCategories = undefined;
      let financeTransactions = undefined;
      let financeTransfers = undefined;
      if (adminToken) {
        try {
          const fin = await fetchFinanceState(adminToken);
          financeAccounts = fin.accounts;
          financeCategories = fin.categories;
          financeTransactions = fin.transactions;
          financeTransfers = fin.transfers;
        } catch {
          // ignore if admin token missing
        }
      }

      const res = await autoInitializeFirestoreCollections({
        settings,
        employees,
        attendanceRecords,
        lateSettlements,
        financeAccounts,
        financeCategories,
        financeTransactions,
        financeTransfers,
      });
      const cols = await inspectFirestoreCollections();
      setFbCollections(cols);
      const conn = await testConnection();
      setFbConnResult({ ok: conn.ok, message: conn.message });
      setNotice({
        type: 'success',
        text:
          res.createdCollections.length > 0
            ? `Koleksi Firestore otomatis dibuat & disinkronkan (${res.syncedDocsCount} dokumen): ${res.createdCollections.join(', ')}.`
            : 'Seluruh koleksi Cloud Firestore yang dibutuhkan sudah tersedia.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal membuat koleksi Cloud Firestore otomatis.',
      });
    } finally {
      setFbBusy(false);
    }
  };

  const generatedScript = useMemo(
    () =>
      generateDatabaseSetupScript({
        engine: scriptEngine,
        schemaName: scriptSchemaName,
        tablePrefix: scriptPrefix,
        includeIndexes,
        includeSeedData,
      }),
    [scriptEngine, scriptSchemaName, scriptPrefix, includeIndexes, includeSeedData]
  );

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript.code);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setNotice({
        type: 'error',
        text: 'Browser tidak mengizinkan akses clipboard otomatis. Silakan blok script lalu salin manual.',
      });
    }
  };

  const handleDownloadScript = () => {
    const blob = new Blob([generatedScript.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generatedScript.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // RENDER LOCKED PIN GATE
  // =========================================================================
  if (!databaseToken) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                5. Pengaturan Database &amp; Struktur Tabel
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Periksa ketersediaan tabel, buat tabel yang belum ada secara otomatis, atau salin script DDL database.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md shrink-0">
            <Lock className="w-3 h-3" />
            <span>Terkunci PIN</span>
          </span>
        </div>

        <form onSubmit={handleUnlockDatabase} className="p-6 max-w-md mx-auto space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
            <div className="w-11 h-11 rounded-xl bg-blue-900 text-white flex items-center justify-center mx-auto">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Otorisasi PIN Pengaturan Database
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Masukkan PIN untuk mengakses pemeriksaan tabel database, pembuatan tabel otomatis, koneksi Firestore, dan generator script SQL.
            </p>
          </div>

          {unlockError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{unlockError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              PIN Pengaturan Database
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setUnlockError(null);
                }}
                placeholder="Masukkan PIN akses database"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Tampilkan atau sembunyikan PIN"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={unlocking}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{unlocking ? 'Memverifikasi PIN...' : 'Buka Pengaturan Database'}</span>
          </button>
        </form>
      </section>
    );
  }

  // =========================================================================
  // RENDER UNLOCKED DATABASE SETTINGS PANEL
  // =========================================================================
  const summary = schemaStatus?.summary;

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              5. Pengaturan Database &amp; Struktur Tabel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Deteksi tabel otomatis, inisialisasi tabel yang belum tersedia, sinkronisasi Firestore, serta copy script SQL/DDL.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLockDatabase}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Kunci Pengaturan Database</span>
        </button>
      </div>

      {/* Sub-Tabs */}
      <div className="px-6 pt-4 border-b border-slate-200 bg-white flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setInnerTab('tables')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
            innerTab === 'tables'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Cek &amp; Buat Tabel Otomatis</span>
        </button>

        <button
          type="button"
          onClick={() => setInnerTab('scripts')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
            innerTab === 'scripts'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Copy Script Setting Tabel</span>
        </button>

        <button
          type="button"
          onClick={() => setInnerTab('config')}
          className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
            innerTab === 'config'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Koneksi &amp; PIN Database</span>
        </button>
      </div>

      <div className="p-6 space-y-5">
        {notice && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
              notice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        {/* TAB 1: TABLE CHECK & AUTO-CREATE */}
        {innerTab === 'tables' && (
          <div className="space-y-5">
            {/* Summary KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] text-slate-500">Tabel Dibutuhkan</div>
                <div className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                  {summary?.totalRequired ?? 14}
                </div>
              </div>
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                <div className="text-[11px] text-emerald-700">Tabel Tersedia</div>
                <div className="font-mono text-lg font-bold text-emerald-800 tabular-nums mt-0.5">
                  {summary?.existingCount ?? 0}
                </div>
              </div>
              <div
                className={`p-3.5 border rounded-lg ${
                  (summary?.missingCount ?? 0) > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div
                  className={`text-[11px] ${
                    (summary?.missingCount ?? 0) > 0 ? 'text-red-700' : 'text-slate-500'
                  }`}
                >
                  Belum Ada / Perlu Dibuat
                </div>
                <div
                  className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${
                    (summary?.missingCount ?? 0) > 0 ? 'text-red-800' : 'text-slate-900'
                  }`}
                >
                  {summary?.missingCount ?? 0}
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] text-slate-500">Total Record Data</div>
                <div className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                  {summary?.totalRecords ?? 0}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
                  Inisialisasi Otomatis Tabel Server
                </div>
                <div>
                  Jika ada tabel atau struktur dataset yang belum tersedia di database, sistem akan membuatnya otomatis tanpa menimpa data yang sudah ada.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => databaseToken && void loadSchemaStatus(databaseToken)}
                  disabled={loadingStatus}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                  <span>Periksa Ulang</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoCreateMissingTables}
                  disabled={autoCreating}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {autoCreating ? 'Membuat Tabel...' : 'Buat Tabel yang Belum Ada Otomatis'}
                  </span>
                </button>
              </div>
            </div>

            {/* Supabase PostgreSQL Cloud Integration Box */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Database className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Supabase Cloud ({schemaStatus?.config.supabaseProjectName || 'Absensi'})
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded border ${
                          schemaStatus?.config.engine !== 'supabase'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : schemaStatus?.config.supabaseConnected && (summary?.missingCount ?? 0) === 0
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : schemaStatus?.config.supabaseConnected
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {schemaStatus?.config.engine !== 'supabase'
                          ? 'Mode Lokal'
                          : schemaStatus?.config.supabaseConnected && (summary?.missingCount ?? 0) === 0
                          ? 'Terhubung & Siap'
                          : schemaStatus?.config.supabaseConnected
                          ? 'Terhubung (Tabel Belum Lengkap)'
                          : 'Belum Terhubung / Error'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Project ID:{' '}
                      <span className="font-mono font-semibold">
                        {schemaStatus?.config.supabaseProjectId || 'jeewhluiufosnourqvje'}
                      </span>
                      {' · REST API: '}
                      <span className="font-mono">
                        {schemaStatus?.config.supabaseRestUrl ||
                          'https://jeewhluiufosnourqvje.supabase.co/rest/v1/'}
                      </span>
                    </div>
                    {schemaStatus?.config.supabaseLastError && (
                      <div className="text-[11px] text-amber-800 mt-1">
                        Catatan: {schemaStatus.config.supabaseLastError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleTestSupabase}
                    disabled={testingSupabase}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <Plug className="w-3.5 h-3.5" />
                    <span>{testingSupabase ? 'Menguji...' : 'Uji Koneksi Supabase'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncSupabase('push')}
                    disabled={syncingSupabase !== null || (summary?.existingCount ?? 0) === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                    <span>
                      {syncingSupabase === 'push' ? 'Mengirim...' : 'Push Lokal → Supabase'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncSupabase('pull')}
                    disabled={syncingSupabase !== null || (summary?.existingCount ?? 0) === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    <span>
                      {syncingSupabase === 'pull' ? 'Mengambil...' : 'Pull Supabase → Lokal'}
                    </span>
                  </button>
                </div>
              </div>

              {(requiresManualSql ||
                (schemaStatus?.config.engine === 'supabase' && (summary?.missingCount ?? 0) > 0)) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {summary?.missingCount ?? 14} tabel belum ditemukan di schema Supabase (public)
                    </div>
                    <div className="text-[11px] text-amber-800 mt-0.5">
                      Supabase REST API tidak mengizinkan pembuatan tabel (DDL) tanpa koneksi langsung PostgreSQL. Anda dapat menyalin script SQL Supabase lalu menjalankannya di{' '}
                      <strong>Supabase SQL Editor</strong>, atau mengisi <strong>Postgres DB URI</strong> di tab Koneksi &amp; PIN Database agar tombol Buat Tabel Otomatis berjalan langsung.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setScriptEngine('supabase');
                        setInnerTab('scripts');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Salin Script SQL Supabase</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInnerTab('config')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Isi Postgres URI</span>
                    </button>
                  </div>
                </div>
              )}

              {supabaseTestResult && (
                <div
                  className={`px-3 py-2 rounded-lg text-[11px] border flex flex-wrap items-center justify-between gap-2 ${
                    supabaseTestResult.ok
                      ? 'bg-white border-emerald-200 text-emerald-800'
                      : 'bg-white border-amber-200 text-amber-900'
                  }`}
                >
                  <span>{supabaseTestResult.message}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    Latensi: {supabaseTestResult.latencyMs} ms · Tersedia:{' '}
                    {supabaseTestResult.existingTablesCount}/14
                  </span>
                </div>
              )}

              {supabaseSyncResult && (
                <div
                  className={`px-3 py-2 rounded-lg text-[11px] border space-y-1 ${
                    supabaseSyncResult.ok
                      ? 'bg-white border-emerald-200 text-emerald-800'
                      : 'bg-white border-red-200 text-red-800'
                  }`}
                >
                  <div className="font-semibold">{supabaseSyncResult.message}</div>
                  {supabaseSyncResult.syncedTables.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-600">
                      {supabaseSyncResult.syncedTables
                        .map((t) => `${t.tableName} (${t.rowCount})`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cloud Firestore Integration Box */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Cloud className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Cloud Firestore ({FIREBASE_APPLET_META.firestoreDatabaseId})
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Project: <span className="font-mono">{FIREBASE_APPLET_META.projectId}</span>
                      {fbUser?.email ? ` · Login: ${fbUser.email}` : ' · Belum login Google Admin'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!fbUser ? (
                    <button
                      type="button"
                      onClick={handleFirebaseSignIn}
                      disabled={fbBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Login Google Admin</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleCheckFirestore}
                        disabled={fbBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${fbBusy ? 'animate-spin' : ''}`} />
                        <span>Cek Koleksi</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoInitFirestore}
                        disabled={fbBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Buat &amp; Sinkronkan Koleksi Otomatis</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleFirebaseSignOut}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Keluar</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {fbConnResult && (
                <div
                  className={`px-3 py-2 rounded-lg text-[11px] border ${
                    fbConnResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  {fbConnResult.message}
                </div>
              )}

              {fbCollections && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {fbCollections.map((col) => (
                    <div
                      key={col.collectionName}
                      className={`px-2.5 py-2 rounded-lg border text-[11px] ${
                        col.exists
                          ? 'bg-white border-emerald-200 text-slate-800'
                          : 'bg-white border-amber-200 text-slate-700'
                      }`}
                    >
                      <div className="font-mono font-semibold truncate">{col.collectionName}</div>
                      <div className={col.exists ? 'text-emerald-700' : 'text-amber-700'}>
                        {col.exists ? `Tersedia (${col.sampleCount}+ dok)` : 'Belum ada dok'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Required Tables Status Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-3">Nama Tabel (SQL)</th>
                    <th className="py-2.5 px-3">Koleksi Firestore</th>
                    <th className="py-2.5 px-3">Modul</th>
                    <th className="py-2.5 px-3">Status Server</th>
                    <th className="py-2.5 px-3 text-right">Baris</th>
                    <th className="py-2.5 px-3">Kolom Utama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(schemaStatus?.tables ?? []).map((tbl) => (
                    <tr key={tbl.tableName} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {tbl.tableName}
                        <div className="font-sans font-normal text-[11px] text-slate-500">
                          {tbl.description}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {tbl.firestoreCollection}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{tbl.module}</td>
                      <td className="py-2.5 px-3">
                        {tbl.remoteStatus === 'available' || (tbl.exists && !tbl.remoteStatus) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Tersedia</span>
                          </span>
                        ) : tbl.remoteStatus === 'local' && tbl.exists ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Tersedia (Lokal)</span>
                          </span>
                        ) : tbl.remoteStatus === 'rls_blocked' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded">
                            <Lock className="w-3 h-3" />
                            <span>Terblokir RLS</span>
                          </span>
                        ) : tbl.remoteStatus === 'unreachable' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Tidak Terjangkau</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 rounded">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Belum Ada</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        <div>{tbl.recordCount}</div>
                        {schemaStatus?.config.engine === 'supabase' &&
                          typeof tbl.localRecordCount === 'number' && (
                            <div className="text-[10px] text-slate-400">
                              Lokal: {tbl.localRecordCount}
                            </div>
                          )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 max-w-[240px]">
                        {tbl.requiredColumns.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: COPY SCRIPT SETTING TABEL */}
        {innerTab === 'scripts' && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Engine Selector */}
              <div className="inline-flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                {(
                  [
                    { id: 'supabase', label: 'Supabase (PostgreSQL + RLS)' },
                    { id: 'postgresql', label: 'PostgreSQL' },
                    { id: 'mysql', label: 'MySQL / MariaDB' },
                    { id: 'sqlite', label: 'SQLite 3' },
                    { id: 'firestore', label: 'Cloud Firestore' },
                  ] as { id: ScriptTargetEngine; label: string }[]
                ).map((eng) => (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setScriptEngine(eng.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      scriptEngine === eng.id
                        ? 'bg-white text-blue-800 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {eng.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedScript ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Script Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Script Tabel</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadScript}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh ({generatedScript.filename.split('.').pop()})</span>
                </button>
              </div>
            </div>

            {scriptEngine !== 'firestore' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {scriptEngine === 'mysql' ? 'Nama Database' : 'Nama Schema'}
                  </label>
                  <input
                    type="text"
                    value={scriptSchemaName}
                    onChange={(e) => setScriptSchemaName(e.target.value)}
                    placeholder={scriptEngine === 'mysql' ? 'karyapresensi_db' : 'public'}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Prefix Tabel (Opsional)
                  </label>
                  <input
                    type="text"
                    value={scriptPrefix}
                    onChange={(e) => setScriptPrefix(e.target.value)}
                    placeholder="Contoh: kp_"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-white"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeIndexes}
                    onChange={(e) => setIncludeIndexes(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>Sertakan Index Performa</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSeedData}
                    onChange={(e) => setIncludeSeedData(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>Sertakan Data Awal (Seed)</span>
                </label>
              </div>
            )}

            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-mono">{generatedScript.filename}</span>
                <span>{generatedScript.languageLabel}</span>
              </div>
              <pre className="p-4 text-[11.5px] leading-relaxed font-mono text-slate-100 overflow-x-auto max-h-[460px]">
                <code>{generatedScript.code}</code>
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: KONEKSI & UBAH PIN DATABASE */}
        {innerTab === 'config' && (
          <div className="space-y-6">
            <form
              onSubmit={handleSaveDatabaseConfig}
              className="p-5 rounded-xl border border-slate-200 space-y-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Konfigurasi Driver &amp; Parameter Database
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur target database perusahaan dan aktifkan pembuatan tabel otomatis ketika ada tabel yang belum tersedia.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Engine Database Aktif
                  </label>
                  <select
                    value={cfgEngine}
                    onChange={(e) => {
                      const val = e.target.value as DatabaseEngineType;
                      setCfgEngine(val);
                      if (val === 'supabase') {
                        setCfgPort(5432);
                        setCfgDbName('postgres');
                        setCfgSchemaName('public');
                        setCfgSslMode('require');
                        if (!cfgHost || cfgHost === '127.0.0.1') {
                          setCfgHost(
                            `db.${cfgSupabaseProjectId || 'jeewhluiufosnourqvje'}.supabase.co`
                          );
                        }
                      }
                      if (val === 'postgresql') setCfgPort(5432);
                      if (val === 'mysql') setCfgPort(3306);
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="supabase">Supabase Cloud Database (PostgreSQL + REST)</option>
                    <option value="local-json">Penyimpanan Lokal Server</option>
                    <option value="firestore">Cloud Firestore ({FIREBASE_APPLET_META.firestoreDatabaseId})</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL / MariaDB</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Host / Endpoint Server
                  </label>
                  <input
                    type="text"
                    value={cfgHost}
                    onChange={(e) => setCfgHost(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Port</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={cfgPort}
                    onChange={(e) => setCfgPort(Number(e.target.value) || 5432)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Database
                  </label>
                  <input
                    type="text"
                    value={cfgDbName}
                    onChange={(e) => setCfgDbName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Schema
                  </label>
                  <input
                    type="text"
                    value={cfgSchemaName}
                    onChange={(e) => setCfgSchemaName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username &amp; SSL
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={cfgUsername}
                      onChange={(e) => setCfgUsername(e.target.value)}
                      placeholder="postgres"
                      className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                    <select
                      value={cfgSslMode}
                      onChange={(e) =>
                        setCfgSslMode(e.target.value as 'disable' | 'require' | 'verify-full')
                      }
                      className="w-full px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="disable">SSL: Disable</option>
                      <option value="require">SSL: Require</option>
                      <option value="verify-full">SSL: Verify Full</option>
                    </select>
                  </div>
                </div>
              </div>

              {cfgEngine === 'supabase' && (
                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Parameter Koneksi Supabase Cloud
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        Hubungkan langsung dengan REST API &amp; PostgreSQL Supabase. Secret Key &amp; Postgres URI bersifat opsional dan disimpan aman di sisi server.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSupabaseSecrets((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
                    >
                      {showSupabaseSecrets ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Sembunyikan Secret</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Tampilkan Secret</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nama Project Supabase
                      </label>
                      <input
                        type="text"
                        value={cfgSupabaseProjectName}
                        onChange={(e) => setCfgSupabaseProjectName(e.target.value)}
                        placeholder="Absensi"
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Project ID
                      </label>
                      <input
                        type="text"
                        value={cfgSupabaseProjectId}
                        onChange={(e) => setCfgSupabaseProjectId(e.target.value)}
                        placeholder="jeewhluiufosnourqvje"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Project URL
                      </label>
                      <input
                        type="url"
                        value={cfgSupabaseUrl}
                        onChange={(e) => setCfgSupabaseUrl(e.target.value)}
                        placeholder="https://jeewhluiufosnourqvje.supabase.co"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Publishable API Key
                      </label>
                      <input
                        type="text"
                        value={cfgSupabasePublishableKey}
                        onChange={(e) => setCfgSupabasePublishableKey(e.target.value)}
                        placeholder="sb_publishable_..."
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-200/70">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-xs font-medium text-slate-700">
                          Secret / Service Role Key (Opsional Server-Only)
                        </label>
                        {schemaStatus?.config.hasSupabaseSecretKey && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            Tersimpan
                          </span>
                        )}
                      </div>
                      <input
                        type={showSupabaseSecrets ? 'text' : 'password'}
                        autoComplete="off"
                        value={cfgSupabaseSecretKey}
                        onChange={(e) => setCfgSupabaseSecretKey(e.target.value)}
                        placeholder={
                          schemaStatus?.config.hasSupabaseSecretKey
                            ? 'Sudah tersimpan (kosongkan jika tidak ubah)'
                            : 'sb_secret_... / service_role key'
                        }
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-xs font-medium text-slate-700">
                          Postgres Direct / Pooler URI (Auto-Create Tabel)
                        </label>
                        {schemaStatus?.config.hasSupabaseDbUrl && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            Tersimpan
                          </span>
                        )}
                      </div>
                      <input
                        type={showSupabaseSecrets ? 'text' : 'password'}
                        autoComplete="off"
                        value={cfgSupabaseDbUrl}
                        onChange={(e) => setCfgSupabaseDbUrl(e.target.value)}
                        placeholder={
                          schemaStatus?.config.hasSupabaseDbUrl
                            ? 'URI Postgres tersimpan (kosongkan jika tidak ubah)'
                            : 'postgresql://postgres.[ref]:[pass]@...supabase.com:6543/postgres'
                        }
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  {(schemaStatus?.config.hasSupabaseSecretKey ||
                    schemaStatus?.config.hasSupabaseDbUrl) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingConfig}
                        onClick={handleClearSupabaseSecrets}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Hapus Secret / URI Tersimpan</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgAutoCreate}
                  onChange={(e) => setCfgAutoCreate(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-700"
                />
                <span>
                  <strong className="text-slate-900">
                    Buat tabel otomatis jika belum tersedia
                  </strong>{' '}
                  — Sistem otomatis membuat tabel dan struktur default yang belum ada saat konfigurasi disimpan atau server dimulai.
                </span>
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan Database'}</span>
                </button>
              </div>
            </form>

            {/* Change Database PIN Form */}
            <form
              onSubmit={handleChangeDatabasePin}
              className="p-5 rounded-xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    PIN Khusus Pengaturan Database
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Status:{' '}
                    <strong className="text-slate-900">
                      {schemaStatus?.config.hasCustomDatabasePin
                        ? 'Menggunakan PIN Database Khusus'
                        : 'Menggunakan PIN Default (Admin / Superuser)'}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangePin((p) => !p)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {showChangePin ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Sembunyikan</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Tampilkan</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    PIN Database Saat Ini
                  </label>
                  <input
                    type={showChangePin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={curDbPin}
                    onChange={(e) => setCurDbPin(e.target.value)}
                    placeholder="Masukkan PIN saat ini"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    PIN Database Baru
                  </label>
                  <input
                    type={showChangePin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={newDbPin}
                    onChange={(e) => setNewDbPin(e.target.value)}
                    placeholder="Minimal 4 karakter"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Konfirmasi PIN Baru
                  </label>
                  <input
                    type={showChangePin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={confirmDbPin}
                    onChange={(e) => setConfirmDbPin(e.target.value)}
                    placeholder="Ulangi PIN baru"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingDbPin}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{savingDbPin ? 'Menyimpan...' : 'Simpan PIN Database'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  );
};
