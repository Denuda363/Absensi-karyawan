import React, { useMemo, useState } from 'react';
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
  formatEmployeeShiftForDisplay,
  formatOffDaysSummary,
  getCurrentTimeStr,
  getCurrentYearMonth,
  getDayNameIndonesian,
  getDaysInMonth,
  getMonthMetadata,
  getTodayDateStr,
  isEmployeeOffDay,
  isEmployeeShiftAssigned,
  LATE_PERMIT_REASON_PRESETS,
  LateSettlement,
  normalizeMatrixColors,
  resolveAttendanceShift,
  resolveEmployeeDefaultShiftForDate,
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

  // Direct matrix table click/keyboard input mode
  const [matrixClickMode, setMatrixClickMode] = useState<
    'detail' | 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpha' | 'libur' | 'hapus'
  >('detail');
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);

  // Unified Full Attendance Input / Cell Editor Modal (with Searchable Employee Picker + Shift)
  const [inputModalOpen, setInputModalOpen] = useState<boolean>(false);
  const [inputModalTitle, setInputModalTitle] = useState<string>('Input Absensi Karyawan');
  const [inputEmpId, setInputEmpId] = useState<string>('');
  const [inputEmpQuery, setInputEmpQuery] = useState<string>('');
  const [inputDate, setInputDate] = useState<string>(getTodayDateStr());
  const [inputShiftName, setInputShiftName] = useState<string>('');
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
    const list = q
      ? activeEmployees.filter(
          (emp) =>
            emp.name.toLowerCase().includes(q) ||
            emp.employeeCode.toLowerCase().includes(q) ||
            emp.department.toLowerCase().includes(q)
        )
      : activeEmployees;
    if (!inputEmpId || q) return list;
    return [...list].sort((a, b) =>
      a.id === inputEmpId ? -1 : b.id === inputEmpId ? 1 : 0
    );
  }, [activeEmployees, inputEmpQuery, inputEmpId]);

  const recordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of attendanceRecords) {
      if (r.date.startsWith(selectedMonth)) {
        map.set(`${r.employeeId}__${r.date}`, r);
      }
    }
    return map;
  }, [attendanceRecords, selectedMonth]);

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
        const rawCode = rec ? statusToMatrixCode(rec.status) : '';
        const isOff = scheduledOff.isOff || rec?.status === 'libur';
        const code = rawCode || (scheduledOff.isOff ? 'L' : '');

        if (code === 'H') {
          empH++;
          daySums[dIdx].h++;
          daySums[dIdx].total++;
          grandH++;
        } else if (code === 'I') {
          empI++;
          daySums[dIdx].i++;
          daySums[dIdx].total++;
          grandI++;
        } else if (code === 'S') {
          empS++;
          daySums[dIdx].s++;
          daySums[dIdx].total++;
          grandS++;
        } else if (code === 'A') {
          empA++;
          daySums[dIdx].a++;
          daySums[dIdx].total++;
          grandA++;
        }

        return {
          date: dateStr,
          rec,
          code,
          isOff,
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
        matrixColors: settings?.matrixColors,
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

  // Open full input modal from toolbar (Matriks page only)
  const openToolbarInputModal = (initialStatus?: AttendanceStatus) => {
    const defaultEmp = scopedEmployees[0] || activeEmployees[0] || null;
    const today = getTodayDateStr();
    const defaultDate =
      today.startsWith(selectedMonth) ? today : days[0] || today;

    setInputModalTitle('Input Absensi Karyawan');
    setInputEmpQuery('');
    setInputEmpId(defaultEmp?.id ?? '');
    setInputDate(defaultDate);

    if (defaultEmp) {
      const existing = attendanceRecords.find(
        (r) => r.employeeId === defaultEmp.id && r.date === defaultDate
      );
      const dayDefaultShift = resolveEmployeeDefaultShiftForDate(
        defaultEmp,
        defaultDate,
        settings?.shifts
      );
      const activeShift = existing?.shiftName
        ? resolveAttendanceShift(defaultEmp, settings?.shifts, existing.shiftName)
        : dayDefaultShift;

      setInputShiftName(
      isEmployeeShiftAssigned(activeShift.shiftName) ? activeShift.shiftName : ''
    );

      if (initialStatus) {
        setInputStatus(initialStatus);
        setInputCheckIn(
          initialStatus === 'izin_terlambat' ? '' : activeShift.shiftStart
        );
        setInputCheckOut(activeShift.shiftEnd);
        setInputOvertimeHours('0');
        setInputNotes('');
        setInputLatePermitReason('');
        setInputLatePermitEstArrival(addMinutesToTime(activeShift.shiftStart, 60));
        setInputLatePermitApprovedBy('Admin HR');
      } else if (existing) {
        setInputStatus(existing.status);
        setInputCheckIn(
          existing.checkIn ||
            (existing.status === 'izin_terlambat' ? '' : activeShift.shiftStart)
        );
        setInputCheckOut(existing.checkOut || activeShift.shiftEnd);
        setInputOvertimeHours(String(existing.overtimeHours || 0));
        setInputNotes(existing.notes || '');
        setInputLatePermitReason(existing.latePermitReason || '');
        setInputLatePermitEstArrival(
          existing.latePermitEstimatedArrival ||
            addMinutesToTime(activeShift.shiftStart, 60)
        );
        setInputLatePermitApprovedBy(existing.latePermitApprovedBy || 'Admin HR');
      } else {
        const off = isEmployeeOffDay(defaultEmp, defaultDate);
        setInputStatus(off.isOff ? 'libur' : 'hadir');
        setInputCheckIn(activeShift.shiftStart);
        setInputCheckOut(activeShift.shiftEnd);
        setInputOvertimeHours('0');
        setInputNotes('');
        setInputLatePermitReason('');
        setInputLatePermitEstArrival(addMinutesToTime(activeShift.shiftStart, 60));
        setInputLatePermitApprovedBy('Admin HR');
      }
    } else {
      setInputShiftName(settings?.shifts?.[0]?.name || '');
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
      'Shift',
      'Status',
      'Jam Masuk',
      'Perkiraan Tiba (Izin Telat)',
      'Jam Keluar',
      'Durasi Kerja',
      'Lembur (Jam)',
      'Alasan / Catatan',
    ];
    const rows = filteredLogRecords.map((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      const shiftLabel = r.shiftName || emp?.shiftName || '-';
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
        `"${shiftLabel.replace(/"/g, '""')}"`,
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
    const dayDefaultShift = resolveEmployeeDefaultShiftForDate(
      emp,
      dateStr,
      settings?.shifts
    );
    const activeShift = existing?.shiftName
      ? resolveAttendanceShift(emp, settings?.shifts, existing.shiftName)
      : dayDefaultShift;

    const normalizedShiftName = isEmployeeShiftAssigned(activeShift.shiftName)
      ? activeShift.shiftName
      : '';
    setInputShiftName(normalizedShiftName);

    if (existing) {
      setInputStatus(existing.status);
      setInputCheckIn(
        existing.checkIn ||
          (existing.status === 'izin_terlambat' ? '' : activeShift.shiftStart)
      );
      setInputCheckOut(existing.checkOut || activeShift.shiftEnd);
      setInputOvertimeHours(String(existing.overtimeHours || 0));
      setInputNotes(existing.notes || '');
      setInputLatePermitReason(existing.latePermitReason || '');
      setInputLatePermitEstArrival(
        existing.latePermitEstimatedArrival ||
          addMinutesToTime(activeShift.shiftStart, 60)
      );
      setInputLatePermitApprovedBy(existing.latePermitApprovedBy || 'Admin HR');
    } else {
      const off = isEmployeeOffDay(emp, dateStr);
      setInputStatus(off.isOff ? 'libur' : 'hadir');
      setInputCheckIn(activeShift.shiftStart);
      setInputCheckOut(activeShift.shiftEnd);
      setInputOvertimeHours('0');
      setInputNotes('');
      setInputLatePermitReason('');
      setInputLatePermitEstArrival(addMinutesToTime(activeShift.shiftStart, 60));
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

  const activeInputShiftInfo = useMemo(() => {
    if (!selectedInputEmployee || !isEmployeeShiftAssigned(inputShiftName)) return null;
    return resolveAttendanceShift(
      selectedInputEmployee,
      settings?.shifts,
      inputShiftName
    );
  }, [selectedInputEmployee, settings?.shifts, inputShiftName]);

  const scheduledDayShiftsForInput = useMemo(() => {
    if (!selectedInputEmployee || !inputDate) return [];
    return resolveEmployeeDefaultShiftForDate(
      selectedInputEmployee,
      inputDate,
      settings?.shifts
    ).scheduledShiftNames;
  }, [selectedInputEmployee, inputDate, settings?.shifts]);

  const inputShiftSelectOptions = useMemo(() => {
    const list: { name: string; startTime: string; endTime: string }[] = [];
    const seen = new Set<string>();
    for (const s of settings?.shifts || []) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ name: s.name, startTime: s.startTime, endTime: s.endTime });
    }
    if (
      inputShiftName &&
      isEmployeeShiftAssigned(inputShiftName) &&
      !seen.has(inputShiftName.toLowerCase())
    ) {
      list.push({
        name: inputShiftName,
        startTime: '',
        endTime: '',
      });
    }
    return list;
  }, [settings?.shifts, inputShiftName]);

  const handleChangeInputShift = (nextShiftName: string) => {
    if (!nextShiftName || !isEmployeeShiftAssigned(nextShiftName)) {
      setInputShiftName('');
      return;
    }
    if (!selectedInputEmployee) {
      setInputShiftName(nextShiftName);
      return;
    }
    const prevShift = isEmployeeShiftAssigned(inputShiftName)
      ? resolveAttendanceShift(selectedInputEmployee, settings?.shifts, inputShiftName)
      : null;
    const nextShift = resolveAttendanceShift(
      selectedInputEmployee,
      settings?.shifts,
      nextShiftName
    );
    setInputShiftName(isEmployeeShiftAssigned(nextShift.shiftName) ? nextShift.shiftName : '');

    const shouldReplaceIn =
      !existingRecordForInput ||
      !inputCheckIn ||
      (prevShift !== null && inputCheckIn === prevShift.shiftStart);
    const shouldReplaceOut =
      !existingRecordForInput ||
      !inputCheckOut ||
      (prevShift !== null && inputCheckOut === prevShift.shiftEnd);

    if (inputStatus === 'izin_terlambat') {
      if (
        !existingRecordForInput ||
        (prevShift !== null &&
          inputLatePermitEstArrival === addMinutesToTime(prevShift.shiftStart, 60))
      ) {
        setInputLatePermitEstArrival(addMinutesToTime(nextShift.shiftStart, 60));
      }
      if (shouldReplaceOut) {
        setInputCheckOut(nextShift.shiftEnd);
      }
      return;
    }

    if (inputStatus === 'hadir' || inputStatus === 'terlambat') {
      const nextCheckIn = shouldReplaceIn ? nextShift.shiftStart : inputCheckIn;
      if (shouldReplaceIn) {
        setInputCheckIn(nextShift.shiftStart);
      }
      if (shouldReplaceOut) {
        setInputCheckOut(nextShift.shiftEnd);
      }
      if (nextCheckIn && nextShift.shiftStart) {
        const evalRes = evaluateLateness(
          nextCheckIn,
          nextShift.shiftStart,
          nextShift.lateToleranceMinutes
        );
        setInputStatus(evalRes.isLate ? 'terlambat' : 'hadir');
      }
    }
  };

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
    const rawShiftName = activeInputShiftInfo?.shiftName || inputShiftName || '';
    const resolvedShiftName = isEmployeeShiftAssigned(rawShiftName) ? rawShiftName : '';
    setInputSaving(true);
    try {
      if (existingRecordForInput) {
        await updateAttendanceRecord(existingRecordForInput.id, {
          status: inputStatus,
          shiftName: resolvedShiftName,
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
          shiftName: resolvedShiftName,
          checkIn: inputCheckIn,
          checkOut: inputCheckOut,
          overtimeHours: parsedOt,
          notes: inputNotes,
          latePermitReason: isPermit ? inputLatePermitReason.trim() : '',
          latePermitEstimatedArrival: isPermit ? inputLatePermitEstArrival : '',
          latePermitApprovedBy: isPermit ? inputLatePermitApprovedBy.trim() : '',
        });
      }
      if (!inputDate.startsWith(selectedMonth)) {
        setSelectedMonth(inputDate.slice(0, 7));
      }
      setLogSelectedDate(inputDate);
      await onRefresh();
      setInputModalOpen(false);
      setActionBanner({
        type: 'success',
        text: `Tersimpan: ${selectedInputEmployee.name} (${inputDate}${
          resolvedShiftName ? ` · ${resolvedShiftName}` : ''
        }) → ${ATTENDANCE_STATUS_META[inputStatus].label} (tercatat di Log Catatan Absensi)`,
      });
    } catch (err) {
      setInputError(err instanceof Error ? err.message : 'Gagal menyimpan absensi.');
    } finally {
      setInputSaving(false);
    }
  };

  const handleDeleteFromInputModal = async () => {
    if (!existingRecordForInput || !selectedInputEmployee) return;
    setInputSaving(true);
    setInputError(null);
    try {
      await deleteAttendanceRecord(existingRecordForInput.id);
      setLogSelectedDate(inputDate);
      await onRefresh();
      const removedName = selectedInputEmployee.name;
      const removedDate = inputDate;
      setInputModalOpen(false);
      setActionBanner({
        type: 'success',
        text: `Catatan absensi ${removedName} (${removedDate}) dihapus dari matriks & log.`,
      });
    } catch (err) {
      setInputError(
        err instanceof Error ? err.message : 'Gagal menghapus catatan absensi.'
      );
    } finally {
      setInputSaving(false);
    }
  };

  const openCellEditor = (
    employee: Employee,
    date: string,
    record: AttendanceRecord | null
  ) => {
    setInputModalTitle(record ? 'Ubah Kehadiran Sel' : 'Input Kehadiran Sel');
    setInputEmpQuery('');
    setInputEmpId(employee.id);
    setInputDate(date);
    const dayDefaultShift = resolveEmployeeDefaultShiftForDate(
      employee,
      date,
      settings?.shifts
    );
    const activeShift = record?.shiftName
      ? resolveAttendanceShift(employee, settings?.shifts, record.shiftName)
      : dayDefaultShift;
    setInputShiftName(activeShift.shiftName);

    if (record) {
      setInputStatus(record.status);
      setInputCheckIn(
        record.checkIn ||
          (record.status === 'izin_terlambat' ? '' : activeShift.shiftStart)
      );
      setInputCheckOut(record.checkOut || activeShift.shiftEnd);
      setInputOvertimeHours(String(record.overtimeHours || 0));
      setInputNotes(record.notes || '');
      setInputLatePermitReason(record.latePermitReason || '');
      setInputLatePermitEstArrival(
        record.latePermitEstimatedArrival ||
          addMinutesToTime(activeShift.shiftStart, 60)
      );
      setInputLatePermitApprovedBy(record.latePermitApprovedBy || 'Admin HR');
    } else {
      const offInfo = isEmployeeOffDay(employee, date);
      setInputStatus(offInfo.isOff ? 'libur' : 'hadir');
      setInputCheckIn(activeShift.shiftStart);
      setInputCheckOut(activeShift.shiftEnd);
      setInputOvertimeHours('0');
      setInputNotes('');
      setInputLatePermitReason('');
      setInputLatePermitEstArrival(addMinutesToTime(activeShift.shiftStart, 60));
      setInputLatePermitApprovedBy('Admin HR');
    }
    setInputError(null);
    setInputModalOpen(true);
  };

  const handleDirectCellAction = async (
    employee: Employee,
    date: string,
    existingRecord: AttendanceRecord | null,
    action: 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpha' | 'libur' | 'hapus'
  ) => {
    const cellKey = `${employee.id}__${date}`;
    if (savingCellKey === cellKey) return;
    setSavingCellKey(cellKey);
    try {
      if (action === 'hapus') {
        if (!existingRecord) {
          setSavingCellKey(null);
          return;
        }
        await deleteAttendanceRecord(existingRecord.id);
        setLogSelectedDate(date);
        await onRefresh();
        setActionBanner({
          type: 'success',
          text: `Catatan ${employee.name} (${date}) dihapus dari matriks & log.`,
        });
        return;
      }

      const dayShift = resolveEmployeeDefaultShiftForDate(
        employee,
        date,
        settings?.shifts
      );
      const effectiveShift = existingRecord?.shiftName
        ? resolveAttendanceShift(employee, settings?.shifts, existingRecord.shiftName)
        : dayShift;
      const shiftNameForRecord = isEmployeeShiftAssigned(effectiveShift.shiftName)
        ? effectiveShift.shiftName
        : '';
      const needsTimes = action === 'hadir' || action === 'terlambat';
      const defaultCheckIn =
        action === 'terlambat'
          ? effectiveShift.shiftStart
            ? addMinutesToTime(effectiveShift.shiftStart, 20)
            : ''
          : effectiveShift.shiftStart;

      if (existingRecord) {
        await updateAttendanceRecord(existingRecord.id, {
          status: action,
          shiftName: shiftNameForRecord,
          checkIn: needsTimes ? existingRecord.checkIn || defaultCheckIn : '',
          checkOut: needsTimes ? existingRecord.checkOut || effectiveShift.shiftEnd : '',
        });
      } else {
        await createAttendanceRecord({
          employeeId: employee.id,
          date,
          status: action,
          shiftName: shiftNameForRecord,
          checkIn: needsTimes ? defaultCheckIn : '',
          checkOut: needsTimes ? effectiveShift.shiftEnd : '',
          overtimeHours: 0,
          notes: '',
        });
      }
      setLogSelectedDate(date);
      await onRefresh();
      setActionBanner({
        type: 'success',
        text: `Tersimpan: ${employee.name} (${date}${
          shiftNameForRecord ? ` · ${shiftNameForRecord}` : ''
        }) → ${ATTENDANCE_STATUS_META[action].label} (tercatat di Log Catatan Absensi)`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan data absensi.',
      });
    } finally {
      setSavingCellKey(null);
    }
  };

  const handleMatrixCellClick = (
    employee: Employee,
    date: string,
    record: AttendanceRecord | null
  ) => {
    if (matrixClickMode === 'detail') {
      openCellEditor(employee, date, record);
      return;
    }
    void handleDirectCellAction(employee, date, record, matrixClickMode);
  };

  const handleMatrixCellKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    employee: Employee,
    date: string,
    record: AttendanceRecord | null
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'h') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'hadir');
    } else if (key === 't') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'terlambat');
    } else if (key === 'i') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'izin');
    } else if (key === 's') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'sakit');
    } else if (key === 'a') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'alpha');
    } else if (key === 'l') {
      e.preventDefault();
      void handleDirectCellAction(employee, date, record, 'libur');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (record) {
        e.preventDefault();
        void handleDirectCellAction(employee, date, record, 'hapus');
      }
    }
  };

  const inputNeedsTimeFields =
    inputStatus === 'hadir' ||
    inputStatus === 'terlambat' ||
    inputStatus === 'izin_terlambat';
  const companyName = settings?.companyName || 'KARYAPRESENSI';
  const companySubtitle = settings?.companySubtitle || 'HRIS PERUSAHAAN';
  const matrixColors = useMemo(
    () => normalizeMatrixColors(settings?.matrixColors),
    [settings?.matrixColors]
  );

  const estimatedPrintSheetHeight =
    36 + Math.max(320, 60 + Math.max(1, matrixData.rows.length) * 16 + 76);
  const matrixPrintZoom =
    estimatedPrintSheetHeight > 715
      ? Number(Math.max(0.58, 715 / estimatedPrintSheetHeight).toFixed(3))
      : 1;

  return (
    <div className="space-y-4 sm:space-y-5 print:space-y-0">
      {activeSubTab === 'matriks' && (
        <style media="print">{`@page { size: A4 landscape; margin: 5mm; }`}</style>
      )}
      {/* Unified Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3.5 no-print">
        {/* Sub-tab Switcher & Primary Attendance Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="grid grid-cols-2 sm:inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80 w-full sm:w-auto sm:self-start">
            <button
              type="button"
              onClick={() => setActiveSubTab('matriks')}
              className={`min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'matriks'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Matriks Hadir</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('log')}
              className={`min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'log'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Log Absensi</span>
              <span className="font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                {filteredLogRecords.length}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            {activeSubTab === 'matriks' ? (
              <>
                <button
                  type="button"
                  onClick={() => openToolbarInputModal()}
                  disabled={activeEmployees.length === 0}
                  className="col-span-2 sm:col-span-1 sm:order-3 min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Input Absensi</span>
                </button>

                <button
                  type="button"
                  onClick={() => openToolbarInputModal('izin_terlambat')}
                  disabled={activeEmployees.length === 0}
                  className="sm:order-2 min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Izin Terlambat</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkMarkOff}
                  disabled={bulkBusy}
                  className="sm:order-1 min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CalendarOff className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{bulkBusy ? 'Memproses...' : 'Isi Libur'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="sm:order-4 min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Cetak</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exporting || scopedEmployees.length === 0}
                  className="sm:order-5 min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span className="truncate">{exporting ? 'Menyiapkan...' : 'Ekspor Excel'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('matriks')}
                  className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Input di Matriks</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportLogCsv}
                  disabled={filteredLogRecords.length === 0}
                  className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh CSV Log</span>
                </button>
              </>
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
            <div className="flex items-center gap-2 flex-wrap">
              {actionBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{actionBanner.text}</span>
              {actionBanner.type === 'success' && activeSubTab === 'matriks' && (
                <button
                  type="button"
                  onClick={() => setActiveSubTab('log')}
                  className="ml-1 px-2.5 py-1 rounded bg-white border border-emerald-300 text-emerald-800 font-semibold hover:bg-emerald-100 cursor-pointer"
                >
                  Lihat di Log Absensi →
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              aria-label="Tutup notifikasi"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Shared Filters */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, ID, divisi, catatan..."
              className="w-full min-h-[40px] sm:min-h-0 pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5">
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
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Filter Divisi"
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
          </div>

          {activeSubTab === 'log' && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
              <SearchableEmployeeSelect
                allowAll
                allLabel="Semua Karyawan"
                value={logEmployeeFilter}
                onChange={setLogEmployeeFilter}
                options={activeEmployees.map((emp) => {
                  const shiftDisp = formatEmployeeShiftForDisplay(
                    emp,
                    logSelectedDate || getTodayDateStr(),
                    settings?.shifts
                  );
                  return {
                    id: emp.id,
                    code: emp.employeeCode,
                    name: emp.name,
                    department: emp.department,
                    subtitle: `${emp.department} · ${shiftDisp.shortLabel}`,
                  };
                })}
                className="w-full sm:w-56"
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
                  className="flex-1 sm:flex-none min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setLogShowAllDates((v) => !v)}
                  className={`min-h-[40px] sm:min-h-0 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    logShowAllDates
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {logShowAllDates ? `Sebulan (${selectedMonth})` : 'Per Tanggal'}
                </button>
              </div>
            </div>
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
              className="min-h-[38px] sm:min-h-0 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Status Segmented Filter when viewing Log Catatan Absensi */}
        {activeSubTab === 'log' && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto w-full sm:w-fit max-w-full">
            <button
              type="button"
              onClick={() => setLogStatusFilter('all')}
              className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
      <div
        className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 overflow-hidden print:border-0 print:rounded-none print:p-0 print:overflow-visible matrix-print-sheet"
        style={{ '--matrix-print-zoom': matrixPrintZoom } as React.CSSProperties}
      >
        {loading ? (
          <div className="space-y-3 py-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3 print:space-y-1.5">
            {/* Quick Direct Input Mode Bar inside Matrix Tab */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 pb-1 no-print">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap">
                <span className="text-[11px] font-semibold text-slate-600 mr-1 shrink-0">
                  Mode Klik Sel:
                </span>
                {(
                  [
                    { id: 'detail', label: 'Edit Detail', colorPair: null, activeCls: 'bg-slate-900 text-white border-slate-900' },
                    { id: 'hadir', label: 'Hadir (H)', colorPair: matrixColors.hadir, activeCls: 'font-bold border-slate-700' },
                    { id: 'terlambat', label: 'Terlambat (T)', colorPair: matrixColors.terlambat, activeCls: 'font-bold border-slate-700' },
                    { id: 'izin', label: 'Izin (I)', colorPair: matrixColors.izin, activeCls: 'font-bold border-amber-400' },
                    { id: 'sakit', label: 'Sakit (S)', colorPair: matrixColors.sakit, activeCls: 'font-bold border-slate-700' },
                    { id: 'alpha', label: 'Alpha (A)', colorPair: matrixColors.alpha, activeCls: 'font-bold border-slate-700' },
                    { id: 'libur', label: 'Libur (L)', colorPair: matrixColors.libur, activeCls: 'font-bold border-slate-500' },
                    { id: 'hapus', label: 'Hapus', colorPair: null, activeCls: 'bg-red-50 text-red-700 border-red-300' },
                  ] as const
                ).map((mode) => {
                  const isActive = matrixClickMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setMatrixClickMode(mode.id)}
                      style={
                        isActive && mode.colorPair
                          ? {
                              backgroundColor: mode.colorPair.bg,
                              color: mode.colorPair.text,
                            }
                          : undefined
                      }
                      className={`min-h-[36px] sm:min-h-0 px-3 sm:px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? mode.activeCls
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-slate-500">
                {matrixClickMode === 'detail'
                  ? 'Ketuk sel untuk edit lengkap (atau tekan H / I / S / A di keyboard).'
                  : `Mode Cepat aktif: ketuk sel tanggal mana saja untuk langsung menyimpan "${
                      matrixClickMode === 'hapus'
                        ? 'Hapus Catatan'
                        : ATTENDANCE_STATUS_META[matrixClickMode].label
                    }".`}
              </span>
            </div>

            {/* Top Title Banner aligned over the main table */}
            <div className="xl:pl-60 print:pl-[124px]">
              <div
                style={{
                  backgroundColor: matrixColors.groupHeader.bg,
                  color: matrixColors.groupHeader.text,
                }}
                className="border border-slate-400 py-2 px-3 sm:px-4 print:py-1 print:px-2 text-center font-bold text-xs sm:text-base print:text-[11px] print:leading-tight tracking-wide uppercase"
              >
                DAFTAR HADIR KARYAWAN BULAN {meta.monthName.toUpperCase()} {meta.year}
                {deptFilter !== 'all' ? ` — DIVISI ${deptFilter.toUpperCase()}` : ''}
              </div>
            </div>

            <div className="flex flex-col xl:flex-row print:flex-row gap-4 print:gap-2 items-start print:items-stretch">
              {/* Left Sidebar Panel (SHEET KEHADIRAN) — compact multi-column grid on mobile */}
              <aside className="w-full xl:w-56 print:w-[116px] shrink-0 border border-slate-400 text-xs print:text-[7.5px] select-none bg-white uppercase">
                {/* Brand Block */}
                <div
                  style={{
                    backgroundColor: matrixColors.brandHeader.bg,
                    color: matrixColors.brandHeader.text,
                  }}
                  className="border-b border-slate-400 px-3 py-2.5 xl:h-20 print:px-1.5 print:py-1 print:h-[44px] flex flex-col items-center justify-center text-center"
                >
                  <div className="font-display font-bold text-xs sm:text-sm print:text-[8.5px] tracking-tight leading-tight uppercase">
                    {companyName}
                  </div>
                  <div className="text-[10px] sm:text-[11px] print:text-[7px] font-bold opacity-90 mt-0.5 uppercase">
                    {companySubtitle}
                  </div>
                </div>

                {/* SHEET KEHADIRAN */}
                <div
                  style={{
                    backgroundColor: matrixColors.groupHeader.bg,
                    color: matrixColors.groupHeader.text,
                  }}
                  className="hidden xl:block print:block border-b border-slate-400 py-1.5 px-2 print:py-0.5 print:px-1 print:text-[7.5px] text-center font-bold"
                >
                  SHEET KEHADIRAN
                </div>

                {/* Tahun / Bulan */}
                <div className="grid grid-cols-2 border-b border-slate-400">
                  <div className="grid grid-cols-2 border-r border-slate-400 xl:border-r-0 xl:col-span-2 xl:border-b xl:border-slate-400 print:border-r-0 print:col-span-2 print:border-b print:border-slate-400">
                    <div className="py-1 px-2.5 print:py-0.5 print:px-1 font-bold bg-slate-50 border-r border-slate-400">
                      Tahun
                    </div>
                    <div className="py-1 px-2 print:py-0.5 print:px-1 font-mono font-bold text-center tabular-nums">
                      {meta.year}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 xl:col-span-2 print:col-span-2">
                    <div className="py-1 px-2.5 print:py-0.5 print:px-1 font-bold bg-slate-50 border-r border-slate-400">
                      Bulan
                    </div>
                    <div className="py-1 px-2 print:py-0.5 print:px-1 font-bold text-center truncate">{meta.monthName}</div>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 border-b border-slate-400 text-[11px] print:text-[7px] font-mono text-slate-700 bg-slate-50 text-center">
                  <div className="py-1 px-1.5 print:py-0.5 print:px-1 border-r border-slate-400">
                    {meta.startDateLabel}
                  </div>
                  <div className="py-1 px-1.5 print:py-0.5 print:px-1">{meta.endDateLabel}</div>
                </div>

                {/* KPI Grid */}
                <div className="p-2 print:p-1 border-b border-slate-400 bg-white">
                  <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-2 print:grid-cols-2 gap-1.5 xl:gap-2 print:gap-1">
                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#4472C4] text-white font-bold py-1 print:py-0.5 text-[10px] sm:text-[11px] print:text-[7px] truncate px-0.5">
                        PEGAWAI
                      </div>
                      <div className="bg-[#EAEEF7] font-mono text-base sm:text-xl print:text-[10px] font-bold text-slate-900 py-1.5 sm:py-2 print:py-0.5 tabular-nums">
                        {matrixData.totals.pegawai}
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#548235] text-white font-bold py-1 print:py-0.5 text-[10px] sm:text-[11px] print:text-[7px] truncate px-0.5">
                        HADIR
                      </div>
                      <div className="bg-[#E2EFDA] font-mono text-base sm:text-xl print:text-[10px] font-bold text-slate-900 py-1.5 sm:py-2 print:py-0.5 tabular-nums">
                        {matrixData.totals.hadirPct}%
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#FCE4D6] text-[#833C0C] font-bold py-1 print:py-0.5 text-[10px] sm:text-[11px] print:text-[7px] truncate px-0.5">
                        IJIN
                      </div>
                      <div className="bg-[#FFF2CC] font-mono text-base sm:text-xl print:text-[10px] font-bold text-slate-900 py-1.5 sm:py-2 print:py-0.5 tabular-nums">
                        {matrixData.totals.i}
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center">
                      <div className="bg-[#4338CA] text-white font-bold py-1 print:py-0.5 text-[10px] sm:text-[11px] print:text-[7px] truncate px-0.5">
                        SAKIT
                      </div>
                      <div className="bg-[#EEF2FF] font-mono text-base sm:text-xl print:text-[10px] font-bold text-slate-900 py-1.5 sm:py-2 print:py-0.5 tabular-nums">
                        {matrixData.totals.s}
                      </div>
                    </div>

                    <div className="border border-slate-400 text-center col-span-2 sm:col-span-1 xl:col-span-2 print:col-span-2">
                      <div className="bg-[#C00000] text-white font-bold py-1 print:py-0.5 text-[10px] sm:text-[11px] print:text-[7px] truncate px-0.5">
                        ALPHA
                      </div>
                      <div className="bg-[#F4CCCC] font-mono text-base sm:text-xl print:text-[10px] font-bold text-slate-900 py-1.5 sm:py-2 print:py-0.5 tabular-nums">
                        {matrixData.totals.a}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div
                  style={{
                    backgroundColor: matrixColors.groupHeader.bg,
                    color: matrixColors.groupHeader.text,
                  }}
                  className="border-b border-slate-400 py-1 px-2 print:py-0.5 print:text-[7.5px] text-center font-bold text-[11px]"
                >
                  KETERANGAN
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-1 print:grid-cols-1 xl:divide-y xl:divide-slate-200 print:divide-y print:divide-slate-200 text-[11px] print:text-[7px]">
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 border-b border-r border-slate-200 xl:border-0 print:border-0 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.hadir.bg,
                        color: matrixColors.hadir.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      H
                    </span>
                    <span className="truncate">HADIR / TERLAMBAT</span>
                  </div>
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 border-b border-slate-200 sm:border-r xl:border-0 print:border-0 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.izinTerlambat.bg,
                        color: matrixColors.izinTerlambat.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      H
                    </span>
                    <span className="truncate">IZIN TELAT</span>
                  </div>
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 border-b border-r border-slate-200 sm:border-r-0 xl:border-0 print:border-0 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.izin.bg,
                        color: matrixColors.izin.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 border border-slate-300 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      I
                    </span>
                    <span className="truncate">IZIN</span>
                  </div>
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 border-b border-slate-200 sm:border-b-0 sm:border-r xl:border-0 print:border-0 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.sakit.bg,
                        color: matrixColors.sakit.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      S
                    </span>
                    <span className="truncate">SAKIT</span>
                  </div>
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 border-r border-slate-200 xl:border-0 print:border-0 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.alpha.bg,
                        color: matrixColors.alpha.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      A
                    </span>
                    <span className="truncate">ALPHA</span>
                  </div>
                  <div className="px-2.5 py-1.5 print:px-1.5 print:py-0.5 flex items-center gap-2 print:gap-1">
                    <span
                      style={{
                        backgroundColor: matrixColors.libur.bg,
                        color: matrixColors.libur.text,
                      }}
                      className="inline-flex items-center justify-center w-4 h-4 print:w-2.5 print:h-2.5 border border-slate-400 font-mono font-bold text-[10px] print:text-[6.5px] shrink-0"
                    >
                      L
                    </span>
                    <span className="truncate">LIBUR KARYAWAN</span>
                  </div>
                </div>
              </aside>

              {/* Right Main Excel Matrix */}
              <div className="flex-1 min-w-0 w-full">
                <div className="md:hidden mb-1.5 flex items-center justify-between text-[11px] text-slate-500 no-print">
                  <span>Geser tabel ke kiri/kanan untuk tanggal 1–{days.length} →</span>
                </div>
                <div className="overflow-x-auto rounded-sm print:overflow-visible print:rounded-none">
                <table className="w-full border-collapse text-[11px] uppercase matrix-print-table">
                  <thead>
                    <tr>
                      <th
                        colSpan={3}
                        style={{
                          backgroundColor: matrixColors.groupHeader.bg,
                          color: matrixColors.groupHeader.text,
                        }}
                        className="border border-slate-400 font-bold text-xs print:text-[8px] py-2 px-2 print:py-1 text-center h-16 sm:h-20 print:h-[38px]"
                      >
                        PEGAWAI
                      </th>
                      {days.map((dateStr) => (
                        <th
                          key={dateStr}
                          style={{
                            backgroundColor: matrixColors.groupHeader.bg,
                            color: matrixColors.groupHeader.text,
                          }}
                          className="border border-slate-400 p-0.5 h-16 sm:h-20 print:h-[38px] w-8 sm:w-7 matrix-print-day-col align-middle"
                        >
                          <div className="flex items-center justify-center h-full">
                            <span
                              className="font-semibold text-[10px] print:text-[7px] whitespace-nowrap uppercase"
                              style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                              }}
                            >
                              {getDayNameIndonesian(dateStr).toUpperCase()}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th className="w-2.5 border-0 bg-white matrix-print-spacer-col" />
                      <th
                        colSpan={4}
                        style={{
                          backgroundColor: matrixColors.groupHeader.bg,
                          color: matrixColors.groupHeader.text,
                        }}
                        className="border border-slate-400 font-bold text-xs print:text-[8px] py-2 px-2 print:py-1 text-center"
                      >
                        RINGKASAN
                      </th>
                    </tr>

                    <tr
                      style={{
                        backgroundColor: matrixColors.tableHeader.bg,
                        color: matrixColors.tableHeader.text,
                      }}
                    >
                      <th className="border border-slate-400 py-1.5 px-2 font-bold text-center whitespace-nowrap matrix-print-id-col">
                        ID
                      </th>
                      <th
                        style={{
                          backgroundColor: matrixColors.tableHeader.bg,
                          color: matrixColors.tableHeader.text,
                        }}
                        className="sticky left-0 z-10 print:static border border-slate-400 py-1.5 px-2 sm:px-2.5 font-bold text-left whitespace-nowrap min-w-[116px] max-w-[138px] sm:max-w-none sm:min-w-[165px] shadow-[2px_0_6px_-2px_rgba(15,23,42,0.2)] print:shadow-none matrix-print-name-col"
                      >
                        NAMA
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-bold text-center whitespace-nowrap matrix-print-off-col">
                        HARI LIBUR
                      </th>
                      {days.map((dateStr) => (
                        <th
                          key={dateStr}
                          className="border border-slate-400 py-1.5 px-1 font-mono font-bold text-center tabular-nums min-w-[30px] sm:min-w-0 matrix-print-day-col"
                        >
                          {dateStr.slice(8, 10)}
                        </th>
                      ))}
                      <th className="w-2.5 border-0 bg-white matrix-print-spacer-col" />
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8 matrix-print-sum-col">
                        H
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8 matrix-print-sum-col">
                        I
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8 matrix-print-sum-col">
                        S
                      </th>
                      <th className="border border-slate-400 py-1.5 px-2 font-mono font-bold text-center w-8 matrix-print-sum-col">
                        A
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
                          <td className="border border-slate-400 px-2 py-1 font-mono text-center text-slate-800 whitespace-nowrap matrix-print-id-col">
                            {row.employee.employeeCode}
                          </td>
                          <td className="sticky left-0 z-10 print:static bg-white border border-slate-400 px-2 sm:px-2.5 py-1 font-semibold text-slate-900 whitespace-nowrap max-w-[138px] sm:max-w-none truncate shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)] print:shadow-none matrix-print-name-col">
                            {row.employee.name}
                          </td>
                          <td className="border border-slate-400 px-2 py-1 text-center text-slate-700 whitespace-nowrap matrix-print-off-col">
                            {formatOffDaysSummary(row.employee.offDays)}
                          </td>

                          {row.cells.map((cell) => {
                            let cellClasses = 'bg-white text-slate-800 hover:bg-blue-50';
                            let cellStyle: React.CSSProperties | undefined;
                            if (cell.code === 'H') {
                              cellClasses = 'font-bold hover:brightness-95 transition-[filter]';
                              if (cell.rec?.status === 'terlambat') {
                                cellStyle = {
                                  backgroundColor: matrixColors.terlambat.bg,
                                  color: matrixColors.terlambat.text,
                                };
                              } else if (cell.rec?.status === 'izin_terlambat') {
                                cellStyle = {
                                  backgroundColor: matrixColors.izinTerlambat.bg,
                                  color: matrixColors.izinTerlambat.text,
                                };
                              } else {
                                cellStyle = {
                                  backgroundColor: matrixColors.hadir.bg,
                                  color: matrixColors.hadir.text,
                                };
                              }
                            } else if (cell.code === 'I') {
                              cellClasses = 'font-bold hover:brightness-95 transition-[filter]';
                              cellStyle = {
                                backgroundColor: matrixColors.izin.bg,
                                color: matrixColors.izin.text,
                              };
                            } else if (cell.code === 'S') {
                              cellClasses = 'font-bold hover:brightness-95 transition-[filter]';
                              cellStyle = {
                                backgroundColor: matrixColors.sakit.bg,
                                color: matrixColors.sakit.text,
                              };
                            } else if (cell.code === 'A') {
                              cellClasses = 'font-bold hover:brightness-95 transition-[filter]';
                              cellStyle = {
                                backgroundColor: matrixColors.alpha.bg,
                                color: matrixColors.alpha.text,
                              };
                            } else if (cell.code === 'L' || cell.isOff) {
                              cellClasses = 'font-bold hover:brightness-95 transition-[filter]';
                              cellStyle = {
                                backgroundColor: matrixColors.libur.bg,
                                color: matrixColors.libur.text,
                              };
                            }

                            const cellShift = cell.rec
                              ? cell.rec.shiftName
                                ? resolveAttendanceShift(
                                    row.employee,
                                    settings?.shifts,
                                    cell.rec.shiftName
                                  )
                                : resolveEmployeeDefaultShiftForDate(
                                    row.employee,
                                    cell.date,
                                    settings?.shifts
                                  )
                              : null;
                            const lateMinutes =
                              cell.rec &&
                              cellShift &&
                              cell.rec.checkIn &&
                              (cell.rec.status === 'hadir' ||
                                cell.rec.status === 'terlambat')
                                ? calculateLatenessMinutes(
                                    cell.rec.checkIn,
                                    cellShift.shiftStart
                                  )
                                : 0;

                            const tooltip = cell.rec
                              ? `${row.employee.name} (${cell.date}): ${
                                  cell.rec.shiftName
                                    ? `${cell.rec.shiftName} · `
                                    : ''
                                }${
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

                            const cellKey = `${row.employee.id}__${cell.date}`;
                            const isCellSaving = savingCellKey === cellKey;

                            return (
                              <td
                                key={cell.date}
                                style={cellStyle}
                                className={`border border-slate-400 p-0 text-center font-mono ${cellClasses} ${
                                  isCellSaving ? 'opacity-60 animate-pulse' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  title={tooltip}
                                  disabled={isCellSaving}
                                  onClick={() =>
                                    handleMatrixCellClick(row.employee, cell.date, cell.rec)
                                  }
                                  onKeyDown={(e) =>
                                    handleMatrixCellKeyDown(e, row.employee, cell.date, cell.rec)
                                  }
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    openCellEditor(row.employee, cell.date, cell.rec);
                                  }}
                                  className="w-full h-8 sm:h-6 min-w-[30px] sm:min-w-0 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-700 matrix-print-cell-btn"
                                >
                                  {isCellSaving ? '·' : cell.code}
                                </button>
                              </td>
                            );
                          })}

                          <td className="w-2.5 border-0 bg-white matrix-print-spacer-col" />
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono font-bold text-slate-900 tabular-nums matrix-print-sum-col">
                            {row.summary.h}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums matrix-print-sum-col">
                            {row.summary.i}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums matrix-print-sum-col">
                            {row.summary.s}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1 text-center font-mono text-slate-800 tabular-nums matrix-print-sum-col">
                            {row.summary.a}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  <tfoot>
                    {(['H', 'I', 'S', 'A', 'TOTAL'] as const).map((metric, idx) => (
                      <tr key={metric}>
                        {idx === 0 && (
                          <td
                            colSpan={2}
                            rowSpan={5}
                            style={{
                              backgroundColor: matrixColors.tableHeader.bg,
                              color: matrixColors.tableHeader.text,
                            }}
                            className="border border-slate-400 font-bold text-xs print:text-[8px] text-center align-middle"
                          >
                            RINGKASAN
                          </td>
                        )}
                        <td
                          style={{
                            backgroundColor: matrixColors.tableHeader.bg,
                            color: matrixColors.tableHeader.text,
                          }}
                          className="border border-slate-400 font-mono font-bold text-center py-1 px-2 print:py-0.5 print:px-1"
                        >
                          {metric}
                        </td>
                        {matrixData.daySums.map((ds, dIdx) => {
                          const val =
                            metric === 'TOTAL'
                              ? ds.total
                              : ds[metric.toLowerCase() as 'h' | 'i' | 's' | 'a'];
                          return (
                            <td
                              key={days[dIdx]}
                              className={`border border-slate-400 text-center font-mono py-1 print:py-0.5 tabular-nums matrix-print-day-col ${
                                metric === 'TOTAL'
                                  ? 'bg-slate-100 font-bold text-slate-900'
                                  : 'bg-white text-slate-800'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                        <td className="w-2.5 border-0 bg-white matrix-print-spacer-col" />
                        {idx === 4 ? (
                          <>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 print:py-0.5 tabular-nums matrix-print-sum-col">
                              {matrixData.totals.h}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 print:py-0.5 tabular-nums matrix-print-sum-col">
                              {matrixData.totals.i}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 print:py-0.5 tabular-nums matrix-print-sum-col">
                              {matrixData.totals.s}
                            </td>
                            <td className="border border-slate-400 bg-slate-100 font-mono font-bold text-center py-1 print:py-0.5 tabular-nums matrix-print-sum-col">
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
                </div>

                <p className="mt-2.5 text-[11px] text-slate-500 no-print">
                  Tip: Ketuk tombol <strong>Input Absensi</strong>, <strong>Izin Terlambat</strong>, atau ketuk sel tanggal mana saja pada tabel untuk mencatat/mengubah kehadiran. Gunakan tab <strong>Log Absensi</strong> di atas untuk melihat rincian log jam masuk/pulang, alasan izin, dan lembur.
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
                Seluruh pencatatan absensi baru dilakukan melalui tabel Matriks Daftar Hadir.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('matriks')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                <Table2 className="w-4 h-4" />
                <span>Ke Matriks Daftar Hadir</span>
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Card List for Attendance Log (< md) */}
              <div className="md:hidden divide-y divide-slate-200">
                {filteredLogRecords.map((rec) => {
                  const meta = ATTENDANCE_STATUS_META[rec.status];
                  const emp = employees.find((e) => e.id === rec.employeeId);
                  const recShift = emp
                    ? rec.shiftName
                      ? resolveAttendanceShift(emp, settings?.shifts, rec.shiftName)
                      : resolveEmployeeDefaultShiftForDate(emp, rec.date, settings?.shifts)
                    : null;
                  const lateMins =
                    recShift && rec.checkIn && (rec.status === 'hadir' || rec.status === 'terlambat')
                      ? calculateLatenessMinutes(rec.checkIn, recShift.shiftStart)
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
                    <div key={rec.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">
                            {rec.employeeName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            {rec.date}
                            {emp ? ` · ${emp.employeeCode} · ${emp.department}` : ''}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                        >
                          {meta.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 font-mono tabular-nums">
                        {recShift && isEmployeeShiftAssigned(recShift.shiftName) && (
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-sans text-[11px] font-semibold text-slate-800">
                            {recShift.shiftName}
                            {recShift.shiftStart && recShift.shiftEnd
                              ? ` (${recShift.shiftStart}–${recShift.shiftEnd})`
                              : ''}
                          </span>
                        )}
                        {rec.checkIn && (
                          <span>
                            Masuk: <strong>{rec.checkIn}</strong>
                          </span>
                        )}
                        {rec.checkOut && (
                          <span>
                            Pulang: <strong>{rec.checkOut}</strong>
                          </span>
                        )}
                        {lateMins > 0 && (
                          <span className="text-amber-700 font-semibold">+{lateMins} mnt</span>
                        )}
                        {rec.overtimeHours > 0 && (
                          <span className="text-blue-700 font-semibold">
                            Lembur {rec.overtimeHours.toFixed(1)}j
                          </span>
                        )}
                      </div>

                      {combinedNote && (
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1.5">
                          {combinedNote}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        {canQuickArrive && (
                          <button
                            type="button"
                            disabled={logBusyId === rec.id}
                            onClick={() => handleQuickArriveLog(rec)}
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 cursor-pointer"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Catat Tiba</span>
                          </button>
                        )}
                        {canQuickOut && (
                          <button
                            type="button"
                            disabled={logBusyId === rec.id}
                            onClick={() => handleQuickCheckOutLog(rec)}
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Pulang</span>
                          </button>
                        )}
                        {emp && (
                          <button
                            type="button"
                            onClick={() => openCellEditor(emp, rec.date, rec)}
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Ubah</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={logBusyId === rec.id}
                          onClick={() => handleDeleteLog(rec.id)}
                          aria-label={`Hapus absensi ${rec.employeeName}`}
                          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table for Attendance Log (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Karyawan</th>
                      <th className="py-3 px-4">Shift</th>
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
                      const recShift = emp
                        ? rec.shiftName
                          ? resolveAttendanceShift(emp, settings?.shifts, rec.shiftName)
                          : resolveEmployeeDefaultShiftForDate(emp, rec.date, settings?.shifts)
                        : null;
                      const offOnDate = emp ? isEmployeeOffDay(emp, rec.date).isOff : false;
                      const lateMins =
                        recShift && rec.checkIn && (rec.status === 'hadir' || rec.status === 'terlambat')
                          ? calculateLatenessMinutes(rec.checkIn, recShift.shiftStart)
                          : 0;
                      const permitTimeRef = rec.checkIn || rec.latePermitEstimatedArrival || '';
                      const permitMins =
                        recShift && permitTimeRef && rec.status === 'izin_terlambat'
                          ? calculateLatenessMinutes(permitTimeRef, recShift.shiftStart)
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
                            {recShift && isEmployeeShiftAssigned(recShift.shiftName) ? (
                              <div>
                                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 rounded">
                                  {recShift.shiftName}
                                </span>
                                {recShift.shiftStart && recShift.shiftEnd && (
                                  <div className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                                    {recShift.shiftStart}–{recShift.shiftEnd}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
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
            </>
          )}
        </div>
      )}

      {/* Modal Input Absensi / Edit Kehadiran Sel (Terpadu & Tercatat di Log Catatan Absensi) */}
      {inputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs no-print">
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-5 sm:p-6 max-h-[92dvh] overflow-y-auto shadow-2xl pb-safe">
            <div className="sm:hidden pb-3 flex justify-center">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                  {inputModalTitle}
                </h3>
                {selectedInputEmployee && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono font-semibold">{selectedInputEmployee.employeeCode}</span>{' '}
                    · {selectedInputEmployee.name} ·{' '}
                    <span className="font-mono">{inputDate}</span>
                  </p>
                )}
              </div>
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
                        const empShiftDisp = formatEmployeeShiftForDisplay(
                          emp,
                          inputDate || getTodayDateStr(),
                          settings?.shifts
                        );
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
                                {emp.department} ·{' '}
                                {empShiftDisp.hasSchedule
                                  ? `${empShiftDisp.shiftName} ${empShiftDisp.shiftStart}–${empShiftDisp.shiftEnd}`
                                  : empShiftDisp.shortLabel}{' '}
                                · Libur: {formatOffDaysSummary(emp.offDays)}
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
                    Shift Kerja
                  </label>
                  <select
                    value={inputShiftName}
                    onChange={(e) => handleChangeInputShift(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    <option value="">-- Pilih Shift (Belum Dijadwalkan) --</option>
                    {inputShiftSelectOptions.map((sh) => (
                      <option key={sh.name} value={sh.name}>
                        {sh.name}
                        {sh.startTime && sh.endTime ? ` (${sh.startTime}–${sh.endTime})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {scheduledDayShiftsForInput.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="font-medium text-slate-700">
                    Jadwal {getDayNameIndonesian(inputDate)}:
                  </span>
                  {scheduledDayShiftsForInput.map((shName) => {
                    const isActive =
                      inputShiftName.toLowerCase() === shName.toLowerCase();
                    return (
                      <button
                        key={shName}
                        type="button"
                        onClick={() => handleChangeInputShift(shName)}
                        className={`px-2 py-0.5 rounded border font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50'
                        }`}
                      >
                        {shName}
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Status Kehadiran
                </label>
                <select
                  value={inputStatus}
                  onChange={(e) => {
                    const nextSt = e.target.value as AttendanceStatus;
                    setInputStatus(nextSt);
                    const refStart = activeInputShiftInfo?.shiftStart || '08:00';
                    const refEnd = activeInputShiftInfo?.shiftEnd || '17:00';
                    if (nextSt === 'izin_terlambat') {
                      if (!existingRecordForInput) setInputCheckIn('');
                      setInputLatePermitEstArrival(addMinutesToTime(refStart, 60));
                      if (!inputCheckOut) setInputCheckOut(refEnd);
                    } else if (
                      (nextSt === 'hadir' || nextSt === 'terlambat') &&
                      !inputCheckIn
                    ) {
                      setInputCheckIn(refStart);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {ATTENDANCE_STATUS_META[st].label} (Kode matriks:{' '}
                      {statusToMatrixCode(st) || 'L'})
                    </option>
                  ))}
                </select>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-teal-950 mb-1">
                        Perkiraan Tiba
                      </label>
                      <input
                        type="time"
                        value={inputLatePermitEstArrival}
                        onChange={(e) => setInputLatePermitEstArrival(e.target.value)}
                        className="w-full px-2.5 py-2 sm:py-1.5 text-xs font-mono bg-white border border-teal-200 rounded-lg"
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
                        className="w-full px-2.5 py-2 sm:py-1.5 text-xs bg-white border border-teal-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {inputNeedsTimeFields && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                            activeInputShiftInfo &&
                            (inputStatus === 'hadir' || inputStatus === 'terlambat')
                          ) {
                            const evalRes = evaluateLateness(
                              nextCheckIn,
                              activeInputShiftInfo.shiftStart,
                              activeInputShiftInfo.lateToleranceMinutes
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

                  {inputStatus !== 'izin_terlambat' &&
                    activeInputShiftInfo &&
                    activeInputShiftInfo.shiftStart &&
                    inputCheckIn &&
                    (() => {
                    const evalRes = evaluateLateness(
                      inputCheckIn,
                      activeInputShiftInfo.shiftStart,
                      activeInputShiftInfo.lateToleranceMinutes
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
                          {activeInputShiftInfo.shiftName}{' '}
                          <span className="font-mono font-semibold">
                            {activeInputShiftInfo.shiftStart}–{activeInputShiftInfo.shiftEnd}
                          </span>
                          {activeInputShiftInfo.lateToleranceMinutes > 0
                            ? ` (toleransi ${activeInputShiftInfo.lateToleranceMinutes} mnt)`
                            : ''}
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

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-slate-100">
                {existingRecordForInput ? (
                  <button
                    type="button"
                    disabled={inputSaving}
                    onClick={handleDeleteFromInputModal}
                    className="w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 rounded-xl sm:rounded-lg hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Catatan</span>
                  </button>
                ) : (
                  <span className="hidden sm:inline" />
                )}

                <div className="flex flex-col-reverse sm:flex-row items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setInputModalOpen(false)}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl sm:rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={inputSaving}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-xl sm:rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    {inputSaving
                      ? 'Menyimpan...'
                      : existingRecordForInput
                      ? 'Perbarui Absensi'
                      : 'Simpan Absensi'}
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
