import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  AttendanceStatus,
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
import { RealtimeClock } from './components/RealtimeClock';

const PAGE_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  ringkasan: {
    title: 'Dashboard',
    subtitle: 'Analitik kehadiran 7 hari, performa per divisi, dan kontrol absensi harian',
  },
  matriks: {
    title: 'Matriks Daftar Hadir',
    subtitle: 'Pusat pencatatan absensi, log catatan kehadiran, izin datang terlambat, dan ekspor .xlsx',
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
  const [preselectedEmpId, setPreselectedEmpId] = useState<string | null>(null);
  const [preselectedStatus, setPreselectedStatus] = useState<AttendanceStatus | null>(null);

  // Mode Biasa (default) vs Mode Admin
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const isAdminMode = Boolean(adminToken);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [showAdminPin, setShowAdminPin] = useState<boolean>(false);
  const [unlockingAdmin, setUnlockingAdmin] = useState<boolean>(false);
  const [adminPinError, setAdminPinError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const state = await fetchDatabaseState();
      setEmployees(state.employees);
      setAttendanceRecords(state.attendanceRecords);
      setLateSettlements(state.lateSettlements ?? []);
      if (state.settings) {
        setSettings(state.settings);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Gagal memuat data absensi dari server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const unloggedTodayCount = useMemo(() => {
    const today = getTodayDateStr();
    const todayRecs = attendanceRecords.filter((r) => r.date === today);
    const loggedIds = new Set(todayRecs.map((r) => r.employeeId));
    return employees.filter(
      (emp) => emp.active && !isEmployeeOffDay(emp, today).isOff && !loggedIds.has(emp.id)
    ).length;
  }, [employees, attendanceRecords]);

  const handleOpenManualEntry = useCallback(
    (employeeId?: string, status?: AttendanceStatus) => {
      setPreselectedEmpId(employeeId ?? null);
      setPreselectedStatus(status ?? null);
      setActiveNav('matriks');
    },
    []
  );

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
        {/* Top Bar */}
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-5 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                  {pageMeta.title}
                </h1>
                <span className="hidden xl:inline-block text-slate-300">|</span>
                <span className="hidden xl:inline-block text-xs text-slate-500 truncate">
                  {pageMeta.subtitle}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
            <RealtimeClock variant="compact" />

            {isAdminMode ? (
              <button
                type="button"
                onClick={handleExitAdminMode}
                title="Keluar dari Mode Admin dan kunci menu Keuangan, Rekap Gaji & Pengaturan"
                className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mode Admin</span>
                <LogOut className="w-3.5 h-3.5 text-emerald-700" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenAdminModeModal}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Mode Admin</span>
              </button>
            )}

            {effectiveNav !== 'matriks' ? (
              <button
                type="button"
                onClick={() => setActiveNav('matriks')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Input Absensi
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveNav('rekap')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Rekap Bulanan
              </button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={loadData}
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
              onRefresh={loadData}
              onNavigate={handleGuardedNavigate}
              onOpenManualEntry={handleOpenManualEntry}
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
              preselectedEmployeeId={preselectedEmpId}
              preselectedStatus={preselectedStatus}
              onClearPreselect={() => {
                setPreselectedEmpId(null);
                setPreselectedStatus(null);
              }}
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

      {/* Modal Masuk Mode Admin */}
      {adminModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
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
                className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
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
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPin((prev) => !prev)}
                    aria-label={showAdminPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showAdminPin ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAdminModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={unlockingAdmin}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {unlockingAdmin ? 'Memeriksa...' : 'Aktifkan Mode Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
