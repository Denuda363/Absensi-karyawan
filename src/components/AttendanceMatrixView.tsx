import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  Clock,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  ATTENDANCE_STATUS_META,
  AttendanceRecord,
  AttendanceStatus,
  calculateLatenessMinutes,
  calculateWorkDurationLabel,
  Employee,
  evaluateLateness,
  formatOffDaysSummary,
  getCurrentTimeStr,
  getCurrentYearMonth,
  getDayNameIndonesian,
  getDaysInMonth,
  getEmployeeShiftTolerance,
  getMonthMetadata,
  getTodayDateStr,
  isEmployeeOffDay,
  LATE_PERMIT_REASON_PRESETS,
  LateSettlement,
  statusToMatrixCode,
} from '../types';
import {
  bulkMarkScheduledOffDays,
  createAttendanceRecord,
  deleteAttendanceRecord,
  updateAttendanceRecord,
} from '../services/attendanceService';
import { exportAttendanceMatrixToExcel } from '../utils/excelAttendanceExport';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';

interface AttendanceMatrixViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements?: LateSettlement[];
  settings?: AppSettings;
  loading: boolean;
  onRefresh: () => Promise<void>;
  preselectedEmployeeId?: string | null;
  preselectedStatus?: AttendanceStatus | null;
  onClearPreselect?: () => void;
}

type MatrixSubTab = 'matriks' | 'log';

