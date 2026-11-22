import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceRecord,
  calculateDurationHours,
  calculateLatenessMinutes,
  Employee,
  formatIndonesianDate,
  formatIndonesianMonth,
  formatOffDaysSummary,
  getCurrentYearMonth,
  getEmployeeShiftTolerance,
  getMonthEffectiveWorkDays,
  getTodayDateStr,
  LateSettlement,
  LateSettlementMethod,
  NavSection,
} from '../types';
import {
  createLateSettlement,
  deleteLateSettlement,
} from '../services/attendanceService';
import { exportAttendanceMatrixToExcel } from '../utils/excelAttendanceExport';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';

interface ReportsViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements?: LateSettlement[];
  settings?: AppSettings;
  loading: boolean;
  onRefresh?: () => Promise<void>;
  onNavigate?: (nav: NavSection) => void;
}

type ReportTab = 'kehadiran' | 'terlambat';

interface EmployeeMonthlySummary {
  employee: Employee;
  effectiveWorkDays: number;
  hadirCount: number;
  terlambatCount: number;
  izinTerlambatCount: number;
  izinSakitCount: number;
  alphaCount: number;
  totalWorkHours: number;
  manualOvertimeHours: number;
  attendancePct: number;
}

interface LateLogDetail {
  record: AttendanceRecord;
  employee: Employee;
  toleranceMinutes: number;
  lateMinutes: number;
}

interface EmployeeLatenessSummary {
  employee: Employee;
  toleranceMinutes: number;
  lateCount: number;
  totalLateMinutes: number;
  avgLateMinutes: number;
  maxLateMinutes: number;
  maxLateDate: string;
  attendedDays: number;
  lateRatioPct: number;
  workSettledMinutes: number;
  workInstallmentCount: number;
  salarySettledMinutes: number;
  totalDeductionAmount: number;
  totalSettledMinutes: number;
  remainingLateMinutes: number;
  lateLogs: LateLogDetail[];
}

function formatMinutesAsHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 mnt';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} mnt`;
  return `${hours}j ${String(mins).padStart(2, '0')}m`;
}

function formatRupiah(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

function calculateTimeDiffMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return 0;
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }
  const diff = endMin - startMin;
  return diff > 0 && diff <= 12 * 60 ? diff : 0;
}

