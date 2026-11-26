import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Layers,
  Palette,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  calculateDurationHours,
  DEFAULT_MATRIX_COLORS,
  Employee,
  getShiftMembersForWeekday,
  HARI_WEEKDAYS,
  LateSettlement,
  MATRIX_COLOR_PRESETS,
  MatrixColorSettings,
  NavSection,
  normalizeMatrixColors,
  pickContrastTextColor,
  ResetDataMode,
  ShiftConfig,
} from '../types';
import {
  downloadBackupJson,
  resetApplicationData,
  restoreDatabaseBackup,
  updateAppSettings,
} from '../services/attendanceService';
import { changeAdminModePin } from '../services/payrollService';
import { lockDatabaseSession } from '../services/databaseService';
import { DatabaseSettingsPanel } from './DatabaseSettingsPanel';

interface SettingsViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements?: LateSettlement[];
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onNavigate?: (nav: NavSection) => void;
  isAdminMode?: boolean;
  adminToken?: string | null;
  onOpenAdminModeModal?: () => void;
}

type SettingsGroup =
  | 'semua'
  | 'shift'
  | 'identitas'
  | 'warna-matriks'
  | 'backup'
  | 'reset'
  | 'keamanan'
  | 'database';

interface ParsedBackupPreview {
  fileName: string;
  exportedAt: string | null;
  employeeCount: number;
  attendanceCount: number;
  shiftCount: number;
  rawPayload: unknown;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  employees,
  attendanceRecords,
  lateSettlements = [],
  settings,
  onRefresh,
  onNavigate,
  isAdminMode = false,
  adminToken = null,
  onOpenAdminModeModal,
}) => {
  const [activeGroup, setActiveGroup] = useState<SettingsGroup>('semua');

  // Shift & lateness policy state
  const [shifts, setShifts] = useState<ShiftConfig[]>(settings.shifts || []);
  const [lateDeductionPerMinute, setLateDeductionPerMinute] = useState<number>(
    settings.lateDeductionPerMinute ?? 1000
  );
  const [savingShifts, setSavingShifts] = useState<boolean>(false);
  const [shiftNotice, setShiftNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Company identity state
  const [companyName, setCompanyName] = useState<string>(settings.companyName || 'KARYAPRESENSI');
  const [companySubtitle, setCompanySubtitle] = useState<string>(
    settings.companySubtitle || 'HRIS PERUSAHAAN'
  );
  const [savingIdentity, setSavingIdentity] = useState<boolean>(false);
  const [identityNotice, setIdentityNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Matrix Color state
  const [matrixColors, setMatrixColors] = useState<MatrixColorSettings>(() =>
    normalizeMatrixColors(settings.matrixColors)
  );
  const [savingMatrixColors, setSavingMatrixColors] = useState<boolean>(false);
  const [matrixColorsNotice, setMatrixColorsNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Backup & Restore state
  const [backingUp, setBackingUp] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [backupPreview, setBackupPreview] = useState<ParsedBackupPreview | null>(null);
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Admin Mode PIN change state
  const [currentAdminPin, setCurrentAdminPin] = useState<string>('');
  const [newAdminPin, setNewAdminPin] = useState<string>('');
  const [confirmAdminPin, setConfirmAdminPin] = useState<string>('');
  const [showPinFields, setShowPinFields] = useState<boolean>(false);
  const [savingAdminPin, setSavingAdminPin] = useState<boolean>(false);
  const [adminPinNotice, setAdminPinNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Reset Data Sistem state
  const [resetModalMode, setResetModalMode] = useState<ResetDataMode | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');
  const [resetPinInput, setResetPinInput] = useState<string>('');
  const [showResetPin, setShowResetPin] = useState<boolean>(false);
  const [resettingData, setResettingData] = useState<boolean>(false);
  const [resetModalError, setResetModalError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Lifted Database PIN Session Token (persists across Settings sub-tabs, locks when exiting Settings)
  const [databaseToken, setDatabaseToken] = useState<string | null>(null);
  const databaseTokenRef = useRef<string | null>(null);

  useEffect(() => {
    databaseTokenRef.current = databaseToken;
  }, [databaseToken]);

  useEffect(() => {
    return () => {
      if (databaseTokenRef.current) {
        void lockDatabaseSession(databaseTokenRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setShifts(settings.shifts || []);
    setLateDeductionPerMinute(settings.lateDeductionPerMinute ?? 1000);
    setCompanyName(settings.companyName || 'KARYAPRESENSI');
    setCompanySubtitle(settings.companySubtitle || 'HRIS PERUSAHAAN');
    setMatrixColors(normalizeMatrixColors(settings.matrixColors));
  }, [settings]);

  const shiftUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    const activeEmployees = employees.filter((e) => e.active);
    for (const s of shifts) {
      const uniqueIds = new Set<string>();
      for (const day of HARI_WEEKDAYS) {
        const { members } = getShiftMembersForWeekday(s, day.index, activeEmployees);
        for (const m of members) uniqueIds.add(m.id);
      }
      counts.set(s.id, uniqueIds.size);
    }
    return counts;
  }, [employees, shifts]);

  const handleAddShift = () => {
    const newShift: ShiftConfig = {
      id: `shift_${Date.now()}`,
      name: `Shift Baru ${shifts.length + 1}`,
      startTime: '08:00',
      endTime: '17:00',
      lateToleranceMinutes: 10,
    };
    setShifts([...shifts, newShift]);
    setShiftNotice(null);
  };

  const handleUpdateShiftField = (
    id: string,
    field: keyof ShiftConfig,
    value: string | number
  ) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
    setShiftNotice(null);
  };

  const handleRemoveShift = (id: string) => {
    if (shifts.length <= 1) {
      setShiftNotice({
        type: 'error',
        text: 'Minimal harus terdapat satu shift kerja aktif.',
      });
      return;
    }
    setShifts((prev) => prev.filter((s) => s.id !== id));
    setShiftNotice(null);
  };

  const handleSaveShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftNotice(null);

    for (const s of shifts) {
      if (!s.name.trim()) {
        setShiftNotice({ type: 'error', text: 'Nama shift tidak boleh kosong.' });
        return;
      }
      if (!s.startTime || !s.endTime) {
        setShiftNotice({
          type: 'error',
          text: `Jam masuk dan jam keluar pada ${s.name} wajib diisi.`,
        });
        return;
      }
    }

    setSavingShifts(true);
    try {
      await updateAppSettings({
        shifts,
        lateDeductionPerMinute,
        syncEmployees: false,
      });
      await onRefresh();
      setShiftNotice({
        type: 'success',
        text: 'Pengaturan jam kerja tiap shift berhasil disimpan dan diterapkan ke Jadwal Shift.',
      });
    } catch (err) {
      setShiftNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan shift.',
      });
    } finally {
      setSavingShifts(false);
    }
  };

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdentityNotice(null);
    if (!companyName.trim()) {
      setIdentityNotice({
        type: 'error',
        text: 'Nama perusahaan tidak boleh kosong.',
      });
      return;
    }

    setSavingIdentity(true);
    try {
      await updateAppSettings({
        companyName: companyName.trim(),
        companySubtitle: companySubtitle.trim() || 'HRIS PERUSAHAAN',
      });
      await onRefresh();
      setIdentityNotice({
        type: 'success',
        text: 'Identitas perusahaan untuk header Matriks & Excel berhasil diperbarui.',
      });
    } catch (err) {
      setIdentityNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan identitas.',
      });
    } finally {
      setSavingIdentity(false);
    }
  };

  const matrixColorPresets = MATRIX_COLOR_PRESETS;

  const handleUpdateMatrixColor = (
    key: keyof MatrixColorSettings,
    field: 'bg' | 'text',
    hex: string,
    autoContrast = false
  ) => {
    const normalizedHex = hex.toUpperCase();
    setMatrixColors((prev) => {
      const nextPair = {
        ...prev[key],
        [field]: normalizedHex,
      };
      if (field === 'bg' && autoContrast) {
        nextPair.text = pickContrastTextColor(normalizedHex);
      }
      return {
        ...prev,
        [key]: nextPair,
      };
    });
    setMatrixColorsNotice(null);
  };

  const handleResetMatrixColors = () => {
    setMatrixColors(normalizeMatrixColors(DEFAULT_MATRIX_COLORS));
    setMatrixColorsNotice(null);
  };

  const handleSaveMatrixColors = async (e: React.FormEvent) => {
    e.preventDefault();
    setMatrixColorsNotice(null);
    setSavingMatrixColors(true);
    try {
      const normalized = normalizeMatrixColors(matrixColors);
      await updateAppSettings({ matrixColors: normalized });
      await onRefresh();
      setMatrixColorsNotice({
        type: 'success',
        text: 'Warna matriks berhasil disimpan dan langsung diterapkan pada Matriks Daftar Hadir, cetak, dan ekspor Excel.',
      });
    } catch (err) {
      setMatrixColorsNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan warna matriks.',
      });
    } finally {
      setSavingMatrixColors(false);
    }
  };

  const handleDownloadBackup = async () => {
    setBackupNotice(null);
    setBackingUp(true);
    try {
      await downloadBackupJson();
      setBackupNotice({
        type: 'success',
        text: 'File backup (.json) berhasil diunduh.',
      });
    } catch (err) {
      setBackupNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat file backup.',
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleSelectBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setBackupNotice(null);
    setBackupPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        exportedAt?: string;
        employees?: unknown[];
        attendanceRecords?: unknown[];
        settings?: { shifts?: unknown[] };
      };

      if (
        !parsed ||
        !Array.isArray(parsed.employees) ||
        !Array.isArray(parsed.attendanceRecords)
      ) {
        setBackupNotice({
          type: 'error',
          text: 'File JSON tidak valid. Pastikan file berasal dari ekspor backup KaryaPresensi.',
        });
        return;
      }

      setBackupPreview({
        fileName: file.name,
        exportedAt: parsed.exportedAt || null,
        employeeCount: parsed.employees.length,
        attendanceCount: parsed.attendanceRecords.length,
        shiftCount: Array.isArray(parsed.settings?.shifts)
          ? parsed.settings.shifts.length
          : 0,
        rawPayload: parsed,
      });
    } catch {
      setBackupNotice({
        type: 'error',
        text: 'Gagal membaca file JSON. Pastikan format file tidak rusak.',
      });
    }
  };

  const handleExecuteRestore = async () => {
    if (!backupPreview) return;
    setRestoring(true);
    setBackupNotice(null);
    try {
      await restoreDatabaseBackup(backupPreview.rawPayload);
      await onRefresh();
      setBackupPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setBackupNotice({
        type: 'success',
        text: 'Seluruh data karyawan, absensi, dan pengaturan shift berhasil dipulihkan.',
      });
    } catch (err) {
      setBackupNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memulihkan data backup.',
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleChangeAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinNotice(null);

    if (!currentAdminPin.trim()) {
      setAdminPinNotice({
        type: 'error',
        text: 'Masukkan PIN Mode Admin saat ini untuk verifikasi.',
      });
      return;
    }
    const cleanNew = newAdminPin.trim();
    if (cleanNew.length < 4 || cleanNew.length > 20) {
      setAdminPinNotice({
        type: 'error',
        text: 'PIN Mode Admin baru minimal 4 karakter dan maksimal 20 karakter.',
      });
      return;
    }
    if (cleanNew !== confirmAdminPin.trim()) {
      setAdminPinNotice({
        type: 'error',
        text: 'Konfirmasi PIN baru tidak cocok.',
      });
      return;
    }

    setSavingAdminPin(true);
    try {
      await changeAdminModePin({
        currentPin: currentAdminPin.trim(),
        newPin: cleanNew,
      });
      setCurrentAdminPin('');
      setNewAdminPin('');
      setConfirmAdminPin('');
      setAdminPinNotice({
        type: 'success',
        text: 'PIN Mode Admin berhasil diperbarui dan langsung berlaku.',
      });
    } catch (err) {
      setAdminPinNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah PIN Mode Admin.',
      });
    } finally {
      setSavingAdminPin(false);
    }
  };

  const resetOptionMeta: Record<
    ResetDataMode,
    {
      title: string;
      shortDesc: string;
      confirmPhrase: string;
      buttonLabel: string;
      deletedItems: string[];
      preservedItems: string[];
      accent: 'amber' | 'orange' | 'red';
    }
  > = {
    attendance: {
      title: 'Reset Data Absensi',
      shortDesc:
        'Hapus seluruh catatan kehadiran & log penyelesaian keterlambatan saja.',
      confirmPhrase: 'RESET ABSENSI',
      buttonLabel: 'Reset Data Absensi',
      deletedItems: [
        `Seluruh catatan absensi matriks & log kehadiran (${attendanceRecords.length} catatan)`,
        `Seluruh riwayat penyelesaian keterlambatan (${lateSettlements.length} catatan)`,
      ],
      preservedItems: [
        `Daftar karyawan (${employees.length} karyawan), jadwal shift & jadwal libur`,
        'Identitas perusahaan, pengaturan shift, data rekap gaji, dan keuangan',
      ],
      accent: 'amber',
    },
    except_employees: {
      title: 'Reset Semua Data Kecuali Nama Karyawan',
      shortDesc:
        'Kosongkan absensi, jadwal shift harian/libur, gaji, dan keuangan — daftar karyawan tetap aman.',
      confirmPhrase: 'RESET KECUALI KARYAWAN',
      buttonLabel: 'Reset Kecuali Karyawan',
      deletedItems: [
        `Seluruh catatan absensi (${attendanceRecords.length}) & penyelesaian keterlambatan (${lateSettlements.length})`,
        'Seluruh jadwal shift harian & jadwal libur individu karyawan',
        'Seluruh profil nominal gaji, bonus/potongan, riwayat kenaikan gaji & status pembayaran gaji',
        'Seluruh transaksi pendapatan/pengeluaran, mutasi transfer & saldo kas/rekening (kembali Rp 0)',
      ],
      preservedItems: [
        `Daftar nama & identitas dasar karyawan (${employees.length} karyawan)`,
        'PIN Mode Admin, PIN Database & konfigurasi koneksi database',
      ],
      accent: 'orange',
    },
    all: {
      title: 'Reset All Data',
      shortDesc:
        'Hapus total seluruh data karyawan, absensi, jadwal, gaji, keuangan, dan kembalikan ke awal kosong.',
      confirmPhrase: 'RESET SEMUA DATA',
      buttonLabel: 'Reset All Data',
      deletedItems: [
        `Seluruh data karyawan (${employees.length} karyawan)`,
        `Seluruh catatan absensi (${attendanceRecords.length}) & penyelesaian keterlambatan (${lateSettlements.length})`,
        'Seluruh jadwal shift harian, jadwal libur, dan pengaturan shift/profil ke default',
        'Seluruh data gaji (profil, penyesuaian, kenaikan gaji & status bulanan)',
        'Seluruh transaksi & transfer keuangan serta reset saldo kas/rekening menjadi Rp 0',
      ],
      preservedItems: [
        'PIN Mode Admin, PIN Database & konfigurasi koneksi database tetap aman agar admin tidak terkunci',
      ],
      accent: 'red',
    },
  };

  const openResetModal = (mode: ResetDataMode) => {
    setResetModalMode(mode);
    setResetConfirmText('');
    setResetPinInput('');
    setShowResetPin(false);
    setResetModalError(null);
  };

  const closeResetModal = () => {
    if (resettingData) return;
    setResetModalMode(null);
    setResetConfirmText('');
    setResetPinInput('');
    setResetModalError(null);
  };

  const handleConfirmResetData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalMode) return;
    setResetModalError(null);

    if (!adminToken) {
      setResetModalError(
        'Sesi Mode Admin belum aktif. Silakan masuk Mode Admin terlebih dahulu.'
      );
      return;
    }

    const meta = resetOptionMeta[resetModalMode];
    if (resetConfirmText.trim().toUpperCase() !== meta.confirmPhrase) {
      setResetModalError(
        `Ketik "${meta.confirmPhrase}" secara persis pada kolom konfirmasi.`
      );
      return;
    }

    if (!resetPinInput.trim()) {
      setResetModalError('Masukkan PIN Mode Admin untuk memverifikasi reset data.');
      return;
    }

    setResettingData(true);
    try {
      const result = await resetApplicationData(adminToken, {
        mode: resetModalMode,
        pin: resetPinInput.trim(),
      });
      await onRefresh();
      setResetModalMode(null);
      setResetConfirmText('');
      setResetPinInput('');
      setResetNotice({
        type: 'success',
        text: result.message,
      });
    } catch (err) {
      setResetModalError(
        err instanceof Error ? err.message : 'Gagal menjalankan reset data aplikasi.'
      );
    } finally {
      setResettingData(false);
    }
  };

  const navGroups: {
    id: SettingsGroup;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'semua',
      label: 'Semua Pengaturan',
      desc: 'Tampilkan seluruh kelompok',
      icon: Layers,
    },
    {
      id: 'shift',
      label: 'Jam Kerja & Shift',
      desc: 'Atur jam masuk & pulang tiap shift',
      icon: Clock,
    },
    {
      id: 'identitas',
      label: 'Identitas Perusahaan',
      desc: 'Nama unit & header laporan Excel',
      icon: Building2,
    },
    {
      id: 'warna-matriks',
      label: 'Warna Matriks',
      desc: 'Atur warna status & header matriks',
      icon: Palette,
    },
    {
      id: 'backup',
      label: 'Backup & Restore',
      desc: 'Cadangkan & pulihkan database',
      icon: HardDrive,
    },
    {
      id: 'reset',
      label: 'Reset Data Sistem',
      desc: 'Reset absensi, kecuali karyawan & all data',
      icon: RotateCcw,
    },
    {
      id: 'keamanan',
      label: 'Keamanan & PIN Admin',
      desc: 'Atur PIN masuk Mode Admin',
      icon: KeyRound,
    },
    {
      id: 'database',
      label: 'Database & Tabel',
      desc: 'Cek tabel, auto-init & script SQL (PIN)',
      icon: Database,
    },
  ];

  const showShift = activeGroup === 'semua' || activeGroup === 'shift';
  const showIdentitas = activeGroup === 'semua' || activeGroup === 'identitas';
  const showWarnaMatriks = activeGroup === 'semua' || activeGroup === 'warna-matriks';
  const showBackup = activeGroup === 'semua' || activeGroup === 'backup';
  const showReset = activeGroup === 'semua' || activeGroup === 'reset';
  const showKeamanan = activeGroup === 'semua' || activeGroup === 'keamanan';
  const showDatabase = activeGroup === 'semua' || activeGroup === 'database';

  return (
    <div className="space-y-6">
      {/* Executive 3D Settings Command Header */}
      <div className="surface-3d-dark rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-20 w-72 h-72 rounded-full bg-blue-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-indigo-500/15 blur-3xl"
        />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="icon-cube-3d w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-sky-300">Pusat Konfigurasi Sistem</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {shifts.length} Shift · {employees.length} Karyawan · {attendanceRecords.length} Log
                </span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
                Pengaturan Operasional, Matriks &amp; Keamanan
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 ${
                isAdminMode
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                  : 'bg-slate-800/90 border-slate-700/80 text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAdminMode ? 'Mode Admin Aktif' : 'Mode Standar'}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Grouped Navigation */}
        <aside className="lg:col-span-3 surface-3d rounded-2xl p-3 lg:sticky lg:top-22">
          <div className="px-2.5 py-2 border-b border-slate-100 mb-2">
            <div className="text-xs font-bold text-slate-900">
              Kelompok Pengaturan
            </div>
            <div className="text-[11px] text-slate-500">
              Pilih kategori konfigurasi sistem
            </div>
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5 lg:gap-1" aria-label="Kategori Pengaturan">
            {navGroups.map((g) => {
              const Icon = g.icon;
              const isActive = activeGroup === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroup(g.id)}
                  className={`w-full text-left px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl flex items-center lg:items-start gap-2 sm:gap-2.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-b from-blue-50 to-indigo-50/70 text-blue-900 border border-blue-200 shadow-xs'
                      : 'text-slate-700 hover:bg-slate-50 border border-slate-100 lg:border-transparent'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                      isActive
                        ? 'icon-cube-3d bg-gradient-to-br from-blue-500 to-indigo-700 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] sm:text-xs font-semibold truncate">{g.label}</div>
                    <div className="hidden lg:block text-[11px] text-slate-500 truncate">{g.desc}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Grouped Settings Cards */}
        <div className="lg:col-span-9 space-y-6">
          {/* KELOMPOK 1: JAM KERJA TIAP SHIFT */}
          {showShift && (
            <section className="surface-3d rounded-2xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-white shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      1. Pengaturan Jam Kerja Tiap Shift
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tetapkan jadwal masuk, jam pulang, dan toleransi keterlambatan untuk setiap shift kerja.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddShift}
                  className="btn-3d-secondary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Shift</span>
                </button>
              </div>

            <form onSubmit={handleSaveShifts} className="p-4 sm:p-6 space-y-4">
              {shiftNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    shiftNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {shiftNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{shiftNotice.text}</span>
                </div>
              )}

              {/* Mobile Shift Editor Cards (< md) */}
              <div className="md:hidden space-y-3">
                {shifts.map((shift) => {
                  const duration = calculateDurationHours(
                    shift.startTime,
                    shift.endTime
                  );
                  const usedCount = shiftUsageCount.get(shift.id) || 0;

                  return (
                    <div
                      key={shift.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={shift.name}
                          onChange={(e) =>
                            handleUpdateShiftField(shift.id, 'name', e.target.value)
                          }
                          maxLength={40}
                          aria-label="Nama shift"
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-semibold bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveShift(shift.id)}
                          disabled={shifts.length <= 1}
                          aria-label={`Hapus ${shift.name}`}
                          className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-30 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Jam Masuk
                          </label>
                          <input
                            type="time"
                            value={shift.startTime}
                            onChange={(e) =>
                              handleUpdateShiftField(
                                shift.id,
                                'startTime',
                                e.target.value
                              )
                            }
                            className="w-full px-2.5 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Jam Pulang
                          </label>
                          <input
                            type="time"
                            value={shift.endTime}
                            onChange={(e) =>
                              handleUpdateShiftField(
                                shift.id,
                                'endTime',
                                e.target.value
                              )
                            }
                            className="w-full px-2.5 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 text-xs">
                        <div className="font-mono text-slate-600 tabular-nums">
                          {duration} jam · {usedCount} staf
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Tol.</span>
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={shift.lateToleranceMinutes}
                            onChange={(e) =>
                              handleUpdateShiftField(
                                shift.id,
                                'lateToleranceMinutes',
                                Math.max(0, Math.min(120, Number(e.target.value) || 0))
                              )
                            }
                            className="w-16 px-2 py-1 text-xs font-mono text-right bg-white border border-slate-200 rounded-md"
                          />
                          <span className="text-[11px] text-slate-500">mnt</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-3">Nama Shift</th>
                      <th className="py-2.5 px-3">Jam Masuk</th>
                      <th className="py-2.5 px-3">Jam Pulang</th>
                      <th className="py-2.5 px-3 text-right">Durasi</th>
                      <th className="py-2.5 px-3 text-right">Toleransi (mnt)</th>
                      <th className="py-2.5 px-3 text-right">Karyawan</th>
                      <th className="py-2.5 px-3 text-right">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {shifts.map((shift) => {
                      const duration = calculateDurationHours(
                        shift.startTime,
                        shift.endTime
                      );
                      const usedCount = shiftUsageCount.get(shift.id) || 0;

                      return (
                        <tr key={shift.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={shift.name}
                              onChange={(e) =>
                                handleUpdateShiftField(shift.id, 'name', e.target.value)
                              }
                              maxLength={40}
                              className="w-full min-w-[130px] px-2.5 py-1.5 text-sm font-medium border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) =>
                                handleUpdateShiftField(
                                  shift.id,
                                  'startTime',
                                  e.target.value
                                )
                              }
                              className="px-2.5 py-1.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) =>
                                handleUpdateShiftField(
                                  shift.id,
                                  'endTime',
                                  e.target.value
                                )
                              }
                              className="px-2.5 py-1.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {duration} jam
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              max={120}
                              value={shift.lateToleranceMinutes}
                              onChange={(e) =>
                                handleUpdateShiftField(
                                  shift.id,
                                  'lateToleranceMinutes',
                                  Math.max(0, Math.min(120, Number(e.target.value) || 0))
                                )
                              }
                              className="w-20 px-2 py-1.5 text-sm font-mono text-right border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                            {usedCount} staf
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveShift(shift.id)}
                              disabled={shifts.length <= 1}
                              aria-label={`Hapus ${shift.name}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <label
                    htmlFor="late-deduction-rate"
                    className="block text-xs font-semibold text-slate-900"
                  >
                    Tarif Default Potongan Gaji Keterlambatan (Rp / Menit)
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Digunakan otomatis saat Admin memilih penyelesaian keterlambatan melalui Potongan Gaji (tetap dapat diubah manual per transaksi).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-slate-500">Rp</span>
                  <input
                    id="late-deduction-rate"
                    type="number"
                    min={0}
                    step={500}
                    value={lateDeductionPerMinute}
                    onChange={(e) =>
                      setLateDeductionPerMinute(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-32 px-3 py-1.5 text-sm font-mono text-right bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <span className="text-xs text-slate-500">/ menit</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <p className="text-xs text-slate-600">
                  Karyawan tidak memiliki shift default; seluruh penjadwalan mengikuti menu{' '}
                  <strong className="text-slate-800">Jadwal Shift</strong>.
                </p>

                <button
                  type="submit"
                  disabled={savingShifts}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingShifts ? 'Menyimpan...' : 'Simpan Pengaturan Shift'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* KELOMPOK 2: IDENTITAS PERUSAHAAN & FORMAT LAPORAN */}
        {showIdentitas && (
          <section className="surface-3d rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    2. Identitas Perusahaan &amp; Header Matriks Excel
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Teks ini ditampilkan pada kotak header kuning di halaman Matriks Daftar Hadir dan file ekspor Excel (.xlsx).
                  </p>
                </div>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('profil-perusahaan')}
                  className="btn-3d-secondary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Kelola Profil Lengkap</span>
                </button>
              )}
            </div>

            <form onSubmit={handleSaveIdentity} className="p-4 sm:p-6 space-y-4">
              {identityNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    identityNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {identityNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{identityNotice.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Nama Perusahaan / Unit
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      maxLength={60}
                      placeholder="KARYAPRESENSI"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Subjudul / Divisi HR
                    </label>
                    <input
                      type="text"
                      value={companySubtitle}
                      onChange={(e) => setCompanySubtitle(e.target.value)}
                      maxLength={60}
                      placeholder="HRIS PERUSAHAAN"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Live Mini Preview of Excel Brand Block */}
                <div className="md:col-span-4">
                  <div className="text-[11px] font-medium text-slate-500 mb-1">
                    Pratinjau Header Matriks:
                  </div>
                  <div className="bg-[#FFC000] border border-slate-400 px-3 py-3 text-center">
                    <div className="font-display font-bold text-xs text-slate-950 uppercase truncate">
                      {companyName || 'KARYAPRESENSI'}
                    </div>
                    <div className="text-[10px] font-bold text-slate-900 uppercase truncate mt-0.5">
                      {companySubtitle || 'HRIS PERUSAHAAN'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savingIdentity}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingIdentity ? 'Menyimpan...' : 'Simpan Identitas'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* KELOMPOK 3: PENGATURAN WARNA MATRIKS */}
        {showWarnaMatriks && (
          <section className="surface-3d rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center text-white shrink-0">
                  <Palette className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    3. Pengaturan Warna Matriks Daftar Hadir
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sesuaikan warna sel status kehadiran (H, I, S, A, L) serta warna header tabel Matriks, tampilan cetak, dan ekspor Excel.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetMatrixColors}
                className="btn-3d-secondary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Default</span>
              </button>
            </div>

            <form onSubmit={handleSaveMatrixColors} className="p-4 sm:p-6 space-y-5">
              {matrixColorsNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    matrixColorsNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {matrixColorsNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{matrixColorsNotice.text}</span>
                </div>
              )}

              {/* Quick Theme Presets */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tema Cepat</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {matrixColorPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setMatrixColors(normalizeMatrixColors(preset.colors));
                        setMatrixColorsNotice(null);
                      }}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-400 transition-colors text-left cursor-pointer"
                    >
                      <div className="text-[11px] font-semibold text-slate-800 truncate mb-1.5">
                        {preset.name}
                      </div>
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { code: 'H', pair: preset.colors.hadir },
                            { code: 'I', pair: preset.colors.izin },
                            { code: 'S', pair: preset.colors.sakit },
                            { code: 'A', pair: preset.colors.alpha },
                            { code: 'L', pair: preset.colors.libur },
                          ] as const
                        ).map((sw) => (
                          <span
                            key={sw.code}
                            style={{ backgroundColor: sw.pair.bg, color: sw.pair.text }}
                            className="w-5 h-5 rounded text-[10px] font-mono font-bold inline-flex items-center justify-center border border-slate-300/80"
                          >
                            {sw.code}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Cell Colors */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">
                  Warna Sel Status Kehadiran
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(
                    [
                      { key: 'hadir', label: 'Hadir Tepat', sample: 'H' },
                      { key: 'terlambat', label: 'Terlambat', sample: 'H' },
                      { key: 'izinTerlambat', label: 'Izin Telat', sample: 'H' },
                      { key: 'izin', label: 'Izin', sample: 'I' },
                      { key: 'sakit', label: 'Sakit', sample: 'S' },
                      { key: 'alpha', label: 'Alpha', sample: 'A' },
                      { key: 'libur', label: 'Libur Karyawan', sample: 'L' },
                    ] as { key: keyof MatrixColorSettings; label: string; sample: string }[]
                  ).map((item) => {
                    const pair = matrixColors[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {item.label}
                          </span>
                          <span
                            style={{ backgroundColor: pair.bg, color: pair.text }}
                            className="w-7 h-7 rounded border border-slate-400 font-mono font-bold text-xs inline-flex items-center justify-center shrink-0"
                          >
                            {item.sample}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-between gap-1.5 px-2 py-1.5 bg-white border border-slate-200 rounded-md cursor-pointer">
                            <span className="text-[11px] text-slate-600">Latar</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-500 uppercase">
                                {pair.bg}
                              </span>
                              <input
                                type="color"
                                value={pair.bg}
                                onChange={(e) =>
                                  handleUpdateMatrixColor(item.key, 'bg', e.target.value, true)
                                }
                                aria-label={`Warna latar ${item.label}`}
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                              />
                            </div>
                          </label>
                          <label className="flex items-center justify-between gap-1.5 px-2 py-1.5 bg-white border border-slate-200 rounded-md cursor-pointer">
                            <span className="text-[11px] text-slate-600">Teks</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-500 uppercase">
                                {pair.text}
                              </span>
                              <input
                                type="color"
                                value={pair.text}
                                onChange={(e) =>
                                  handleUpdateMatrixColor(item.key, 'text', e.target.value)
                                }
                                aria-label={`Warna teks ${item.label}`}
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Header Colors */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">
                  Warna Header &amp; Struktur Tabel Matriks
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { key: 'brandHeader', label: 'Kotak Brand Perusahaan', sample: 'PT' },
                      { key: 'groupHeader', label: 'Header Judul & Hari', sample: 'HDR' },
                      { key: 'tableHeader', label: 'Header Kolom & Ringkasan', sample: 'ID' },
                    ] as { key: keyof MatrixColorSettings; label: string; sample: string }[]
                  ).map((item) => {
                    const pair = matrixColors[item.key];
                    return (
                      <div
                        key={item.key}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {item.label}
                          </span>
                          <span
                            style={{ backgroundColor: pair.bg, color: pair.text }}
                            className="px-2 h-6 rounded border border-slate-400 font-mono font-bold text-[10px] inline-flex items-center justify-center shrink-0"
                          >
                            {item.sample}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-md cursor-pointer">
                            <span className="text-[11px] text-slate-600">Latar</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono text-slate-500 uppercase">
                                {pair.bg}
                              </span>
                              <input
                                type="color"
                                value={pair.bg}
                                onChange={(e) =>
                                  handleUpdateMatrixColor(item.key, 'bg', e.target.value, true)
                                }
                                aria-label={`Warna latar ${item.label}`}
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                              />
                            </div>
                          </label>
                          <label className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-md cursor-pointer">
                            <span className="text-[11px] text-slate-600">Teks</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono text-slate-500 uppercase">
                                {pair.text}
                              </span>
                              <input
                                type="color"
                                value={pair.text}
                                onChange={(e) =>
                                  handleUpdateMatrixColor(item.key, 'text', e.target.value)
                                }
                                aria-label={`Warna teks ${item.label}`}
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Mini Matrix Preview */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-600">
                  Pratinjau Langsung Matriks:
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[520px] flex gap-2 items-stretch">
                    <div className="w-36 shrink-0 border border-slate-400 bg-white uppercase text-[10px]">
                      <div
                        style={{
                          backgroundColor: matrixColors.brandHeader.bg,
                          color: matrixColors.brandHeader.text,
                        }}
                        className="border-b border-slate-400 px-2 py-2 text-center font-bold truncate"
                      >
                        {companyName || 'KARYAPRESENSI'}
                      </div>
                      <div
                        style={{
                          backgroundColor: matrixColors.groupHeader.bg,
                          color: matrixColors.groupHeader.text,
                        }}
                        className="border-b border-slate-400 px-2 py-1 text-center font-bold"
                      >
                        KETERANGAN
                      </div>
                      <div className="p-1.5 space-y-1 text-[9px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: matrixColors.hadir.bg, color: matrixColors.hadir.text }}
                            className="w-4 h-4 inline-flex items-center justify-center font-mono font-bold"
                          >
                            H
                          </span>
                          <span>HADIR</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: matrixColors.libur.bg, color: matrixColors.libur.text }}
                            className="w-4 h-4 inline-flex items-center justify-center font-mono font-bold border border-slate-400"
                          >
                            L
                          </span>
                          <span>LIBUR</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1">
                      <div
                        style={{
                          backgroundColor: matrixColors.groupHeader.bg,
                          color: matrixColors.groupHeader.text,
                        }}
                        className="border border-b-0 border-slate-400 py-1 px-2 text-center text-[10px] font-bold uppercase"
                      >
                        DAFTAR HADIR KARYAWAN
                      </div>
                      <table className="w-full border-collapse text-[10px] font-mono uppercase">
                        <thead>
                          <tr
                            style={{
                              backgroundColor: matrixColors.tableHeader.bg,
                              color: matrixColors.tableHeader.text,
                            }}
                          >
                            <th className="border border-slate-400 px-2 py-1 text-left font-sans">NAMA</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">01</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">02</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">03</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">04</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">05</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">06</th>
                            <th className="border border-slate-400 px-1 py-1 text-center">07</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-slate-400 bg-white px-2 py-1 font-sans font-semibold text-slate-900">
                              BUDI SANTOSO
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.hadir.bg, color: matrixColors.hadir.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              H
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.terlambat.bg, color: matrixColors.terlambat.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              H
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.izinTerlambat.bg, color: matrixColors.izinTerlambat.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              H
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.izin.bg, color: matrixColors.izin.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              I
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.sakit.bg, color: matrixColors.sakit.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              S
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.alpha.bg, color: matrixColors.alpha.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              A
                            </td>
                            <td
                              style={{ backgroundColor: matrixColors.libur.bg, color: matrixColors.libur.text }}
                              className="border border-slate-400 text-center font-bold py-1"
                            >
                              L
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Tip: Saat mengubah warna latar, warna teks otomatis menyesuaikan agar tetap jelas terbaca.
                </span>
                <button
                  type="submit"
                  disabled={savingMatrixColors}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingMatrixColors ? 'Menyimpan...' : 'Simpan Warna Matriks'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* KELOMPOK 4: BACKUP & RESTORE DATA */}
        {showBackup && (
          <section className="surface-3d rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-start gap-3">
              <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  3. Backup &amp; Restore Data
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cadangkan seluruh basis data absensi dalam format JSON atau pulihkan kembali dari file cadangan sebelumnya.
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              {backupNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    backupNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {backupNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{backupNotice.text}</span>
                </div>
              )}

              {/* Current DB Summary Strip */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 truncate">Karyawan</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {employees.length}
                  </div>
                </div>
                <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 truncate">Absensi</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {attendanceRecords.length}
                  </div>
                </div>
                <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[11px] text-slate-500 truncate">Shift Aktif</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                    {settings.shifts.length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left: Backup */}
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Backup Data (.json)
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Mengunduh salinan lengkap data karyawan, jadwal libur individu, riwayat catatan absensi, dan pengaturan jam kerja tiap shift ke perangkat Anda.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    disabled={backingUp}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{backingUp ? 'Menyiapkan File...' : 'Unduh Backup Data (.json)'}</span>
                  </button>
                </div>

                {/* Right: Restore */}
                <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Restore Data dari Backup
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Pilih file cadangan <code className="font-mono text-[11px]">.json</code> untuk memulihkan database. Sistem akan menampilkan pratinjau isi file sebelum menimpa data saat ini.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleSelectBackupFile}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer"
                    />

                    {backupPreview && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5 text-xs">
                        <div className="font-semibold text-amber-950">
                          Pratinjau File: {backupPreview.fileName}
                        </div>
                        <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-amber-900 tabular-nums">
                          <div>Karyawan: {backupPreview.employeeCount}</div>
                          <div>Absensi: {backupPreview.attendanceCount}</div>
                          <div>Shift: {backupPreview.shiftCount}</div>
                        </div>
                        <div className="text-[11px] text-amber-800">
                          Memulihkan backup akan menggantikan seluruh data aktif saat ini.
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={restoring}
                            onClick={handleExecuteRestore}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 rounded-md hover:bg-amber-800 disabled:opacity-50 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {restoring ? 'Memulihkan...' : 'Pulihkan Data Sekarang'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBackupPreview(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Batal</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* KELOMPOK 3B / RESET DATA SISTEM */}
        {showReset && (
          <section className="surface-3d rounded-2xl border-red-200/80 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 bg-red-50/60 border-b border-red-200/80 flex items-start gap-3">
              <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center text-white shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  4. Reset Data Aplikasi
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Pilih tingkat pembersihan data sesuai kebutuhan. Setiap proses reset membutuhkan konfirmasi teks dan verifikasi PIN Mode Admin.
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {resetNotice && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
                    resetNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {resetNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{resetNotice.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Reset Data Absensi */}
                <div className="p-4 border border-amber-200 bg-amber-50/30 rounded-xl flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-200 rounded">
                      <RotateCcw className="w-3 h-3" />
                      <span>Khusus Absensi</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Reset Data Absensi
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Menghapus seluruh log kehadiran harian ({attendanceRecords.length} record) dan catatan penyelesaian terlambat ({lateSettlements.length}). Daftar karyawan, jadwal shift/libur, gaji, dan keuangan tetap aman.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openResetModal('attendance')}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Data Absensi</span>
                  </button>
                </div>

                {/* 2. Reset Semua Data Kecuali Nama Karyawan */}
                <div className="p-4 border border-orange-200 bg-orange-50/30 rounded-xl flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-800 bg-orange-100 border border-orange-200 rounded">
                      <Users className="w-3 h-3" />
                      <span>Simpan Nama Staf</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Reset Semua Data Kecuali Nama Karyawan
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Menghapus seluruh absensi, jadwal libur &amp; jadwal shift harian, seluruh data rekap gaji, serta seluruh transaksi keuangan — <strong className="text-slate-900">{employees.length} nama karyawan tetap dipertahankan</strong>.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openResetModal('except_employees')}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Reset Kecuali Nama Karyawan</span>
                  </button>
                </div>

                {/* 3. Reset All Data */}
                <div className="p-4 border border-red-200 bg-red-50/40 rounded-xl flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800 bg-red-100 border border-red-200 rounded">
                      <Trash2 className="w-3 h-3" />
                      <span>Reset Total</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Reset All Data
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Menghapus seluruh data karyawan, absensi, jadwal, gaji, transaksi keuangan, dan mengembalikan pengaturan ke kondisi awal kosong (0 karyawan, 0 absensi, saldo Rp 0).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openResetModal('all')}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset All Data</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* KELOMPOK 4: KEAMANAN & PIN MODE ADMIN */}
        {showKeamanan && (
          <section className="surface-3d rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-950 text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    5. Keamanan &amp; PIN Mode Admin
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    PIN Mode Admin digunakan untuk membuka Mode Admin agar menu Keuangan Perusahaan, Rekap Gaji, dan Pengaturan dapat diakses. Pada Mode Biasa, menu tersebut disembunyikan.
                  </p>
                </div>
              </div>

              {!isAdminMode && onOpenAdminModeModal && (
                <button
                  type="button"
                  onClick={onOpenAdminModeModal}
                  className="btn-3d-primary inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Masuk Mode Admin</span>
                </button>
              )}
            </div>

            <form onSubmit={handleChangeAdminPin} className="p-4 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-3">
                <span>
                  Status sesi saat ini:{' '}
                  <strong className={isAdminMode ? 'text-emerald-700' : 'text-slate-900'}>
                    {isAdminMode ? 'Mode Admin Aktif' : 'Mode Biasa'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPinFields((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {showPinFields ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Sembunyikan PIN</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Tampilkan PIN</span>
                    </>
                  )}
                </button>
              </div>

              {adminPinNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    adminPinNotice.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {adminPinNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{adminPinNotice.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    PIN Mode Admin Saat Ini
                  </label>
                  <input
                    type={showPinFields ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={currentAdminPin}
                    onChange={(e) => setCurrentAdminPin(e.target.value)}
                    placeholder="Masukkan PIN saat ini"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    PIN Mode Admin Baru
                  </label>
                  <input
                    type={showPinFields ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={newAdminPin}
                    onChange={(e) => setNewAdminPin(e.target.value)}
                    placeholder="Minimal 4 digit/karakter"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Konfirmasi PIN Baru
                  </label>
                  <input
                    type={showPinFields ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={confirmAdminPin}
                    onChange={(e) => setConfirmAdminPin(e.target.value)}
                    placeholder="Ulangi PIN baru"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savingAdminPin}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingAdminPin ? 'Menyimpan...' : 'Simpan PIN Mode Admin'}</span>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* KELOMPOK 5: PENGATURAN DATABASE & TABEL (DILINDUNGI PIN) */}
        {showDatabase && (
          <DatabaseSettingsPanel
            employees={employees}
            attendanceRecords={attendanceRecords}
            lateSettlements={lateSettlements}
            settings={settings}
            adminToken={adminToken}
            databaseToken={databaseToken}
            onDatabaseTokenChange={setDatabaseToken}
            onRefresh={onRefresh}
          />
        )}
        </div>
      </div>

      {/* Modal Konfirmasi Reset Data */}
      {resetModalMode && (() => {
        const meta = resetOptionMeta[resetModalMode];
        const headerBg =
          meta.accent === 'red'
            ? 'bg-red-950'
            : meta.accent === 'orange'
            ? 'bg-orange-950'
            : 'bg-slate-950';
        const submitBg =
          meta.accent === 'red'
            ? 'bg-red-600 hover:bg-red-700'
            : meta.accent === 'orange'
            ? 'bg-orange-600 hover:bg-orange-700'
            : 'bg-amber-600 hover:bg-amber-700';

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col pb-safe">
              <div className={`sm:hidden pt-2.5 pb-1 flex justify-center ${headerBg}`}>
                <div className="w-10 h-1 bg-white/30 rounded-full" />
              </div>
              <div className={`${headerBg} px-5 py-4 text-white flex items-center justify-between gap-3 shrink-0`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4 text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-white truncate">
                      Konfirmasi {meta.title}
                    </h3>
                    <p className="text-[11px] text-white/75 truncate">
                      Tindakan ini tidak dapat dibatalkan setelah dijalankan
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={resettingData}
                  aria-label="Tutup konfirmasi reset"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-white/75 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleConfirmResetData}
                className="p-5 space-y-4 overflow-y-auto"
              >
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-1.5">
                  <div className="text-xs font-bold text-red-900">
                    Data yang akan dihapus / direset:
                  </div>
                  <ul className="text-xs text-red-800 space-y-1 list-disc pl-4">
                    {meta.deletedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                  <div className="text-xs font-bold text-emerald-900">
                    Data yang tetap dipertahankan:
                  </div>
                  <ul className="text-xs text-emerald-800 space-y-1 list-disc pl-4">
                    {meta.preservedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-600">
                    Disarankan unduh cadangan terlebih dahulu sebelum mereset data.
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    disabled={backingUp}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{backingUp ? 'Mengunduh...' : 'Backup JSON'}</span>
                  </button>
                </div>

                {resetModalError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{resetModalError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="reset-confirm-phrase"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Ketik <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-red-700">{meta.confirmPhrase}</code> untuk konfirmasi
                  </label>
                  <input
                    id="reset-confirm-phrase"
                    type="text"
                    autoComplete="off"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder={meta.confirmPhrase}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reset-admin-pin"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Verifikasi PIN Mode Admin
                  </label>
                  <div className="relative">
                    <input
                      id="reset-admin-pin"
                      type={showResetPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="off"
                      value={resetPinInput}
                      onChange={(e) => setResetPinInput(e.target.value)}
                      placeholder="Masukkan PIN Mode Admin"
                      className="w-full min-h-[44px] pl-3.5 pr-11 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPin((prev) => !prev)}
                      aria-label={showResetPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showResetPin ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    disabled={resettingData}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl sm:rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={resettingData}
                    className={`w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 py-2 text-xs font-semibold text-white rounded-xl sm:rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer ${submitBg}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {resettingData ? 'Mereset Data...' : `Jalankan ${meta.buttonLabel}`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