const STATUS_OPTIONS: AttendanceStatus[] = [
  'hadir',
  'terlambat',
  'izin_terlambat',
  'izin',
  'sakit',
  'alpha',
  'libur',
];

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [sh, sm] = timeStr.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return '09:00';
  const total = (sh * 60 + sm + minutesToAdd) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const AttendanceMatrixView: React.FC<AttendanceMatrixViewProps> = ({
  employees,
  attendanceRecords,
  lateSettlements = [],
  settings,
  loading,
  onRefresh,
  preselectedEmployeeId,
  preselectedStatus,
  onClearPreselect,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<MatrixSubTab>('matriks');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exporting, setExporting] = useState<boolean>(false);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Log Catatan Absensi filters & quick-action state
  const [logSelectedDate, setLogSelectedDate] = useState<string>(getTodayDateStr());
  const [logShowAllDates, setLogShowAllDates] = useState<boolean>(false);
  const [logEmployeeFilter, setLogEmployeeFilter] = useState<string>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [logBusyId, setLogBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);

  // Quick cell edit modal
  const [cellModal, setCellModal] = useState<{
    employee: Employee;
    date: string;
    record: AttendanceRecord | null;
  } | null>(null);
  const [formStatus, setFormStatus] = useState<AttendanceStatus>('hadir');
  const [formCheckIn, setFormCheckIn] = useState<string>('08:00');
  const [formCheckOut, setFormCheckOut] = useState<string>('17:00');
  const [formOvertimeHours, setFormOvertimeHours] = useState<string>('0');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formLatePermitReason, setFormLatePermitReason] = useState<string>('');
  const [formLatePermitEstArrival, setFormLatePermitEstArrival] = useState<string>('09:00');
  const [formLatePermitApprovedBy, setFormLatePermitApprovedBy] = useState<string>('Admin HR');
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Full Admin Input Modal directly on Matrix page (with Searchable Employee Picker)
  const [inputModalOpen, setInputModalOpen] = useState<boolean>(false);
  const [inputEmpId, setInputEmpId] = useState<string>('');
  const [inputEmpQuery, setInputEmpQuery] = useState<string>('');
  const [inputDate, setInputDate] = useState<string>(getTodayDateStr());
  const [inputStatus, setInputStatus] = useState<AttendanceStatus>('hadir');
  const [inputCheckIn, setInputCheckIn] = useState<string>('08:00');
  const [inputCheckOut, setInputCheckOut] = useState<string>('17:00');
  const [inputOvertimeHours, setInputOvertimeHours] = useState<string>('0');
  const [inputNotes, setInputNotes] = useState<string>('');
  const [inputLatePermitReason, setInputLatePermitReason] = useState<string>('');
  const [inputLatePermitEstArrival, setInputLatePermitEstArrival] = useState<string>('09:00');
  const [inputLatePermitApprovedBy, setInputLatePermitApprovedBy] = useState<string>('Admin HR');
  const [inputSaving, setInputSaving] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const meta = useMemo(() => getMonthMetadata(selectedMonth), [selectedMonth]);
  const days = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth]);

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

  const scopedEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeEmployees
      .filter((e) => (deptFilter === 'all' ? true : e.department === deptFilter))
      .filter((e) => {
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q)
        );
      });
  }, [activeEmployees, deptFilter, searchQuery]);

  const modalFilteredEmployees = useMemo(() => {
    const q = inputEmpQuery.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
    );
  }, [activeEmployees, inputEmpQuery]);

  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendanceRecords) {
      if (r.date.startsWith(selectedMonth)) {
        map.set(`${r.employeeId}__${r.date}`, r);
      }
    }
    return map;
  }, [attendanceRecords, selectedMonth]);

  // If navigated from Dashboard "Izin Telat" or "Input Detail", open input modal directly
  useEffect(() => {
    if (activeEmployees.length === 0) return;
    if (preselectedEmployeeId || preselectedStatus) {
      const emp =
        (preselectedEmployeeId
          ? activeEmployees.find((e) => e.id === preselectedEmployeeId)
          : activeEmployees[0]) || null;
      if (emp) {
        const today = getTodayDateStr();
        const off = isEmployeeOffDay(emp, today);
        const targetStatus: AttendanceStatus =
          preselectedStatus ?? (off.isOff ? 'libur' : 'hadir');
        setInputEmpQuery('');
        setInputEmpId(emp.id);
        setInputDate(today);
        setInputStatus(targetStatus);
        setInputCheckIn(targetStatus === 'izin_terlambat' ? '' : emp.shiftStart);
        setInputCheckOut(emp.shiftEnd);
        setInputOvertimeHours('0');
        setInputNotes('');
        setInputLatePermitReason('');
        setInputLatePermitEstArrival(addMinutesToTime(emp.shiftStart, 60));
        setInputLatePermitApprovedBy('Admin HR');
        setInputError(null);
        setInputModalOpen(true);
      }
      onClearPreselect?.();
    }
  }, [preselectedEmployeeId, preselectedStatus, activeEmployees, onClearPreselect]);

  const filteredLogRecords = useMemo(() => {
    return attendanceRecords
      .filter((rec) => {
        const emp = employees.find((e) => e.id === rec.employeeId);
        if (deptFilter !== 'all' && emp?.department !== deptFilter) return false;
        if (logShowAllDates) {
          if (!rec.date.startsWith(selectedMonth)) return false;
        } else if (rec.date !== logSelectedDate) {
          return false;
        }
        if (logEmployeeFilter !== 'all' && rec.employeeId !== logEmployeeFilter) return false;
        if (logStatusFilter !== 'all' && rec.status !== logStatusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = rec.employeeName.toLowerCase().includes(q);
          const matchNotes = (rec.notes || '').toLowerCase().includes(q);
          const matchPermit = (rec.latePermitReason || '').toLowerCase().includes(q);
          const matchCode = emp ? emp.employeeCode.toLowerCase().includes(q) : false;
          const matchDept = emp ? emp.department.toLowerCase().includes(q) : false;
          if (!matchName && !matchNotes && !matchPermit && !matchCode && !matchDept) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.checkIn || '').localeCompare(a.checkIn || '');
      });
  }, [
    attendanceRecords,
    employees,
    deptFilter,
    selectedMonth,
    logShowAllDates,
    logSelectedDate,
    logEmployeeFilter,
    logStatusFilter,
    searchQuery,
  ]);

  const matrixData = useMemo(() => {
    const daySums = days.map(() => ({ h: 0, i: 0, s: 0, a: 0, total: 0 }));
    let grandH = 0;
    let grandI = 0;
    let grandS = 0;
    let grandA = 0;

    const rows = scopedEmployees.map((emp) => {
      let empH = 0;
      let empI = 0;
      let empS = 0;
      let empA = 0;

      const cells = days.map((dateStr, dIdx) => {
        const rec = recordMap.get(`${emp.id}__${dateStr}`) ?? null;
        const scheduledOff = isEmployeeOffDay(emp, dateStr);
        const code = rec ? statusToMatrixCode(rec.status) : '';

        if (code === 'h') {
          empH++;
          daySums[dIdx].h++;
          daySums[dIdx].total++;
          grandH++;
        } else if (code === 'i') {
          empI++;
          daySums[dIdx].i++;
          daySums[dIdx].total++;
          grandI++;
        } else if (code === 's') {
          empS++;
          daySums[dIdx].s++;
          daySums[dIdx].total++;
          grandS++;
        } else if (code === 'a') {
          empA++;
          daySums[dIdx].a++;
          daySums[dIdx].total++;
          grandA++;
        }

        return {
          date: dateStr,
          rec,
          code,
          isOff: scheduledOff.isOff || rec?.status === 'libur',
        };
      });

      return {
        employee: emp,
        cells,
        summary: { h: empH, i: empI, s: empS, a: empA },
      };
    });

    const totalRecorded = grandH + grandI + grandS + grandA;
    const hadirPct =
      totalRecorded > 0 ? Math.round((grandH / totalRecorded) * 100) : 0;

    return {
      rows,
      daySums,
      totals: {
        pegawai: scopedEmployees.length,
        hadirPct,
        h: grandH,
        i: grandI,
        s: grandS,
        a: grandA,
      },
    };
  }, [scopedEmployees, days, recordMap]);

  const handleExportExcel = async () => {
    setExporting(true);
    setActionBanner(null);
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
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengekspor Excel matriks absensi.',
      });
    } finally {
      setExporting(false);
    }
  };

  // Open full input modal from toolbar
  const openToolbarInputModal = (initialStatus?: AttendanceStatus) => {
    const defaultEmp = scopedEmployees[0] || activeEmployees[0] || null;
    const today = getTodayDateStr();
    const defaultDate =
      activeSubTab === 'log' && !logShowAllDates
        ? logSelectedDate
        : today.startsWith(selectedMonth)
        ? today
        : days[0] || today;

    setInputEmpQuery('');
    setInputEmpId(defaultEmp?.id ?? '');
    setInputDate(defaultDate);

    if (defaultEmp) {
      const existing = attendanceRecords.find(
        (r) => r.employeeId === defaultEmp.id && r.date === defaultDate
      );
      if (initialStatus) {
        setInputStatus(initialStatus);
        setInputCheckIn(
          initialStatus === 'izin_terlambat' ? '' : defaultEmp.shiftStart
        );
        setInputCheckOut(defaultEmp.shiftEnd);
        setInputOvertimeHours('0');
        setInputNotes('');
        setInputLatePermitReason('');
        setInputLatePermitEstArrival(addMinutesToTime(defaultEmp.shiftStart, 60));
        setInputLatePermitApprovedBy('Admin HR');
      } else if (existing) {
        setInputStatus(existing.status);
        setInputCheckIn(
          existing.checkIn ||
            (existing.status === 'izin_terlambat' ? '' : defaultEmp.shiftStart)
        );
        setInputCheckOut(existing.checkOut || defaultEmp.shiftEnd);
        setInputOvertimeHours(String(existing.overtimeHours || 0));
        setInputNotes(existing.notes || '');
        setInputLatePermitReason(existing.latePermitReason || '');
        setInputLatePermitEstArrival(
          existing.latePermitEstimatedArrival ||
            addMinutesToTime(defaultEmp.shiftStart, 60)
        );
        setInputLatePermitApprovedBy(existing.latePermitApprovedBy || 'Admin HR');
      } else {
        const off = isEmployeeOffDay(defaultEmp, defaultDate);
        setInputStatus(off.isOff ? 'libur' : 'hadir');
        setInputCheckIn(defaultEmp.shiftStart);
        setInputCheckOut(defaultEmp.shiftEnd);
        setInputOvertimeHours('0');
        setInputNotes('');
        setInputLatePermitReason('');
        setInputLatePermitEstArrival(addMinutesToTime(defaultEmp.shiftStart, 60));
        setInputLatePermitApprovedBy('Admin HR');
      }
    }
    setInputError(null);
    setInputModalOpen(true);
  };

  const handleQuickArriveLog = async (rec: AttendanceRecord) => {
    setLogBusyId(rec.id);
    setActionBanner(null);
    try {
      await updateAttendanceRecord(rec.id, { checkIn: getCurrentTimeStr() });
      await onRefresh();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat jam tiba karyawan.',
      });
    } finally {
      setLogBusyId(null);
    }
  };

  const handleQuickCheckOutLog = async (rec: AttendanceRecord) => {
    setLogBusyId(rec.id);
    setActionBanner(null);
    try {
      await updateAttendanceRecord(rec.id, { checkOut: getCurrentTimeStr() });
      await onRefresh();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat jam pulang karyawan.',
      });
    } finally {
      setLogBusyId(null);
    }
  };

  const handleDeleteLog = async (recordId: string) => {
    setLogBusyId(recordId);
    setActionBanner(null);
    try {
      await deleteAttendanceRecord(recordId);
      await onRefresh();
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menghapus catatan absensi.',
      });
    } finally {
      setLogBusyId(null);
    }
  };

  const handleBulkMarkOff = async () => {
    setBulkBusy(true);
    setActionBanner(null);
    try {
      const targetDate =
        activeSubTab === 'log' && !logShowAllDates ? logSelectedDate : getTodayDateStr();
      const res = await bulkMarkScheduledOffDays(targetDate);
      await onRefresh();
      setActionBanner({
        type: 'success',
        text:
          res.createdCount > 0
            ? `${res.createdCount} karyawan libur terjadwal pada ${targetDate} telah ditandai.`
            : `Seluruh karyawan libur terjadwal pada ${targetDate} sudah tercatat.`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menandai libur terjadwal.',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExportLogCsv = () => {
    const header = [
      'Tanggal',
      'Karyawan',
      'Status',
      'Jam Masuk',
      'Perkiraan Tiba (Izin Telat)',
      'Jam Keluar',
      'Durasi Kerja',
      'Lembur (Jam)',
      'Alasan / Catatan',
    ];
    const rows = filteredLogRecords.map((r) => {
      const noteParts = [
        r.latePermitReason ? `Alasan Izin Telat: ${r.latePermitReason}` : '',
        r.latePermitApprovedBy ? `Disetujui: ${r.latePermitApprovedBy}` : '',
        r.notes || '',
      ]
        .filter(Boolean)
        .join(' | ');
      return [
        r.date,
        `"${r.employeeName.replace(/"/g, '""')}"`,
        ATTENDANCE_STATUS_META[r.status].label,
        r.checkIn || '-',
        r.status === 'izin_terlambat' ? r.latePermitEstimatedArrival || '-' : '-',
        r.checkOut || '-',
        calculateWorkDurationLabel(r.checkIn, r.checkOut),
        (r.overtimeHours || 0).toFixed(1),
        `"${noteParts.replace(/"/g, '""')}"`,
      ];
    });
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log-absensi-${logShowAllDates ? selectedMonth : logSelectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const syncInputFieldsForEmployeeAndDate = (emp: Employee, dateStr: string) => {
    const existing = attendanceRecords.find(
      (r) => r.employeeId === emp.id && r.date === dateStr
    );
    if (existing) {
      setInputStatus(existing.status);
      setInputCheckIn(
        existing.checkIn ||
          (existing.status === 'izin_terlambat' ? '' : emp.shiftStart)
      );
      setInputCheckOut(existing.checkOut || emp.shiftEnd);
      setInputOvertimeHours(String(existing.overtimeHours || 0));
      setInputNotes(existing.notes || '');
      setInputLatePermitReason(existing.latePermitReason || '');
      setInputLatePermitEstArrival(
        existing.latePermitEstimatedArrival || addMinutesToTime(emp.shiftStart, 60)
      );
      setInputLatePermitApprovedBy(existing.latePermitApprovedBy || 'Admin HR');
    } else {
      const off = isEmployeeOffDay(emp, dateStr);
      setInputStatus(off.isOff ? 'libur' : 'hadir');
      setInputCheckIn(emp.shiftStart);
      setInputCheckOut(emp.shiftEnd);
      setInputOvertimeHours('0');
      setInputNotes('');
      setInputLatePermitReason('');
      setInputLatePermitEstArrival(addMinutesToTime(emp.shiftStart, 60));
      setInputLatePermitApprovedBy('Admin HR');
    }
  };

  const selectedInputEmployee = useMemo(
    () => activeEmployees.find((e) => e.id === inputEmpId) ?? null,
    [activeEmployees, inputEmpId]
  );

  const existingRecordForInput = useMemo(() => {
    if (!inputEmpId || !inputDate) return null;
    return (
      attendanceRecords.find(
        (r) => r.employeeId === inputEmpId && r.date === inputDate
      ) ?? null
    );
  }, [attendanceRecords, inputEmpId, inputDate]);

  const handleSaveToolbarInput = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    if (!selectedInputEmployee) {
      setInputError('Pilih karyawan terlebih dahulu.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
      setInputError('Tanggal tidak valid.');
      return;
    }
    if ((inputStatus === 'hadir' || inputStatus === 'terlambat') && !inputCheckIn) {
      setInputError('Jam masuk wajib diisi untuk status Hadir atau Terlambat.');
      return;
    }
    if (inputStatus === 'izin_terlambat') {
      if (!inputLatePermitReason.trim()) {
        setInputError('Alasan izin datang terlambat wajib diisi.');
        return;
      }
      if (!inputLatePermitEstArrival && !inputCheckIn) {
        setInputError('Isi perkiraan jam tiba atau jam masuk aktual.');
        return;
      }
    }

    const parsedOt = Math.max(0, Math.min(16, Number(inputOvertimeHours) || 0));
    const isPermit = inputStatus === 'izin_terlambat';
    setInputSaving(true);
    try {
      if (existingRecordForInput) {
        await updateAttendanceRecord(existingRecordForInput.id, {
          status: inputStatus,
          checkIn: inputCheckIn,
          checkOut: inputCheckOut,
          overtimeHours: parsedOt,
          notes: inputNotes,
          latePermitReason: isPermit ? inputLatePermitReason.trim() : '',
          latePermitEstimatedArrival: isPermit ? inputLatePermitEstArrival : '',
          latePermitApprovedBy: isPermit ? inputLatePermitApprovedBy.trim() : '',
        });
      } else {
        await createAttendanceRecord({
          employeeId: selectedInputEmployee.id,
          date: inputDate,
          status: inputStatus,
          checkIn: inputCheckIn,
          checkOut: inputCheckOut,
          overtimeHours: parsedOt,
          notes: inputNotes,
          latePermitReason: isPermit ? inputLatePermitReason.trim() : '',
          latePermitEstimatedArrival: isPermit ? inputLatePermitEstArrival : '',
          latePermitApprovedBy: isPermit ? inputLatePermitApprovedBy.trim() : '',
        });
      }
      await onRefresh();
      setInputModalOpen(false);
    } catch (err) {
      setInputError(err instanceof Error ? err.message : 'Gagal menyimpan absensi.');
    } finally {
      setInputSaving(false);
    }
  };

  const openCellEditor = (
    employee: Employee,
    date: string,
    record: AttendanceRecord | null
  ) => {
    const offInfo = isEmployeeOffDay(employee, date);
    setCellModal({ employee, date, record });
    if (record) {
      setFormStatus(record.status);
      setFormCheckIn(
        record.checkIn ||
          (record.status === 'izin_terlambat' ? '' : employee.shiftStart)
      );
      setFormCheckOut(record.checkOut || employee.shiftEnd);
      setFormOvertimeHours(String(record.overtimeHours || 0));
      setFormNotes(record.notes || '');
      setFormLatePermitReason(record.latePermitReason || '');
      setFormLatePermitEstArrival(
        record.latePermitEstimatedArrival ||
          addMinutesToTime(employee.shiftStart, 60)
      );
      setFormLatePermitApprovedBy(record.latePermitApprovedBy || 'Admin HR');
    } else {
      setFormStatus(offInfo.isOff ? 'libur' : 'hadir');
      setFormCheckIn(employee.shiftStart);
      setFormCheckOut(employee.shiftEnd);
      setFormOvertimeHours('0');
      setFormNotes('');
      setFormLatePermitReason('');
      setFormLatePermitEstArrival(addMinutesToTime(employee.shiftStart, 60));
      setFormLatePermitApprovedBy('Admin HR');
    }
    setFormError(null);
  };

  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cellModal) return;
    setFormError(null);

    if ((formStatus === 'hadir' || formStatus === 'terlambat') && !formCheckIn) {
      setFormError('Jam masuk wajib diisi untuk status Hadir atau Terlambat.');
      return;
    }
    if (formStatus === 'izin_terlambat') {
      if (!formLatePermitReason.trim()) {
        setFormError('Alasan izin datang terlambat wajib diisi.');
        return;
      }
      if (!formLatePermitEstArrival && !formCheckIn) {
        setFormError('Isi perkiraan jam tiba atau jam masuk aktual.');
        return;
      }
    }

    const parsedOt = Math.max(0, Math.min(16, Number(formOvertimeHours) || 0));
    const isPermit = formStatus === 'izin_terlambat';
    setSaving(true);
    try {
      if (cellModal.record) {
        await updateAttendanceRecord(cellModal.record.id, {
          status: formStatus,
          checkIn: formCheckIn,
          checkOut: formCheckOut,
          overtimeHours: parsedOt,
          notes: formNotes,
          latePermitReason: isPermit ? formLatePermitReason.trim() : '',
          latePermitEstimatedArrival: isPermit ? formLatePermitEstArrival : '',
          latePermitApprovedBy: isPermit ? formLatePermitApprovedBy.trim() : '',
        });
      } else {
        await createAttendanceRecord({
          employeeId: cellModal.employee.id,
          date: cellModal.date,
          status: formStatus,
          checkIn: formCheckIn,
          checkOut: formCheckOut,
          overtimeHours: parsedOt,
          notes: formNotes,
          latePermitReason: isPermit ? formLatePermitReason.trim() : '',
          latePermitEstimatedArrival: isPermit ? formLatePermitEstArrival : '',
          latePermitApprovedBy: isPermit ? formLatePermitApprovedBy.trim() : '',
        });
      }
      await onRefresh();
      setCellModal(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan data.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCellRecord = async () => {
    if (!cellModal?.record) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteAttendanceRecord(cellModal.record.id);
      await onRefresh();
      setCellModal(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menghapus catatan absensi.');
    } finally {
      setSaving(false);
    }
  };

  const needsTimeFields =
    formStatus === 'hadir' ||
    formStatus === 'terlambat' ||
    formStatus === 'izin_terlambat';
  const inputNeedsTimeFields =
    inputStatus === 'hadir' ||
    inputStatus === 'terlambat' ||
    inputStatus === 'izin_terlambat';
  const companyName = settings?.companyName || 'KARYAPRESENSI';
  const companySubtitle = settings?.companySubtitle || 'HRIS PERUSAHAAN';

  return (
    <div className="space-y-5">
      {/* Unified Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 no-print">
        {/* Sub-tab Switcher & Primary Attendance Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80 self-start">
            <button
              type="button"
              onClick={() => setActiveSubTab('matriks')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'matriks'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Matriks Daftar Hadir</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('log')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'log'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Log Catatan Absensi</span>
              <span className="font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                {filteredLogRecords.length}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleBulkMarkOff}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarOff className="w-3.5 h-3.5" />
              <span>{bulkBusy ? 'Memproses...' : 'Isi Libur Terjadwal'}</span>
            </button>

            <button
              type="button"
              onClick={() => openToolbarInputModal('izin_terlambat')}
              disabled={activeEmployees.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Izin Datang Terlambat</span>
            </button>

            <button
              type="button"
              onClick={() => openToolbarInputModal()}
              disabled={activeEmployees.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Input Absensi</span>
            </button>

            {activeSubTab === 'matriks' ? (
              <>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exporting || scopedEmployees.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{exporting ? 'Menyiapkan Excel...' : 'Ekspor Excel (.xlsx)'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleExportLogCsv}
                disabled={filteredLogRecords.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh CSV Log</span>
              </button>
            )}
          </div>
        </div>

        {actionBanner && (
          <div
            className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
              actionBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{actionBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              aria-label="Tutup notifikasi"
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Shared Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, divisi, catatan..."
                className="pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                if (!logSelectedDate.startsWith(e.target.value)) {
                  setLogSelectedDate(`${e.target.value}-01`);
                }
              }}
              aria-label="Pilih Bulan"
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />

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

            {activeSubTab === 'log' && (
              <>
                <SearchableEmployeeSelect
                  allowAll
                  allLabel="Semua Karyawan"
                  value={logEmployeeFilter}
                  onChange={setLogEmployeeFilter}
                  options={activeEmployees.map((emp) => ({
                    id: emp.id,
                    code: emp.employeeCode,
                    name: emp.name,
                    department: emp.department,
                    subtitle: `${emp.department} · ${emp.shiftName}`,
                  }))}
                  className="w-56"
                />

                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={logSelectedDate}
                    disabled={logShowAllDates}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLogSelectedDate(val);
                      if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                        setSelectedMonth(val.slice(0, 7));
                      }
                    }}
                    className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setLogShowAllDates((v) => !v)}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      logShowAllDates
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {logShowAllDates ? `Sebulan (${selectedMonth})` : 'Per Tanggal'}
                  </button>
                </div>
              </>
            )}

            {(searchQuery !== '' ||
              deptFilter !== 'all' ||
              (activeSubTab === 'log' &&
                (logEmployeeFilter !== 'all' ||
                  logStatusFilter !== 'all' ||
                  logShowAllDates))) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDeptFilter('all');
                  setLogEmployeeFilter('all');
                  setLogStatusFilter('all');
                  setLogShowAllDates(false);
                }}
                className="px-2.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* Status Segmented Filter when viewing Log Catatan Absensi */}
        {activeSubTab === 'log' && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto w-fit max-w-full">
            <button
              type="button"
              onClick={() => setLogStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                logStatusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Status
            </button>
            {STATUS_OPTIONS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setLogStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  logStatusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ATTENDANCE_STATUS_META[st].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeSubTab === 'matriks' ? (
      <>
      {/* Excel-Style Sheet View */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-hidden">
        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Top Title Banner aligned over the main table */}
            <div className="xl:pl-60">
              <div className="bg-[#D9E1F2] border border-slate-400 py-2 px-4 text-center font-bold text-sm sm:text-base tracking-wide text-slate-950 uppercase">
                DAFTAR HADIR KARYAWAN BULAN {meta.monthName.toUpperCase()} {meta.year}
                {deptFilter !== 'all' ? ` — DIVISI ${deptFilter.toUpperCase()}` : ''}
              </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-4 items-start">
              {/* Left Sidebar Panel (SHEET KEHADIRAN) */}
              <aside className="w-full xl:w-56 shrink-0 border border-slate-400 text-xs select-none bg-white">
                {/* Gold Brand Block */}
                <div className="bg-[#FFC000] border-b border-slate-400 px-3 h-20 flex flex-col items-center justify-center text-center">
                  <div className="font-display font-bold text-sm tracking-tight text-slate-950 leading-tight uppercase">
                    {companyName}
                  </div>
                  <div className="text-[11px] font-bold text-slate-900 mt-0.5 uppercase">
                    {companySubtitle}
                  </div>
                </div>

                {/* SHEET KEHADIRAN */}
                <div className="bg-[#D9E1F2] border-b border-slate-400 py-1.5 px-2 text-center font-bold text-slate-900">
                  SHEET KEHADIRAN
                </div>

                {/* Tahun / Bulan */}
                <div className="grid grid-cols-2 border-b border-slate-400">
                  <div className="py-1 px-2.5 font-bold bg-slate-50 border-r border-slate-400">
                    Tahun
                  </div>
                  <div className="py-1 px-2 font-mono font-bold text-center tabular-nums">
                    {meta.year}
                  </div>
                </div>
                <div className="grid grid-cols-2 border-b border-slate-400">
                  <div className="py-1 px-2.5 font-bold bg-slate-50 border-r border-slate-400">
                    Bulan
                  </div>
                  <div className="py-1 px-2 font-bold text-center">{meta.monthName}</div>
                </div>

                {/* Date Range (Neutral Dark Slate, no red color) */}
                <div className="grid grid-cols-2 border-b border-slate-400 text-[11px] font-mono text-slate-700 bg-slate-50 text-center">
                  <div className="py-1 px-1.5 border-r border-slate-400">
                    {meta.startDateLabel}
                  </div>
                  <div className="py-1 px-1.5">{meta.endDateLabel}</div>
                </div>

                {/* KPI Grid: PEGAWAI | HADIR (%) / IJIN | SAKIT / ALPHA */}
                <div className="p-2.5 space-y-2 border-b border-slate-400 bg-white">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#4472C4] text-white font-bold py-1 text-[11px]">
                        PEGAWAI
                      </div>
                      <div className="bg-[#EAEEF7] font-mono text-xl font-bold text-slate-900 py-2 tabular-nums">
                        {matrixData.totals.pegawai}
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#548235] text-white font-bold py-1 text-[11px]">
                        HADIR
                      </div>
                      <div className="bg-[#E2EFDA] font-mono text-xl font-bold text-slate-900 py-2 tabular-nums">
                        {matrixData.totals.hadirPct}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#FCE4D6] text-[#833C0C] font-bold py-1 text-[11px]">
                        IJIN
                      </div>
                      <div className="bg-[#FFF2CC] font-mono text-xl font-bold text-slate-900 py-2 tabular-nums">
                        {matrixData.totals.i}
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#4338CA] text-white font-bold py-1 text-[11px]">
                        SAKIT
                      </div>
                      <div className="bg-[#EEF2FF] font-mono text-xl font-bold text-slate-900 py-2 tabular-nums">
                        {matrixData.totals.s}
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-400 text-center">
                    <div className="bg-[#C00000] text-white font-bold py-1 text-[11px]">
                      ALPHA
                    </div>
                    <div className="bg-[#F4CCCC] font-mono text-xl font-bold text-slate-900 py-2 tabular-nums">
                      {matrixData.totals.a}
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="bg-[#D9E1F2] border-b border-slate-400 py-1 px-2 text-center font-bold text-[11px] text-slate-900">
                  KETERANGAN
                </div>
                <div className="divide-y divide-slate-200 text-[11px]">
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#548235] text-white font-mono font-bold text-[10px]">
                      h
                    </span>
                    <span>= Hadir / Terlambat</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#0F766E] text-white font-mono font-bold text-[10px]">
                      h
                    </span>
                    <span>= Izin Datang Terlambat</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#FFF2CC] text-[#833C0C] border border-amber-300 font-mono font-bold text-[10px]">
                      i
                    </span>
                    <span>= Ijin</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#4338CA] text-white font-mono font-bold text-[10px]">
                      s
                    </span>
                    <span>= Sakit</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-4 h-4 bg-[#C00000] text-white font-mono font-bold text-[10px]">
                      a
                    </span>
                    <span>= Alpha</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex items-center gap-2">
                    <span className="w-4 h-4 bg-[#D9D9D9] border border-slate-400 inline-block shrink-0" />
                    <span>Hari Libur Karyawan</span>
                  </div>
                </div>
              </aside>

              {/* Right Main Excel Matrix */}
              <div className="flex-1 min-w-0 w-full overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th
                        colSpan={3}
                        className="bg-[#D9E1F2] border border-slate-400 font-bold text-slate-900 text-xs py-2 px-2 text-center h-20"
                      >
                        PEGAWAI
                      </th>
                      {days.map((dateStr) => (
                        <th
                          key={dateStr}
                          className="bg-[#D9E1F2] border border-slate-400 p-0.5 h-20 w-7 align-middle"
                        >
                          <div className="flex items-center justify-center h-full">
                            <span
                              className="font-semibold text-[10px] text-slate-900 whitespace-nowrap"
                              style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                              }}
                            >
                              {getDayNameIndonesian(dateStr)}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th className="w-2.5 border-0 bg-white" />
                      <th
                        colSpan={4}
                        className="bg-[#D9E1F2] border border-slate-400 font-bold text-slate-900 text-xs py-2 px-2 text-center"
                      >
                        RINGKASAN
                      </th>
                    </tr>

                    <tr className="bg-[#1F4E78] text-white">
                      <th className="border border-slate-400 py-1.5 px-2 font-bold text-center whitespace-nowrap">
                        ID
                      </th>
                      <th className="sticky left-0 z-10 bg-[#1F4E78] border border-slate-400 py-1.5 px-2.5 font-bold text-left whitespace-nowrap min-w-[165px]">
                        Nama
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-bold text-center whitespace-nowrap">
                        Hari Libur
                      </th>
                      {days.map((dateStr) => (
                        <th
                          key={dateStr}
                          className="border border-slate-400 py-1.5 px-1 font-mono font-bold text-center tabular-nums"
                        >
                          {dateStr.slice(8, 10)}
                        </th>
                      ))}
                      <th className="w-2.5 border-0 bg-white" />
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8">
                        h
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8">
                        i
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8">
                        s
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8">
                        a
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {matrixData.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={days.length + 8}
                          className="border border-slate-400 py-10 text-center text-xs text-slate-500"
                        >
                          Tidak ada karyawan yang sesuai filter pencarian.
                        </td>
                      </tr>
                    ) : (
                      matrixData.rows.map((row) => (
                        <tr key={row.employee.id} className="hover:bg-blue-50/40">
                          <td className="border border-slate-400 px-2 py-1 font-mono text-center text-slate-800 whitespace-nowrap">
                            {row.employee.employeeCode}
                          </td>
                          <td className="sticky left-0 z-10 bg-white border border-slate-400 px-2.5 py-1 font-semibold text-slate-900 whitespace-nowrap">
                            {row.employee.name}
                          </td>
                          <td className="border border-slate-400 px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                            {formatOffDaysSummary(row.employee.offDays)}
                          </td>

                          {row.cells.map((cell) => {
                            let cellClasses = 'bg-white text-slate-800 hover:bg-blue-50';
                            if (cell.code === 'h') {
                              if (cell.rec?.status === 'terlambat') {
                                cellClasses =
                                  'bg-[#D97706] text-white font-bold hover:bg-amber-700';
                              } else if (cell.rec?.status === 'izin_terlambat') {
                                cellClasses =
                                  'bg-[#0F766E] text-white font-bold hover:bg-teal-800';
                              } else {
                                cellClasses =
                                  'bg-[#548235] text-white font-bold hover:bg-[#436829]';
                              }
                            } else if (cell.code === 'i') {
                              cellClasses =
                                'bg-[#FFF2CC] text-[#833C0C] font-bold hover:bg-amber-200';
                            } else if (cell.code === 's') {
                              cellClasses =
                                'bg-[#4338CA] text-white font-bold hover:bg-indigo-800';
                            } else if (cell.code === 'a') {
                              cellClasses =
                                'bg-[#C00000] text-white font-bold hover:bg-red-800';
                            } else if (cell.isOff) {
                              cellClasses = 'bg-[#D9D9D9] text-slate-500 hover:bg-slate-300';
                            }

                            const lateMinutes =
                              cell.rec &&
                              cell.rec.checkIn &&
                              (cell.rec.status === 'hadir' ||
                                cell.rec.status === 'terlambat')
                                ? calculateLatenessMinutes(
                                    cell.rec.checkIn,
                                    row.employee.shiftStart
                                  )
                                : 0;

                            const tooltip = cell.rec
                              ? `${row.employee.name} (${cell.date}): ${
                                  ATTENDANCE_STATUS_META[cell.rec.status].label
                                }${
                                  cell.rec.checkIn
                                    ? ` · ${cell.rec.checkIn}${
                                        cell.rec.checkOut ? `–${cell.rec.checkOut}` : ''
                                      }`
                                    : cell.rec.status === 'izin_terlambat' &&
                                      cell.rec.latePermitEstimatedArrival
                                    ? ` · Est. ${cell.rec.latePermitEstimatedArrival}`
                                    : ''
                                }${
                                  cell.rec.status === 'terlambat' && lateMinutes > 0
                                    ? ` (+${lateMinutes} mnt)`
                                    : ''
                                }${
                                  cell.rec.status === 'izin_terlambat' &&
                                  cell.rec.latePermitReason
                                    ? ` · ${cell.rec.latePermitReason}`
                                    : ''
                                }${
                                  cell.rec.overtimeHours > 0
                                    ? ` · Lembur ${cell.rec.overtimeHours}j`
                                    : ''
                                }`
                              : cell.isOff
                              ? `${row.employee.name} (${cell.date}): Jadwal Libur — Klik untuk input`
                              : `${row.employee.name} (${cell.date}): Belum diisi — Klik untuk input`;

                            return (
                              <td
                                key={cell.date}
                                className={`border border-slate-400 p-0 text-center font-mono ${cellClasses}`}
                              >
                                <button
                                  type="button"
                                  title={tooltip}
                                  onClick={() =>
                                    openCellEditor(row.employee, cell.date, cell.rec)
                                  }
                                  className="w-full h-6 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-700"
                                >
                                  {cell.code}
                                </button>
                              </td>
                            );
                          })}

                          <td className="w-2.5 border-0 bg-white" />
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono font-bold text-slate-900 tabular-nums">
                            {row.summary.h}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums">
                            {row.summary.i}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums">
                            {row.summary.s}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums">
                            {row.summary.a}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  <tfoot>
                    {(['h', 'i', 's', 'a', 'TOTAL'] as const).map((metric, idx) => (
                      <tr key={metric}>
                        {idx === 0 && (
                          <td
                            colSpan={2}
                            rowSpan={5}
                            className="bg-[#1F4E78] text-white border border-slate-400 font-bold text-xs text-center align-middle"
                          >
                            RINGKASAN
                          </td>
                        )}
                        <td className="bg-[#1F4E78] text-white border border-slate-400 font-mono font-bold text-center py-1 px-2">
                          {metric}
                        </td>
                        {matrixData.daySums.map((ds, dIdx) => {
                          const val = ds[metric === 'TOTAL' ? 'total' : metric];
                          return (
                            <td
                              key={days[dIdx]}
                              className={`border border-slate-400 text-center font-mono py-1 tabular-nums ${
                                metric === 'TOTAL'
                                  ? 'bg-slate-100 font-bold text-slate-900'
                                  : 'bg-white text-slate-800'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                        <td className="w-2.5 border-0 bg-white" />
                        {idx === 4 ? (
                          <>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 tabular-nums">
                              {matrixData.totals.h}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 tabular-nums">
                              {matrixData.totals.i}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 tabular-nums">
                              {matrixData.totals.s}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 tabular-nums">
                              {matrixData.totals.a}
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="border-0 bg-white" />
                        )}
                      </tr>
                    ))}
                  </tfoot>
                </table>

                <p className="mt-2.5 text-[11px] text-slate-500 no-print">
                  Tip: Klik tombol <strong>Input Absensi</strong>, <strong>Izin Datang Terlambat</strong>, atau klik sel tanggal mana saja pada tabel untuk mencatat/mengubah kehadiran. Gunakan tab <strong>Log Catatan Absensi</strong> di atas untuk melihat rincian log jam masuk/pulang, alasan izin, dan lembur.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      </>
      ) : (
        /* Log Catatan Absensi View */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Log Catatan Absensi Karyawan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {filteredLogRecords.length} catatan ditampilkan ·{' '}
                {logShowAllDates
                  ? `Bulan ${selectedMonth}`
                  : `Tanggal ${logSelectedDate}`}
              </p>
            </div>
            <span className="text-[11px] text-slate-500">
              Kelola jam masuk, pulang, izin datang terlambat, dan lembur dari satu halaman
            </span>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredLogRecords.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">
                Belum ada log catatan absensi pada filter ini
              </p>
              <p className="text-xs text-slate-500 mb-5">
                Catat jam masuk/pulang, izin datang terlambat, izin, sakit, atau lembur melalui tombol Input Absensi di atas.
              </p>
              <button
                type="button"
                onClick={() => openToolbarInputModal()}
                disabled={activeEmployees.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Input Absensi</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Karyawan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Masuk</th>
                    <th className="py-3 px-4 text-right">Keluar</th>
                    <th className="py-3 px-4 text-right">Ketepatan</th>
                    <th className="py-3 px-4 text-right">Durasi</th>
                    <th className="py-3 px-4 text-right">Lembur</th>
                    <th className="py-3 px-4">Catatan &amp; Izin</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredLogRecords.map((rec) => {
                    const meta = ATTENDANCE_STATUS_META[rec.status];
                    const emp = employees.find((e) => e.id === rec.employeeId);
                    const offOnDate = emp ? isEmployeeOffDay(emp, rec.date).isOff : false;
                    const lateMins =
                      emp && rec.checkIn && (rec.status === 'hadir' || rec.status === 'terlambat')
                        ? calculateLatenessMinutes(rec.checkIn, emp.shiftStart)
                        : 0;
                    const permitTimeRef = rec.checkIn || rec.latePermitEstimatedArrival || '';
                    const permitMins =
                      emp && permitTimeRef && rec.status === 'izin_terlambat'
                        ? calculateLatenessMinutes(permitTimeRef, emp.shiftStart)
                        : 0;
                    const canQuickArrive = rec.status === 'izin_terlambat' && !rec.checkIn;
                    const canQuickOut =
                      !rec.checkOut &&
                      Boolean(rec.checkIn) &&
                      (rec.status === 'hadir' ||
                        rec.status === 'terlambat' ||
                        rec.status === 'izin_terlambat');

                    const combinedNote = [
                      rec.latePermitReason ? `Izin: ${rec.latePermitReason}` : '',
                      rec.latePermitApprovedBy ? `ACC: ${rec.latePermitApprovedBy}` : '',
                      rec.notes || '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {rec.date}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{rec.employeeName}</div>
                          {emp && (
                            <div className="text-xs text-slate-500">
                              {emp.employeeCode} · {emp.department}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium border rounded-md ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                          >
                            {meta.label}
                          </span>
                          {offOnDate && rec.status !== 'libur' && (
                            <span className="ml-2 text-xs text-amber-700">(Hari libur)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                          {rec.checkIn ? (
                            rec.checkIn
                          ) : rec.status === 'izin_terlambat' && rec.latePermitEstimatedArrival ? (
                            <span
                              className="text-teal-700 font-medium"
                              title="Perkiraan jam tiba (belum check-in aktual)"
                            >
                              Est. {rec.latePermitEstimatedArrival}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                          {rec.checkOut || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          {rec.status === 'izin_terlambat' ? (
                            <span className="text-teal-700 font-medium">
                              {permitMins > 0 ? `Izin (+${permitMins} mnt)` : 'Izin Resmi'}
                            </span>
                          ) : rec.status === 'hadir' || rec.status === 'terlambat' ? (
                            lateMins > 0 ? (
                              <span className="text-amber-700 font-medium">+{lateMins} mnt</span>
                            ) : (
                              <span className="text-emerald-700">Tepat</span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {calculateWorkDurationLabel(rec.checkIn, rec.checkOut)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          {rec.overtimeHours > 0 ? (
                            <span className="font-semibold text-blue-700">
                              {rec.overtimeHours.toFixed(1)} j
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          {combinedNote ? (
                            <div className="text-xs text-slate-700 truncate" title={combinedNote}>
                              {combinedNote}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {canQuickArrive && (
                              <button
                                type="button"
                                disabled={logBusyId === rec.id}
                                onClick={() => handleQuickArriveLog(rec)}
                                title="Catat jam tiba aktual sekarang"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors cursor-pointer mr-1"
                              >
                                <LogIn className="w-3 h-3" />
                                <span>Catat Tiba</span>
                              </button>
                            )}
                            {canQuickOut && (
                              <button
                                type="button"
                                disabled={logBusyId === rec.id}
                                onClick={() => handleQuickCheckOutLog(rec)}
                                title="Catat jam pulang sekarang"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-800 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors cursor-pointer mr-1"
                              >
                                <LogOut className="w-3 h-3" />
                                <span>Pulang</span>
                              </button>
                            )}
                            {emp && (
                              <button
                                type="button"
                                onClick={() => openCellEditor(emp, rec.date, rec)}
                                aria-label={`Ubah absensi ${rec.employeeName}`}
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={logBusyId === rec.id}
                              onClick={() => handleDeleteLog(rec.id)}
                              aria-label={`Hapus absensi ${rec.employeeName}`}
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Input Absensi Lengkap dari Halaman Matriks (dengan Pencarian Karyawan) */}
      {inputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                Input Absensi Karyawan (Admin)
              </h3>
              <button
                type="button"
                onClick={() => setInputModalOpen(false)}
                aria-label="Tutup modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveToolbarInput} className="mt-4 space-y-4">
              {inputError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {inputError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Cari &amp; Pilih Karyawan
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inputEmpQuery}
                      onChange={(e) => setInputEmpQuery(e.target.value)}
                      placeholder="Cari nama, kode (KRY-...), atau divisi..."
                      className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    {inputEmpQuery && (
                      <button
                        type="button"
                        onClick={() => setInputEmpQuery('')}
                        aria-label="Hapus pencarian"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {modalFilteredEmployees.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-500 text-center">
                        Tidak ada karyawan yang cocok dengan &ldquo;{inputEmpQuery}&rdquo;.
                      </div>
                    ) : (
                      modalFilteredEmployees.map((emp) => {
                        const isSelected = emp.id === inputEmpId;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setInputEmpId(emp.id);
                              syncInputFieldsForEmployeeAndDate(emp, inputDate);
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 text-blue-900'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {emp.name}{' '}
                                <span className="font-mono font-normal text-slate-500">
                                  ({emp.employeeCode})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {emp.department} · Shift {emp.shiftStart}–{emp.shiftEnd} · Libur:{' '}
                                {formatOffDaysSummary(emp.offDays)}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-700 text-white rounded shrink-0">
                                Dipilih
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={inputDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setInputDate(nextDate);
                      if (selectedInputEmployee) {
                        syncInputFieldsForEmployeeAndDate(selectedInputEmployee, nextDate);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Status Kehadiran
                  </label>
                  <select
                    value={inputStatus}
                    onChange={(e) => {
                      const nextSt = e.target.value as AttendanceStatus;
                      setInputStatus(nextSt);
                      if (nextSt === 'izin_terlambat') {
                        if (!existingRecordForInput) setInputCheckIn('');
                        if (selectedInputEmployee) {
                          setInputLatePermitEstArrival(
                            addMinutesToTime(selectedInputEmployee.shiftStart, 60)
                          );
                          if (!inputCheckOut) setInputCheckOut(selectedInputEmployee.shiftEnd);
                        }
                      } else if (
                        (nextSt === 'hadir' || nextSt === 'terlambat') &&
                        !inputCheckIn &&
                        selectedInputEmployee
                      ) {
                        setInputCheckIn(selectedInputEmployee.shiftStart);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {ATTENDANCE_STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedInputEmployee &&
                isEmployeeOffDay(selectedInputEmployee, inputDate).isOff && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
                    <CalendarOff className="w-4 h-4 shrink-0" />
                    <span>
                      Tanggal {inputDate} adalah hari libur terjadwal bagi{' '}
                      <strong>{selectedInputEmployee.name}</strong>.
                    </span>
                  </div>
                )}

              {existingRecordForInput && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  Catatan pada tanggal ini sudah ada — menyimpan akan memperbarui data yang sudah tercatat.
                </div>
              )}

              {inputStatus === 'izin_terlambat' && (
                <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-teal-900">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-700" />
                      <span>Detail Izin Datang Terlambat</span>
                    </span>
                    <span className="text-[11px] font-semibold bg-white border border-teal-200 px-2 py-0.5 rounded">
                      Bebas Denda
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={180}
                    value={inputLatePermitReason}
                    onChange={(e) => setInputLatePermitReason(e.target.value)}
                    placeholder="Alasan izin datang terlambat (wajib)..."
                    className="w-full px-3 py-2 text-xs bg-white border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <div className="flex flex-wrap gap-1">
                    {LATE_PERMIT_REASON_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInputLatePermitReason(preset)}
                        className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer ${
                          inputLatePermitReason === preset
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-teal-950 mb-1">
                        Perkiraan Tiba
                      </label>
                      <input
                        type="time"
                        value={inputLatePermitEstArrival}
                        onChange={(e) => setInputLatePermitEstArrival(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-teal-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-teal-950 mb-1">
                        Disetujui Oleh
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        value={inputLatePermitApprovedBy}
                        onChange={(e) => setInputLatePermitApprovedBy(e.target.value)}
                        placeholder="Admin HR"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-teal-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {inputNeedsTimeFields && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {inputStatus === 'izin_terlambat' ? 'Masuk Aktual' : 'Jam Masuk'}
                      </label>
                      <input
                        type="time"
                        value={inputCheckIn}
                        onChange={(e) => {
                          const nextCheckIn = e.target.value;
                          setInputCheckIn(nextCheckIn);
                          if (
                            selectedInputEmployee &&
                            (inputStatus === 'hadir' || inputStatus === 'terlambat')
                          ) {
                            const tol = getEmployeeShiftTolerance(
                              selectedInputEmployee,
                              settings?.shifts
                            );
                            const evalRes = evaluateLateness(
                              nextCheckIn,
                              selectedInputEmployee.shiftStart,
                              tol
                            );
                            setInputStatus(evalRes.isLate ? 'terlambat' : 'hadir');
                          }
                        }}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Jam Keluar
                      </label>
                      <input
                        type="time"
                        value={inputCheckOut}
                        onChange={(e) => setInputCheckOut(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Lembur (Jam)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="16"
                        step="0.5"
                        value={inputOvertimeHours}
                        onChange={(e) => setInputOvertimeHours(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {inputStatus !== 'izin_terlambat' && selectedInputEmployee && inputCheckIn && (() => {
                    const tol = getEmployeeShiftTolerance(
                      selectedInputEmployee,
                      settings?.shifts
                    );
                    const evalRes = evaluateLateness(
                      inputCheckIn,
                      selectedInputEmployee.shiftStart,
                      tol
                    );
                    return (
                      <div
                        className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          evalRes.isLate
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        }`}
                      >
                        <span>
                          Shift{' '}
                          <span className="font-mono font-semibold">
                            {selectedInputEmployee.shiftStart}
                          </span>
                          {tol > 0 ? ` (toleransi ${tol} mnt)` : ''}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {evalRes.isLate
                            ? `Terlambat +${evalRes.rawLateMinutes} menit`
                            : evalRes.rawLateMinutes > 0
                            ? `Dalam toleransi (+${evalRes.rawLateMinutes} mnt)`
                            : 'Tepat Waktu'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Catatan
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  placeholder="Keterangan singkat..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setInputModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={inputSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {inputSaving
                    ? 'Menyimpan...'
                    : existingRecordForInput
                    ? 'Perbarui Absensi'
                    : 'Simpan Absensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Cell Edit/Create Modal */}
      {cellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 no-print">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {cellModal.record ? 'Ubah Kehadiran Sel' : 'Input Kehadiran Sel'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold">{cellModal.employee.employeeCode}</span>{' '}
                  · {cellModal.employee.name} ·{' '}
                  <span className="font-mono">{cellModal.date}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCellModal(null)}
                aria-label="Tutup modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCell} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {formError}
                </div>
              )}

              {isEmployeeOffDay(cellModal.employee, cellModal.date).isOff && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
                  <CalendarOff className="w-4 h-4 shrink-0" />
                  <span>
                    Tanggal ini merupakan jadwal libur rutin ({formatOffDaysSummary(cellModal.employee.offDays)}).
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Status Kehadiran
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => {
                    const nextSt = e.target.value as AttendanceStatus;
                    setFormStatus(nextSt);
                    if (nextSt === 'izin_terlambat') {
                      if (!cellModal.record) setFormCheckIn('');
                      setFormLatePermitEstArrival(
                        addMinutesToTime(cellModal.employee.shiftStart, 60)
                      );
                      if (!formCheckOut) setFormCheckOut(cellModal.employee.shiftEnd);
                    } else if (
                      (nextSt === 'hadir' || nextSt === 'terlambat') &&
                      !formCheckIn
                    ) {
                      setFormCheckIn(cellModal.employee.shiftStart);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {ATTENDANCE_STATUS_META[st].label} (Kode matriks:{' '}
                      {statusToMatrixCode(st) || 'Libur'})
                    </option>
                  ))}
                </select>
              </div>

              {formStatus === 'izin_terlambat' && (
                <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-teal-900">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-700" />
                      <span>Izin Datang Terlambat</span>
                    </span>
                    <span className="text-[11px] font-semibold bg-white border border-teal-200 px-2 py-0.5 rounded">
                      Bebas Denda
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={180}
                    value={formLatePermitReason}
                    onChange={(e) => setFormLatePermitReason(e.target.value)}
                    placeholder="Alasan izin datang terlambat (wajib)..."
                    className="w-full px-3 py-2 text-xs bg-white border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <div className="flex flex-wrap gap-1">
                    {LATE_PERMIT_REASON_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormLatePermitReason(preset)}
                        className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer ${
                          formLatePermitReason === preset
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-teal-950 mb-1">
                        Perkiraan Tiba
                      </label>
                      <input
                        type="time"
                        value={formLatePermitEstArrival}
                        onChange={(e) => setFormLatePermitEstArrival(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-teal-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-teal-950 mb-1">
                        Disetujui Oleh
                      </label>
                      <input
                        type="text"
                        maxLength={80}
                        value={formLatePermitApprovedBy}
                        onChange={(e) => setFormLatePermitApprovedBy(e.target.value)}
                        placeholder="Admin HR"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-teal-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {needsTimeFields && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        {formStatus === 'izin_terlambat' ? 'Masuk Aktual' : 'Jam Masuk'}
                      </label>
                      <input
                        type="time"
                        value={formCheckIn}
                        onChange={(e) => {
                          const nextCheckIn = e.target.value;
                          setFormCheckIn(nextCheckIn);
                          if (formStatus === 'hadir' || formStatus === 'terlambat') {
                            const tol = getEmployeeShiftTolerance(
                              cellModal.employee,
                              settings?.shifts
                            );
                            const evalRes = evaluateLateness(
                              nextCheckIn,
                              cellModal.employee.shiftStart,
                              tol
                            );
                            setFormStatus(evalRes.isLate ? 'terlambat' : 'hadir');
                          }
                        }}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Jam Keluar
                      </label>
                      <input
                        type="time"
                        value={formCheckOut}
                        onChange={(e) => setFormCheckOut(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Lembur (Jam)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="16"
                        step="0.5"
                        value={formOvertimeHours}
                        onChange={(e) => setFormOvertimeHours(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {formStatus !== 'izin_terlambat' && formCheckIn && (() => {
                    const tol = getEmployeeShiftTolerance(
                      cellModal.employee,
                      settings?.shifts
                    );
                    const evalRes = evaluateLateness(
                      formCheckIn,
                      cellModal.employee.shiftStart,
                      tol
                    );
                    return (
                      <div
                        className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          evalRes.isLate
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        }`}
                      >
                        <span>
                          Shift{' '}
                          <span className="font-mono font-semibold">
                            {cellModal.employee.shiftStart}
                          </span>
                          {tol > 0 ? ` (toleransi ${tol} mnt)` : ''}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {evalRes.isLate
                            ? `Terlambat +${evalRes.rawLateMinutes} menit`
                            : evalRes.rawLateMinutes > 0
                            ? `Dalam toleransi (+${evalRes.rawLateMinutes} mnt)`
                            : 'Tepat Waktu'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Catatan
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Keterangan singkat..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                {cellModal.record ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDeleteCellRecord}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCellModal(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
