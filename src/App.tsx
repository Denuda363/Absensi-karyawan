import { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  Clock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  Employee,
  getTodayDateStr,
  isEmployeeOffDay,
  LateSettlement,
  NavSection,
} from './types';
import { fetchDatabaseState } from './services/attendanceService';
import {
  lockAdminModeSession,
  unlockAdminModeWithPin,
} from './services/payrollService';
import {
  notifyScopeRefresh,
  subscribeRealtimeScopes,
} from './services/realtimeService';
import {
  subscribeFirebaseAuth,
  subscribeFirestoreRealtime,
} from './services/firebaseClient';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { DayOffScheduleView } from './components/DayOffScheduleView';
import { ReportsView } from './components/ReportsView';
import { AttendanceMatrixView } from './components/AttendanceMatrixView';
import { CompanyProfileView } from './components/CompanyProfileView';
import { SettingsView } from './components/SettingsView';
import { PayrollRecapView } from './components/PayrollRecapView';
import { FinanceView } from './components/FinanceView';
import { ShiftScheduleView } from './components/ShiftScheduleView';
import { RealtimeClock } from './components/RealtimeClock';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallControls';
import {
  NotificationBellButton,
  NotificationCenterDrawer,
  NotificationToastStack,
  useNotificationCenterState,
} from './components/NotificationCenter';

const PAGE_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  ringkasan: {
    title: 'Dashboard',
    subtitle: 'Analitik kehadiran 7 hari, performa per divisi, dan kontrol absensi harian',
  },
  matriks: {
    title: 'Matriks Daftar Hadir',
    subtitle: 'Pusat pencatatan absensi, log catatan kehadiran, izin datang terlambat, dan ekspor .xlsx',
  },
  'jadwal-shift': {
    title: 'Jadwal Shift Karyawan',
    subtitle: 'Atur penugasan anggota per shift (Pagi, Siang, Reguler, Malam) beserta jadwal harian & mingguan',
  },
  'jadwal-libur': {
    title: 'Jadwal Libur Karyawan',
    subtitle: 'Atur hari libur mingguan berbeda dan kalender khusus per individu',
  },
  rekap: {
    title: 'Rekapitulasi Bulanan',
    subtitle: 'Laporan kehadiran, keterlambatan karyawan, jam kerja, dan lembur manual siap cetak & ekspor',
  },
  keuangan: {
    title: 'Keuangan Perusahaan',
    subtitle: 'Pendapatan cash & transfer, pengeluaran perusahaan, serta pengaturan kategori khusus Mode Admin',
  },
  'rekap-gaji': {
    title: 'Rekap Gaji Karyawan',
    subtitle: 'Data penggajian rahasia dilindungi otorisasi PIN Superuser',
  },
  'profil-perusahaan': {
    title: 'Profil Perusahaan',
    subtitle: 'Identitas resmi, legalitas, struktur pimpinan, sebaran divisi, dan lokasi kantor cabang',
  },
  pengaturan: {
    title: 'Pengaturan Sistem',
    subtitle: 'Kelola jam kerja tiap shift, identitas perusahaan, dan backup/restore data',
  },
};

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'KARYAPRESENSI',
  companySubtitle: 'HRIS PERUSAHAAN',
  lateDeductionPerMinute: 1000,
  shifts: [],
};

