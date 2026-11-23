import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LockKeyhole,
  Plus,
  Printer,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  Employee,
  EmployeeSalaryProfile,
  formatIndonesianMonth,
  getCurrentYearMonth,
  getTodayDateStr,
  LateSettlement,
  PayrollAdjustmentType,
  PayrollDatabaseState,
  PayrollPaymentMethod,
  PayrollRecordStatus,
  PayrollSettings,
  SalaryRaiseMethod,
} from '../types';
import {
  createPayrollAdjustment,
  createSalaryRaise,
  deletePayrollAdjustment,
  deleteSalaryRaise,
  downloadPayrollBackupJson,
  fetchPayrollState,
  lockPayrollSession,
  PayrollUnauthorizedError,
  restorePayrollBackup,
  saveEmployeeSalaryProfile,
  unlockPayrollWithPin,
  updatePayrollMonthlyStatus,
  updatePayrollSettings,
} from '../services/payrollService';
import {
  calculateEmployeePayroll,
  EmployeePayrollCalculation,
  formatRupiah,
} from '../utils/payrollCalculator';
import { exportPayrollToExcel } from '../utils/excelPayrollExport';
import {
  SearchableEmployeeOption,
  SearchableEmployeeSelect,
} from './SearchableEmployeeSelect';

interface PayrollRecapViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements: LateSettlement[];
  settings: AppSettings;
}

const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  defaultOvertimeHourlyRate: 25000,
  defaultAlphaDeductionPerDay: 150000,
  defaultIzinDeductionPerDay: 0,
  autoDeductRemainingLate: true,
  bpjsKesehatanPct: 1,
  bpjsKetenagakerjaanPct: 2,
  paydayDayOfMonth: 25,
};

const ADJUSTMENT_PRESETS: Record<PayrollAdjustmentType, string[]> = {
  bonus: ['Bonus Target', 'Uang Kerajinan', 'Komisi Penjualan', 'THR / Bonus Tahunan'],
  tunjangan: ['Tunjangan Operasional', 'Uang Makan Tambahan', 'Tunjangan Kesehatan', 'Reimburse Tugas'],
  potongan: ['Cicilan Kasbon', 'Pinjaman Karyawan', 'Potongan Seragam / Inventaris'],
};