function addMinutesToTimeStr(timeStr: string, minutesToAdd: number): string {
  const [sh, sm] = timeStr.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return '';
  const total = (sh * 60 + sm + minutesToAdd) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  employees,
  attendanceRecords,
  lateSettlements = [],
  settings,
  loading,
  onRefresh,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('kehadiran');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [lateSearch, setLateSearch] = useState<string>('');
  const [lateEmpFilter, setLateEmpFilter] = useState<string>('all');
  const [lateShiftFilter, setLateShiftFilter] = useState<string>('all');
  const [expandedLateEmpIds, setExpandedLateEmpIds] = useState<Set<string>>(new Set());
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(null);

  // Settlement / Cicilan Modal state
  const [settlementModalOpen, setSettlementModalOpen] = useState<boolean>(false);
  const [formEmpId, setFormEmpId] = useState<string>('');
  const [formMethod, setFormMethod] = useState<LateSettlementMethod>('tambahan_jam_kerja');
  const [formDate, setFormDate] = useState<string>(getTodayDateStr());
  const [formMinutes, setFormMinutes] = useState<number>(30);
  const [formExtraStart, setFormExtraStart] = useState<string>('');
  const [formExtraEnd, setFormExtraEnd] = useState<string>('');
  const [formDeductionAmount, setFormDeductionAmount] = useState<number>(0);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittingSettlement, setSubmittingSettlement] = useState<boolean>(false);

  const defaultRatePerMinute = settings?.lateDeductionPerMinute ?? 1000;

  const scopedEmployees = useMemo(() => {
    const active = employees.filter((e) => e.active);
    if (deptFilter === 'all') return active;
    return active.filter((e) => e.department === deptFilter);
  }, [employees, deptFilter]);

  const departments = useMemo(() => {
    const set = new Set(employees.filter((e) => e.active).map((e) => e.department));
    return ['all', ...Array.from(set).sort()];
  }, [employees]);

  const summaries: EmployeeMonthlySummary[] = useMemo(() => {
    return scopedEmployees
      .map((emp) => {
        const monthAtt = attendanceRecords.filter(
          (r) => r.employeeId === emp.id && r.date.startsWith(selectedMonth)
        );

        const effectiveWorkDays = getMonthEffectiveWorkDays(emp, selectedMonth);
        const hadirCount = monthAtt.filter((r) => r.status === 'hadir').length;
        const terlambatCount = monthAtt.filter((r) => r.status === 'terlambat').length;
        const izinTerlambatCount = monthAtt.filter(
          (r) => r.status === 'izin_terlambat'
        ).length;
        const izinSakitCount = monthAtt.filter(
          (r) => r.status === 'izin' || r.status === 'sakit'
        ).length;
        const alphaCount = monthAtt.filter((r) => r.status === 'alpha').length;

        const totalWorkHours = monthAtt.reduce((acc, rec) => {
          if (!rec.checkIn || !rec.checkOut) return acc;
          const h = calculateDurationHours(rec.checkIn, rec.checkOut);
          return h > 0 && h <= 20 ? acc + h : acc;
        }, 0);

        const manualOvertimeHours = monthAtt.reduce(
          (acc, rec) => acc + (rec.overtimeHours || 0),
          0
        );

        const attendedTotal = hadirCount + terlambatCount + izinTerlambatCount;
        const recordedWorkLogs = attendedTotal + izinSakitCount + alphaCount;
        const attendancePct =
          recordedWorkLogs > 0
            ? Math.round((attendedTotal / recordedWorkLogs) * 100)
            : 0;

        return {
          employee: emp,
          effectiveWorkDays,
          hadirCount,
          terlambatCount,
          izinTerlambatCount,
          izinSakitCount,
          alphaCount,
          totalWorkHours: Math.round(totalWorkHours * 10) / 10,
          manualOvertimeHours: Math.round(manualOvertimeHours * 10) / 10,
          attendancePct,
        };
      })
      .sort((a, b) => a.employee.employeeCode.localeCompare(b.employee.employeeCode));
  }, [scopedEmployees, attendanceRecords, selectedMonth]);

  const aggregate = useMemo(() => {
    const totalPresent = summaries.reduce(
      (acc, s) => acc + s.hadirCount + s.terlambatCount + s.izinTerlambatCount,
      0
    );
    const totalLate = summaries.reduce((acc, s) => acc + s.terlambatCount, 0);
    const totalIzinTerlambat = summaries.reduce(
      (acc, s) => acc + s.izinTerlambatCount,
      0
    );
    const totalWorkHours = summaries.reduce((acc, s) => acc + s.totalWorkHours, 0);
    const totalOtHours = summaries.reduce(
      (acc, s) => acc + s.manualOvertimeHours,
      0
    );
    return {
      totalPresent,
      totalLate,
      totalIzinTerlambat,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      totalOtHours: Math.round(totalOtHours * 10) / 10,
    };
  }, [summaries]);

  // Scoped settlements for selectedMonth & department
  const monthScopedSettlements = useMemo(() => {
    const scopedIds = new Set(scopedEmployees.map((e) => e.id));
    return lateSettlements
      .filter((s) => s.yearMonth === selectedMonth && scopedIds.has(s.employeeId))
      .sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [lateSettlements, selectedMonth, scopedEmployees]);

  // Authorized late arrival permits (exempt from lateness deduction)
  const latePermitLogs = useMemo(() => {
    const empMap = new Map(scopedEmployees.map((e) => [e.id, e]));
    return attendanceRecords
      .filter(
        (r) =>
          r.status === 'izin_terlambat' &&
          r.date.startsWith(selectedMonth) &&
          empMap.has(r.employeeId)
      )
      .map((rec) => {
        const employee = empMap.get(rec.employeeId)!;
        const refTime = rec.checkIn || rec.latePermitEstimatedArrival || '';
        const diffMins = refTime
          ? calculateLatenessMinutes(refTime, employee.shiftStart)
          : 0;
        return { record: rec, employee, diffMins };
      })
      .sort((a, b) => b.record.date.localeCompare(a.record.date));
  }, [scopedEmployees, attendanceRecords, selectedMonth]);

  // Lateness computation (Rekap Karyawan Terlambat + Penggantian/Cicilan)
  const { lateEmployeeSummaries, lateLogDetails, lateStats } = useMemo(() => {
    const details: LateLogDetail[] = [];
    const empSummaries: EmployeeLatenessSummary[] = [];

    for (const emp of scopedEmployees) {
      const tolerance = getEmployeeShiftTolerance(emp, settings?.shifts);
      const monthAtt = attendanceRecords.filter(
        (r) => r.employeeId === emp.id && r.date.startsWith(selectedMonth)
      );

      const attendedDays = monthAtt.filter(
        (r) =>
          r.status === 'hadir' ||
          r.status === 'terlambat' ||
          r.status === 'izin_terlambat'
      ).length;

      const empLateLogs: LateLogDetail[] = [];

      for (const rec of monthAtt) {
        const rawLate = rec.checkIn
          ? calculateLatenessMinutes(rec.checkIn, emp.shiftStart)
          : 0;
        const isLateRecord =
          rec.status === 'terlambat' ||
          (rec.status === 'hadir' && Boolean(rec.checkIn) && rawLate > tolerance);

        if (isLateRecord) {
          const item: LateLogDetail = {
            record: rec,
            employee: emp,
            toleranceMinutes: tolerance,
            lateMinutes: rawLate,
          };
          empLateLogs.push(item);
          details.push(item);
        }
      }

      const empSettlements = monthScopedSettlements.filter(
        (s) => s.employeeId === emp.id
      );

      if (empLateLogs.length > 0 || empSettlements.length > 0) {
        const totalLateMinutes = empLateLogs.reduce(
          (acc, l) => acc + l.lateMinutes,
          0
        );
        const maxEntry =
          empLateLogs.length > 0
            ? empLateLogs.reduce(
                (best, curr) => (curr.lateMinutes > best.lateMinutes ? curr : best),
                empLateLogs[0]
              )
            : null;
        const avgLateMinutes =
          empLateLogs.length > 0
            ? Math.round(totalLateMinutes / empLateLogs.length)
            : 0;
        const lateRatioPct =
          attendedDays > 0
            ? Math.round((empLateLogs.length / attendedDays) * 100)
            : 0;

        const workEntries = empSettlements.filter(
          (s) => s.method === 'tambahan_jam_kerja'
        );
        const salaryEntries = empSettlements.filter(
          (s) => s.method === 'potongan_gaji'
        );
        const workSettledMinutes = workEntries.reduce(
          (acc, s) => acc + s.minutesSettled,
          0
        );
        const salarySettledMinutes = salaryEntries.reduce(
          (acc, s) => acc + s.minutesSettled,
          0
        );
        const totalDeductionAmount = salaryEntries.reduce(
          (acc, s) => acc + (s.deductionAmount || 0),
          0
        );
        const totalSettledMinutes = workSettledMinutes + salarySettledMinutes;
        const remainingLateMinutes = Math.max(
          0,
          totalLateMinutes - totalSettledMinutes
        );

        empSummaries.push({
          employee: emp,
          toleranceMinutes: tolerance,
          lateCount: empLateLogs.length,
          totalLateMinutes,
          avgLateMinutes,
          maxLateMinutes: maxEntry ? maxEntry.lateMinutes : 0,
          maxLateDate: maxEntry ? maxEntry.record.date : '—',
          attendedDays,
          lateRatioPct,
          workSettledMinutes,
          workInstallmentCount: workEntries.length,
          salarySettledMinutes,
          totalDeductionAmount,
          totalSettledMinutes,
          remainingLateMinutes,
          lateLogs: [...empLateLogs].sort((a, b) =>
            b.record.date.localeCompare(a.record.date)
          ),
        });
      }
    }

    empSummaries.sort((a, b) => {
      if (b.remainingLateMinutes !== a.remainingLateMinutes) {
        return b.remainingLateMinutes - a.remainingLateMinutes;
      }
      if (b.totalLateMinutes !== a.totalLateMinutes) {
        return b.totalLateMinutes - a.totalLateMinutes;
      }
      return a.employee.employeeCode.localeCompare(b.employee.employeeCode);
    });

    details.sort((a, b) => {
      if (b.record.date !== a.record.date) {
        return b.record.date.localeCompare(a.record.date);
      }
      return b.lateMinutes - a.lateMinutes;
    });

    const totalLateCount = details.length;
    const totalLateMinutes = details.reduce((acc, d) => acc + d.lateMinutes, 0);
    const totalSettledWorkMinutes = empSummaries.reduce(
      (acc, e) => acc + e.workSettledMinutes,
      0
    );
    const workInstallmentCount = empSummaries.reduce(
      (acc, e) => acc + e.workInstallmentCount,
      0
    );
    const totalSettledSalaryMinutes = empSummaries.reduce(
      (acc, e) => acc + e.salarySettledMinutes,
      0
    );
    const totalDeductionAmount = empSummaries.reduce(
      (acc, e) => acc + e.totalDeductionAmount,
      0
    );
    const totalRemainingLateMinutes = empSummaries.reduce(
      (acc, e) => acc + e.remainingLateMinutes,
      0
    );

    return {
      lateEmployeeSummaries: empSummaries,
      lateLogDetails: details,
      lateStats: {
        totalLateCount,
        lateEmployeeCount: empSummaries.filter((e) => e.lateCount > 0).length,
        totalLateMinutes,
        totalSettledWorkMinutes,
        workInstallmentCount,
        totalSettledSalaryMinutes,
        totalDeductionAmount,
        totalRemainingLateMinutes,
      },
    };
  }, [
    scopedEmployees,
    attendanceRecords,
    selectedMonth,
    settings?.shifts,
    monthScopedSettlements,
  ]);

  const lateShiftOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of lateLogDetails) {
      if (d.employee.shiftName) set.add(d.employee.shiftName);
    }
    return ['all', ...Array.from(set).sort()];
  }, [lateLogDetails]);

  const filteredLateLogDetails = useMemo(() => {
    const q = lateSearch.trim().toLowerCase();
    return lateLogDetails
      .filter((item) =>
        lateEmpFilter === 'all' ? true : item.employee.id === lateEmpFilter
      )
      .filter((item) =>
        lateShiftFilter === 'all' ? true : item.employee.shiftName === lateShiftFilter
      )
      .filter((item) => {
        if (!q) return true;
        return (
          item.employee.name.toLowerCase().includes(q) ||
          item.employee.employeeCode.toLowerCase().includes(q) ||
          item.employee.department.toLowerCase().includes(q) ||
          item.employee.shiftName.toLowerCase().includes(q) ||
          item.record.date.includes(q) ||
          (item.record.notes ?? '').toLowerCase().includes(q)
        );
      });
  }, [lateLogDetails, lateSearch, lateEmpFilter, lateShiftFilter]);

  const toggleExpandLateEmp = (empId: string) => {
    setExpandedLateEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  };

  const selectedFormSummary = useMemo(
    () => lateEmployeeSummaries.find((s) => s.employee.id === formEmpId) ?? null,
    [lateEmployeeSummaries, formEmpId]
  );

  const selectedFormEmployee = useMemo(
    () => employees.find((e) => e.id === formEmpId) ?? null,
    [employees, formEmpId]
  );

  const openSettlementModal = (employeeId?: string) => {
    const targetSummary =
      (employeeId
        ? lateEmployeeSummaries.find((s) => s.employee.id === employeeId)
        : lateEmployeeSummaries.find((s) => s.remainingLateMinutes > 0) ??
          lateEmployeeSummaries[0]) ?? null;

    const chosenEmpId =
      targetSummary?.employee.id ||
      employeeId ||
      scopedEmployees[0]?.id ||
      '';
    const chosenEmp = employees.find((e) => e.id === chosenEmpId);
    const remaining = targetSummary?.remainingLateMinutes ?? 0;
    const defaultMinutes = remaining > 0 ? Math.min(30, remaining) : 30;
    const shiftEnd = chosenEmp?.shiftEnd || '17:00';

    setFormEmpId(chosenEmpId);
    setFormMethod('tambahan_jam_kerja');
    setFormDate(getTodayDateStr());
    setFormMinutes(defaultMinutes);
    setFormExtraStart(shiftEnd);
    setFormExtraEnd(addMinutesToTimeStr(shiftEnd, defaultMinutes));
    setFormDeductionAmount(defaultMinutes * defaultRatePerMinute);
    setFormNotes('');
    setFormError(null);
    setSettlementModalOpen(true);
  };

  const handleModalEmployeeChange = (newEmpId: string) => {
    setFormEmpId(newEmpId);
    setFormError(null);
    const summary = lateEmployeeSummaries.find((s) => s.employee.id === newEmpId);
    const emp = employees.find((e) => e.id === newEmpId);
    const remaining = summary?.remainingLateMinutes ?? 0;
    const nextMin = remaining > 0 ? Math.min(30, remaining) : 30;
    setFormMinutes(nextMin);
    const shiftEnd = emp?.shiftEnd || '17:00';
    setFormExtraStart(shiftEnd);
    setFormExtraEnd(addMinutesToTimeStr(shiftEnd, nextMin));
    setFormDeductionAmount(nextMin * defaultRatePerMinute);
  };

  const handleMinutesChange = (val: number) => {
    const clean = Math.max(0, Math.round(val));
    setFormMinutes(clean);
    setFormError(null);
    if (formMethod === 'tambahan_jam_kerja' && formExtraStart && clean > 0) {
      setFormExtraEnd(addMinutesToTimeStr(formExtraStart, clean));
    }
    setFormDeductionAmount(clean * defaultRatePerMinute);
  };

  const handleExtraTimeRangeChange = (nextStart: string, nextEnd: string) => {
    setFormExtraStart(nextStart);
    setFormExtraEnd(nextEnd);
    setFormError(null);
    const diff = calculateTimeDiffMinutes(nextStart, nextEnd);
    if (diff > 0) {
      setFormMinutes(diff);
      setFormDeductionAmount(diff * defaultRatePerMinute);
    }
  };

  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formEmpId) {
      setFormError('Pilih karyawan terlebih dahulu.');
      return;
    }
    if (!formDate) {
      setFormError('Tanggal penggantian wajib diisi.');
      return;
    }
    if (!formMinutes || formMinutes <= 0) {
      setFormError('Jumlah menit keterlambatan yang diganti harus lebih dari 0.');
      return;
    }

    const remaining = selectedFormSummary?.remainingLateMinutes ?? 0;
    if (selectedFormSummary && remaining === 0) {
      setFormError(
        `${selectedFormSummary.employee.name} tidak memiliki sisa tunggakan keterlambatan pada periode ini.`
      );
      return;
    }
    if (selectedFormSummary && formMinutes > remaining) {
      setFormError(
        `Jumlah menit (${formMinutes} mnt) melebihi sisa keterlambatan (${remaining} mnt).`
      );
      return;
    }

    setSubmittingSettlement(true);
    try {
      const empName = selectedFormEmployee?.name || 'Karyawan';
      const defaultNote =
        formMethod === 'tambahan_jam_kerja'
          ? `Cicilan penggantian keterlambatan ${formMinutes} menit dengan tambahan jam kerja`
          : `Penyelesaian keterlambatan ${formMinutes} menit via potongan gaji (${formatRupiah(
              formDeductionAmount
            )})`;

      await createLateSettlement({
        employeeId: formEmpId,
        yearMonth: selectedMonth,
        date: formDate,
        method: formMethod,
        minutesSettled: formMinutes,
        extraWorkStart:
          formMethod === 'tambahan_jam_kerja' ? formExtraStart || undefined : undefined,
        extraWorkEnd:
          formMethod === 'tambahan_jam_kerja' ? formExtraEnd || undefined : undefined,
        deductionAmount:
          formMethod === 'potongan_gaji' ? formDeductionAmount : undefined,
        notes: formNotes.trim() || defaultNote,
      });

      if (onRefresh) await onRefresh();
      setSettlementModalOpen(false);
      const nextRemaining = Math.max(0, remaining - formMinutes);
      setBannerMessage(
        formMethod === 'tambahan_jam_kerja'
          ? `Ganti keterlambatan ${empName} sebesar ${formMinutes} menit (Tambahan Jam Kerja) dicatat. Sisa tunggakan: ${nextRemaining} menit.`
          : `Potongan gaji ${empName} untuk ${formMinutes} menit keterlambatan (${formatRupiah(
              formDeductionAmount
            )}) dicatat. Sisa tunggakan: ${nextRemaining} menit.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Gagal menyimpan data ganti keterlambatan.'
      );
    } finally {
      setSubmittingSettlement(false);
    }
  };

  const handleDeleteSettlement = async (settlement: LateSettlement) => {
    setDeletingSettlementId(settlement.id);
    setBannerMessage(null);
    try {
      await deleteLateSettlement(settlement.id);
      if (onRefresh) await onRefresh();
      setBannerMessage(
        `Catatan ganti keterlambatan ${settlement.employeeName} (${settlement.minutesSettled} menit) telah dihapus.`
      );
    } finally {
      setDeletingSettlementId(null);
    }
  };

  const handleExportMonthlyCsv = () => {
    const header = [
      'Kode',
      'Nama Karyawan',
      'Divisi',
      'Jadwal Libur Mingguan',
      'Hari Kerja Efektif',
      'Hadir',
      'Izin Terlambat',
      'Terlambat',
      'Izin/Sakit',
      'Alpha',
      'Total Jam Kerja',
      'Lembur Manual (Jam)',
      'Kehadiran (%)',
    ];
    const rows = summaries.map((s) => [
      s.employee.employeeCode,
      `"${s.employee.name.replace(/"/g, '""')}"`,
      `"${s.employee.department.replace(/"/g, '""')}"`,
      `"${formatOffDaysSummary(s.employee.offDays)}"`,
      s.effectiveWorkDays,
      s.hadirCount,
      s.izinTerlambatCount,
      s.terlambatCount,
      s.izinSakitCount,
      s.alphaCount,
      s.totalWorkHours.toFixed(1),
      s.manualOvertimeHours.toFixed(1),
      `${s.attendancePct}%`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-absensi-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportLatenessCsv = () => {
    const summaryHeader = [
      'Kode',
      'Nama Karyawan',
      'Divisi',
      'Shift',
      'Jam Shift',
      'Toleransi (Menit)',
      'Kali Terlambat',
      'Total Menit Terlambat',
      'Rincian Tanggal & Menit Terlambat',
      'Ganti Tambahan Jam Kerja (Menit)',
      'Potongan Gaji (Menit)',
      'Nominal Potongan Gaji (Rp)',
      'Sisa Tunggakan (Menit)',
      'Status Penyelesaian',
    ];
    const summaryRows = lateEmployeeSummaries.map((s) => {
      const datesText = s.lateLogs
        .map((l) => `${l.record.date} (+${l.lateMinutes} mnt)`)
        .join('; ');
      return [
        s.employee.employeeCode,
        `"${s.employee.name.replace(/"/g, '""')}"`,
        `"${s.employee.department.replace(/"/g, '""')}"`,
        `"${s.employee.shiftName.replace(/"/g, '""')}"`,
        `${s.employee.shiftStart}-${s.employee.shiftEnd}`,
        s.toleranceMinutes,
        s.lateCount,
        s.totalLateMinutes,
        `"${datesText.replace(/"/g, '""')}"`,
        s.workSettledMinutes,
        s.salarySettledMinutes,
        s.totalDeductionAmount,
        s.remainingLateMinutes,
        s.remainingLateMinutes === 0 ? 'Lunas' : 'Belum Lunas',
      ];
    });

    const settlementHeader = [
      'Tanggal Transaksi',
      'Karyawan',
      'Metode',
      'Menit Diganti',
      'Jam Tambahan',
      'Potongan Gaji (Rp)',
      'Catatan',
    ];
    const settlementRows = monthScopedSettlements.map((st) => [
      st.date,
      `"${st.employeeName.replace(/"/g, '""')}"`,
      st.method === 'tambahan_jam_kerja' ? 'Tambahan Jam Kerja' : 'Potongan Gaji',
      st.minutesSettled,
      st.extraWorkStart && st.extraWorkEnd
        ? `${st.extraWorkStart}-${st.extraWorkEnd}`
        : '-',
      st.deductionAmount || 0,
      `"${(st.notes || '').replace(/"/g, '""')}"`,
    ]);

    const detailHeader = [
      'Tanggal',
      'Kode',
      'Nama Karyawan',
      'Divisi',
      'Nama Shift',
      'Jam Shift',
      'Jam Masuk Aktual',
      'Terlambat (Menit)',
      'Catatan',
    ];
    const detailRows = lateLogDetails.map((d) => [
      d.record.date,
      d.employee.employeeCode,
      `"${d.employee.name.replace(/"/g, '""')}"`,
      `"${d.employee.department.replace(/"/g, '""')}"`,
      `"${d.employee.shiftName.replace(/"/g, '""')}"`,
      `${d.employee.shiftStart}-${d.employee.shiftEnd}`,
      d.record.checkIn || '-',
      d.lateMinutes,
      `"${(d.record.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csv = [
      `REKAP RINGKASAN & PENYELESAIAN KETERLAMBATAN KARYAWAN - ${selectedMonth}`,
      summaryHeader.join(','),
      ...summaryRows.map((r) => r.join(',')),
      '',
      `RIWAYAT CICILAN & POTONGAN GAJI KETERLAMBATAN - ${selectedMonth}`,
      settlementHeader.join(','),
      ...settlementRows.map((r) => r.join(',')),
      '',
      `RINCIAN LOG TANGGAL TERLAMBAT - ${selectedMonth}`,
      detailHeader.join(','),
      ...detailRows.map((r) => r.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rekap-keterlambatan-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const companyProfile = settings?.companyProfile;
  const companyDisplayName =
    companyProfile?.legalName || settings?.companyName || 'KARYAPRESENSI';

  return (
    <div className="space-y-6">
      {/* Print-Only Official Company Letterhead */}
      <div className="hidden print:flex items-center justify-between gap-4 pb-4 border-b-2 border-slate-900">
        <div className="flex items-center gap-4">
          {companyProfile?.logoDataUrl && (
            <img
              src={companyProfile.logoDataUrl}
              alt={companyDisplayName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-contain"
            />
          )}
          <div>
            <div className="font-display text-lg font-bold text-slate-950 uppercase">
              {companyDisplayName}
            </div>
            {companyProfile?.address && (
              <div className="text-xs text-slate-700">
                {companyProfile.address}
                {companyProfile.city ? `, ${companyProfile.city}` : ''}
                {companyProfile.postalCode ? ` ${companyProfile.postalCode}` : ''}
              </div>
            )}
            <div className="text-[11px] font-mono text-slate-600">
              {[
                companyProfile?.phone ? `Telp: ${companyProfile.phone}` : '',
                companyProfile?.email,
                companyProfile?.website,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-700">
          <div className="font-semibold">Laporan HRD Bulanan</div>
          <div className="font-mono">{formatIndonesianMonth(selectedMonth)}</div>
        </div>
      </div>

      {/* Sub-navigation Tabs + Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('kehadiran')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'kehadiran'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Rekap Kehadiran &amp; Lembur</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('terlambat')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'terlambat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Rekap Karyawan Terlambat</span>
              <span
                className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                  lateStats.totalRemainingLateMinutes > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {lateStats.totalLateCount}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Periode aktif:{' '}
            <span className="font-semibold text-slate-800">
              {formatIndonesianMonth(selectedMonth)}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <label className="sr-only" htmlFor="month-select">
                Periode Bulan
              </label>
              <input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Filter Divisi"
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="all">Semua Divisi</option>
              {departments
                .filter((d) => d !== 'all')
                .map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
            </select>

            {deptFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setDeptFilter('all')}
                className="px-2.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset Divisi
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeTab === 'terlambat' && (
              <button
                type="button"
                onClick={() => openSettlementModal()}
                disabled={lateEmployeeSummaries.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Catat Ganti Keterlambatan</span>
              </button>
            )}

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('matriks')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Lihat Tampilan Matriks</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>

            {activeTab === 'kehadiran' ? (
              <button
                type="button"
                onClick={handleExportMonthlyCsv}
                disabled={summaries.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportLatenessCsv}
                disabled={lateLogDetails.length === 0 && monthScopedSettlements.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV Keterlambatan</span>
              </button>
            )}

            <button
              type="button"
              disabled={exportingExcel || scopedEmployees.length === 0}
              onClick={async () => {
                setExportingExcel(true);
                try {
                  await exportAttendanceMatrixToExcel({
                    employees: scopedEmployees,
                    attendanceRecords,
                    lateSettlements,
                    shifts: settings?.shifts,
                    yearMonth: selectedMonth,
                    departmentFilter: deptFilter,
                    companyName: settings?.companyName,
                    companySubtitle: settings?.companySubtitle,
                    companyProfile: settings?.companyProfile,
                  });
                } finally {
                  setExportingExcel(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{exportingExcel ? 'Menyiapkan...' : 'Ekspor Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {bannerMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'kehadiran' ? (
        <>
          {/* Print Header & Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Laporan Rekapitulasi Kehadiran &amp; Lembur — {formatIndonesianMonth(selectedMonth)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hari kerja efektif dihitung otomatis berdasarkan hari libur individu masing-masing karyawan
                </p>
              </div>
              <span className="font-mono text-xs text-slate-600 tabular-nums">
                {summaries.length} Karyawan
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="text-xs font-medium text-slate-500">Total Kehadiran Tercatat</div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {aggregate.totalPresent} <span className="text-xs font-normal text-slate-500">hari</span>
                </div>
              </div>
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="text-xs font-medium text-slate-500">Total Keterlambatan</div>
                <div className="mt-2 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                  {aggregate.totalLate} <span className="text-xs font-normal text-slate-500">kali</span>
                </div>
                {aggregate.totalIzinTerlambat > 0 && (
                  <div className="mt-1 text-[11px] font-medium text-teal-700 font-mono tabular-nums">
                    + {aggregate.totalIzinTerlambat} izin datang terlambat
                  </div>
                )}
              </div>
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="text-xs font-medium text-slate-500">Akumulasi Jam Kerja</div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {aggregate.totalWorkHours.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-500">jam</span>
                </div>
              </div>
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="text-xs font-medium text-slate-500">Total Lembur Manual</div>
                <div className="mt-2 font-mono text-2xl font-bold text-blue-700 tabular-nums">
                  {aggregate.totalOtHours.toFixed(1)}{' '}
                  <span className="text-xs font-normal text-slate-500">jam</span>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Attendance Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((r) => (
                  <div key={r} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : summaries.length === 0 ? (
              <div className="py-14 px-6 text-center text-sm text-slate-500">
                Belum ada data karyawan untuk periode ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Hari Libur</th>
                      <th className="py-3 px-3 text-right">Wajib Kerja</th>
                      <th className="py-3 px-3 text-right">Hadir</th>
                      <th className="py-3 px-3 text-right">Izin Telat</th>
                      <th className="py-3 px-3 text-right">Terlambat</th>
                      <th className="py-3 px-3 text-right">Izin/Sakit</th>
                      <th className="py-3 px-3 text-right">Alpha</th>
                      <th className="py-3 px-3 text-right">Jam Kerja</th>
                      <th className="py-3 px-3 text-right">Lembur</th>
                      <th className="py-3 px-4 text-right">Rasio Hadir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {summaries.map((row) => (
                      <tr key={row.employee.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{row.employee.name}</div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">{row.employee.employeeCode}</span> ·{' '}
                            {row.employee.department}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {formatOffDaysSummary(row.employee.offDays)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                          {row.effectiveWorkDays} hr
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                          {row.hadirCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-teal-700 tabular-nums">
                          {row.izinTerlambatCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-amber-700 tabular-nums">
                          {row.terlambatCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-sky-700 tabular-nums">
                          {row.izinSakitCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-red-700 tabular-nums">
                          {row.alphaCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-slate-800 tabular-nums">
                          {row.totalWorkHours.toFixed(1)} j
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-semibold text-blue-700 tabular-nums">
                          {row.manualOvertimeHours.toFixed(1)} j
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {row.attendancePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* TAB: REKAP DATA KARYAWAN TERLAMBAT & GANTI KETERLAMBATAN */
        <div className="space-y-6">
          {/* Summary Header + 4 KPI Cards */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Rekapitulasi &amp; Penyelesaian Keterlambatan — {formatIndonesianMonth(selectedMonth)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Keterlambatan dapat diganti secara bertahap (dicicil) melalui tambahan jam kerja maupun diselesaikan via potongan gaji
                </p>
              </div>
              <span className="font-mono text-xs text-amber-700 font-semibold tabular-nums">
                {lateStats.lateEmployeeCount} dari {scopedEmployees.length} Karyawan
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Total Keterlambatan</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {lateStats.totalLateMinutes}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    mnt ({lateStats.totalLateCount}x)
                  </span>
                </div>
              </div>

              <div className="p-5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <div className="flex items-center justify-between text-xs font-medium text-blue-800">
                  <span>Diganti Jam Kerja (Cicilan)</span>
                  <Clock className="w-3.5 h-3.5 text-blue-700" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-blue-900 tabular-nums">
                  {lateStats.totalSettledWorkMinutes}{' '}
                  <span className="text-xs font-normal text-blue-700">
                    mnt ({lateStats.workInstallmentCount} cicilan)
                  </span>
                </div>
              </div>

              <div className="p-5 bg-rose-50/70 border border-rose-200/80 rounded-xl">
                <div className="flex items-center justify-between text-xs font-medium text-rose-800">
                  <span>Diganti Potongan Gaji</span>
                  <Banknote className="w-3.5 h-3.5 text-rose-700" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-rose-900 tabular-nums">
                  {lateStats.totalSettledSalaryMinutes}{' '}
                  <span className="text-xs font-normal text-rose-700">
                    mnt ({formatRupiah(lateStats.totalDeductionAmount)})
                  </span>
                </div>
              </div>

              <div
                className={`p-5 border rounded-xl ${
                  lateStats.totalRemainingLateMinutes > 0
                    ? 'bg-amber-50/80 border-amber-200'
                    : 'bg-emerald-50/80 border-emerald-200'
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-medium ${
                    lateStats.totalRemainingLateMinutes > 0
                      ? 'text-amber-800'
                      : 'text-emerald-800'
                  }`}
                >
                  <span>Sisa Tunggakan Keterlambatan</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                    lateStats.totalRemainingLateMinutes > 0
                      ? 'text-amber-900'
                      : 'text-emerald-900'
                  }`}
                >
                  {lateStats.totalRemainingLateMinutes}{' '}
                  <span className="text-xs font-normal">
                    mnt ({formatMinutesAsHoursMinutes(lateStats.totalRemainingLateMinutes)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Per-Employee Lateness & Installment Settlement Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Ringkasan &amp; Saldo Cicilan Keterlambatan Per Karyawan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pantau akumulasi keterlambatan, total yang sudah dicicil dengan jam kerja atau potongan gaji, serta sisa tunggakan
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {lateEmployeeSummaries.length} Karyawan
              </span>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((r) => (
                  <div key={r} className="h-10 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : lateEmployeeSummaries.length === 0 ? (
              <div className="py-12 px-6 text-center text-sm text-slate-500">
                Tidak ada data keterlambatan karyawan pada periode{' '}
                <span className="font-semibold text-slate-700">
                  {formatIndonesianMonth(selectedMonth)}
                </span>
                .
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Shift &amp; Jadwal</th>
                      <th className="py-3 px-4">Tanggal &amp; Menit Terlambat</th>
                      <th className="py-3 px-3 text-right">Total Telat</th>
                      <th className="py-3 px-3 text-right">Ganti Jam Kerja</th>
                      <th className="py-3 px-3 text-right">Potongan Gaji</th>
                      <th className="py-3 px-3 text-right">Sisa Tunggakan</th>
                      <th className="py-3 px-4 text-right no-print">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {lateEmployeeSummaries.map((row) => {
                      const isExpanded = expandedLateEmpIds.has(row.employee.id);
                      const visibleDates = row.lateLogs.slice(0, 3);
                      const extraCount = Math.max(0, row.lateLogs.length - 3);

                      return (
                        <React.Fragment key={row.employee.id}>
                          <tr className="hover:bg-amber-50/20 align-top">
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{row.employee.name}</div>
                              <div className="text-xs text-slate-500">
                                <span className="font-mono">{row.employee.employeeCode}</span> ·{' '}
                                {row.employee.department}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{row.employee.shiftName}</div>
                              <div className="font-mono text-slate-500 tabular-nums">
                                {row.employee.shiftStart}–{row.employee.shiftEnd} · Tol. {row.toleranceMinutes} mnt
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              {row.lateLogs.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="space-y-1">
                                  <div className="space-y-0.5 font-mono tabular-nums text-slate-700">
                                    {visibleDates.map((entry) => (
                                      <div key={entry.record.id} className="flex items-center gap-2 whitespace-nowrap">
                                        <span className="text-slate-700">{entry.record.date}</span>
                                        <span className="text-slate-400">·</span>
                                        <span className="font-semibold text-amber-800">
                                          +{entry.lateMinutes} mnt
                                        </span>
                                        <span className="text-slate-400 text-[11px]">
                                          (masuk {entry.record.checkIn || '—'})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  {(row.lateLogs.length > 0) && (
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandLateEmp(row.employee.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 cursor-pointer no-print"
                                    >
                                      {isExpanded ? (
                                        <>
                                          <ChevronUp className="w-3.5 h-3.5" />
                                          <span>Tutup rincian</span>
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="w-3.5 h-3.5" />
                                          <span>
                                            {extraCount > 0
                                              ? `Lihat semua ${row.lateLogs.length} tanggal (+${extraCount} lagi)`
                                              : `Lihat detail shift & catatan (${row.lateLogs.length})`}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-amber-800">
                                +{row.totalLateMinutes} mnt
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {row.lateCount}x · Terlama +{row.maxLateMinutes}m
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-blue-700">
                                {row.workSettledMinutes > 0 ? `${row.workSettledMinutes} mnt` : '0 mnt'}
                              </div>
                              {row.workInstallmentCount > 0 && (
                                <div className="text-[11px] text-slate-500">
                                  {row.workInstallmentCount} cicilan
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              <div className="font-semibold text-rose-700">
                                {row.salarySettledMinutes > 0
                                  ? `${row.salarySettledMinutes} mnt`
                                  : '0 mnt'}
                              </div>
                              {row.totalDeductionAmount > 0 && (
                                <div className="text-[11px] text-slate-500">
                                  {formatRupiah(row.totalDeductionAmount)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                              {row.remainingLateMinutes === 0 ? (
                                <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                  Lunas (0 mnt)
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                                  {row.remainingLateMinutes} mnt
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right no-print whitespace-nowrap">
                              <button
                                type="button"
                                disabled={row.remainingLateMinutes === 0}
                                onClick={() => openSettlementModal(row.employee.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Ganti / Cicil</span>
                              </button>
                            </td>
                          </tr>

                          {isExpanded && row.lateLogs.length > 0 && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={8} className="px-4 py-3 border-t border-slate-200/70">
                                <div className="text-xs font-semibold text-slate-800 mb-2">
                                  Rincian Keterlambatan {row.employee.name} ({row.lateLogs.length} kejadian)
                                </div>
                                <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                                        <th className="py-2 px-3">Tanggal</th>
                                        <th className="py-2 px-3">Shift</th>
                                        <th className="py-2 px-3">Jam Shift</th>
                                        <th className="py-2 px-3">Jam Masuk Aktual</th>
                                        <th className="py-2 px-3 text-right">Terlambat</th>
                                        <th className="py-2 px-3">Catatan</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {row.lateLogs.map((entry) => (
                                        <tr key={entry.record.id} className="hover:bg-slate-50/60">
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="font-mono font-semibold text-slate-800">
                                              {entry.record.date}
                                            </span>
                                            <span className="text-slate-500 ml-2">
                                              {formatIndonesianDate(entry.record.date)}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                                            {entry.employee.shiftName}
                                          </td>
                                          <td className="py-2 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                                            {entry.employee.shiftStart}–{entry.employee.shiftEnd} (tol. {entry.toleranceMinutes}m)
                                          </td>
                                          <td className="py-2 px-3 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                            {entry.record.checkIn || '—'}
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono font-semibold text-amber-800 tabular-nums whitespace-nowrap">
                                            +{entry.lateMinutes} mnt
                                          </td>
                                          <td className="py-2 px-3 text-slate-600">
                                            {entry.record.notes || '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Installment & Settlement History Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Riwayat Cicilan Jam Kerja &amp; Potongan Gaji Keterlambatan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar transaksi penggantian keterlambatan yang dicatat Admin pada periode {formatIndonesianMonth(selectedMonth)}
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {monthScopedSettlements.length} Transaksi
              </span>
            </div>

            {monthScopedSettlements.length === 0 ? (
              <div className="py-10 px-6 text-center text-xs text-slate-500">
                Belum ada catatan penggantian keterlambatan (tambahan jam kerja atau potongan gaji) pada bulan ini. Klik{' '}
                <span className="font-semibold text-slate-700">Ganti / Cicil</span> pada baris karyawan untuk mencatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Tanggal Ganti</th>
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Metode Penyelesaian</th>
                      <th className="py-3 px-3 text-right">Menit Diganti</th>
                      <th className="py-3 px-4">Jam Tambahan / Potongan</th>
                      <th className="py-3 px-4">Catatan</th>
                      <th className="py-3 px-4 text-right no-print">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {monthScopedSettlements.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-xs font-semibold text-slate-800">
                            {st.date}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatIndonesianDate(st.date)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {st.employeeName}
                        </td>
                        <td className="py-3 px-4">
                          {st.method === 'tambahan_jam_kerja' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                              <Clock className="w-3 h-3" />
                              Tambahan Jam Kerja
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 rounded-md">
                              <Banknote className="w-3 h-3" />
                              Potongan Gaji
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {st.minutesSettled} mnt
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">
                          {st.method === 'tambahan_jam_kerja'
                            ? st.extraWorkStart && st.extraWorkEnd
                              ? `${st.extraWorkStart} – ${st.extraWorkEnd}`
                              : 'Jam tambahan manual'
                            : formatRupiah(st.deductionAmount || 0)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                          {st.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-right no-print">
                          <button
                            type="button"
                            disabled={deletingSettlementId === st.id}
                            onClick={() => handleDeleteSettlement(st)}
                            aria-label={`Hapus transaksi ${st.employeeName}`}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chronological Detailed Lateness Log Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Rincian Log Tanggal Terlambat
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Catatan detail tanggal, shift kerja, jam masuk aktual, dan menit keterlambatan tiap kejadian
                </p>
              </div>

              {lateLogDetails.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 no-print">
                  <div className="w-56">
                    <SearchableEmployeeSelect
                      value={lateEmpFilter}
                      onChange={setLateEmpFilter}
                      allowAll
                      allLabel="Semua Karyawan Terlambat"
                      options={lateEmployeeSummaries.map((s) => ({
                        id: s.employee.id,
                        code: s.employee.employeeCode,
                        name: s.employee.name,
                        department: s.employee.department,
                        subtitle: `${s.employee.shiftName} · ${s.lateCount}x telat`,
                      }))}
                      placeholder="Filter karyawan..."
                    />
                  </div>

                  <select
                    value={lateShiftFilter}
                    onChange={(e) => setLateShiftFilter(e.target.value)}
                    aria-label="Filter Shift"
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    <option value="all">Semua Shift</option>
                    {lateShiftOptions
                      .filter((s) => s !== 'all')
                      .map((shiftName) => (
                        <option key={shiftName} value={shiftName}>
                          {shiftName}
                        </option>
                      ))}
                  </select>

                  <div className="relative w-full sm:w-52">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={lateSearch}
                      onChange={(e) => setLateSearch(e.target.value)}
                      placeholder="Cari tanggal, shift, catatan..."
                      className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    {lateSearch && (
                      <button
                        type="button"
                        onClick={() => setLateSearch('')}
                        aria-label="Hapus pencarian"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {(lateEmpFilter !== 'all' ||
                    lateShiftFilter !== 'all' ||
                    lateSearch !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setLateEmpFilter('all');
                        setLateShiftFilter('all');
                        setLateSearch('');
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              )}
            </div>

            {filteredLateLogDetails.length === 0 ? (
              <div className="py-10 px-6 text-center text-xs text-slate-500">
                {lateLogDetails.length === 0
                  ? 'Belum ada log keterlambatan pada periode yang dipilih.'
                  : 'Tidak ada log keterlambatan yang cocok dengan filter yang dipilih.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Shift &amp; Jam Kerja</th>
                      <th className="py-3 px-4">Jam Masuk Aktual</th>
                      <th className="py-3 px-4 text-right">Terlambat</th>
                      <th className="py-3 px-4">Catatan Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredLateLogDetails.map((item) => (
                      <tr key={item.record.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-xs font-semibold text-slate-800">
                            {item.record.date}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatIndonesianDate(item.record.date)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {item.employee.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">{item.employee.employeeCode}</span> ·{' '}
                            {item.employee.department}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-800">
                            {item.employee.shiftName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {item.employee.shiftStart}–{item.employee.shiftEnd} (tol. {item.toleranceMinutes}m)
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {item.record.checkIn || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                            +{item.lateMinutes} mnt
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                          {item.record.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Authorized Late Arrival Permit Audit Table */}
          {latePermitLogs.length > 0 && (
            <div className="bg-white border border-teal-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-teal-100 bg-teal-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-teal-950">
                    Riwayat Izin Datang Terlambat Resmi ({latePermitLogs.length} Catatan)
                  </h3>
                  <p className="text-xs text-teal-800 mt-0.5">
                    Izin resmi masuk terlambat yang disetujui — tetap dihitung hadir &amp; bebas denda keterlambatan
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white border border-teal-200 text-teal-800 whitespace-nowrap shrink-0">
                  Bebas Potongan Gaji
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Est. Tiba / Aktual</th>
                      <th className="py-3 px-4">Alasan Izin</th>
                      <th className="py-3 px-4">Disetujui Oleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {latePermitLogs.map((item) => (
                      <tr key={item.record.id} className="hover:bg-teal-50/30">
                        <td className="py-3 px-4 font-mono text-xs text-slate-800 whitespace-nowrap">
                          {item.record.date}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {item.employee.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">{item.employee.employeeCode}</span> ·{' '}
                            {item.employee.department}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-teal-800 whitespace-nowrap tabular-nums">
                          {item.record.checkIn
                            ? `Aktual ${item.record.checkIn}`
                            : item.record.latePermitEstimatedArrival
                            ? `Est. ${item.record.latePermitEstimatedArrival}`
                            : '—'}
                          {item.diffMins > 0 && (
                            <span className="ml-1.5 text-slate-500">
                              (+{item.diffMins} mnt)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-800 max-w-xs">
                          {item.record.latePermitReason || item.record.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {item.record.latePermitApprovedBy || 'Admin HR'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print-Only HRD Sign-off Block */}
      {companyProfile?.hrManagerName && (
        <div className="hidden print:flex justify-end pt-8">
          <div className="w-64 text-center text-xs text-slate-800">
            <div>
              {companyProfile.city ? `${companyProfile.city.split(',')[0]}, ` : ''}
              {formatIndonesianDate(getTodayDateStr())}
            </div>
            <div className="font-semibold mt-1">
              {companyProfile.hrManagerTitle || 'Manajer Sumber Daya Manusia'}
            </div>
            <div className="h-16" />
            <div className="font-bold underline underline-offset-4">
              {companyProfile.hrManagerName}
            </div>
            {companyDisplayName && (
              <div className="text-[11px] text-slate-600 mt-0.5">{companyDisplayName}</div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Ganti Keterlambatan (Cicilan Tambahan Jam Kerja / Potongan Gaji) */}
      {settlementModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settlement-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div>
                <h3
                  id="settlement-modal-title"
                  className="font-display text-base font-semibold text-slate-900"
                >
                  Ganti / Cicil Keterlambatan Karyawan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Periode {formatIndonesianMonth(selectedMonth)} — Dapat dicicil sebagian atau dilunasi sekaligus
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettlementModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSettlement} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                  {formError}
                </div>
              )}

              {/* Searchable Employee Picker */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cari &amp; Pilih Karyawan
                </label>
                <SearchableEmployeeSelect
                  value={formEmpId}
                  onChange={handleModalEmployeeChange}
                  options={lateEmployeeSummaries.map((s) => ({
                    id: s.employee.id,
                    code: s.employee.employeeCode,
                    name: s.employee.name,
                    department: s.employee.department,
                    subtitle: `${s.employee.department} · Telat ${s.totalLateMinutes} mnt`,
                    badgeText:
                      s.remainingLateMinutes === 0
                        ? 'Lunas'
                        : `Sisa ${s.remainingLateMinutes} mnt`,
                    badgeTone: s.remainingLateMinutes === 0 ? 'emerald' : 'amber',
                  }))}
                  placeholder="Cari nama atau kode karyawan..."
                />
              </div>

              {/* Balance Breakdown Box */}
              {selectedFormSummary && (
                <div className="grid grid-cols-3 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div>
                    <div className="text-slate-500">Total Telat</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                      {selectedFormSummary.totalLateMinutes} mnt
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Sudah Diganti</div>
                    <div className="font-mono font-bold text-blue-700 mt-0.5 tabular-nums">
                      {selectedFormSummary.totalSettledMinutes} mnt
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Sisa Tunggakan</div>
                    <div
                      className={`font-mono font-bold mt-0.5 tabular-nums ${
                        selectedFormSummary.remainingLateMinutes > 0
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {selectedFormSummary.remainingLateMinutes} mnt
                    </div>
                  </div>
                </div>
              )}

              {/* Method Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Metode Penggantian
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormMethod('tambahan_jam_kerja');
                      setFormError(null);
                    }}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      formMethod === 'tambahan_jam_kerja'
                        ? 'bg-blue-50 border-blue-600 text-blue-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                      <span>Tambahan Jam Kerja</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Bekerja lebih lama (bisa dicicil bertahap)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormMethod('potongan_gaji');
                      setFormDeductionAmount(formMinutes * defaultRatePerMinute);
                      setFormError(null);
                    }}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      formMethod === 'potongan_gaji'
                        ? 'bg-rose-50 border-rose-600 text-rose-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Banknote className="w-4 h-4 text-rose-700 shrink-0" />
                      <span>Potongan Gaji</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Tutup tunggakan dengan pemotongan gaji
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Pelaksanaan
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jumlah Menit Diganti (Cicilan)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={formMinutes || ''}
                    onChange={(e) => handleMinutesChange(Number(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Quick installment buttons */}
              {selectedFormSummary && selectedFormSummary.remainingLateMinutes > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 mr-1">Pilih cepat:</span>
                  {[15, 30, 45, 60]
                    .filter((m) => m < selectedFormSummary.remainingLateMinutes)
                    .map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleMinutesChange(preset)}
                        className="px-2.5 py-1 text-xs font-mono font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 cursor-pointer"
                      >
                        {preset} mnt
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() =>
                      handleMinutesChange(selectedFormSummary.remainingLateMinutes)
                    }
                    className="px-2.5 py-1 text-xs font-mono font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 cursor-pointer"
                  >
                    Lunasi Semua ({selectedFormSummary.remainingLateMinutes} mnt)
                  </button>
                </div>
              )}

              {/* Method-specific fields */}
              {formMethod === 'tambahan_jam_kerja' ? (
                <div className="p-3 bg-blue-50/50 border border-blue-200/80 rounded-lg space-y-2.5">
                  <div className="text-xs font-medium text-blue-950">
                    Rentang Jam Kerja Tambahan (Opsional — otomatis menghitung menit)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Mulai Tambahan
                      </label>
                      <input
                        type="time"
                        value={formExtraStart}
                        onChange={(e) =>
                          handleExtraTimeRangeChange(e.target.value, formExtraEnd)
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Selesai Tambahan
                      </label>
                      <input
                        type="time"
                        value={formExtraEnd}
                        onChange={(e) =>
                          handleExtraTimeRangeChange(formExtraStart, e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 text-sm font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-rose-50/50 border border-rose-200/80 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-rose-950">
                      Nominal Potongan Gaji (Rp)
                    </label>
                    <span className="text-[11px] font-mono text-rose-700">
                      Tarif default: {formatRupiah(defaultRatePerMinute)}/mnt
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={formDeductionAmount}
                    onChange={(e) =>
                      setFormDeductionAmount(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-rose-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Admin
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  maxLength={250}
                  placeholder={
                    formMethod === 'tambahan_jam_kerja'
                      ? 'Contoh: Cicil 30 mnt hari ini (selesai stok opname)'
                      : 'Contoh: Potong gaji periode bulan berjalan'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              {/* Live Calculation Preview */}
              {selectedFormSummary && formMinutes > 0 && (
                <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs flex items-center justify-between gap-3">
                  <span>Sisa tunggakan setelah transaksi ini:</span>
                  <span className="font-mono font-bold tabular-nums">
                    {Math.max(0, selectedFormSummary.remainingLateMinutes - formMinutes) === 0
                      ? '0 mnt (LUNAS)'
                      : `${Math.max(
                          0,
                          selectedFormSummary.remainingLateMinutes - formMinutes
                        )} mnt (masih bisa dicicil)`}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettlementModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingSettlement}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {submittingSettlement ? 'Menyimpan...' : 'Simpan Penggantian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