function AppWorkspace() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [lateSettlements, setLateSettlements] = useState<LateSettlement[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavSection>('ringkasan');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const {
    notifications,
    unreadCount,
    prefs: notificationPrefs,
    toasts: notificationToasts,
    permission: deviceNotificationPermission,
  } = useNotificationCenterState();

  // Mode Biasa (default) vs Mode Admin
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const isAdminMode = Boolean(adminToken);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [showAdminPin, setShowAdminPin] = useState<boolean>(false);
  const [unlockingAdmin, setUnlockingAdmin] = useState<boolean>(false);
  const [adminPinError, setAdminPinError] = useState<string | null>(null);

  const [fbUser, setFbUser] = useState<User | null>(null);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoadError(null);
      }
      const state = await fetchDatabaseState();
      setEmployees(state.employees);
      setAttendanceRecords(state.attendanceRecords);
      setLateSettlements(state.lateSettlements ?? []);
      if (state.settings) {
        setSettings(state.settings);
      }
      setLoadError(null);
    } catch (err) {
      if (!options?.silent) {
        setLoadError(
          err instanceof Error ? err.message : 'Gagal memuat data absensi dari server.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = subscribeRealtimeScopes(
      ['attendance'],
      () => {
        void loadData({ silent: true });
      },
      { ignoreImmediateLocalEcho: true }
    );
    return () => unsub();
  }, [loadData]);

  useEffect(() => {
    const unsub = subscribeFirebaseAuth((user) => {
      setFbUser(user);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!fbUser || !fbUser.emailVerified) return;
    const unsub = subscribeFirestoreRealtime({
      onAppSettings: (remoteSettings, { isInitial }) => {
        if (isInitial) return;
        setSettings((prev) => ({
          ...prev,
          ...remoteSettings,
          shifts:
            remoteSettings.shifts && remoteSettings.shifts.length > 0
              ? remoteSettings.shifts
              : prev.shifts,
        }));
        notifyScopeRefresh('database', 'firestore');
      },
      onEmployees: (remoteEmployees, { isInitial }) => {
        if (isInitial) return;
        setEmployees(
          [...remoteEmployees].sort((a, b) =>
            a.employeeCode.localeCompare(b.employeeCode)
          )
        );
        notifyScopeRefresh('database', 'firestore');
      },
      onAttendance: (remoteRecords, { isInitial }) => {
        if (isInitial) return;
        setAttendanceRecords(remoteRecords);
        notifyScopeRefresh('database', 'firestore');
      },
      onLateSettlements: (remoteSettlements, { isInitial }) => {
        if (isInitial) return;
        setLateSettlements(remoteSettlements);
        notifyScopeRefresh('database', 'firestore');
      },
      onPayrollChanged: ({ isInitial }) => {
        if (isInitial) return;
        notifyScopeRefresh('payroll', 'firestore');
        notifyScopeRefresh('database', 'firestore');
      },
      onFinanceChanged: ({ isInitial }) => {
        if (isInitial) return;
        notifyScopeRefresh('finance', 'firestore');
        notifyScopeRefresh('database', 'firestore');
      },
    });
    return () => unsub();
  }, [fbUser]);

  const unloggedTodayCount = useMemo(() => {
    const today = getTodayDateStr();
    const todayRecs = attendanceRecords.filter((r) => r.date === today);
    const loggedIds = new Set(todayRecs.map((r) => r.employeeId));
    return employees.filter(
      (emp) => emp.active && !isEmployeeOffDay(emp, today).isOff && !loggedIds.has(emp.id)
    ).length;
  }, [employees, attendanceRecords]);

  const handleOpenAdminModeModal = useCallback(() => {
    setAdminPinInput('');
    setAdminPinError(null);
    setShowAdminPin(false);
    setAdminModalOpen(true);
  }, []);

  const handleUnlockAdminMode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPinInput.trim()) {
      setAdminPinError('Masukkan PIN Mode Admin terlebih dahulu.');
      return;
    }
    setUnlockingAdmin(true);
    setAdminPinError(null);
    try {
      const res = await unlockAdminModeWithPin(adminPinInput.trim());
      setAdminToken(res.token);
      setAdminPinInput('');
      setAdminModalOpen(false);
    } catch (err) {
      setAdminPinError(
        err instanceof Error ? err.message : 'PIN Mode Admin tidak valid.'
      );
      setAdminPinInput('');
    } finally {
      setUnlockingAdmin(false);
    }
  };

  const handleExitAdminMode = useCallback(async () => {
    const token = adminToken;
    setAdminToken(null);
    setActiveNav((prev) =>
      prev === 'rekap-gaji' || prev === 'keuangan' || prev === 'pengaturan'
        ? 'ringkasan'
        : prev
    );
    if (token) {
      await lockAdminModeSession(token);
    }
  }, [adminToken]);

  const handleGuardedNavigate = useCallback(
    (nav: NavSection) => {
      if (
        !isAdminMode &&
        (nav === 'rekap-gaji' || nav === 'keuangan' || nav === 'pengaturan')
      ) {
        return;
      }
      setActiveNav(nav);
    },
    [isAdminMode]
  );

  const effectiveNav: NavSection =
    !isAdminMode &&
    (activeNav === 'rekap-gaji' ||
      activeNav === 'keuangan' ||
      activeNav === 'pengaturan')
      ? 'ringkasan'
      : activeNav;
  const pageMeta = PAGE_TITLES[effectiveNav];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activeNav={effectiveNav}
        onSelectNav={handleGuardedNavigate}
        unloggedTodayCount={unloggedTodayCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        companyName={settings.companyName}
        companyLogo={settings.companyProfile?.logoDataUrl}
        isAdminMode={isAdminMode}
        onOpenAdminModeModal={handleOpenAdminModeModal}
        onExitAdminMode={handleExitAdminMode}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineIndicator />

        {/* Top Bar (compact 56px mobile height, 64px desktop) */}
        <header className="h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3.5 sm:px-5 lg:px-8 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="font-display text-sm sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                  {pageMeta.title}
                </h1>
                <span className="hidden xl:inline-block text-slate-300">|</span>
                <span className="hidden xl:inline-block text-xs text-slate-500 truncate">
                  {pageMeta.subtitle}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2.5">
            <div className="hidden sm:block">
              <RealtimeClock variant="compact" />
            </div>

            <PWAInstallButton variant="header" />

            <NotificationBellButton
              unreadCount={unreadCount}
              deviceReady={
                deviceNotificationPermission === 'granted' &&
                notificationPrefs.systemNotificationsEnabled
              }
              onClick={() => setNotificationOpen(true)}
            />

            {isAdminMode ? (
              <button
                type="button"
                onClick={handleExitAdminMode}
                title="Keluar dari Mode Admin dan kunci menu Keuangan, Rekap Gaji & Pengaturan"
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mode Admin</span>
                <LogOut className="w-3.5 h-3.5 text-emerald-700" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenAdminModeModal}
                title="Masuk ke Mode Admin"
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Mode Admin</span>
              </button>
            )}

            {effectiveNav !== 'matriks' ? (
              <button
                type="button"
                onClick={() => setActiveNav('matriks')}
                className="hidden sm:inline-flex px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Matriks Absensi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveNav('rekap')}
                className="hidden sm:inline-flex px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Rekap Bulanan
              </button>
            )}
          </div>
        </header>

        {/* Main Content (includes bottom safe clearance for mobile bottom nav) */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-8 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void loadData()}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {effectiveNav === 'ringkasan' && (
            <OverviewView
              employees={employees}
              attendanceRecords={attendanceRecords}
              shifts={settings.shifts}
              settings={settings}
              loading={loading}
              onNavigate={handleGuardedNavigate}
            />
          )}

          {effectiveNav === 'matriks' && (
            <AttendanceMatrixView
              employees={employees}
              attendanceRecords={attendanceRecords}
              lateSettlements={lateSettlements}
              settings={settings}
              loading={loading}
              onRefresh={loadData}
            />
          )}

          {effectiveNav === 'jadwal-shift' && (
            <ShiftScheduleView
              employees={employees}
              settings={settings}
              loading={loading}
              onRefresh={loadData}
              onNavigate={handleGuardedNavigate}
            />
          )}

          {effectiveNav === 'jadwal-libur' && (
            <DayOffScheduleView
              employees={employees}
              shifts={settings.shifts}
              loading={loading}
              onRefresh={loadData}
            />
          )}

          {effectiveNav === 'rekap' && (
            <ReportsView
              employees={employees}
              attendanceRecords={attendanceRecords}
              lateSettlements={lateSettlements}
              settings={settings}
              loading={loading}
              onRefresh={loadData}
              onNavigate={handleGuardedNavigate}
            />
          )}

          {effectiveNav === 'keuangan' && isAdminMode && adminToken && (
            <FinanceView
              adminToken={adminToken}
              settings={settings}
              employees={employees}
              onExitAdminMode={handleExitAdminMode}
            />
          )}

          {effectiveNav === 'rekap-gaji' && isAdminMode && (
            <PayrollRecapView
              employees={employees}
              attendanceRecords={attendanceRecords}
              lateSettlements={lateSettlements}
              settings={settings}
            />
          )}

          {effectiveNav === 'profil-perusahaan' && (
            <CompanyProfileView
              employees={employees}
              settings={settings}
              loading={loading}
              onRefresh={loadData}
              onNavigate={handleGuardedNavigate}
              isAdminMode={isAdminMode}
            />
          )}

          {effectiveNav === 'pengaturan' && isAdminMode && (
            <SettingsView
              employees={employees}
              attendanceRecords={attendanceRecords}
              lateSettlements={lateSettlements}
              settings={settings}
              onRefresh={loadData}
              onNavigate={handleGuardedNavigate}
              isAdminMode={isAdminMode}
              adminToken={adminToken}
              onOpenAdminModeModal={handleOpenAdminModeModal}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Thumb-Zone Navigation Bar */}
      <nav
        aria-label="Navigasi cepat mobile"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden pb-safe no-print"
      >
        <div className="grid grid-cols-5 items-center h-[60px]">
          <button
            type="button"
            onClick={() => handleGuardedNavigate('ringkasan')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer transition-colors ${
              effectiveNav === 'ringkasan'
                ? 'text-blue-700 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] tracking-tight truncate">Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => handleGuardedNavigate('matriks')}
            className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer transition-colors ${
              effectiveNav === 'matriks'
                ? 'text-blue-700 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Table2 className="w-5 h-5" />
              {unloggedTodayCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white font-mono text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {unloggedTodayCount > 9 ? '9+' : unloggedTodayCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight truncate">Matriks</span>
          </button>

          <button
            type="button"
            onClick={() => handleGuardedNavigate('jadwal-shift')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer transition-colors ${
              effectiveNav === 'jadwal-shift'
                ? 'text-blue-700 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] tracking-tight truncate">Shift</span>
          </button>

          <button
            type="button"
            onClick={() => handleGuardedNavigate('rekap')}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer transition-colors ${
              effectiveNav === 'rekap'
                ? 'text-blue-700 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] tracking-tight truncate">Rekap</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer transition-colors ${
              mobileMenuOpen ||
              effectiveNav === 'jadwal-libur' ||
              effectiveNav === 'profil-perusahaan' ||
              effectiveNav === 'keuangan' ||
              effectiveNav === 'rekap-gaji' ||
              effectiveNav === 'pengaturan'
                ? 'text-blue-700 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] tracking-tight truncate">Menu</span>
          </button>
        </div>
      </nav>

      {/* Modal Masuk Mode Admin */}
      {adminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden pb-safe">
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-slate-950">
              <div className="w-10 h-1 bg-slate-700 rounded-full" />
            </div>
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-white">
                    Masuk ke Mode Admin
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Buka akses menu manajemen lanjutan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminModalOpen(false)}
                aria-label="Tutup modal"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUnlockAdminMode} className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Masukkan PIN Mode Admin untuk membuka menu Keuangan Perusahaan, Rekap Gaji, dan Pengaturan Sistem. PIN dapat diubah melalui menu Pengaturan saat Mode Admin aktif.
              </p>

              {adminPinError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adminPinError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="admin-mode-pin-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  PIN Mode Admin
                </label>
                <div className="relative">
                  <input
                    id="admin-mode-pin-input"
                    type={showAdminPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    value={adminPinInput}
                    onChange={(e) => setAdminPinInput(e.target.value)}
                    placeholder="Masukkan PIN Mode Admin"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPin((prev) => !prev)}
                    aria-label={showAdminPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showAdminPin ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAdminModalOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl sm:rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={unlockingAdmin}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-xl sm:rounded-lg cursor-pointer"
                >
                  {unlockingAdmin ? 'Memeriksa...' : 'Aktifkan Mode Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NotificationToastStack
        toasts={notificationToasts}
        onOpenCenter={() => setNotificationOpen(true)}
      />

      <NotificationCenterDrawer
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        prefs={notificationPrefs}
        permission={deviceNotificationPermission}
        isAdminMode={isAdminMode}
        onNavigate={handleGuardedNavigate}
        onOpenAdminModeModal={handleOpenAdminModeModal}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppWorkspace />
    </ErrorBoundary>
  );
}