export const PayrollRecapView: React.FC<PayrollRecapViewProps> = ({
  employees,
  attendanceRecords,
  lateSettlements,
  settings,
}) => {
  // Security Gate State (token lives strictly in React memory; cleared on lock/unmount)
  const [payrollToken, setPayrollToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Payroll Data State
  const [payrollData, setPayrollData] = useState<PayrollDatabaseState | null>(null);
  const [loadingPayroll, setLoadingPayroll] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [empFilter, setEmpFilter] = useState<string>('all');
  const [paydayFilter, setPaydayFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PayrollRecordStatus>('all');
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [lowerTab, setLowerTab] = useState<'penyesuaian' | 'kenaikan'>('penyesuaian');

  // Edit Salary Profile Modal
  const [editingProfileEmp, setEditingProfileEmp] = useState<Employee | null>(null);
  const [profileForm, setProfileForm] = useState<{
    baseSalary: number;
    positionAllowance: number;
    transportMealAllowance: number;
    otherAllowance: number;
    overtimeHourlyRate: number;
    paydayDay: number;
    paymentMethod: PayrollPaymentMethod;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolder: string;
    notes: string;
  }>({
    baseSalary: 0,
    positionAllowance: 0,
    transportMealAllowance: 0,
    otherAllowance: 0,
    overtimeHourlyRate: 25000,
    paydayDay: 25,
    paymentMethod: 'transfer',
    bankName: 'BCA',
    bankAccountNumber: '',
    bankAccountHolder: '',
    notes: '',
  });
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Bonus / Tunjangan / Potongan Modal
  const [adjModalOpen, setAdjModalOpen] = useState<boolean>(false);
  const [adjEmpId, setAdjEmpId] = useState<string>('');
  const [adjType, setAdjType] = useState<PayrollAdjustmentType>('bonus');
  const [adjTitle, setAdjTitle] = useState<string>('');
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjDate, setAdjDate] = useState<string>(getTodayDateStr());
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [savingAdj, setSavingAdj] = useState<boolean>(false);
  const [deletingAdjId, setDeletingAdjId] = useState<string | null>(null);

  // Kenaikan Gaji Modal
  const [raiseModalOpen, setRaiseModalOpen] = useState<boolean>(false);
  const [raiseEmpId, setRaiseEmpId] = useState<string>('');
  const [raiseMethod, setRaiseMethod] = useState<SalaryRaiseMethod>('persentase');
  const [raisePercent, setRaisePercent] = useState<number>(10);
  const [raiseNominalAdd, setRaiseNominalAdd] = useState<number>(500000);
  const [raiseNewBase, setRaiseNewBase] = useState<number>(0);
  const [raiseNewPos, setRaiseNewPos] = useState<number>(0);
  const [raiseNewTrans, setRaiseNewTrans] = useState<number>(0);
  const [raiseNewOther, setRaiseNewOther] = useState<number>(0);
  const [raiseEffectiveMonth, setRaiseEffectiveMonth] = useState<string>(getCurrentYearMonth());
  const [raiseDate, setRaiseDate] = useState<string>(getTodayDateStr());
  const [raiseReason, setRaiseReason] = useState<string>('Evaluasi Kinerja & Penyesuaian Gaji');
  const [raiseNotes, setRaiseNotes] = useState<string>('');
  const [raiseApplyToProfile, setRaiseApplyToProfile] = useState<boolean>(true);
  const [savingRaise, setSavingRaise] = useState<boolean>(false);
  const [deletingRaiseId, setDeletingRaiseId] = useState<string | null>(null);

  // Settings & Backup & Payslip Modals
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [payrollSettingsForm, setPayrollSettingsForm] = useState<PayrollSettings>(
    DEFAULT_PAYROLL_SETTINGS
  );
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  const [backupModalOpen, setBackupModalOpen] = useState<boolean>(false);
  const [restoringBackup, setRestoringBackup] = useState<boolean>(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const [payslipRow, setPayslipRow] = useState<EmployeePayrollCalculation | null>(null);
  const [updatingStatusKey, setUpdatingStatusKey] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = payrollToken;

  useEffect(() => {
    return () => {
      if (tokenRef.current) {
        lockPayrollSession(tokenRef.current);
      }
    };
  }, []);

  const handleForceLock = useCallback(async (reason?: string) => {
    const activeToken = tokenRef.current;
    setPayrollToken(null);
    setPayrollData(null);
    setPinInput('');
    setPayslipRow(null);
    setEditingProfileEmp(null);
    setAdjModalOpen(false);
    setRaiseModalOpen(false);
    setSettingsModalOpen(false);
    setBackupModalOpen(false);
    if (reason) {
      setUnlockError(reason);
    }
    if (activeToken) {
      await lockPayrollSession(activeToken);
    }
  }, []);

  const loadPayrollData = useCallback(
    async (token: string) => {
      setLoadingPayroll(true);
      setErrorMessage(null);
      try {
        const data = await fetchPayrollState(token);
        setPayrollData({
          ...data,
          salaryRaises: Array.isArray(data.salaryRaises) ? data.salaryRaises : [],
        });
        setPayrollSettingsForm(data.settings);
      } catch (err) {
        if (err instanceof PayrollUnauthorizedError) {
          await handleForceLock(err.message);
        } else {
          setErrorMessage(
            err instanceof Error ? err.message : 'Gagal memuat data rekap gaji.'
          );
        }
      } finally {
        setLoadingPayroll(false);
      }
    },
    [handleForceLock]
  );

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      setUnlockError('Masukkan PIN terlebih dahulu.');
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    try {
      const result = await unlockPayrollWithPin(pinInput.trim());
      setPayrollToken(result.token);
      setPinInput('');
      setShowPin(false);
      await loadPayrollData(result.token);
    } catch (err) {
      setUnlockError(
        err instanceof Error
          ? err.message
          : 'PIN tidak valid. Gunakan PIN standar Admin atau PIN Superuser.'
      );
      setPinInput('');
    } finally {
      setUnlocking(false);
    }
  };

  // Calculations
  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.active)
        .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
    [employees]
  );

  const departments = useMemo(() => {
    const set = new Set(activeEmployees.map((e) => e.department));
    return ['all', ...Array.from(set).sort()];
  }, [activeEmployees]);

  const employeeOptions: SearchableEmployeeOption[] = useMemo(
    () =>
      activeEmployees.map((emp) => ({
        id: emp.id,
        code: emp.employeeCode,
        name: emp.name,
        department: emp.department,
        subtitle: `${emp.department} • ${emp.position}`,
      })),
    [activeEmployees]
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, EmployeeSalaryProfile>();
    if (payrollData) {
      for (const p of payrollData.profiles) {
        map.set(p.employeeId, p);
      }
    }
    return map;
  }, [payrollData]);

  const allMonthlyRows: EmployeePayrollCalculation[] = useMemo(() => {
    if (!payrollData) return [];
    const pSettings = payrollData.settings || DEFAULT_PAYROLL_SETTINGS;
    const lateRate = settings.lateDeductionPerMinute ?? 1000;

    return activeEmployees.map((emp) => {
      const mStatus = payrollData.statuses.find(
        (s) => s.employeeId === emp.id && s.yearMonth === selectedMonth
      );
      return calculateEmployeePayroll({
        employee: emp,
        attendanceRecords,
        lateSettlements,
        shifts: settings.shifts,
        lateDeductionPerMinute: lateRate,
        payrollSettings: pSettings,
        salaryProfile: profileMap.get(emp.id),
        adjustments: payrollData.adjustments,
        salaryRaises: payrollData.salaryRaises,
        monthlyStatus: mStatus,
        yearMonth: selectedMonth,
      });
    });
  }, [
    payrollData,
    activeEmployees,
    attendanceRecords,
    lateSettlements,
    settings,
    profileMap,
    selectedMonth,
  ]);

  const distinctPaydays = useMemo(() => {
    const set = new Set<number>();
    for (const r of allMonthlyRows) {
      set.add(r.paydayDay);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [allMonthlyRows]);

  const filteredRows = useMemo(() => {
    return allMonthlyRows.filter((row) => {
      if (deptFilter !== 'all' && row.employee.department !== deptFilter) return false;
      if (empFilter !== 'all' && row.employee.id !== empFilter) return false;
      if (paydayFilter !== 'all' && String(row.paydayDay) !== paydayFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [allMonthlyRows, deptFilter, empFilter, paydayFilter, statusFilter]);

  const kpiTotals = useMemo(() => {
    const gross = filteredRows.reduce((a, r) => a + r.grossSalary, 0);
    const overtimePay = filteredRows.reduce((a, r) => a + r.overtimePay, 0);
    const totalExtras = filteredRows.reduce(
      (a, r) => a + r.totalBonus + r.totalExtraAllowance,
      0
    );
    const deductions = filteredRows.reduce((a, r) => a + r.totalDeductions, 0);
    const net = filteredRows.reduce((a, r) => a + r.netSalary, 0);
    const paidCount = filteredRows.filter((r) => r.status === 'dibayar').length;
    const approvedCount = filteredRows.filter((r) => r.status === 'disetujui').length;
    return {
      gross,
      overtimePay,
      totalExtras,
      deductions,
      net,
      paidCount,
      approvedCount,
      count: filteredRows.length,
    };
  }, [filteredRows]);

  const monthAdjustments = useMemo(() => {
    if (!payrollData) return [];
    const scopedIds = new Set(filteredRows.map((r) => r.employee.id));
    return payrollData.adjustments
      .filter((a) => a.yearMonth === selectedMonth && scopedIds.has(a.employeeId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [payrollData, filteredRows, selectedMonth]);

  const scopedRaises = useMemo(() => {
    if (!payrollData) return [];
    const scopedIds = new Set(filteredRows.map((r) => r.employee.id));
    return (payrollData.salaryRaises || [])
      .filter((sr) => scopedIds.has(sr.employeeId))
      .sort((a, b) => (b.raiseDate || '').localeCompare(a.raiseDate || ''));
  }, [payrollData, filteredRows]);

  // Handlers: Salary Profile
  const openEditProfile = (row: EmployeePayrollCalculation) => {
    setEditingProfileEmp(row.employee);
    setProfileForm({
      baseSalary: row.profile.baseSalary,
      positionAllowance: row.profile.positionAllowance,
      transportMealAllowance: row.profile.transportMealAllowance,
      otherAllowance: row.profile.otherAllowance ?? 0,
      overtimeHourlyRate:
        row.profile.overtimeHourlyRate ??
        payrollData?.settings.defaultOvertimeHourlyRate ??
        25000,
      paydayDay: row.paydayDay,
      paymentMethod: row.profile.paymentMethod || 'transfer',
      bankName: row.profile.bankName || 'BCA',
      bankAccountNumber: row.profile.bankAccountNumber || '',
      bankAccountHolder: row.profile.bankAccountHolder || row.employee.name,
      notes: row.profile.notes || '',
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollToken || !editingProfileEmp) return;
    setSavingProfile(true);
    setErrorMessage(null);
    try {
      await saveEmployeeSalaryProfile(payrollToken, editingProfileEmp.id, profileForm);
      await loadPayrollData(payrollToken);
      setBannerMessage(
        `Komponen gaji & tanggal gajian (Tgl ${profileForm.paydayDay}) untuk ${editingProfileEmp.name} berhasil disimpan.`
      );
      setEditingProfileEmp(null);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan profil gaji.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // Handlers: Bonus / Tunjangan / Potongan
  const openAdjustmentModal = (
    preselectEmpId?: string,
    defaultType: PayrollAdjustmentType = 'bonus'
  ) => {
    setAdjEmpId(
      preselectEmpId ||
        (empFilter !== 'all' ? empFilter : activeEmployees[0]?.id || '')
    );
    setAdjType(defaultType);
    setAdjTitle('');
    setAdjAmount(0);
    setAdjDate(getTodayDateStr());
    setAdjNotes('');
    setAdjModalOpen(true);
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollToken) return;
    if (!adjEmpId || !adjTitle.trim() || adjAmount <= 0) {
      setErrorMessage('Lengkapi nama karyawan, keterangan, dan nominal lebih dari Rp 0.');
      return;
    }
    setSavingAdj(true);
    setErrorMessage(null);
    try {
      await createPayrollAdjustment(payrollToken, {
        employeeId: adjEmpId,
        yearMonth: selectedMonth,
        type: adjType,
        title: adjTitle.trim(),
        amount: adjAmount,
        date: adjDate,
        notes: adjNotes.trim(),
      });
      await loadPayrollData(payrollToken);
      const label =
        adjType === 'bonus'
          ? 'Bonus / insentif'
          : adjType === 'tunjangan'
          ? 'Tunjangan / tambahan'
          : 'Potongan / kasbon';
      setBannerMessage(`${label} berhasil ditambahkan.`);
      setAdjModalOpen(false);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Gagal menyimpan penyesuaian gaji.'
        );
      }
    } finally {
      setSavingAdj(false);
    }
  };

  const handleDeleteAdjustment = async (id: string) => {
    if (!payrollToken) return;
    setDeletingAdjId(id);
    try {
      await deletePayrollAdjustment(payrollToken, id);
      await loadPayrollData(payrollToken);
      setBannerMessage('Item penyesuaian gaji dihapus.');
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus item.');
      }
    } finally {
      setDeletingAdjId(null);
    }
  };

  // Handlers: Kenaikan Gaji
  const syncRaiseTargetEmployee = useCallback(
    (empId: string, method: SalaryRaiseMethod, pct: number, nom: number) => {
      const prof = profileMap.get(empId);
      const curBase = prof?.baseSalary ?? 0;
      const curPos = prof?.positionAllowance ?? 0;
      const curTrans = prof?.transportMealAllowance ?? 0;
      const curOther = prof?.otherAllowance ?? 0;

      const computedBase =
        method === 'persentase'
          ? Math.round(curBase * (1 + pct / 100))
          : Math.round(curBase + nom);

      setRaiseNewBase(computedBase);
      setRaiseNewPos(curPos);
      setRaiseNewTrans(curTrans);
      setRaiseNewOther(curOther);
    },
    [profileMap]
  );

  const openRaiseModal = (preselectEmpId?: string) => {
    const targetId =
      preselectEmpId ||
      (empFilter !== 'all' ? empFilter : activeEmployees[0]?.id || '');
    setRaiseEmpId(targetId);
    setRaiseMethod('persentase');
    setRaisePercent(10);
    setRaiseNominalAdd(500000);
    setRaiseEffectiveMonth(selectedMonth);
    setRaiseDate(getTodayDateStr());
    setRaiseReason('Evaluasi Kinerja & Penyesuaian Gaji');
    setRaiseNotes('');
    setRaiseApplyToProfile(true);
    syncRaiseTargetEmployee(targetId, 'persentase', 10, 500000);
    setRaiseModalOpen(true);
  };

  const handleChangeRaiseEmployee = (empId: string) => {
    setRaiseEmpId(empId);
    syncRaiseTargetEmployee(empId, raiseMethod, raisePercent, raiseNominalAdd);
  };

  const handleChangeRaiseMethod = (nextMethod: SalaryRaiseMethod) => {
    setRaiseMethod(nextMethod);
    syncRaiseTargetEmployee(raiseEmpId, nextMethod, raisePercent, raiseNominalAdd);
  };

  const handleApplyRaisePercent = (pct: number) => {
    setRaiseMethod('persentase');
    setRaisePercent(pct);
    const curBase = profileMap.get(raiseEmpId)?.baseSalary ?? 0;
    setRaiseNewBase(Math.round(curBase * (1 + pct / 100)));
  };

  const handleApplyRaiseNominal = (addAmt: number) => {
    setRaiseMethod('nominal');
    setRaiseNominalAdd(addAmt);
    const curBase = profileMap.get(raiseEmpId)?.baseSalary ?? 0;
    setRaiseNewBase(Math.round(curBase + addAmt));
  };

  const handleSubmitRaise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollToken || !raiseEmpId) return;
    if (!raiseReason.trim()) {
      setErrorMessage('Alasan / keterangan kenaikan gaji wajib diisi.');
      return;
    }
    setSavingRaise(true);
    setErrorMessage(null);
    try {
      await createSalaryRaise(payrollToken, {
        employeeId: raiseEmpId,
        effectiveMonth: raiseEffectiveMonth,
        raiseDate,
        method: raiseMethod,
        percentIncrease: raiseMethod === 'persentase' ? raisePercent : undefined,
        newBaseSalary: raiseNewBase,
        newPositionAllowance: raiseNewPos,
        newTransportMealAllowance: raiseNewTrans,
        newOtherAllowance: raiseNewOther,
        reason: raiseReason.trim(),
        notes: raiseNotes.trim(),
        applyToProfile: raiseApplyToProfile,
      });
      await loadPayrollData(payrollToken);
      const empName =
        activeEmployees.find((em) => em.id === raiseEmpId)?.name || 'Karyawan';
      setBannerMessage(
        raiseApplyToProfile
          ? `Kenaikan gaji ${empName} dicatat dan langsung diterapkan ke profil gaji aktif.`
          : `Riwayat rencana kenaikan gaji ${empName} berhasil dicatat.`
      );
      setLowerTab('kenaikan');
      setRaiseModalOpen(false);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Gagal menyimpan kenaikan gaji.'
        );
      }
    } finally {
      setSavingRaise(false);
    }
  };

  const handleDeleteRaise = async (id: string) => {
    if (!payrollToken) return;
    setDeletingRaiseId(id);
    try {
      await deleteSalaryRaise(payrollToken, id);
      await loadPayrollData(payrollToken);
      setBannerMessage('Riwayat kenaikan gaji dihapus.');
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus riwayat.');
      }
    } finally {
      setDeletingRaiseId(null);
    }
  };

  const handleChangePaymentStatus = async (
    employeeId: string,
    nextStatus: PayrollRecordStatus
  ) => {
    if (!payrollToken) return;
    setUpdatingStatusKey(employeeId);
    try {
      await updatePayrollMonthlyStatus(payrollToken, {
        employeeId,
        yearMonth: selectedMonth,
        status: nextStatus,
      });
      await loadPayrollData(payrollToken);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memperbarui status gaji.');
      }
    } finally {
      setUpdatingStatusKey(null);
    }
  };

  const handleSavePayrollSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payrollToken) return;
    setSavingSettings(true);
    try {
      await updatePayrollSettings(payrollToken, payrollSettingsForm);
      await loadPayrollData(payrollToken);
      setBannerMessage('Aturan & tarif perhitungan payroll berhasil disimpan.');
      setSettingsModalOpen(false);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportExcel = async () => {
    if (!payrollData) return;
    setExportingExcel(true);
    try {
      await exportPayrollToExcel({
        rows: filteredRows,
        adjustments: payrollData.adjustments,
        salaryRaises: payrollData.salaryRaises || [],
        yearMonth: selectedMonth,
        departmentFilter: deptFilter,
        companyName: settings.companyName,
        companyProfile: settings.companyProfile,
      });
      setBannerMessage(
        `File Excel Rekap Gaji (${formatIndonesianMonth(selectedMonth)}) berhasil diunduh.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengekspor Excel rekap gaji.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Kode',
      'Nama Karyawan',
      'Divisi',
      'Jabatan',
      'Tgl Gajian',
      'Hadir',
      'Efektif',
      'Lembur (Jam)',
      'Gaji Pokok',
      'Tunjangan Jabatan',
      'Tunjangan Transp/Makan',
      'Tunjangan Lain Tetap',
      'Uang Lembur',
      'Bonus & Tambahan',
      'Total Bruto',
      'Potongan Telat',
      'Potongan Alpha/Izin',
      'Potongan BPJS',
      'Potongan Lainnya',
      'Gaji Bersih (THP)',
      'Status Bayar',
    ];
    const lines = filteredRows.map((r) => [
      r.employee.employeeCode,
      `"${r.employee.name.replace(/"/g, '""')}"`,
      `"${r.employee.department.replace(/"/g, '""')}"`,
      `"${r.employee.position.replace(/"/g, '""')}"`,
      `Tgl ${r.paydayDay}`,
      r.presentDays,
      r.effectiveWorkDays,
      r.overtimeHours,
      r.baseSalary,
      r.positionAllowance,
      r.transportMealAllowance,
      r.otherAllowance,
      r.overtimePay,
      r.totalBonus + r.totalExtraAllowance,
      r.grossSalary,
      r.totalLateDeduction,
      r.alphaDeduction + r.izinDeduction,
      r.bpjsKesehatanDeduction + r.bpjsTkDeduction,
      r.totalOtherDeduction,
      r.netSalary,
      r.status,
    ]);
    const csv = [header.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-gaji-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPayrollBackup = async () => {
    if (!payrollToken) return;
    try {
      await downloadPayrollBackupJson(payrollToken);
      setBannerMessage('Backup rahasia data gaji berhasil diunduh.');
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal mengunduh backup gaji.');
      }
    }
  };

  const handleRestorePayrollFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payrollToken) return;
    setRestoringBackup(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const next = await restorePayrollBackup(payrollToken, parsed);
      setPayrollData({
        ...next,
        salaryRaises: Array.isArray(next.salaryRaises) ? next.salaryRaises : [],
      });
      setPayrollSettingsForm(next.settings);
      setBannerMessage('Data master gaji & kenaikan gaji berhasil dipulihkan dari backup.');
      setBackupModalOpen(false);
    } catch (err) {
      if (err instanceof PayrollUnauthorizedError) {
        await handleForceLock(err.message);
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'File backup gaji tidak valid.'
        );
      }
    } finally {
      setRestoringBackup(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  // ===========================================================================
  // LOCKED GATE VIEW (WHEN PIN HAS NOT BEEN VERIFIED)
  // ===========================================================================
  if (!payrollToken) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-slate-950 px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                <LockKeyhole className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight text-white">
                  Akses Terbatas — Rekap Gaji
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Otorisasi PIN Standar Admin / Superuser
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleUnlockSubmit} className="p-6 space-y-5">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                Seluruh informasi gaji pokok, tunjangan, tanggal gajian, kenaikan gaji, bonus, potongan, dan slip gaji karyawan bersifat rahasia. Masukkan PIN standar Mode Admin atau PIN Superuser untuk membuka akses sementara.
              </span>
            </div>

            {unlockError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="superuser-payroll-pin"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                PIN Akses Rekap Gaji
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="superuser-payroll-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Masukkan PIN standar Admin atau Superuser"
                  className="w-full pl-10 pr-10 py-2.5 text-sm font-mono tracking-widest bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={unlocking}
              className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{unlocking ? 'Memverifikasi PIN...' : 'Buka Rekap Gaji Karyawan'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // UNLOCKED PAYROLL WORKSPACE
  // ===========================================================================
  const companyProfile = settings.companyProfile;
  const legalName =
    companyProfile?.legalName?.trim() || settings.companyName || 'Perusahaan';

  const raiseSelectedProfile = profileMap.get(raiseEmpId);
  const raiseCurrentBase = raiseSelectedProfile?.baseSalary ?? 0;
  const raiseBaseDiff = raiseNewBase - raiseCurrentBase;
  const raiseActualPct =
    raiseCurrentBase > 0
      ? Math.round((raiseBaseDiff / raiseCurrentBase) * 1000) / 10
      : 0;

  return (
    <div className="space-y-6">
      {/* Main Interactive Workspace (hidden on print if Slip Gaji modal is open) */}
      <div className={payslipRow ? 'no-print space-y-6' : 'space-y-6'}>
        {/* Top Security Bar */}
        <div className="bg-slate-950 text-white rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Akses Penggajian Aktif — Data Gaji Terbuka
              </div>
              <div className="text-xs text-slate-400">
                Gaji &amp; tanggal gajian diatur fleksibel per karyawan • Terkunci otomatis saat keluar menu
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Aturan &amp; Tarif</span>
            </button>
            <button
              type="button"
              onClick={() => setBackupModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Backup Gaji</span>
            </button>
            <button
              type="button"
              onClick={() => handleForceLock()}
              className="px-3.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci Akses</span>
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {bannerMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {bannerMessage}
            </span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-800 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-700 hover:text-red-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filter & Export Controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Periode Bulan
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Divisi
              </label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d === 'all' ? 'Semua Divisi' : d}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cari / Pilih Karyawan
              </label>
              <SearchableEmployeeSelect
                options={employeeOptions}
                value={empFilter}
                onChange={setEmpFilter}
                allowAll
                allLabel="Semua Karyawan"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tanggal Gajian
              </label>
              <select
                value={paydayFilter}
                onChange={(e) => setPaydayFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="all">Semua Tgl Gajian</option>
                {distinctPaydays.map((day) => (
                  <option key={day} value={String(day)}>
                    Tanggal {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Status Pembayaran
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | PayrollRecordStatus)
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="all">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="disetujui">Disetujui</option>
                <option value="dibayar">Dibayar</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Tanggal gajian berbeda tiap karyawan dapat diatur langsung lewat tombol <strong>Atur Gaji</strong>.
                </span>
              </span>
              {(deptFilter !== 'all' ||
                empFilter !== 'all' ||
                paydayFilter !== 'all' ||
                statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setDeptFilter('all');
                    setEmpFilter('all');
                    setPaydayFilter('all');
                    setStatusFilter('all');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openRaiseModal()}
                className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Atur Kenaikan Gaji</span>
              </button>
              <button
                type="button"
                onClick={() => openAdjustmentModal()}
                className="px-3 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bonus / Tunjangan / Potongan</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportingExcel || filteredRows.length === 0}
                className="px-3 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{exportingExcel ? 'Menyiapkan...' : 'Excel (.xlsx)'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredRows.length === 0}
                className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Total Gaji Bersih (THP)</span>
              <Wallet className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatRupiah(kpiTotals.net)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              Periode {formatIndonesianMonth(selectedMonth)} • {kpiTotals.count} karyawan
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Pendapatan Bruto</span>
              <Banknote className="w-4 h-4 text-blue-700" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {formatRupiah(kpiTotals.gross)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
              Lembur {formatRupiah(kpiTotals.overtimePay)} • Bonus/Tambahan{' '}
              {formatRupiah(kpiTotals.totalExtras)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Total Potongan</span>
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-red-700 tabular-nums">
              {formatRupiah(kpiTotals.deductions)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              Termasuk telat, alpha, BPJS &amp; kasbon
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Progres Pembayaran</span>
              <CheckCircle2 className="w-4 h-4 text-slate-700" />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {kpiTotals.paidCount} / {kpiTotals.count}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              Dibayar • {kpiTotals.approvedCount} Disetujui
            </div>
          </div>
        </div>

        {/* Main Payroll Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Rekapitulasi Gaji Bulanan — {formatIndonesianMonth(selectedMonth)}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Setiap karyawan memiliki komponen gaji, tunjangan tetap, tarif lembur, dan tanggal gajian masing-masing.
              </p>
            </div>
          </div>

          {loadingPayroll && !payrollData ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Memuat data penggajian...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Tidak ada karyawan yang sesuai dengan filter saat ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1160px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Karyawan</th>
                    <th className="py-3 px-3">Tgl Gajian</th>
                    <th className="py-3 px-3">Kehadiran &amp; Lembur</th>
                    <th className="py-3 px-3 text-right">Pokok &amp; Tunjangan</th>
                    <th className="py-3 px-3 text-right">Lembur, Bonus &amp; Lain</th>
                    <th className="py-3 px-3 text-right">Potongan</th>
                    <th className="py-3 px-3 text-right">Gaji Bersih (THP)</th>
                    <th className="py-3 px-3">Status Bayar</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRows.map((row) => {
                    const allowanceTotal =
                      row.positionAllowance +
                      row.transportMealAllowance +
                      row.otherAllowance;
                    const extraEarnTotal =
                      row.overtimePay + row.totalBonus + row.totalExtraAllowance;
                    const bpjsTotal =
                      row.bpjsKesehatanDeduction + row.bpjsTkDeduction;

                    return (
                      <tr
                        key={row.employee.id}
                        className="hover:bg-slate-50/80 transition-colors align-top"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">
                            {row.employee.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono text-slate-600">
                              {row.employee.employeeCode}
                            </span>{' '}
                            • {row.employee.department} • {row.employee.position}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {row.profile.paymentMethod === 'tunai'
                              ? 'Pembayaran Tunai'
                              : `${row.profile.bankName || 'Transfer'} ${
                                  row.profile.bankAccountNumber || '(Rek. belum diisi)'
                                }`}
                          </div>
                          {row.latestRaise && (
                            <div className="text-[11px] text-emerald-700 font-medium mt-0.5 inline-flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" />
                              <span>
                                Naik gaji ({row.latestRaise.effectiveMonth}):{' '}
                                {formatRupiah(
                                  row.latestRaise.newBaseSalary -
                                    row.latestRaise.previousBaseSalary
                                )}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="font-mono text-xs font-bold text-slate-900">
                            Tanggal {row.paydayDay}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Setiap bulan
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-xs text-slate-700 tabular-nums">
                          <div className="font-medium">
                            Hadir {row.presentDays}/{row.effectiveWorkDays} hari
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            Lembur {row.overtimeHours} jam
                          </div>
                          {(row.totalLateMinutes > 0 || row.alphaCount > 0) && (
                            <div className="text-[11px] text-amber-700 mt-0.5">
                              {row.totalLateMinutes > 0 &&
                                `Telat ${row.totalLateMinutes}m (sisa ${row.remainingLateMinutes}m)`}
                              {row.totalLateMinutes > 0 && row.alphaCount > 0 && ' • '}
                              {row.alphaCount > 0 && `Alpha ${row.alphaCount}h`}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div className="font-semibold text-slate-900">
                            {formatRupiah(row.baseSalary + allowanceTotal)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Pokok {formatRupiah(row.baseSalary)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Tunj. {formatRupiah(allowanceTotal)}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div className="font-semibold text-blue-700">
                            +{formatRupiah(extraEarnTotal)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Lembur {formatRupiah(row.overtimePay)}
                          </div>
                          {row.totalBonus > 0 && (
                            <div className="text-[11px] text-emerald-700">
                              Bonus {formatRupiah(row.totalBonus)}
                            </div>
                          )}
                          {row.totalExtraAllowance > 0 && (
                            <div className="text-[11px] text-blue-600">
                              Tambahan {formatRupiah(row.totalExtraAllowance)}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div
                            className={`font-semibold ${
                              row.totalDeductions > 0 ? 'text-red-700' : 'text-slate-500'
                            }`}
                          >
                            -{formatRupiah(row.totalDeductions)}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                            {row.totalLateDeduction > 0 && (
                              <div>Telat {formatRupiah(row.totalLateDeduction)}</div>
                            )}
                            {row.alphaDeduction + row.izinDeduction > 0 && (
                              <div>
                                Alpha/Izin{' '}
                                {formatRupiah(row.alphaDeduction + row.izinDeduction)}
                              </div>
                            )}
                            {bpjsTotal > 0 && <div>BPJS {formatRupiah(bpjsTotal)}</div>}
                            {row.totalOtherDeduction > 0 && (
                              <div>Kasbon/Lain {formatRupiah(row.totalOtherDeduction)}</div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          <div className="text-base font-bold text-emerald-800">
                            {formatRupiah(row.netSalary)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Bruto {formatRupiah(row.grossSalary)}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <select
                            aria-label={`Status gaji ${row.employee.name}`}
                            value={row.status}
                            disabled={updatingStatusKey === row.employee.id}
                            onChange={(e) =>
                              handleChangePaymentStatus(
                                row.employee.id,
                                e.target.value as PayrollRecordStatus
                              )
                            }
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer focus:outline-none ${
                              row.status === 'dibayar'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : row.status === 'disetujui'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="draft">Draft</option>
                            <option value="disetujui">Disetujui</option>
                            <option value="dibayar">Dibayar</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPayslipRow(row)}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
                            >
                              Slip
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditProfile(row)}
                              className="px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                            >
                              Atur Gaji
                            </button>
                            <button
                              type="button"
                              onClick={() => openRaiseModal(row.employee.id)}
                              title="Atur kenaikan gaji karyawan ini"
                              className="p-1.5 text-xs font-medium bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 rounded-lg cursor-pointer"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openAdjustmentModal(row.employee.id)}
                              title="Tambah bonus, tunjangan tambahan, atau potongan"
                              className="p-1.5 text-xs font-medium bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 rounded-lg cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-mono text-xs font-bold tabular-nums">
                    <td className="py-3.5 px-4 font-sans" colSpan={3}>
                      TOTAL KESELURUHAN ({filteredRows.length} Karyawan)
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {formatRupiah(
                        filteredRows.reduce(
                          (a, r) =>
                            a +
                            r.baseSalary +
                            r.positionAllowance +
                            r.transportMealAllowance +
                            r.otherAllowance,
                          0
                        )
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right text-blue-300">
                      +{formatRupiah(kpiTotals.overtimePay + kpiTotals.totalExtras)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-red-300">
                      -{formatRupiah(kpiTotals.deductions)}
                    </td>
                    <td className="py-3.5 px-3 text-right text-sm text-emerald-300">
                      {formatRupiah(kpiTotals.net)}
                    </td>
                    <td className="py-3.5 px-3" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Lower Tabbed Section: Bonus/Tunjangan/Potongan & Riwayat Kenaikan Gaji */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLowerTab('penyesuaian')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  lowerTab === 'penyesuaian'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Bonus, Tunjangan &amp; Potongan ({monthAdjustments.length})
              </button>
              <button
                type="button"
                onClick={() => setLowerTab('kenaikan')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  lowerTab === 'kenaikan'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Riwayat Kenaikan Gaji ({scopedRaises.length})
              </button>
            </div>

            {lowerTab === 'penyesuaian' ? (
              <button
                type="button"
                onClick={() => openAdjustmentModal()}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Bonus / Lainnya</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openRaiseModal()}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Catat Kenaikan Gaji</span>
              </button>
            )}
          </div>

          {lowerTab === 'penyesuaian' ? (
            monthAdjustments.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Belum ada bonus, tunjangan tambahan, atau potongan pada periode{' '}
                {formatIndonesianMonth(selectedMonth)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {monthAdjustments.map((adj) => {
                  const typeLabel =
                    adj.type === 'bonus'
                      ? 'Bonus / Insentif'
                      : adj.type === 'tunjangan'
                      ? 'Tunjangan / Lainnya'
                      : 'Potongan / Kasbon';
                  const amountColor =
                    adj.type === 'potongan'
                      ? 'text-red-700'
                      : adj.type === 'tunjangan'
                      ? 'text-blue-700'
                      : 'text-emerald-700';

                  return (
                    <div
                      key={adj.id}
                      className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {adj.employeeName}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            — {adj.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {adj.date} • {typeLabel}
                          {adj.notes ? ` • ${adj.notes}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold tabular-nums ${amountColor}`}>
                          {adj.type === 'potongan' ? '-' : '+'}
                          {formatRupiah(adj.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          disabled={deletingAdjId === adj.id}
                          aria-label={`Hapus ${adj.title}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : scopedRaises.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-slate-500">
              Belum ada riwayat kenaikan gaji karyawan yang tercatat. Klik tombol{' '}
              <strong>Catat Kenaikan Gaji</strong> untuk mengatur kenaikan gaji pokok maupun tunjangan karyawan.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {scopedRaises.map((sr) => {
                const diffBase = sr.newBaseSalary - sr.previousBaseSalary;
                const oldAllow =
                  sr.previousPositionAllowance +
                  sr.previousTransportMealAllowance +
                  sr.previousOtherAllowance;
                const newAllow =
                  sr.newPositionAllowance +
                  sr.newTransportMealAllowance +
                  sr.newOtherAllowance;
                const diffAllow = newAllow - oldAllow;

                return (
                  <div
                    key={sr.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">
                        {sr.employeeName}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          — {sr.reason}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Tanggal SK: {sr.raiseDate} • Efektif Bulan:{' '}
                        <strong>{formatIndonesianMonth(sr.effectiveMonth)}</strong>
                        {sr.method === 'persentase' && sr.percentIncrease !== undefined
                          ? ` • (+${sr.percentIncrease}%)`
                          : ' • (Nominal Tetap)'}
                        {sr.notes ? ` • ${sr.notes}` : ''}
                      </div>
                      <div className="text-xs text-slate-600 font-mono tabular-nums pt-0.5">
                        Gaji Pokok: {formatRupiah(sr.previousBaseSalary)} →{' '}
                        <strong className="text-slate-900">
                          {formatRupiah(sr.newBaseSalary)}
                        </strong>
                        {diffAllow !== 0 && (
                          <span className="text-slate-500">
                            {' '}
                            | Total Tunjangan: {formatRupiah(oldAllow)} →{' '}
                            {formatRupiah(newAllow)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-mono tabular-nums">
                        <div
                          className={`text-sm font-bold ${
                            diffBase >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {diffBase >= 0 ? '+' : ''}
                          {formatRupiah(diffBase)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {sr.appliedToProfile ? 'Diterapkan' : 'Catatan Saja'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRaise(sr.id)}
                        disabled={deletingRaiseId === sr.id}
                        aria-label={`Hapus riwayat kenaikan ${sr.employeeName}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL: SLIP GAJI INDIVIDU (PRINT-READY)                               */}
      {/* ===================================================================== */}
      {payslipRow && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white w-full max-w-3xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden print:border-0 print:shadow-none print:rounded-none">
            <div className="px-6 py-3.5 bg-slate-950 text-white flex items-center justify-between no-print">
              <div className="text-sm font-semibold">
                Pratinjau Slip Gaji — {payslipRow.employee.name}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak / Simpan PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayslipRow(null)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6 text-slate-900">
              <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
                <div className="flex items-center gap-3">
                  {companyProfile?.logoDataUrl && (
                    <img
                      src={companyProfile.logoDataUrl}
                      alt={legalName}
                      className="w-12 h-12 object-contain border border-slate-200 rounded-lg p-1"
                    />
                  )}
                  <div>
                    <div className="font-display text-lg font-bold text-slate-950">
                      {legalName}
                    </div>
                    <div className="text-xs text-slate-600">
                      {companyProfile?.address || ''}{' '}
                      {companyProfile?.city ? `• ${companyProfile.city}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {[
                        companyProfile?.phone ? `Telp: ${companyProfile.phone}` : '',
                        companyProfile?.email,
                        companyProfile?.taxId ? `NPWP: ${companyProfile.taxId}` : '',
                      ]
                        .filter(Boolean)
                        .join(' | ')}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold tracking-wider uppercase text-slate-500">
                    SLIP GAJI KARYAWAN
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {formatIndonesianMonth(selectedMonth)}
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Jadwal Gajian: Tgl {payslipRow.paydayDay}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div>
                  <div className="text-slate-500">Nama / Kode</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {payslipRow.employee.name}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    {payslipRow.employee.employeeCode}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Divisi &amp; Jabatan</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {payslipRow.employee.department}
                  </div>
                  <div className="text-slate-600">{payslipRow.employee.position}</div>
                </div>
                <div>
                  <div className="text-slate-500">Ringkasan Absensi</div>
                  <div className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                    Hadir {payslipRow.presentDays} / {payslipRow.effectiveWorkDays} hari
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Lembur {payslipRow.overtimeHours}j • Alpha {payslipRow.alphaCount}h
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Rekening / Metode</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {payslipRow.profile.paymentMethod === 'tunai'
                      ? 'Pembayaran Tunai'
                      : payslipRow.profile.bankName || 'Transfer Bank'}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    {payslipRow.profile.paymentMethod === 'tunai'
                      ? 'Kas Perusahaan'
                      : payslipRow.profile.bankAccountNumber || '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 font-bold text-emerald-900">
                    A. PENDAPATAN (PENERIMAAN)
                  </div>
                  <div className="p-4 space-y-2.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Gaji Pokok</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatRupiah(payslipRow.baseSalary)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tunjangan Jabatan</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatRupiah(payslipRow.positionAllowance)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tunjangan Transport &amp; Makan</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatRupiah(payslipRow.transportMealAllowance)}
                      </span>
                    </div>
                    {payslipRow.otherAllowance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Tunjangan Tetap Lainnya</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatRupiah(payslipRow.otherAllowance)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Uang Lembur ({payslipRow.overtimeHours} jam ×{' '}
                        {formatRupiah(payslipRow.overtimeHourlyRate)})
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatRupiah(payslipRow.overtimePay)}
                      </span>
                    </div>
                    {payslipRow.bonusItems.map((b) => (
                      <div key={b.id} className="flex justify-between">
                        <span className="text-slate-600">Bonus: {b.title}</span>
                        <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                          {formatRupiah(b.amount)}
                        </span>
                      </div>
                    ))}
                    {payslipRow.extraAllowanceItems.map((t) => (
                      <div key={t.id} className="flex justify-between">
                        <span className="text-slate-600">{t.title}</span>
                        <span className="font-mono font-semibold text-blue-700 tabular-nums">
                          {formatRupiah(t.amount)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2.5 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                      <span>Total Pendapatan (Bruto)</span>
                      <span className="font-mono tabular-nums">
                        {formatRupiah(payslipRow.grossSalary)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 font-bold text-red-900">
                    B. POTONGAN
                  </div>
                  <div className="p-4 space-y-2.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Potongan Keterlambatan ({payslipRow.totalLateMinutes} mnt total)
                      </span>
                      <span className="font-mono font-semibold text-red-700 tabular-nums">
                        {formatRupiah(payslipRow.totalLateDeduction)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Potongan Alpha ({payslipRow.alphaCount} hari)
                      </span>
                      <span className="font-mono font-semibold text-red-700 tabular-nums">
                        {formatRupiah(payslipRow.alphaDeduction)}
                      </span>
                    </div>
                    {payslipRow.izinDeduction > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          Potongan Izin ({payslipRow.izinCount} hari)
                        </span>
                        <span className="font-mono font-semibold text-red-700 tabular-nums">
                          {formatRupiah(payslipRow.izinDeduction)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Iuran BPJS Kesehatan &amp; TK
                      </span>
                      <span className="font-mono font-semibold text-red-700 tabular-nums">
                        {formatRupiah(
                          payslipRow.bpjsKesehatanDeduction + payslipRow.bpjsTkDeduction
                        )}
                      </span>
                    </div>
                    {payslipRow.otherDeductionItems.map((d) => (
                      <div key={d.id} className="flex justify-between">
                        <span className="text-slate-600">{d.title}</span>
                        <span className="font-mono font-semibold text-red-700 tabular-nums">
                          {formatRupiah(d.amount)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2.5 border-t border-slate-200 flex justify-between font-bold text-red-800">
                      <span>Total Potongan</span>
                      <span className="font-mono tabular-nums">
                        {formatRupiah(payslipRow.totalDeductions)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 text-white rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    Total Gaji Bersih Diterima (Take-Home Pay)
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Periode {formatIndonesianMonth(selectedMonth)} • Dibayarkan tiap tanggal {payslipRow.paydayDay}
                  </div>
                </div>
                <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                  {formatRupiah(payslipRow.netSalary)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 pt-4 text-xs text-center">
                <div>
                  <div className="text-slate-500">Disetujui Oleh,</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {companyProfile?.hrManagerTitle || 'Manajer HRD'}
                  </div>
                  <div className="h-14" />
                  <div className="font-bold underline text-slate-900">
                    {companyProfile?.hrManagerName || 'HRD & Payroll'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Diterima Oleh,</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {payslipRow.employee.position}
                  </div>
                  <div className="h-14" />
                  <div className="font-bold underline text-slate-900">
                    {payslipRow.employee.name}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ATUR KOMPONEN GAJI & TANGGAL GAJIAN PER KARYAWAN               */}
      {/* ===================================================================== */}
      {editingProfileEmp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Atur Gaji &amp; Tanggal Gajian — {editingProfileEmp.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingProfileEmp.employeeCode} • {editingProfileEmp.department} ({editingProfileEmp.position})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfileEmp(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gaji Pokok (Rp / Bulan)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={profileForm.baseSalary}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        baseSalary: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunjangan Jabatan (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={profileForm.positionAllowance}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        positionAllowance: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunjangan Transport &amp; Makan (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={profileForm.transportMealAllowance}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        transportMealAllowance: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunjangan Tetap Lainnya (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={profileForm.otherAllowance}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        otherAllowance: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarif Lembur Khusus (Rp / Jam)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={profileForm.overtimeHourlyRate}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        overtimeHourlyRate: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Gajian Karyawan (1–31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={profileForm.paydayDay}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        paydayDay: Math.max(
                          1,
                          Math.min(31, Number(e.target.value) || 1)
                        ),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-blue-300 bg-blue-50/40 rounded-lg font-semibold text-blue-900"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={profileForm.paymentMethod}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        paymentMethod: e.target.value as PayrollPaymentMethod,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="transfer">Transfer Bank</option>
                    <option value="tunai">Tunai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    disabled={profileForm.paymentMethod === 'tunai'}
                    value={profileForm.bankName}
                    onChange={(e) =>
                      setProfileForm((p) => ({ ...p, bankName: e.target.value }))
                    }
                    placeholder="BCA / Mandiri"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Rekening
                  </label>
                  <input
                    type="text"
                    disabled={profileForm.paymentMethod === 'tunai'}
                    value={profileForm.bankAccountNumber}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        bankAccountNumber: e.target.value,
                      }))
                    }
                    placeholder="Nomor rekening"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Gaji
                </label>
                <input
                  type="text"
                  value={profileForm.notes}
                  onChange={(e) =>
                    setProfileForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Contoh: Gajian tiap tgl 1 mengikuti kontrak proyek"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProfileEmp(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan Gaji & Tgl Gajian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: ATUR KENAIKAN GAJI KARYAWAN                                    */}
      {/* ===================================================================== */}
      {raiseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display text-base font-bold">
                  Atur Kenaikan Gaji Karyawan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRaiseModalOpen(false)}
                className="p-1 text-slate-300 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRaise} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Karyawan
                </label>
                <SearchableEmployeeSelect
                  options={employeeOptions}
                  value={raiseEmpId}
                  onChange={handleChangeRaiseEmployee}
                />
              </div>

              {/* Current vs New Summary Strip */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Gaji Pokok Saat Ini</div>
                  <div className="font-mono font-bold text-slate-900 text-sm tabular-nums mt-0.5">
                    {formatRupiah(raiseCurrentBase)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500">Selisih Kenaikan</div>
                  <div
                    className={`font-mono font-bold text-sm tabular-nums mt-0.5 ${
                      raiseBaseDiff >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {raiseBaseDiff >= 0 ? '+' : ''}
                    {formatRupiah(raiseBaseDiff)} ({raiseActualPct >= 0 ? '+' : ''}
                    {raiseActualPct}%)
                  </div>
                </div>
              </div>

              {/* Method Switch + Quick Presets */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChangeRaiseMethod('persentase')}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                      raiseMethod === 'persentase'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Naik Berdasarkan Persentase (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeRaiseMethod('nominal')}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer ${
                      raiseMethod === 'nominal'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    Naik Berdasarkan Nominal (Rp)
                  </button>
                </div>

                {raiseMethod === 'persentase' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleApplyRaisePercent(pct)}
                        className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border cursor-pointer ${
                          raisePercent === pct
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        +{pct}%
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number"
                        step={0.5}
                        value={raisePercent}
                        onChange={(e) =>
                          handleApplyRaisePercent(Number(e.target.value) || 0)
                        }
                        className="w-20 px-2.5 py-1 text-xs font-mono text-right border border-slate-300 rounded-md"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {[250000, 500000, 1000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleApplyRaiseNominal(amt)}
                        className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md border cursor-pointer ${
                          raiseNominalAdd === amt
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        +{amt / 1000}rb
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-xs text-slate-500">+Rp</span>
                      <input
                        type="number"
                        step={50000}
                        value={raiseNominalAdd}
                        onChange={(e) =>
                          handleApplyRaiseNominal(Number(e.target.value) || 0)
                        }
                        className="w-28 px-2.5 py-1 text-xs font-mono text-right border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Editable New Salary Components */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gaji Pokok Baru (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={50000}
                    value={raiseNewBase}
                    onChange={(e) => setRaiseNewBase(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm font-mono font-bold text-emerald-900 bg-emerald-50/40 border border-emerald-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunjangan Jabatan Baru (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={raiseNewPos}
                    onChange={(e) => setRaiseNewPos(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunj. Transport &amp; Makan Baru (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={raiseNewTrans}
                    onChange={(e) => setRaiseNewTrans(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tunjangan Tetap Lainnya Baru (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={25000}
                    value={raiseNewOther}
                    onChange={(e) => setRaiseNewOther(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Berlaku Mulai Bulan
                  </label>
                  <input
                    type="month"
                    required
                    value={raiseEffectiveMonth}
                    onChange={(e) => setRaiseEffectiveMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Penetapan / SK
                  </label>
                  <input
                    type="date"
                    required
                    value={raiseDate}
                    onChange={(e) => setRaiseDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Kenaikan Gaji
                </label>
                <input
                  type="text"
                  required
                  value={raiseReason}
                  onChange={(e) => setRaiseReason(e.target.value)}
                  placeholder="Contoh: Promosi Jabatan / Evaluasi Tahunan / Penyesuaian UMR"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={raiseApplyToProfile}
                  onChange={(e) => setRaiseApplyToProfile(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-700"
                />
                <span className="text-xs text-slate-700">
                  <strong>Terapkan langsung ke profil gaji aktif karyawan</strong> sehingga perhitungan rekap gaji langsung menggunakan nominal baru.
                </span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRaiseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingRaise}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                >
                  {savingRaise ? 'Menyimpan...' : 'Simpan Kenaikan Gaji'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: TAMBAH BONUS, TUNJANGAN TAMBAHAN & POTONGAN                    */}
      {/* ===================================================================== */}
      {adjModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Tambah Bonus / Tunjangan / Potongan ({formatIndonesianMonth(selectedMonth)})
              </h3>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Karyawan
                </label>
                <SearchableEmployeeSelect
                  options={employeeOptions}
                  value={adjEmpId}
                  onChange={setAdjEmpId}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType('bonus')}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    adjType === 'bonus'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  + Bonus
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('tunjangan')}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    adjType === 'tunjangan'
                      ? 'bg-blue-50 border-blue-600 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  + Tunjangan / Lain
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('potongan')}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    adjType === 'potongan'
                      ? 'bg-red-50 border-red-600 text-red-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  - Potongan
                </button>
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ADJUSTMENT_PRESETS[adjType].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjTitle(preset)}
                      className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan
                </label>
                <input
                  type="text"
                  required
                  value={adjTitle}
                  onChange={(e) => setAdjTitle(e.target.value)}
                  placeholder="Pilih atau ketik keterangan..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={1000}
                    step={5000}
                    value={adjAmount || ''}
                    onChange={(e) => setAdjAmount(Number(e.target.value) || 0)}
                    placeholder="100000"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    required
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAdj}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {savingAdj ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PENGATURAN TARIF & ATURAN PAYROLL                              */}
      {/* ===================================================================== */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Pengaturan Tarif &amp; Aturan Payroll
              </h3>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayrollSettings} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarif Lembur Default (Rp / Jam)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={payrollSettingsForm.defaultOvertimeHourlyRate}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        defaultOvertimeHourlyRate: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Potongan Alpha (Rp / Hari)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={payrollSettingsForm.defaultAlphaDeductionPerDay}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        defaultAlphaDeductionPerDay: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Potongan Izin (Rp / Hari)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    value={payrollSettingsForm.defaultIzinDeductionPerDay}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        defaultIzinDeductionPerDay: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tgl Gajian Default Karyawan Baru
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={payrollSettingsForm.paydayDayOfMonth}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        paydayDayOfMonth: Math.max(
                          1,
                          Math.min(31, Number(e.target.value) || 25)
                        ),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Potongan BPJS Kesehatan (% Pokok)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={payrollSettingsForm.bpjsKesehatanPct}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        bpjsKesehatanPct: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Potongan BPJS TK (% Pokok)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={payrollSettingsForm.bpjsKetenagakerjaanPct}
                    onChange={(e) =>
                      setPayrollSettingsForm((s) => ({
                        ...s,
                        bpjsKetenagakerjaanPct: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={payrollSettingsForm.autoDeductRemainingLate}
                  onChange={(e) =>
                    setPayrollSettingsForm((s) => ({
                      ...s,
                      autoDeductRemainingLate: e.target.checked,
                    }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-blue-700"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong>Otomatis potong sisa keterlambatan belum dicicil</strong> menggunakan tarif pengaturan ({formatRupiah(settings.lateDeductionPerMinute ?? 1000)}/menit). Jika dimatikan, hanya cicilan dengan metode &ldquo;Potongan Gaji&rdquo; yang dihitung.
                </span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: BACKUP & RESTORE RAHASIA GAJI                                  */}
      {/* ===================================================================== */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Backup &amp; Restore Data Gaji (Rahasia)
              </h3>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Data penggajian disimpan terpisah dari backup absensi umum agar kerahasiaan nominal gaji, tanggal gajian individu, dan riwayat kenaikan gaji tetap terjaga.
              </p>

              <button
                type="button"
                onClick={handleDownloadPayrollBackup}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File Backup Gaji (.json)</span>
              </button>

              <div className="pt-3 border-t border-slate-200">
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleRestorePayrollFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={restoringBackup}
                  onClick={() => restoreInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {restoringBackup
                      ? 'Memulihkan...'
                      : 'Restore dari File Backup Gaji'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
