import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  CalendarOff,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Layers,
  Moon,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Sun,
  Sunset,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AppSettings,
  calculateDurationHours,
  Employee,
  formatIndonesianDate,
  getActiveWeekDates,
  getDayOfWeekFromDateStr,
  getEmployeeScheduledShiftsForWeekday,
  getEmployeeWeeklyShiftSummary,
  getShiftMembersForWeekday,
  getTodayDateStr,
  HARI_MAP,
  HARI_WEEKDAYS,
  isEmployeeOffDay,
  isEmployeeOffOnShiftDay,
  NavSection,
  ShiftConfig,
} from '../types';
import { updateAppSettings, updateEmployee } from '../services/attendanceService';
import { exportShiftScheduleToExcel } from '../utils/excelShiftExport';
import {
  buildDailyScheduleBlocks,
  groupEmployeesByPosition,
} from '../utils/shiftScheduleLayout';
import { Tilt3DCard } from './Tilt3DCard';
import { ReadOnlyModeBanner } from './ReadOnlyModeBanner';

interface ShiftScheduleViewProps {
  employees: Employee[];
  settings: AppSettings;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate?: (nav: NavSection) => void;
  isAttendanceAdmin?: boolean;
  onRequestAttendanceAdmin?: () => void;
}

type ShiftSubTab = 'harian' | 'roster' | 'mingguan' | 'preview';

interface ShiftVisualStyle {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  headerBg: string;
  accentBar: string;
  iconBg: string;
  iconText: string;
  cardRing: string;
  icon: 'sun' | 'sunset' | 'moon' | 'clock' | 'layers';
}

function getShiftVisualStyle(shiftName: string, index: number): ShiftVisualStyle {
  const lower = shiftName.toLowerCase();
  if (lower.includes('pagi')) {
    return {
      badgeBg: 'bg-amber-50',
      badgeText: 'text-amber-800',
      badgeBorder: 'border-amber-200',
      headerBg: 'bg-amber-50/60',
      accentBar: 'bg-amber-500',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-700',
      cardRing: 'ring-amber-400',
      icon: 'sun',
    };
  }
  if (lower.includes('siang') || lower.includes('sore')) {
    return {
      badgeBg: 'bg-indigo-50',
      badgeText: 'text-indigo-800',
      badgeBorder: 'border-indigo-200',
      headerBg: 'bg-indigo-50/60',
      accentBar: 'bg-indigo-600',
      iconBg: 'bg-indigo-100',
      iconText: 'text-indigo-700',
      cardRing: 'ring-indigo-400',
      icon: 'sunset',
    };
  }
  if (lower.includes('malam')) {
    return {
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-800',
      badgeBorder: 'border-slate-300',
      headerBg: 'bg-slate-100/80',
      accentBar: 'bg-slate-800',
      iconBg: 'bg-slate-200',
      iconText: 'text-slate-800',
      cardRing: 'ring-slate-500',
      icon: 'moon',
    };
  }
  if (lower.includes('reguler') || index === 1) {
    return {
      badgeBg: 'bg-blue-50',
      badgeText: 'text-blue-800',
      badgeBorder: 'border-blue-200',
      headerBg: 'bg-blue-50/60',
      accentBar: 'bg-blue-700',
      iconBg: 'bg-blue-100',
      iconText: 'text-blue-700',
      cardRing: 'ring-blue-400',
      icon: 'clock',
    };
  }
  return {
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200',
    headerBg: 'bg-teal-50/60',
    accentBar: 'bg-teal-600',
    iconBg: 'bg-teal-100',
    iconText: 'text-teal-700',
    cardRing: 'ring-teal-400',
    icon: 'layers',
  };
}

function renderShiftIcon(icon: ShiftVisualStyle['icon'], className = 'w-4 h-4') {
  switch (icon) {
    case 'sun':
      return <Sun className={className} />;
    case 'sunset':
      return <Sunset className={className} />;
    case 'moon':
      return <Moon className={className} />;
    case 'clock':
      return <Clock className={className} />;
    default:
      return <Layers className={className} />;
  }
}

export const ShiftScheduleView: React.FC<ShiftScheduleViewProps> = ({
  employees,
  settings,
  loading,
  onRefresh,
  onNavigate,
  isAttendanceAdmin = false,
  onRequestAttendanceAdmin,
}) => {
  const today = getTodayDateStr();
  const activeWeekDates = useMemo(() => getActiveWeekDates(today), [today]);
  const todayWeekday = useMemo(() => {
    const parts = today.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return new Date().getDay();
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }, [today]);

  const [subTab, setSubTab] = useState<ShiftSubTab>('harian');
  const [previewFormat, setPreviewFormat] = useState<'cetak' | 'karyawan'>('cetak');
  const [selectedWeekdayFilter, setSelectedWeekdayFilter] = useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');

  const [busyDailyKey, setBusyDailyKey] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [printOverrideDayIndex, setPrintOverrideDayIndex] = useState<number | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintOverrideDayIndex(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  // Modal A: Atur Anggota Harian (per Shift + Hari Senin..Minggu)
  const [dailyModal, setDailyModal] = useState<{
    shift: ShiftConfig;
    dayIndex: number;
  } | null>(null);
  const [dailyModalSelectedIds, setDailyModalSelectedIds] = useState<Set<string>>(new Set());
  const [dailyModalSearch, setDailyModalSearch] = useState<string>('');
  const [dailyModalApplyScope, setDailyModalApplyScope] = useState<'single' | 'weekdays' | 'all'>('single');
  const [dailyModalError, setDailyModalError] = useState<string | null>(null);
  const [savingDailyModal, setSavingDailyModal] = useState<boolean>(false);

  // Modal B: Salin Jadwal Satu Hari ke Hari Lain
  const [copyDaySource, setCopyDaySource] = useState<number | null>(null);
  const [copyDayTargets, setCopyDayTargets] = useState<Set<number>>(new Set());
  const [savingCopyDay, setSavingCopyDay] = useState<boolean>(false);

  // Modal 2: Buat / Edit Shift
  const [shiftFormOpen, setShiftFormOpen] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<ShiftConfig | null>(null);
  const [shiftNameInput, setShiftNameInput] = useState<string>('');
  const [shiftStartInput, setShiftStartInput] = useState<string>('08:00');
  const [shiftEndInput, setShiftEndInput] = useState<string>('17:00');
  const [shiftToleranceInput, setShiftToleranceInput] = useState<number>(10);
  const [newShiftMemberIds, setNewShiftMemberIds] = useState<Set<string>>(new Set());
  const [newShiftMemberSearch, setNewShiftMemberSearch] = useState<string>('');
  const [savingShiftForm, setSavingShiftForm] = useState<boolean>(false);

  // Modal 3: Konfirmasi Hapus Shift
  const [deletingShift, setDeletingShift] = useState<ShiftConfig | null>(null);
  const [deleteTargetShiftId, setDeleteTargetShiftId] = useState<string>('');
  const [deletingBusy, setDeletingBusy] = useState<boolean>(false);

  // Modal 4: Pindah Hari Libur / Tanggal Libur
  const [moveOffModal, setMoveOffModal] = useState<{
    emp: Employee;
    sourceDayIndex: number;
    sourceDateStr: string;
    autoAddToDailyModal: boolean;
  } | null>(null);
  const [moveOffMode, setMoveOffMode] = useState<'hari' | 'tanggal'>('hari');
  const [moveTargetDayIndex, setMoveTargetDayIndex] = useState<number>(1);
  const [moveSourceCustomDate, setMoveSourceCustomDate] = useState<string>('');
  const [moveTargetCustomDate, setMoveTargetCustomDate] = useState<string>('');
  const [moveTargetShiftId, setMoveTargetShiftId] = useState<string>('');
  const [moveOffError, setMoveOffError] = useState<string | null>(null);
  const [savingMoveOff, setSavingMoveOff] = useState<boolean>(false);

  const shifts = settings.shifts;

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [employees]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    activeEmployees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeEmployees.filter((emp) => {
      if (departmentFilter !== 'ALL' && emp.department !== departmentFilter) {
        return false;
      }
      if (q) {
        const weeklySummary = getEmployeeWeeklyShiftSummary(emp.id, shifts);
        const scheduledHit = weeklySummary.uniqueShiftNames.some((n) =>
          n.toLowerCase().includes(q)
        );
        const hit =
          emp.name.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q) ||
          scheduledHit;
        if (!hit) return false;
      }
      return true;
    });
  }, [activeEmployees, departmentFilter, searchQuery, shifts]);

  const shiftSummaries = useMemo(() => {
    const activeIds = new Set(activeEmployees.map((e) => e.id));
    return shifts.map((shift, idx) => {
      const weeklyMemberIdSet = new Set<string>();
      for (const day of HARI_WEEKDAYS) {
        const { members } = getShiftMembersForWeekday(shift, day.index, activeEmployees);
        for (const m of members) {
          if (activeIds.has(m.id)) weeklyMemberIdSet.add(m.id);
        }
      }
      const todayDaily = getShiftMembersForWeekday(shift, todayWeekday, activeEmployees);
      const onDutyToday = todayDaily.members.filter(
        (e) => !isEmployeeOffDay(e, today).isOff
      ).length;
      const offToday = Math.max(0, todayDaily.members.length - onDutyToday);
      return {
        shift,
        style: getShiftVisualStyle(shift.name, idx),
        weeklyUniqueCount: weeklyMemberIdSet.size,
        todayAssignedCount: todayDaily.members.length,
        onDutyToday,
        offToday,
        durationHours: calculateDurationHours(shift.startTime, shift.endTime),
      };
    });
  }, [shifts, activeEmployees, today, todayWeekday]);

  const visibleShiftSummaries = useMemo(() => {
    if (shiftFilter === 'ALL') return shiftSummaries;
    return shiftSummaries.filter((item) => item.shift.id === shiftFilter);
  }, [shiftSummaries, shiftFilter]);

  const visibleWeekdays = useMemo(() => {
    if (selectedWeekdayFilter === 'ALL') return HARI_WEEKDAYS;
    return HARI_WEEKDAYS.filter((d) => d.index === selectedWeekdayFilter);
  }, [selectedWeekdayFilter]);

  const printBlocks = useMemo(() => {
    const targetDays =
      printOverrideDayIndex !== null
        ? HARI_WEEKDAYS.filter((d) => d.index === printOverrideDayIndex)
        : visibleWeekdays;
    return buildDailyScheduleBlocks({
      shifts,
      employees: activeEmployees,
      days: targetDays,
    });
  }, [shifts, activeEmployees, visibleWeekdays, printOverrideDayIndex]);

  const previewQaStats = useMemo(() => {
    let totalAssignedSlots = 0;
    let totalOffSlots = 0;
    const unscheduledItems: { dayLabel: string; employeeNames: string[] }[] = [];

    for (const day of visibleWeekdays) {
      const weekDateStr = activeWeekDates[day.index];
      const assignedIds = new Set<string>();
      for (const s of shifts) {
        const { members } = getShiftMembersForWeekday(s, day.index, activeEmployees);
        members.forEach((m) => {
          if (!isEmployeeOffOnShiftDay(m, day.index, weekDateStr).isOff) {
            assignedIds.add(m.id);
          }
        });
      }
      totalAssignedSlots += assignedIds.size;
      const offEmps = activeEmployees.filter(
        (e) => isEmployeeOffOnShiftDay(e, day.index, weekDateStr).isOff
      );
      totalOffSlots += offEmps.length;
      const unscheduled = activeEmployees
        .filter(
          (e) =>
            !isEmployeeOffOnShiftDay(e, day.index, weekDateStr).isOff &&
            !assignedIds.has(e.id)
        )
        .map((e) => e.name);
      if (unscheduled.length > 0) {
        unscheduledItems.push({ dayLabel: day.label, employeeNames: unscheduled });
      }
    }

    return {
      dayCount: visibleWeekdays.length,
      totalAssignedSlots,
      totalOffSlots,
      unscheduledItems,
      totalUnscheduledSlots: unscheduledItems.reduce(
        (acc, item) => acc + item.employeeNames.length,
        0
      ),
    };
  }, [visibleWeekdays, shifts, activeEmployees, activeWeekDates]);

  const openPreviewForDay = (dayIndex?: number) => {
    if (typeof dayIndex === 'number') {
      setSelectedWeekdayFilter(dayIndex);
    }
    setSubTab('preview');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const showToast = (msg: string) => {
    setErrorMessage(null);
    setBannerMessage(msg);
  };

  // Daily roster modal handlers
  const openDailyMemberModal = (shift: ShiftConfig, dayIndex: number) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk mengubah anggota shift.'
      );
      return;
    }
    const weekDateStr = activeWeekDates[dayIndex];
    const { members } = getShiftMembersForWeekday(shift, dayIndex, activeEmployees);
    const eligibleMembers = members.filter(
      (m) => !isEmployeeOffOnShiftDay(m, dayIndex, weekDateStr).isOff
    );
    setDailyModal({ shift, dayIndex });
    setDailyModalSelectedIds(new Set(eligibleMembers.map((m) => m.id)));
    setDailyModalSearch('');
    setDailyModalApplyScope('single');
    setDailyModalError(null);
    setErrorMessage(null);
  };

  const openMoveOffModal = (
    emp: Employee,
    dayIndex: number,
    options?: { autoAddToDailyModal?: boolean; preferredShiftId?: string }
  ) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk memindahkan hari/tanggal libur.'
      );
      return;
    }
    const sourceDateStr = activeWeekDates[dayIndex] || today;
    const offInfo = isEmployeeOffOnShiftDay(emp, dayIndex, sourceDateStr);
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const candidateDay =
      weekdayOrder.find((d) => d !== dayIndex && !emp.offDays.includes(d)) ??
      weekdayOrder.find((d) => d !== dayIndex) ??
      1;

    // Pick a sensible replacement date (first day in active week that is not already off, or +1 day)
    const candidateWeekDay = weekdayOrder.find((d) => {
      if (d === dayIndex) return false;
      const dtStr = activeWeekDates[d];
      return dtStr && !isEmployeeOffDay(emp, dtStr).isOff;
    });
    let fallbackTargetDate = candidateWeekDay ? activeWeekDates[candidateWeekDay] : '';
    if (!fallbackTargetDate) {
      const parts = sourceDateStr.split('-').map(Number);
      const dt =
        parts.length === 3 && !parts.some(isNaN)
          ? new Date(parts[0], parts[1] - 1, parts[2] + 1)
          : new Date();
      fallbackTargetDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(dt.getDate()).padStart(2, '0')}`;
    }

    setMoveOffModal({
      emp,
      sourceDayIndex: dayIndex,
      sourceDateStr,
      autoAddToDailyModal: Boolean(options?.autoAddToDailyModal),
    });
    setMoveOffMode(offInfo.isCustomDateOff && !offInfo.isRoutineOff ? 'tanggal' : 'hari');
    setMoveTargetDayIndex(candidateDay);
    setMoveSourceCustomDate(sourceDateStr);
    setMoveTargetCustomDate(fallbackTargetDate);
    setMoveTargetShiftId(options?.preferredShiftId ?? '');
    setMoveOffError(null);
  };

  const handleConfirmMoveOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveOffModal) return;

    const { emp, sourceDayIndex, sourceDateStr, autoAddToDailyModal } = moveOffModal;
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    let nextOffDays = [...(emp.offDays || [])];
    let nextCustomDates = [...(emp.customOffDates || [])];
    const cleanupDayIndices = new Set<number>();
    let actionSummary = '';

    if (moveOffMode === 'hari') {
      if (moveTargetDayIndex === sourceDayIndex) {
        setMoveOffError('Pilih hari libur pengganti yang berbeda dari hari libur asal.');
        return;
      }
      if (emp.offDays.includes(moveTargetDayIndex)) {
        setMoveOffError(
          `Hari ${HARI_MAP[moveTargetDayIndex]?.label ?? ''} sudah merupakan hari libur rutin ${emp.name}.`
        );
        return;
      }

      nextOffDays = Array.from(
        new Set([
          ...nextOffDays.filter((d) => d !== sourceDayIndex),
          moveTargetDayIndex,
        ])
      ).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));

      // Jika tanggal minggu ini pada hari asal juga tercatat di customOffDates, bersihkan agar benar-benar bisa masuk jadwal
      if (sourceDateStr && nextCustomDates.includes(sourceDateStr)) {
        nextCustomDates = nextCustomDates.filter((dt) => dt !== sourceDateStr);
      }

      cleanupDayIndices.add(moveTargetDayIndex);
      actionSummary = `Hari libur ${emp.name} dipindah dari ${HARI_MAP[sourceDayIndex]?.label ?? ''} ke ${HARI_MAP[moveTargetDayIndex]?.label ?? ''}`;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(moveTargetCustomDate)) {
        setMoveOffError('Pilih tanggal libur pengganti yang valid.');
        return;
      }
      const srcDateToRemove = moveSourceCustomDate || sourceDateStr;
      if (moveTargetCustomDate === srcDateToRemove) {
        setMoveOffError('Tanggal libur pengganti harus berbeda dari tanggal asal.');
        return;
      }
      const targetDow = getDayOfWeekFromDateStr(moveTargetCustomDate);
      const willTargetRoutineConflict =
        nextOffDays.filter((d) => d !== sourceDayIndex).includes(targetDow) ||
        nextCustomDates.filter((dt) => dt !== srcDateToRemove).includes(moveTargetCustomDate);
      if (willTargetRoutineConflict) {
        setMoveOffError(
          `Tanggal ${formatIndonesianDate(moveTargetCustomDate)} sudah termasuk hari/tanggal libur ${emp.name}. Pilih tanggal masuk kerja lainnya.`
        );
        return;
      }

      // Lepas hari libur rutin pada hari asal bila ada, supaya tanggal asal benar-benar bisa dijadwalkan masuk
      if (nextOffDays.includes(sourceDayIndex)) {
        nextOffDays = nextOffDays.filter((d) => d !== sourceDayIndex);
      }
      if (srcDateToRemove) {
        nextCustomDates = nextCustomDates.filter((dt) => dt !== srcDateToRemove);
      }
      if (!nextCustomDates.includes(moveTargetCustomDate)) {
        nextCustomDates = [...nextCustomDates, moveTargetCustomDate].sort();
      }

      if (activeWeekDates[targetDow] === moveTargetCustomDate) {
        cleanupDayIndices.add(targetDow);
      }

      actionSummary = `Tanggal libur ${emp.name} dipindah dari ${formatIndonesianDate(
        srcDateToRemove
      )} ke ${formatIndonesianDate(moveTargetCustomDate)}`;
    }

    setSavingMoveOff(true);
    setMoveOffError(null);
    setErrorMessage(null);
    try {
      await updateEmployee(emp.id, {
        offDays: nextOffDays,
        customOffDates: nextCustomDates,
      });

      let shiftsChanged = false;
      let nextShifts = shifts.map((s) => {
        let updatedDaily = s.dailyMemberIds ? { ...s.dailyMemberIds } : undefined;
        cleanupDayIndices.forEach((cleanDay) => {
          const dKey = String(cleanDay);
          if (updatedDaily && Array.isArray(updatedDaily[dKey]) && updatedDaily[dKey].includes(emp.id)) {
            updatedDaily[dKey] = updatedDaily[dKey].filter((id) => id !== emp.id);
            shiftsChanged = true;
          }
        });
        return updatedDaily ? { ...s, dailyMemberIds: updatedDaily } : s;
      });

      let assignedShiftName = '';
      if (!autoAddToDailyModal && moveTargetShiftId) {
        const targetShift = nextShifts.find((s) => s.id === moveTargetShiftId);
        if (targetShift) {
          const dayKey = String(sourceDayIndex);
          nextShifts = nextShifts.map((s) => {
            const nextDaily = { ...(s.dailyMemberIds ?? {}) };
            const currentIds = Array.isArray(nextDaily[dayKey]) ? [...nextDaily[dayKey]] : [];
            if (s.id === targetShift.id) {
              if (!currentIds.includes(emp.id)) {
                currentIds.push(emp.id);
              }
              nextDaily[dayKey] = currentIds;
              shiftsChanged = true;
            } else if (currentIds.includes(emp.id)) {
              nextDaily[dayKey] = currentIds.filter((id) => id !== emp.id);
              shiftsChanged = true;
            }
            return { ...s, dailyMemberIds: nextDaily };
          });
          assignedShiftName = targetShift.name;
        }
      }

      if (shiftsChanged) {
        await updateAppSettings({ shifts: nextShifts });
      }

      await onRefresh();

      if (autoAddToDailyModal && dailyModal && dailyModal.dayIndex === sourceDayIndex) {
        setDailyModalSelectedIds((prev) => {
          const next = new Set(prev);
          next.add(emp.id);
          return next;
        });
        setDailyModalError(null);
      }

      setMoveOffModal(null);
      showToast(
        autoAddToDailyModal && dailyModal
          ? `${actionSummary}. ${emp.name} otomatis dicentang ke ${dailyModal.shift.name} — klik "Simpan Jadwal Harian" untuk menyimpan.`
          : assignedShiftName
            ? `${actionSummary} dan langsung dimasukkan ke ${assignedShiftName} (${HARI_MAP[sourceDayIndex]?.label ?? ''}).`
            : `${actionSummary}. Sekarang ${emp.name} sudah dapat masuk jadwal hari ${HARI_MAP[sourceDayIndex]?.label ?? ''}.`
      );
    } catch (err) {
      setMoveOffError(
        err instanceof Error ? err.message : 'Gagal memindahkan jadwal libur karyawan.'
      );
    } finally {
      setSavingMoveOff(false);
    }
  };

  const dailyModalFilteredEmployees = useMemo(() => {
    const q = dailyModalSearch.trim().toLowerCase();
    return activeEmployees.filter((emp) => {
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.position.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
      );
    });
  }, [activeEmployees, dailyModalSearch]);

  const dailyModalGroupedEmployees = useMemo(
    () => groupEmployeesByPosition(dailyModalFilteredEmployees),
    [dailyModalFilteredEmployees]
  );

  // Map employeeId -> array of conflicting other shift labels across target days (anti double shift)
  const dailyOtherShiftMap = useMemo(() => {
    const result = new Map<string, string[]>();
    if (!dailyModal) return result;
    const targetDays: number[] =
      dailyModalApplyScope === 'all'
        ? [1, 2, 3, 4, 5, 6, 0]
        : dailyModalApplyScope === 'weekdays'
          ? [1, 2, 3, 4, 5, 6]
          : [dailyModal.dayIndex];

    for (const s of shifts) {
      if (s.id === dailyModal.shift.id) continue;
      for (const d of targetDays) {
        const { members } = getShiftMembersForWeekday(s, d, activeEmployees);
        for (const m of members) {
          const prev = result.get(m.id) ?? [];
          const label =
            targetDays.length === 1 ? s.name : `${s.name} (${HARI_MAP[d]?.short ?? ''})`;
          if (!prev.includes(label)) {
            prev.push(label);
            result.set(m.id, prev);
          }
        }
      }
    }
    return result;
  }, [dailyModal, dailyModalApplyScope, shifts, activeEmployees]);

  const dailyOffEmployeesOnModalDay = useMemo(() => {
    if (!dailyModal) return [];
    const weekDateStr = activeWeekDates[dailyModal.dayIndex];
    return activeEmployees.filter(
      (emp) => isEmployeeOffOnShiftDay(emp, dailyModal.dayIndex, weekDateStr).isOff
    );
  }, [dailyModal, activeEmployees, activeWeekDates]);

  const handleSaveDailyModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyModal) return;

    const targetDays: number[] =
      dailyModalApplyScope === 'all'
        ? [1, 2, 3, 4, 5, 6, 0]
        : dailyModalApplyScope === 'weekdays'
          ? [1, 2, 3, 4, 5, 6]
          : [dailyModal.dayIndex];

    const empById = new Map<string, Employee>(activeEmployees.map((emp) => [emp.id, emp]));
    const orderedSelectedIds = activeEmployees
      .filter((emp) => dailyModalSelectedIds.has(emp.id))
      .map((emp) => emp.id);

    // Block selecting employees who are OFF on the primary modal day
    const modalDayDateStr = activeWeekDates[dailyModal.dayIndex];
    const offConflictsOnModalDay = orderedSelectedIds
      .map((empId) => empById.get(empId))
      .filter(
        (emp): emp is Employee =>
          Boolean(
            emp &&
              isEmployeeOffOnShiftDay(emp, dailyModal.dayIndex, modalDayDateStr).isOff
          )
      );
    if (offConflictsOnModalDay.length > 0) {
      const names = offConflictsOnModalDay.slice(0, 3).map((e) => e.name).join(', ');
      setDailyModalError(
        `Karyawan sedang libur pada hari ${HARI_MAP[dailyModal.dayIndex]?.label ?? ''}: ${names}. Tidak bisa masuk jadwal tanpa memindahkan hari/tanggal liburnya terlebih dahulu.`
      );
      return;
    }

    // Enforce anti-double-shift validation across every target day
    const conflicts: string[] = [];
    for (const empId of orderedSelectedIds) {
      const otherLabels = dailyOtherShiftMap.get(empId);
      if (otherLabels && otherLabels.length > 0) {
        const emp = empById.get(empId);
        if (emp) {
          conflicts.push(`${emp.name} (${otherLabels.join(', ')})`);
        }
      }
    }
    if (conflicts.length > 0) {
      const preview = conflicts.slice(0, 3).join('; ');
      const extra = conflicts.length > 3 ? ` dan ${conflicts.length - 3} lainnya` : '';
      setDailyModalError(
        `Tidak bisa double shift! Karyawan berikut sudah masuk shift lain: ${preview}${extra}. Keluarkan dari shift sebelumnya terlebih dahulu.`
      );
      return;
    }

    setSavingDailyModal(true);
    setDailyModalError(null);
    setErrorMessage(null);
    try {
      let skippedOffOnOtherDaysCount = 0;
      const nextShifts = shifts.map((s) => {
        if (s.id !== dailyModal.shift.id) return s;
        const nextDaily: Record<string, string[]> = { ...(s.dailyMemberIds ?? {}) };
        for (const d of targetDays) {
          const dayDateStr = activeWeekDates[d];
          const eligibleForTargetDay = orderedSelectedIds.filter((empId) => {
            const emp = empById.get(empId);
            if (!emp) return false;
            const isOffOnTarget = isEmployeeOffOnShiftDay(emp, d, dayDateStr).isOff;
            if (isOffOnTarget) {
              skippedOffOnOtherDaysCount += 1;
              return false;
            }
            return true;
          });
          nextDaily[String(d)] = eligibleForTargetDay;
        }
        return {
          ...s,
          dailyMemberIds: nextDaily,
        };
      });

      await updateAppSettings({ shifts: nextShifts });
      await onRefresh();
      const dayLabel = HARI_MAP[dailyModal.dayIndex]?.label ?? '';
      const shiftName = dailyModal.shift.name;
      setDailyModal(null);
      showToast(
        dailyModalApplyScope === 'single'
          ? `Jadwal ${shiftName} hari ${dayLabel} disimpan (${orderedSelectedIds.length} karyawan).`
          : `Jadwal ${shiftName} diterapkan ke ${targetDays.length} hari (${orderedSelectedIds.length} karyawan${
              skippedOffOnOtherDaysCount > 0
                ? `, ${skippedOffOnOtherDaysCount} slot hari libur dilewati otomatis`
                : ''
            }).`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menyimpan jadwal shift harian.';
      setDailyModalError(msg);
      setErrorMessage(msg);
    } finally {
      setSavingDailyModal(false);
    }
  };

  const handleRemoveEmployeeFromDailyShift = async (
    shift: ShiftConfig,
    dayIndex: number,
    emp: Employee
  ) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk mengubah.'
      );
      return;
    }
    const lockKey = `${shift.id}__${dayIndex}`;
    setBusyDailyKey(lockKey);
    setErrorMessage(null);
    try {
      const { members } = getShiftMembersForWeekday(shift, dayIndex, activeEmployees);
      const nextIds = members.filter((m) => m.id !== emp.id).map((m) => m.id);
      const nextShifts = shifts.map((s) => {
        if (s.id !== shift.id) return s;
        return {
          ...s,
          dailyMemberIds: {
            ...(s.dailyMemberIds ?? {}),
            [String(dayIndex)]: nextIds,
          },
        };
      });
      await updateAppSettings({ shifts: nextShifts });
      await onRefresh();
      showToast(
        `${emp.name} dihapus dari ${shift.name} hari ${HARI_MAP[dayIndex]?.label ?? ''}.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal memperbarui anggota shift harian.'
      );
    } finally {
      setBusyDailyKey(null);
    }
  };

  const handleClearDailyShift = async (
    shift: ShiftConfig,
    dayIndex: number
  ) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk mengubah.'
      );
      return;
    }
    const lockKey = `${shift.id}__${dayIndex}`;
    setBusyDailyKey(lockKey);
    setErrorMessage(null);
    try {
      const nextShifts = shifts.map((s) => {
        if (s.id !== shift.id) return s;
        const nextDaily = { ...(s.dailyMemberIds ?? {}) };
        delete nextDaily[String(dayIndex)];
        const hasRemaining = Object.keys(nextDaily).length > 0;
        if (!hasRemaining) {
          const rest = { ...s };
          delete rest.dailyMemberIds;
          return rest;
        }
        return {
          ...s,
          dailyMemberIds: nextDaily,
        };
      });
      await updateAppSettings({ shifts: nextShifts });
      await onRefresh();
      showToast(
        `Daftar anggota ${shift.name} hari ${HARI_MAP[dayIndex]?.label ?? ''} dikosongkan.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengosongkan jadwal harian.'
      );
    } finally {
      setBusyDailyKey(null);
    }
  };

  // Copy one day's entire shift setup (all shifts) to other weekdays
  const openCopyDayModal = (sourceDayIndex: number) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk menyalin jadwal.'
      );
      return;
    }
    setCopyDaySource(sourceDayIndex);
    const defaultTargets = new Set<number>(
      [1, 2, 3, 4, 5, 6].filter((d) => d !== sourceDayIndex)
    );
    setCopyDayTargets(defaultTargets);
    setErrorMessage(null);
  };

  const handleConfirmCopyDay = async () => {
    if (copyDaySource === null || copyDayTargets.size === 0) return;
    setSavingCopyDay(true);
    setErrorMessage(null);
    try {
      const empById = new Map<string, Employee>(activeEmployees.map((emp) => [emp.id, emp]));
      let skippedOffSlots = 0;
      const nextShifts = shifts.map((s) => {
        const { members } = getShiftMembersForWeekday(s, copyDaySource, activeEmployees);
        const sourceIds = members.map((m) => m.id);
        const nextDaily: Record<string, string[]> = { ...(s.dailyMemberIds ?? {}) };
        for (const targetDay of copyDayTargets) {
          const targetDateStr = activeWeekDates[targetDay];
          const eligibleTargetIds = sourceIds.filter((empId) => {
            const emp = empById.get(empId);
            if (!emp) return false;
            if (isEmployeeOffOnShiftDay(emp, targetDay, targetDateStr).isOff) {
              skippedOffSlots += 1;
              return false;
            }
            return true;
          });
          nextDaily[String(targetDay)] = eligibleTargetIds;
        }
        return {
          ...s,
          dailyMemberIds: nextDaily,
        };
      });
      await updateAppSettings({ shifts: nextShifts });
      await onRefresh();
      const srcLabel = HARI_MAP[copyDaySource]?.label ?? '';
      const count = copyDayTargets.size;
      setCopyDaySource(null);
      showToast(
        `Susunan seluruh shift hari ${srcLabel} berhasil disalin ke ${count} hari lainnya${
          skippedOffSlots > 0 ? ` (${skippedOffSlots} slot karyawan libur dilewati otomatis)` : ''
        }.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyalin jadwal hari.'
      );
    } finally {
      setSavingCopyDay(false);
    }
  };

  // Open Create Shift Modal
  const openCreateShiftModal = () => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk membuat shift baru.'
      );
      return;
    }
    setEditingShift(null);
    setShiftNameInput('');
    setShiftStartInput('08:00');
    setShiftEndInput('17:00');
    setShiftToleranceInput(10);
    setNewShiftMemberIds(new Set());
    setNewShiftMemberSearch('');
    setShiftFormOpen(true);
    setErrorMessage(null);
  };

  // Open Edit Shift Modal
  const openEditShiftModal = (shift: ShiftConfig) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk mengubah shift.'
      );
      return;
    }
    setEditingShift(shift);
    setShiftNameInput(shift.name);
    setShiftStartInput(shift.startTime);
    setShiftEndInput(shift.endTime);
    setShiftToleranceInput(shift.lateToleranceMinutes);
    setNewShiftMemberIds(new Set());
    setNewShiftMemberSearch('');
    setShiftFormOpen(true);
    setErrorMessage(null);
  };

  const handleSaveShiftForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = shiftNameInput.trim();
    if (!cleanName) {
      setErrorMessage('Nama shift wajib diisi (misal: Shift Pagi, Shift Sela, Shift Siang).');
      return;
    }

    const duplicate = shifts.find(
      (s) =>
        s.name.toLowerCase() === cleanName.toLowerCase() &&
        (!editingShift || s.id !== editingShift.id)
    );
    if (duplicate) {
      setErrorMessage(`Nama shift "${cleanName}" sudah ada. Gunakan nama yang berbeda.`);
      return;
    }

    setSavingShiftForm(true);
    setErrorMessage(null);
    try {
      if (editingShift) {
        const nextShifts = shifts.map((s) =>
          s.id === editingShift.id
            ? {
                ...s,
                name: cleanName,
                startTime: shiftStartInput,
                endTime: shiftEndInput,
                lateToleranceMinutes: Math.max(0, Math.min(120, Number(shiftToleranceInput) || 0)),
              }
            : s
        );

        await updateAppSettings({
          shifts: nextShifts,
          syncEmployees: false,
        });

        await onRefresh();
        setShiftFormOpen(false);
        showToast(`Shift "${cleanName}" berhasil diperbarui (${shiftStartInput} – ${shiftEndInput}).`);
      } else {
        const selectedEmps = activeEmployees.filter((emp) =>
          newShiftMemberIds.has(emp.id)
        );
        const dailyMemberIds: Record<string, string[]> = {};
        if (selectedEmps.length > 0) {
          for (const day of HARI_WEEKDAYS) {
            const dayDateStr = activeWeekDates[day.index];
            const occupiedIds = new Set<string>();
            for (const other of shifts) {
              const { members } = getShiftMembersForWeekday(other, day.index, activeEmployees);
              members.forEach((m) => occupiedIds.add(m.id));
            }
            const eligibleForDay = selectedEmps
              .filter(
                (emp) =>
                  !isEmployeeOffOnShiftDay(emp, day.index, dayDateStr).isOff &&
                  !occupiedIds.has(emp.id)
              )
              .map((emp) => emp.id);
            if (eligibleForDay.length > 0) {
              dailyMemberIds[String(day.index)] = eligibleForDay;
            }
          }
        }

        const newShift: ShiftConfig = {
          id: `shift_${Date.now()}`,
          name: cleanName,
          startTime: shiftStartInput,
          endTime: shiftEndInput,
          lateToleranceMinutes: Math.max(0, Math.min(120, Number(shiftToleranceInput) || 0)),
          ...(Object.keys(dailyMemberIds).length > 0 ? { dailyMemberIds } : {}),
        };
        const nextShifts = [...shifts, newShift];
        await updateAppSettings({ shifts: nextShifts });

        await onRefresh();
        setShiftFormOpen(false);
        showToast(
          `Shift baru "${cleanName}" (${shiftStartInput} – ${shiftEndInput}) dibuat${
            selectedEmps.length > 0
              ? ` dan dijadwalkan untuk ${selectedEmps.length} karyawan (anti double shift diterapkan).`
              : '.'
          }`
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi shift.'
      );
    } finally {
      setSavingShiftForm(false);
    }
  };

  // Delete Shift flow
  const openDeleteShiftModal = (shift: ShiftConfig) => {
    if (!isAttendanceAdmin) {
      setErrorMessage(
        'Mode Biasa hanya dapat melihat jadwal. Masuk Admin Absensi (PIN 1234) untuk menghapus shift.'
      );
      return;
    }
    const fallback = shifts.find((s) => s.id !== shift.id);
    setDeletingShift(shift);
    setDeleteTargetShiftId(fallback ? fallback.id : '');
    setErrorMessage(null);
  };

  const handleConfirmDeleteShift = async () => {
    if (!deletingShift || shifts.length <= 1) return;
    const fallback = shifts.find((s) => s.id === deleteTargetShiftId);
    const hasScheduledSlots = HARI_WEEKDAYS.some(
      (day) => getShiftMembersForWeekday(deletingShift, day.index, activeEmployees).members.length > 0
    );

    setDeletingBusy(true);
    setErrorMessage(null);
    try {
      const nextShifts = shifts
        .filter((s) => s.id !== deletingShift.id)
        .map((s) => {
          if (!fallback || s.id !== fallback.id || !hasScheduledSlots) return s;
          const nextDaily: Record<string, string[]> = { ...(s.dailyMemberIds ?? {}) };
          for (const day of HARI_WEEKDAYS) {
            const dKey = String(day.index);
            const { members: sourceMembers } = getShiftMembersForWeekday(
              deletingShift,
              day.index,
              activeEmployees
            );
            if (sourceMembers.length === 0) continue;
            const occupiedOtherIds = new Set<string>();
            for (const other of shifts) {
              if (other.id === deletingShift.id) continue;
              const { members } = getShiftMembersForWeekday(other, day.index, activeEmployees);
              members.forEach((m) => occupiedOtherIds.add(m.id));
            }
            const existingTargetIds = Array.isArray(nextDaily[dKey]) ? nextDaily[dKey] : [];
            const dayDateStr = activeWeekDates[day.index];
            const merged = [...existingTargetIds];
            for (const m of sourceMembers) {
              if (
                !isEmployeeOffOnShiftDay(m, day.index, dayDateStr).isOff &&
                !occupiedOtherIds.has(m.id) &&
                !merged.includes(m.id)
              ) {
                merged.push(m.id);
              }
            }
            if (merged.length > 0) {
              nextDaily[dKey] = merged;
            }
          }
          return Object.keys(nextDaily).length > 0 ? { ...s, dailyMemberIds: nextDaily } : s;
        });

      await updateAppSettings({ shifts: nextShifts });
      if (shiftFilter === deletingShift.id) {
        setShiftFilter('ALL');
      }
      await onRefresh();
      const deletedName = deletingShift.name;
      setDeletingShift(null);
      showToast(
        `Shift "${deletedName}" dihapus.${
          hasScheduledSlots && fallback
            ? ` Jadwal harian yang kosong dipindahkan ke ${fallback.name}.`
            : ''
        }`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menghapus shift.'
      );
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleExportExcel = async (dayIndex?: number) => {
    setExportingExcel(true);
    setErrorMessage(null);
    try {
      const targetDays =
        typeof dayIndex === 'number'
          ? HARI_WEEKDAYS.filter((d) => d.index === dayIndex)
          : selectedWeekdayFilter !== 'ALL'
            ? HARI_WEEKDAYS.filter((d) => d.index === selectedWeekdayFilter)
            : HARI_WEEKDAYS;

      await exportShiftScheduleToExcel({
        companyName: settings.companyName,
        shifts,
        employees: activeEmployees,
        days: targetDays,
      });

      if (targetDays.length === 1) {
        showToast(`File Excel jadwal hari ${targetDays[0].label} berhasil diunduh.`);
      } else {
        showToast('File Excel jadwal shift berhasil diunduh.');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengekspor jadwal shift ke Excel.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePrintSchedule = (dayIndex?: number) => {
    if (typeof dayIndex === 'number') {
      flushSync(() => {
        setPrintOverrideDayIndex(dayIndex);
      });
    } else if (printOverrideDayIndex !== null) {
      flushSync(() => {
        setPrintOverrideDayIndex(null);
      });
    }
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Feedback Banners */}
      {bannerMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-800 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-950 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Executive 3D Shift Command Banner */}
      <section className="surface-3d-dark rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden no-print">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-indigo-500/15 blur-3xl"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="icon-cube-3d w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-700 border border-indigo-300/35 text-white flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-300 flex flex-wrap items-center gap-2">
                <span>{formatIndonesianDate(today)}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-sky-300 font-semibold tabular-nums">
                  {shifts.length} Jenis Shift · {activeEmployees.length} Karyawan Aktif
                </span>
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white mt-0.5 tracking-tight">
                Manajemen Shift &amp; Penugasan Harian
              </h2>
            </div>
          </div>

          {isAttendanceAdmin && (
            <button
              type="button"
              onClick={openCreateShiftModal}
              className="btn-3d-primary inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Shift Baru</span>
            </button>
          )}
        </div>
      </section>

      {!isAttendanceAdmin && (
        <ReadOnlyModeBanner
          areaLabel="jadwal shift harian & mingguan"
          onRequestAttendanceAdmin={onRequestAttendanceAdmin}
        />
      )}

      {/* Top 3D Shift Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {shiftSummaries.map(
          ({ shift, style, todayAssignedCount, onDutyToday, offToday, durationHours }) => {
            const isSelected = shiftFilter === shift.id;
            return (
              <Tilt3DCard
                key={shift.id}
                className={`surface-3d rounded-2xl transition-all ${
                  isSelected
                    ? `border-blue-600 ring-2 ${style.cardRing}`
                    : ''
                }`}
              >
                <div
                  onClick={() => setShiftFilter(isSelected ? 'ALL' : shift.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShiftFilter(isSelected ? 'ALL' : shift.id);
                    }
                  }}
                  className="p-3.5 sm:p-4 cursor-pointer relative h-full"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${style.accentBar}`} />
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div
                        className={`icon-cube-3d w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/50 ${style.iconBg} ${style.iconText}`}
                      >
                        {renderShiftIcon(style.icon, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {shift.name}
                        </div>
                        <div className="font-mono text-[11px] sm:text-xs font-semibold text-slate-600 tabular-nums truncate">
                          {shift.startTime}–{shift.endTime} ({durationHours}j)
                        </div>
                      </div>
                    </div>
                    <span
                      className={`hidden sm:inline-block font-mono text-xs font-bold px-2 py-0.5 rounded-lg border tabular-nums shrink-0 ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
                    >
                      {todayAssignedCount} hari ini
                    </span>
                  </div>

                  <div className="mt-2.5 sm:mt-3 pt-2 sm:pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 truncate">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {onDutyToday} masuk ({HARI_MAP[todayWeekday]?.short})
                      </span>
                    </span>
                    <span className="shrink-0">
                      {offToday > 0 ? `${offToday} libur` : `Tol. ${shift.lateToleranceMinutes}m`}
                    </span>
                  </div>
                </div>
              </Tilt3DCard>
            );
          }
        )}
      </div>

      {/* Main Toolbar */}
      <div className="surface-3d rounded-2xl p-3.5 sm:p-4 space-y-3.5 sm:space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Sub-Tabs */}
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSubTab('harian')}
              className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'harian'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Jadwal Harian</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('roster')}
              className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'roster'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Jenis Shift</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('mingguan')}
              className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'mingguan'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Matriks Mingguan</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('preview')}
              className={`min-h-[40px] sm:min-h-0 px-2.5 sm:px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'preview'
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Preview Jadwal</span>
            </button>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {isAttendanceAdmin && (
              <button
                type="button"
                onClick={openCreateShiftModal}
                className="btn-3d-primary col-span-2 sm:col-span-1 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Shift Baru</span>
              </button>
            )}

            <select
              aria-label="Pilih hari untuk ekspor dan cetak jadwal"
              value={selectedWeekdayFilter === 'ALL' ? 'ALL' : String(selectedWeekdayFilter)}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedWeekdayFilter(val === 'ALL' ? 'ALL' : Number(val));
              }}
              className="col-span-2 sm:col-span-1 px-3 py-2.5 sm:py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 min-h-[40px] cursor-pointer"
            >
              <option value="ALL">Semua Hari (Sen–Min)</option>
              {HARI_WEEKDAYS.map((day) => (
                <option key={day.index} value={String(day.index)}>
                  Khusus Hari {day.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => openPreviewForDay()}
              className={`px-3.5 py-2.5 sm:py-2 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px] border ${
                subTab === 'preview'
                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {selectedWeekdayFilter === 'ALL'
                  ? 'Preview'
                  : `Preview (${HARI_MAP[selectedWeekdayFilter]?.short})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleExportExcel()}
              disabled={exportingExcel || loading}
              className="px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exportingExcel
                  ? 'Menyiapkan...'
                  : selectedWeekdayFilter === 'ALL'
                    ? 'Ekspor Excel'
                    : `Excel (${HARI_MAP[selectedWeekdayFilter]?.short})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handlePrintSchedule()}
              className="px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {selectedWeekdayFilter === 'ALL'
                  ? 'Cetak Jadwal'
                  : `Cetak (${HARI_MAP[selectedWeekdayFilter]?.short})`}
              </span>
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 pt-2 border-t border-slate-100">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama karyawan, kode, divisi, atau jabatan..."
              className="w-full pl-9 pr-9 py-2.5 sm:py-2 text-sm sm:text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:contents gap-2.5">
            <div className="md:col-span-4">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="ALL">Semua Divisi ({activeEmployees.length})</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    Divisi: {dept}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="ALL">Semua Shift ({shifts.length})</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime}–{s.endTime})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Print View (Format sesuai tabel Jadwal Harian: Header Biru, Shift, Jabatan Kuning/Oranye, Footer OFF Merah) */}
      <div className="hidden print:block space-y-6">
        {printBlocks.map((block) => {
          const colCount = Math.max(1, block.shiftHeaders.length);
          const offText = `OFF : ${block.offNames.length > 0 ? block.offNames.join(', ') : '-'}`;
          return (
            <div key={block.dayIndex} className="break-inside-avoid">
              <table className="w-full border-collapse border-2 border-black text-black font-sans table-fixed">
                <thead>
                  <tr>
                    <th
                      colSpan={colCount}
                      className="bg-[#00B0F0] text-black font-bold text-center text-[13px] py-1.5 px-2 border-b-2 border-black uppercase tracking-wide"
                    >
                      {block.dayLabel}
                    </th>
                  </tr>
                  <tr>
                    {block.shiftHeaders.map((header, idx) => (
                      <th
                        key={idx}
                        className="bg-white text-black font-bold text-center text-[11px] py-1.5 px-2 border-b-2 border-black border-r-2 last:border-r-0"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.roleGroups.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="bg-white text-center text-[11px] py-3 px-2 border-b border-black text-slate-500"
                      >
                        Belum ada data karyawan aktif.
                      </td>
                    </tr>
                  ) : (
                    block.roleGroups.map((group) => (
                      <React.Fragment key={group.key}>
                        <tr>
                          <td
                            colSpan={colCount}
                            className={`${
                              group.isLeader ? 'bg-[#FFC000]' : 'bg-[#FFFF00]'
                            } text-black font-bold text-center text-[11px] py-1 px-2 border-t-2 border-b border-black uppercase`}
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.rows.map((rRow, rIdx) => (
                          <tr key={rIdx}>
                            {rRow.cells.map((cellVal, cIdx) => (
                              <td
                                key={cIdx}
                                className="bg-white text-black text-left text-[11px] font-normal py-1 px-2 border-t border-b border-black border-r-2 last:border-r-0 h-6 align-middle"
                              >
                                {cellVal}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={colCount}
                      className="bg-[#FF0000] text-white font-bold text-left text-[11px] py-1.5 px-2 border-t-2 border-black uppercase"
                    >
                      {offText}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}
      </div>

      {/* TAB 1: Jadwal Harian (Senin -> Shift Pagi: a, b, c; Shift Sela: a, b, c; dst.) */}
      {subTab === 'harian' && (
        <div className="space-y-4 sm:space-y-5 no-print">
          {/* Day Filter Pill Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 no-print">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedWeekdayFilter('ALL')}
                className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedWeekdayFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Semua Hari
              </button>
              {HARI_WEEKDAYS.map((day) => {
                const isActive = selectedWeekdayFilter === day.index;
                const isToday = day.index === todayWeekday;
                return (
                  <button
                    key={day.index}
                    type="button"
                    onClick={() => setSelectedWeekdayFilter(day.index)}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{day.label}</span>
                    {isToday && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        Hari Ini
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('jadwal-libur')}
                className="text-xs font-semibold text-blue-700 hover:underline shrink-0 self-start sm:self-auto py-1 cursor-pointer"
              >
                {isAttendanceAdmin ? 'Atur Jadwal Libur →' : 'Lihat Jadwal Libur →'}
              </button>
            )}
          </div>

          {/* Stacked Day Cards: Senin -> Shift Pagi (a, b, c) / Shift Sela (a, b, c) ... */}
          <div className="space-y-4 sm:space-y-5">
            {visibleWeekdays.map((day) => {
              const isTodayDay = day.index === todayWeekday;
              const weekDateStr = activeWeekDates[day.index];
              const offEmployeesOnDay = filteredEmployees.filter(
                (emp) => isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff
              );
              const assignedIdsOnDay = new Set<string>();
              for (const s of shifts) {
                const { members } = getShiftMembersForWeekday(s, day.index, activeEmployees);
                members.forEach((m) => {
                  if (!isEmployeeOffOnShiftDay(m, day.index, weekDateStr).isOff) {
                    assignedIdsOnDay.add(m.id);
                  }
                });
              }
              const unscheduledEmployeesOnDay = filteredEmployees.filter(
                (emp) =>
                  !isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff &&
                  !assignedIdsOnDay.has(emp.id)
              );

              return (
                <section
                  key={day.index}
                  className={`bg-white rounded-xl border shadow-xs overflow-hidden ${
                    isTodayDay ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  {/* Day Section Header */}
                  <div
                    className={`px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 ${
                      isTodayDay
                        ? 'bg-blue-50/80 border-blue-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                      <span className="font-display text-sm sm:text-base font-bold text-slate-900 uppercase tracking-wide">
                        {day.label}
                      </span>
                      {isTodayDay && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-700 text-white">
                          Hari Ini
                        </span>
                      )}
                      {offEmployeesOnDay.length > 0 && (
                        <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                          <CalendarOff className="w-3 h-3" />
                          <span>{offEmployeesOnDay.length} libur</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto no-print">
                      <button
                        type="button"
                        onClick={() => openPreviewForDay(day.index)}
                        title={`Preview jadwal siap cetak hari ${day.label}`}
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportingExcel || loading}
                        onClick={() => handleExportExcel(day.index)}
                        title={`Ekspor Excel jadwal hari ${day.label}`}
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintSchedule(day.index)}
                        title={`Cetak jadwal hari ${day.label}`}
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak</span>
                      </button>
                      {isAttendanceAdmin && (
                        <button
                          type="button"
                          onClick={() => openCopyDayModal(day.index)}
                          className="px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="truncate">Salin {day.short}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Shifts within this Day */}
                  <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                    {visibleShiftSummaries.map(({ shift, style }) => {
                      const { members: allDayMembers, isCustomDayRoster } =
                        getShiftMembersForWeekday(shift, day.index, activeEmployees);
                      const workingAllDayMembers = allDayMembers.filter(
                        (m) => !isEmployeeOffOnShiftDay(m, day.index, weekDateStr).isOff
                      );
                      const filteredIds = new Set(filteredEmployees.map((e) => e.id));
                      const displayMembers = workingAllDayMembers.filter((m) =>
                        filteredIds.has(m.id)
                      );
                      const isLocked = busyDailyKey === `${shift.id}__${day.index}`;

                      return (
                        <div
                          key={shift.id}
                          className="rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden"
                        >
                          {/* Shift Header inside Day */}
                          <div
                            className={`px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 ${style.headerBg}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconText}`}
                              >
                                {renderShiftIcon(style.icon, 'w-3.5 h-3.5')}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-display text-sm font-bold text-slate-900 truncate">
                                    {shift.name}
                                  </span>
                                  <span
                                    className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
                                  >
                                    {allDayMembers.length}
                                  </span>
                                </div>
                                <div className="font-mono text-[11px] text-slate-600">
                                  {shift.startTime} – {shift.endTime}
                                  {isCustomDayRoster && (
                                    <span className="ml-1.5 text-blue-700 font-sans font-semibold">
                                      • Khusus {day.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isAttendanceAdmin && (
                              <div className="flex items-center gap-1.5 shrink-0 no-print">
                                {isCustomDayRoster && allDayMembers.length > 0 && (
                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => handleClearDailyShift(shift, day.index)}
                                    title="Kosongkan anggota shift pada hari ini"
                                    className="p-2 sm:p-1.5 text-slate-500 hover:text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-md cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openDailyMemberModal(shift, day.index)}
                                  className="px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs sm:text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                  <span>Atur</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Member list grouped by Jabatan */}
                          <div className="flex-1 divide-y divide-slate-100">
                            {displayMembers.length === 0 ? (
                              <div className="px-4 py-5 text-center">
                                <p className="text-xs text-slate-400 italic">
                                  {allDayMembers.length === 0
                                    ? `Belum ada karyawan di ${shift.name} hari ${day.label}.`
                                    : 'Tidak ada yang cocok dengan filter.'}
                                </p>
                                {isAttendanceAdmin && allDayMembers.length === 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openDailyMemberModal(shift, day.index)}
                                    className="mt-2 px-3 py-2 sm:py-1 text-xs sm:text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md inline-flex items-center gap-1 cursor-pointer no-print"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Pilih Karyawan</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              groupEmployeesByPosition(displayMembers).map((posGroup) => (
                                <div key={posGroup.key}>
                                  <div
                                    className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between border-b border-slate-200/80 ${
                                      posGroup.isLeader
                                        ? 'bg-amber-50 text-amber-900'
                                        : 'bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <span>{posGroup.label}</span>
                                    <span className="font-mono text-[10px] opacity-75">
                                      {posGroup.employees.length}
                                    </span>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {posGroup.employees.map((emp, idx) => {
                                      const isRoutineOff = emp.offDays.includes(day.index);
                                      return (
                                        <div
                                          key={emp.id}
                                          className="px-3.5 py-2.5 sm:py-2 flex items-center justify-between gap-2 hover:bg-slate-50/70"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="font-mono text-[11px] text-slate-400 w-4 shrink-0">
                                              {idx + 1}.
                                            </span>
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs font-semibold text-slate-900 truncate">
                                                  {emp.name}
                                                </span>
                                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                                  {emp.position || emp.department}
                                                </span>
                                                {isRoutineOff && (
                                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                                    Libur Rutin
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[11px] text-slate-500 truncate">
                                                {emp.employeeCode} · {emp.department}
                                              </div>
                                            </div>
                                          </div>

                                          {isAttendanceAdmin && (
                                            <button
                                              type="button"
                                              disabled={isLocked}
                                              onClick={() =>
                                                handleRemoveEmployeeFromDailyShift(
                                                  shift,
                                                  day.index,
                                                  emp
                                                )
                                              }
                                              title={`Keluarkan ${emp.name} dari ${shift.name} hari ${day.label}`}
                                              className="p-2 sm:p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 shrink-0 cursor-pointer no-print"
                                            >
                                              <X className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Karyawan Belum Masuk Shift Hari Ini */}
                  {unscheduledEmployeesOnDay.length > 0 && (
                    <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          Belum Terjadwal Shift ({unscheduledEmployeesOnDay.length}):
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {unscheduledEmployeesOnDay.map((emp) => (
                          <span
                            key={emp.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-700 font-medium"
                          >
                            <span className="font-semibold">{emp.name}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">
                              ({emp.position || emp.department})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Karyawan Libur / OFF Section on Day Card */}
                  <div className="px-4 sm:px-5 py-3 bg-rose-50/70 border-t border-rose-200/80 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 shrink-0">
                        <CalendarOff className="w-3.5 h-3.5 text-rose-700" />
                        <span>
                          Libur / OFF {day.label}
                          {weekDateStr ? ` (${weekDateStr.slice(8, 10)}/${weekDateStr.slice(5, 7)})` : ''} ({offEmployeesOnDay.length}):
                        </span>
                      </div>
                      {offEmployeesOnDay.length > 0 && (
                        <span className="text-[11px] text-rose-700/90 no-print">
                          Tidak dapat masuk shift sebelum libur dipindah
                        </span>
                      )}
                    </div>
                    {offEmployeesOnDay.length === 0 ? (
                      <span className="text-xs text-slate-500 italic">
                        Tidak ada karyawan libur pada hari {day.label}.
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {offEmployeesOnDay.map((emp) => {
                          const offInfo = isEmployeeOffOnShiftDay(emp, day.index, weekDateStr);
                          return (
                            <span
                              key={emp.id}
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-white border border-rose-200 text-[11px] text-rose-950 font-medium"
                            >
                              <span className="font-semibold">{emp.name}</span>
                              <span className="text-[10px] text-rose-700 uppercase font-semibold">
                                ({emp.position || emp.department})
                              </span>
                              {offInfo.isCustomDateOff && (
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  Tgl Khusus
                                </span>
                              )}
                              {isAttendanceAdmin && (
                                <button
                                  type="button"
                                  onClick={() => openMoveOffModal(emp, day.index)}
                                  title={`Pindah hari/tanggal libur ${emp.name} agar bisa masuk jadwal`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[10px] font-semibold text-rose-800 cursor-pointer no-print"
                                >
                                  <ArrowRightLeft className="w-2.5 h-2.5" />
                                  <span>Pindah Libur</span>
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Jenis Shift & Ringkasan Mingguan Karyawan */}
      {subTab === 'roster' && (
        <div className="space-y-6 no-print">
          {/* Shift Definitions */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleShiftSummaries.map(
              ({ shift, style, weeklyUniqueCount, todayAssignedCount, onDutyToday, durationHours }) => (
                <div
                  key={shift.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col"
                >
                  <div
                    className={`px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 ${style.headerBg}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconText}`}
                      >
                        {renderShiftIcon(style.icon, 'w-5 h-5')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-base font-bold text-slate-900 truncate">
                            {shift.name}
                          </h3>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
                          >
                            {todayAssignedCount} hari ini
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                          {shift.startTime} – {shift.endTime} ({durationHours} jam) · Toleransi{' '}
                          {shift.lateToleranceMinutes} menit
                        </p>
                      </div>
                    </div>

                    {isAttendanceAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0 no-print">
                        <button
                          type="button"
                          onClick={() => openEditShiftModal(shift)}
                          title="Ubah nama atau jam kerja shift"
                          className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {shifts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => openDeleteShiftModal(shift)}
                            title="Hapus shift ini"
                            className="p-1.5 text-red-600 hover:text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-800">{weeklyUniqueCount} karyawan</span>{' '}
                      terjadwal minggu ini ·{' '}
                      <span className="text-emerald-700 font-semibold">{onDutyToday} masuk hari ini</span>
                    </div>
                    {isAttendanceAdmin && (
                      <button
                        type="button"
                        onClick={() => openDailyMemberModal(shift, todayWeekday)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shrink-0 cursor-pointer"
                      >
                        Atur Hari Ini
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Ringkasan Jadwal Mingguan per Karyawan (Dikelompokkan per Jabatan) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Ringkasan Jadwal Shift per Karyawan (Senin – Minggu)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tidak ada shift default per karyawan. Seluruh jadwal diambil langsung dari tab Jadwal Harian dan dikelompokkan berdasarkan jabatan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('harian')}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
              >
                {isAttendanceAdmin ? 'Atur di Jadwal Harian →' : 'Lihat Jadwal Harian →'}
              </button>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                Tidak ada karyawan yang cocok dengan filter pencarian.
              </div>
            ) : (
              <>
                {/* Mobile Card List (< md) */}
                <div className="md:hidden divide-y divide-slate-200">
                  {groupEmployeesByPosition(filteredEmployees).map((posGroup) => (
                    <div key={posGroup.key}>
                      <div
                        className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/80 ${
                          posGroup.isLeader
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {posGroup.label} ({posGroup.employees.length})
                      </div>
                      <div className="divide-y divide-slate-100">
                        {posGroup.employees.map((emp) => (
                          <div key={emp.id} className="p-3.5 space-y-2.5">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <span className="font-mono">{emp.employeeCode}</span> ·{' '}
                                {emp.position || emp.department}
                              </div>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {HARI_WEEKDAYS.map((day) => {
                                const weekDateStr = activeWeekDates[day.index];
                                const isOff = isEmployeeOffOnShiftDay(
                                  emp,
                                  day.index,
                                  weekDateStr
                                ).isOff;
                                const scheduled = getEmployeeScheduledShiftsForWeekday(
                                  emp.id,
                                  day.index,
                                  shifts
                                )[0];
                                return isOff ? (
                                  isAttendanceAdmin ? (
                                    <button
                                      key={day.index}
                                      type="button"
                                      onClick={() => openMoveOffModal(emp, day.index)}
                                      title={`Ketuk untuk pindah hari/tanggal libur ${emp.name}`}
                                      className="py-1.5 px-0.5 rounded-md bg-rose-50 border border-rose-200 text-center cursor-pointer active:bg-rose-100"
                                    >
                                      <div className="text-[9px] text-rose-700 font-semibold">
                                        {day.short}
                                      </div>
                                      <div className="text-[9px] font-bold text-rose-800 mt-0.5">
                                        OFF
                                      </div>
                                    </button>
                                  ) : (
                                    <div
                                      key={day.index}
                                      className="py-1.5 px-0.5 rounded-md bg-rose-50 border border-rose-200 text-center"
                                    >
                                      <div className="text-[9px] text-rose-700 font-semibold">
                                        {day.short}
                                      </div>
                                      <div className="text-[9px] font-bold text-rose-800 mt-0.5">
                                        OFF
                                      </div>
                                    </div>
                                  )
                                ) : scheduled ? (
                                  isAttendanceAdmin ? (
                                    <button
                                      key={day.index}
                                      type="button"
                                      onClick={() => openDailyMemberModal(scheduled, day.index)}
                                      className="py-1.5 px-0.5 rounded-md bg-blue-50 border border-blue-200 text-center cursor-pointer active:bg-blue-100"
                                    >
                                      <div className="text-[9px] text-blue-700 font-semibold">
                                        {day.short}
                                      </div>
                                      <div className="text-[9px] font-bold text-blue-900 mt-0.5 truncate">
                                        {scheduled.name.replace(/^shift\s+/i, '')}
                                      </div>
                                    </button>
                                  ) : (
                                    <div
                                      key={day.index}
                                      className="py-1.5 px-0.5 rounded-md bg-blue-50 border border-blue-200 text-center"
                                    >
                                      <div className="text-[9px] text-blue-700 font-semibold">
                                        {day.short}
                                      </div>
                                      <div className="text-[9px] font-bold text-blue-900 mt-0.5 truncate">
                                        {scheduled.name.replace(/^shift\s+/i, '')}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <div
                                    key={day.index}
                                    className="py-1.5 px-0.5 rounded-md bg-slate-50 border border-slate-200 text-center"
                                  >
                                    <div className="text-[9px] text-slate-400 font-semibold">
                                      {day.short}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-0.5">—</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <th className="py-2.5 px-4 w-56">Karyawan &amp; Jabatan</th>
                        {HARI_WEEKDAYS.map((day) => (
                          <th key={day.index} className="py-2.5 px-2 text-center">
                            {day.short}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {groupEmployeesByPosition(filteredEmployees).map((posGroup) => (
                        <React.Fragment key={posGroup.key}>
                          <tr>
                            <td
                              colSpan={8}
                              className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-y border-slate-200/80 ${
                                posGroup.isLeader
                                  ? 'bg-amber-50 text-amber-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {posGroup.label} ({posGroup.employees.length})
                            </td>
                          </tr>
                          {posGroup.employees.map((emp) => (
                            <tr key={emp.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-slate-900">{emp.name}</div>
                                <div className="text-[11px] text-slate-500">
                                  <span className="font-mono">{emp.employeeCode}</span> · {emp.position || emp.department}
                                </div>
                              </td>
                              {HARI_WEEKDAYS.map((day) => {
                                const weekDateStr = activeWeekDates[day.index];
                                const isOff = isEmployeeOffOnShiftDay(
                                  emp,
                                  day.index,
                                  weekDateStr
                                ).isOff;
                                const scheduled = getEmployeeScheduledShiftsForWeekday(
                                  emp.id,
                                  day.index,
                                  shifts
                                )[0];
                                return (
                                  <td key={day.index} className="py-2 px-1.5 text-center">
                                    {isOff ? (
                                      isAttendanceAdmin ? (
                                        <button
                                          type="button"
                                          onClick={() => openMoveOffModal(emp, day.index)}
                                          title={`Klik untuk pindah hari/tanggal libur ${emp.name}`}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-semibold text-[10px] cursor-pointer"
                                        >
                                          <span>Libur</span>
                                          <ArrowRightLeft className="w-2.5 h-2.5 opacity-75" />
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-[10px]">
                                          Libur
                                        </span>
                                      )
                                    ) : scheduled ? (
                                      isAttendanceAdmin ? (
                                        <button
                                          type="button"
                                          onClick={() => openDailyMemberModal(scheduled, day.index)}
                                          title={`${scheduled.name} (${scheduled.startTime}–${scheduled.endTime})`}
                                          className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold text-[10px] hover:bg-blue-100 cursor-pointer"
                                        >
                                          {scheduled.name.replace(/^shift\s+/i, '')}
                                        </button>
                                      ) : (
                                        <span
                                          title={`${scheduled.name} (${scheduled.startTime}–${scheduled.endTime})`}
                                          className="inline-block px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold text-[10px]"
                                        >
                                          {scheduled.name.replace(/^shift\s+/i, '')}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic">
                                        —
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Matriks Mingguan (Shift x Senin-Minggu) */}
      {subTab === 'mingguan' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden no-print">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                Matriks Jadwal Mingguan per Shift (Senin – Minggu)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menampilkan siapa saja yang bertugas di setiap shift sepanjang hari dalam seminggu (mengikuti pengaturan Jadwal Harian). Klik sel untuk langsung mengubah anggota hari tersebut.
              </p>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
              Kolom Biru = Hari Ini
            </span>
          </div>

          {/* Mobile Shift-Day Cards (< md) */}
          <div className="md:hidden divide-y divide-slate-200">
            {visibleShiftSummaries.map(({ shift, style }) => (
              <div key={shift.id} className="p-3.5 space-y-2.5">
                <div className={`px-3 py-2 rounded-lg border ${style.headerBg} ${style.badgeBorder}`}>
                  <div className="font-display text-sm font-bold text-slate-900">
                    {shift.name}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600">
                    {shift.startTime} – {shift.endTime}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {HARI_WEEKDAYS.map((day) => {
                    const isTodayCol = day.index === todayWeekday;
                    const weekDateStr = activeWeekDates[day.index];
                    const filteredIds = new Set(filteredEmployees.map((e) => e.id));
                    const { members } = getShiftMembersForWeekday(
                      shift,
                      day.index,
                      activeEmployees
                    );
                    const workingToday = members.filter(
                      (e) =>
                        filteredIds.has(e.id) &&
                        !isEmployeeOffOnShiftDay(e, day.index, weekDateStr).isOff
                    );
                    const cardClass = `w-full text-left p-2.5 rounded-lg border transition-colors ${
                      isAttendanceAdmin ? 'cursor-pointer ' : ''
                    }${
                      isTodayCol
                        ? 'bg-blue-50/70 border-blue-300'
                        : 'bg-slate-50/70 border-slate-200'
                    }`;
                    const cardInner = (
                      <>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            <span>{day.label}</span>
                            {isTodayCol && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-700 text-white font-bold">
                                Hari Ini
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {workingToday.length} org{isAttendanceAdmin ? ' · Ketuk atur' : ''}
                          </span>
                        </div>
                        {workingToday.length === 0 ? (
                          <div className="text-[11px] italic text-slate-400">Belum diatur</div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {workingToday.map((emp) => (
                              <span
                                key={emp.id}
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-medium text-slate-800"
                              >
                                {emp.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                    return isAttendanceAdmin ? (
                      <button
                        key={day.index}
                        type="button"
                        onClick={() => openDailyMemberModal(shift, day.index)}
                        className={cardClass}
                      >
                        {cardInner}
                      </button>
                    ) : (
                      <div key={day.index} className={cardClass}>
                        {cardInner}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Weekly Off-day summary card on mobile */}
            <div className="p-3.5 space-y-2 bg-amber-50/40">
              <div className="font-display text-sm font-bold text-amber-950">
                Libur Mingguan per Hari
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {HARI_WEEKDAYS.map((day) => {
                  const weekDateStr = activeWeekDates[day.index];
                  const offEmployees = filteredEmployees.filter(
                    (emp) => isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff
                  );
                  return (
                    <div
                      key={day.index}
                      className="p-2 rounded-lg bg-white border border-amber-200 flex items-start justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-amber-950 shrink-0 w-16">
                        {day.label}
                      </span>
                      <div className="flex-1 text-right text-[11px] text-amber-900">
                        {offEmployees.length === 0
                          ? '—'
                          : offEmployees.map((e) => e.name).join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-slate-900 text-white text-xs">
                  <th className="text-left px-4 py-3 font-semibold w-44 border-r border-slate-800">
                    Shift / Jam Kerja
                  </th>
                  {HARI_WEEKDAYS.map((day) => {
                    const isTodayCol = day.index === todayWeekday;
                    return (
                      <th
                        key={day.index}
                        className={`text-left px-3 py-3 font-semibold border-r border-slate-800 last:border-r-0 ${
                          isTodayCol ? 'bg-blue-700 text-white' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>{day.label}</span>
                          {isTodayCol && (
                            <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">
                              Hari Ini
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {visibleShiftSummaries.map(({ shift, style }) => (
                  <tr key={shift.id} className="align-top">
                    <td className={`px-4 py-3.5 border-r border-slate-200 ${style.headerBg}`}>
                      <div className="font-display font-bold text-slate-900">
                        {shift.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                        {shift.startTime} – {shift.endTime}
                      </div>
                    </td>

                    {HARI_WEEKDAYS.map((day) => {
                      const isTodayCol = day.index === todayWeekday;
                      const weekDateStr = activeWeekDates[day.index];
                      const filteredIds = new Set(filteredEmployees.map((e) => e.id));
                      const { members } = getShiftMembersForWeekday(
                        shift,
                        day.index,
                        activeEmployees
                      );
                      const workingToday = members.filter(
                        (e) =>
                          filteredIds.has(e.id) &&
                          !isEmployeeOffOnShiftDay(e, day.index, weekDateStr).isOff
                      );

                      return (
                        <td
                          key={day.index}
                          onClick={
                            isAttendanceAdmin
                              ? () => openDailyMemberModal(shift, day.index)
                              : undefined
                          }
                          title={
                            isAttendanceAdmin
                              ? `Klik untuk atur anggota ${shift.name} hari ${day.label}`
                              : `${shift.name} hari ${day.label}`
                          }
                          className={`px-3 py-3 border-r border-slate-100 last:border-r-0 ${
                            isAttendanceAdmin
                              ? 'cursor-pointer hover:bg-blue-50/60 transition-colors'
                              : ''
                          } ${isTodayCol ? 'bg-blue-50/40' : ''}`}
                        >
                          {workingToday.length === 0 ? (
                            <span className="text-[11px] italic text-slate-400">
                              Belum diatur
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {workingToday.map((emp) => (
                                <div
                                  key={emp.id}
                                  className="px-2 py-1 rounded bg-slate-50 border border-slate-200/80 text-slate-800 font-medium leading-tight"
                                >
                                  <div className="truncate">{emp.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate uppercase">
                                    {emp.position || emp.department}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Weekly Off-day summary row */}
                <tr className="align-top bg-amber-50/40">
                  <td className="px-4 py-3.5 border-r border-slate-200 bg-amber-50">
                    <div className="font-display font-bold text-amber-950">
                      Libur Mingguan
                    </div>
                    <div className="text-[11px] text-amber-800 mt-0.5">
                      Jadwal istirahat rutin &amp; khusus minggu ini
                    </div>
                  </td>
                  {HARI_WEEKDAYS.map((day) => {
                    const isTodayCol = day.index === todayWeekday;
                    const weekDateStr = activeWeekDates[day.index];
                    const offEmployees = filteredEmployees.filter(
                      (emp) => isEmployeeOffOnShiftDay(emp, day.index, weekDateStr).isOff
                    );
                    return (
                      <td
                        key={day.index}
                        className={`px-3 py-3 border-r border-amber-100 last:border-r-0 ${
                          isTodayCol ? 'bg-amber-100/40' : ''
                        }`}
                      >
                        {offEmployees.length === 0 ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <div className="space-y-1">
                            {offEmployees.map((emp) => (
                              <div
                                key={emp.id}
                                className="px-2 py-1 rounded bg-white border border-amber-200 text-amber-950 text-[11px] flex items-center justify-between gap-1.5"
                              >
                                <div className="min-w-0">
                                  <span className="font-semibold">{emp.name}</span>{' '}
                                  <span className="text-amber-700 text-[10px] uppercase">
                                    ({emp.position || emp.department})
                                  </span>
                                </div>
                                {isAttendanceAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => openMoveOffModal(emp, day.index)}
                                    title={`Pindah hari/tanggal libur ${emp.name}`}
                                    className="p-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 shrink-0 cursor-pointer"
                                  >
                                    <ArrowRightLeft className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Preview Jadwal Siap Cetak & Ringkasan Karyawan */}
      {subTab === 'preview' && (
        <div className="space-y-4 sm:space-y-5 no-print">
          {/* Preview Controls Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3.5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Eye className="w-4 h-4 text-blue-700" />
                  <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Preview Jadwal Shift
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                    {selectedWeekdayFilter === 'ALL'
                      ? 'Senin – Minggu (7 Hari)'
                      : `Hari ${HARI_MAP[selectedWeekdayFilter]?.label}`}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pratinjau langsung hasil akhir tabel jadwal sebelum dicetak atau diekspor ke Excel.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Format Toggle */}
                <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:inline-flex items-center bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPreviewFormat('cetak')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      previewFormat === 'cetak'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Format Cetak / Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFormat('karyawan')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      previewFormat === 'karyawan'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Per Karyawan
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSubTab('harian')}
                  className="px-3 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isAttendanceAdmin ? 'Edit Jadwal' : 'Kembali ke Harian'}</span>
                </button>
                <button
                  type="button"
                  disabled={exportingExcel || loading}
                  onClick={() => handleExportExcel()}
                  className="px-3 py-2.5 sm:py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Ekspor Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintSchedule()}
                  className="col-span-2 sm:col-span-1 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Sekarang</span>
                </button>
              </div>
            </div>

            {/* Day Filter Bar inside Preview */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedWeekdayFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedWeekdayFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Semua Hari
                </button>
                {HARI_WEEKDAYS.map((day) => {
                  const isActive = selectedWeekdayFilter === day.index;
                  const isToday = day.index === todayWeekday;
                  return (
                    <button
                      key={day.index}
                      type="button"
                      onClick={() => setSelectedWeekdayFilter(day.index)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{day.label}</span>
                      {isToday && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          Hari Ini
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span>
                  Terjadwal:{' '}
                  <strong className="font-mono text-emerald-700">
                    {previewQaStats.totalAssignedSlots}
                  </strong>{' '}
                  slot kerja
                </span>
                <span>•</span>
                <span>
                  Libur:{' '}
                  <strong className="font-mono text-rose-700">
                    {previewQaStats.totalOffSlots}
                  </strong>{' '}
                  slot OFF
                </span>
                {previewQaStats.totalUnscheduledSlots > 0 && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-amber-700">
                      {previewQaStats.totalUnscheduledSlots} slot belum masuk shift
                    </span>
                  </>
                )}
              </div>
            </div>

            {previewQaStats.unscheduledItems.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Catatan Pra-Cetak:</span> Beberapa karyawan aktif tidak libur namun belum masuk shift pada:{' '}
                    <span className="font-semibold">
                      {previewQaStats.unscheduledItems
                        .map((item) => `${item.dayLabel} (${item.employeeNames.length} org)`)
                        .join(', ')}
                    </span>
                    .
                  </div>
                </div>
                {isAttendanceAdmin && (
                  <button
                    type="button"
                    onClick={() => setSubTab('harian')}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-md shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    Lengkapi Sekarang →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Paper Sheet Preview Container */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-2.5 sm:p-6 space-y-4 sm:space-y-5">
            {/* Official Document Header */}
            <div className="border-b-2 border-slate-900 pb-3.5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  {settings.companyName} · {settings.companySubtitle}
                </div>
                <h4 className="font-display text-base sm:text-lg font-extrabold text-slate-900 uppercase tracking-wide mt-0.5">
                  Jadwal Shift Karyawan
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Cakupan:{' '}
                  <strong className="text-slate-900">
                    {selectedWeekdayFilter === 'ALL'
                      ? 'Mingguan (Senin – Minggu)'
                      : `Hari ${HARI_MAP[selectedWeekdayFilter]?.label}`}
                  </strong>{' '}
                  · {shifts.length} Shift Aktif · {activeEmployees.length} Karyawan Aktif
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {shifts.map((s) => (
                  <span
                    key={s.id}
                    className="px-2 py-1 rounded bg-slate-100 border border-slate-200 font-mono text-slate-800 font-semibold"
                  >
                    {s.name}: {s.startTime}–{s.endTime}
                  </span>
                ))}
              </div>
            </div>

            {previewFormat === 'cetak' ? (
              <div className="space-y-6">
                {buildDailyScheduleBlocks({
                  shifts,
                  employees: activeEmployees,
                  days: visibleWeekdays,
                }).map((block) => {
                  const colCount = Math.max(1, block.shiftHeaders.length);
                  const offText = `OFF : ${block.offNames.length > 0 ? block.offNames.join(', ') : '-'}`;
                  const q = searchQuery.trim().toLowerCase();

                  return (
                    <div key={block.dayIndex} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          Lembar Hari {HARI_MAP[block.dayIndex]?.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportExcel(block.dayIndex)}
                            className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                          >
                            Ekspor Hari Ini
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => handlePrintSchedule(block.dayIndex)}
                            className="text-blue-700 hover:underline font-semibold cursor-pointer"
                          >
                            Cetak Hari Ini
                          </button>
                        </div>
                      </div>

                      <div className="w-full">
                        <table className="w-full border-collapse border sm:border-2 border-black text-black font-sans table-fixed">
                          <thead>
                            <tr>
                              <th
                                colSpan={colCount}
                                className="bg-[#00B0F0] text-black font-bold text-center text-[11px] sm:text-[13px] py-1 sm:py-1.5 px-1.5 sm:px-2 border-b sm:border-b-2 border-black uppercase tracking-wide"
                              >
                                {block.dayLabel}
                              </th>
                            </tr>
                            <tr>
                              {block.shiftHeaders.map((header, idx) => {
                                const headerMatch = header.match(/^(.+?)\s+(\(.+\))$/);
                                return (
                                  <th
                                    key={idx}
                                    className="bg-white text-black font-bold text-center text-[9px] sm:text-[11px] leading-tight py-1 sm:py-1.5 px-1 sm:px-2 border-b sm:border-b-2 border-black border-r sm:border-r-2 last:border-r-0 break-words"
                                  >
                                    {headerMatch ? (
                                      <>
                                        <span>{headerMatch[1]}</span>{' '}
                                        <span className="block sm:inline font-semibold sm:font-bold text-[8px] sm:text-[11px]">
                                          {headerMatch[2]}
                                        </span>
                                      </>
                                    ) : (
                                      header
                                    )}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {block.roleGroups.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={colCount}
                                  className="bg-white text-center text-[10px] sm:text-[11px] py-4 px-2 border-b border-black text-slate-500"
                                >
                                  Belum ada data karyawan aktif.
                                </td>
                              </tr>
                            ) : (
                              block.roleGroups.map((group) => (
                                <React.Fragment key={group.key}>
                                  <tr>
                                    <td
                                      colSpan={colCount}
                                      className={`${
                                        group.isLeader ? 'bg-[#FFC000]' : 'bg-[#FFFF00]'
                                      } text-black font-bold text-center text-[9px] sm:text-[11px] py-0.5 sm:py-1 px-1.5 sm:px-2 border-t sm:border-t-2 border-b border-black uppercase`}
                                    >
                                      {group.label}
                                    </td>
                                  </tr>
                                  {group.rows.map((rRow, rIdx) => (
                                    <tr key={rIdx}>
                                      {rRow.cells.map((cellVal, cIdx) => {
                                        const isSearchMatch =
                                          Boolean(q) && cellVal.toLowerCase().includes(q);
                                        return (
                                          <td
                                            key={cIdx}
                                            className={`${
                                              isSearchMatch
                                                ? 'bg-sky-100 font-bold'
                                                : 'bg-white font-normal'
                                            } text-black text-left text-[9px] sm:text-[11px] leading-tight py-1 sm:py-1.5 px-1 sm:px-2.5 border-t border-b border-black border-r sm:border-r-2 last:border-r-0 h-6 sm:h-7 align-middle break-words`}
                                          >
                                            {cellVal}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </React.Fragment>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td
                                colSpan={colCount}
                                className="bg-[#FF0000] text-white font-bold text-left text-[9px] sm:text-[11px] leading-snug py-1 sm:py-1.5 px-1.5 sm:px-2.5 border-t sm:border-t-2 border-black uppercase break-words"
                              >
                                {offText}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Preview Format Ringkas per Karyawan */
              <>
                {/* Mobile Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {filteredEmployees.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Tidak ada karyawan yang cocok dengan filter aktif.
                    </div>
                  ) : (
                    groupEmployeesByPosition(filteredEmployees).map((posGroup) => (
                      <div key={posGroup.key}>
                        <div
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-slate-300 ${
                            posGroup.isLeader
                              ? 'bg-[#FFC000] text-black'
                              : 'bg-[#FFFF00] text-black'
                          }`}
                        >
                          {posGroup.label} ({posGroup.employees.length})
                        </div>
                        <div className="divide-y divide-slate-200">
                          {posGroup.employees.map((emp) => {
                            let workCount = 0;
                            let offCount = 0;
                            const cells = visibleWeekdays.map((day) => {
                              const weekDateStr = activeWeekDates[day.index];
                              const isOff = isEmployeeOffOnShiftDay(
                                emp,
                                day.index,
                                weekDateStr
                              ).isOff;
                              const scheduled = getEmployeeScheduledShiftsForWeekday(
                                emp.id,
                                day.index,
                                shifts
                              )[0];
                              if (isOff) offCount += 1;
                              else if (scheduled) workCount += 1;
                              return { day, isOff, scheduled };
                            });
                            return (
                              <div key={emp.id} className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-900 truncate">
                                      {emp.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {emp.employeeCode} · {emp.position || emp.department}
                                    </div>
                                  </div>
                                  <div className="font-mono text-[11px] shrink-0">
                                    <span className="font-bold text-emerald-700">{workCount}M</span>
                                    <span className="text-slate-400"> / </span>
                                    <span className="font-bold text-rose-700">{offCount}L</span>
                                  </div>
                                </div>
                                <div
                                  className={`grid ${
                                    visibleWeekdays.length === 1 ? 'grid-cols-1' : 'grid-cols-7'
                                  } gap-1`}
                                >
                                  {cells.map(({ day, isOff, scheduled }) => (
                                    <div
                                      key={day.index}
                                      className={`py-1 px-0.5 rounded text-center border text-[9px] ${
                                        isOff
                                          ? 'bg-rose-600 text-white border-rose-600 font-bold'
                                          : scheduled
                                            ? 'bg-blue-50 text-blue-900 border-blue-200 font-semibold'
                                            : 'bg-slate-50 text-slate-400 border-slate-200'
                                      }`}
                                    >
                                      <div>{day.short}</div>
                                      <div className="truncate mt-0.5">
                                        {isOff
                                          ? 'OFF'
                                          : scheduled
                                            ? scheduled.name.replace(/^shift\s+/i, '')
                                            : '—'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-700 w-10">
                          No
                        </th>
                        <th className="py-2.5 px-3 text-left font-semibold border-r border-slate-700 w-56">
                          Nama Karyawan &amp; Jabatan
                        </th>
                        {visibleWeekdays.map((day) => (
                          <th
                            key={day.index}
                            className="py-2.5 px-2 text-center font-semibold border-r border-slate-700"
                          >
                            {day.label}
                          </th>
                        ))}
                        <th className="py-2.5 px-3 text-center font-semibold w-24">
                          Masuk / Off
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td
                            colSpan={visibleWeekdays.length + 3}
                            className="py-8 text-center text-slate-500"
                          >
                            Tidak ada karyawan yang cocok dengan filter aktif.
                          </td>
                        </tr>
                      ) : (
                        groupEmployeesByPosition(filteredEmployees).map((posGroup) => (
                          <React.Fragment key={posGroup.key}>
                            <tr>
                              <td
                                colSpan={visibleWeekdays.length + 3}
                                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-y border-slate-300 ${
                                  posGroup.isLeader
                                    ? 'bg-[#FFC000] text-black'
                                    : 'bg-[#FFFF00] text-black'
                                }`}
                              >
                                {posGroup.label} ({posGroup.employees.length})
                              </td>
                            </tr>
                            {posGroup.employees.map((emp, idx) => {
                              let workCount = 0;
                              let offCount = 0;
                              return (
                                <tr key={emp.id} className="hover:bg-slate-50/70">
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-500 border-r border-slate-200 text-center">
                                    {idx + 1}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-200">
                                    <div className="font-semibold text-slate-900">{emp.name}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {emp.employeeCode} · {emp.position || emp.department}
                                    </div>
                                  </td>
                                  {visibleWeekdays.map((day) => {
                                    const weekDateStr = activeWeekDates[day.index];
                                    const isOff = isEmployeeOffOnShiftDay(
                                      emp,
                                      day.index,
                                      weekDateStr
                                    ).isOff;
                                    const scheduled = getEmployeeScheduledShiftsForWeekday(
                                      emp.id,
                                      day.index,
                                      shifts
                                    )[0];
                                    if (isOff) offCount += 1;
                                    else if (scheduled) workCount += 1;

                                    const styleIdx = scheduled
                                      ? shifts.findIndex((s) => s.id === scheduled.id)
                                      : 0;
                                    const shiftStyle = scheduled
                                      ? getShiftVisualStyle(scheduled.name, Math.max(0, styleIdx))
                                      : null;

                                    return (
                                      <td
                                        key={day.index}
                                        className="py-2 px-1.5 text-center border-r border-slate-200"
                                      >
                                        {isOff ? (
                                          <span className="inline-block px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                                            OFF
                                          </span>
                                        ) : scheduled && shiftStyle ? (
                                          <div
                                            className={`inline-flex flex-col items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${shiftStyle.badgeBg} ${shiftStyle.badgeText} ${shiftStyle.badgeBorder}`}
                                          >
                                            <span>{scheduled.name.replace(/^shift\s+/i, '')}</span>
                                            <span className="font-mono text-[9px] opacity-80">
                                              {scheduled.startTime}–{scheduled.endTime}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-[11px] text-slate-400 italic">
                                            —
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 px-3 text-center font-mono text-[11px]">
                                    <span className="font-bold text-emerald-700">{workCount}</span>
                                    <span className="text-slate-400"> / </span>
                                    <span className="font-bold text-rose-700">{offCount}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL A: Atur Anggota Harian (per Shift & Hari) */}
      {dailyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Atur Anggota {dailyModal.shift.name} — Hari{' '}
                  {HARI_MAP[dailyModal.dayIndex]?.label}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Jam Kerja: {dailyModal.shift.startTime} – {dailyModal.shift.endTime} • Centang siapa saja yang masuk di shift ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDailyModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDailyModal} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={dailyModalSearch}
                    onChange={(e) => setDailyModalSearch(e.target.value)}
                    placeholder="Cari nama karyawan, jabatan, atau kode..."
                    className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-sm sm:text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    Terpilih untuk {dailyModal.shift.name} ({HARI_MAP[dailyModal.dayIndex]?.label}):{' '}
                    {dailyModalSelectedIds.size} karyawan
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDailyModalError(null);
                        const modalWeekDate = activeWeekDates[dailyModal.dayIndex];
                        setDailyModalSelectedIds((prev) => {
                          const next = new Set(prev);
                          dailyModalFilteredEmployees.forEach((emp) => {
                            const isOff = isEmployeeOffOnShiftDay(
                              emp,
                              dailyModal.dayIndex,
                              modalWeekDate
                            ).isOff;
                            if (!dailyOtherShiftMap.has(emp.id) && !isOff) {
                              next.add(emp.id);
                            }
                          });
                          return next;
                        });
                      }}
                      className="text-blue-700 hover:underline font-semibold py-1 cursor-pointer"
                    >
                      Pilih semua yang tersedia
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDailyModalError(null);
                        setDailyModalSelectedIds(new Set());
                      }}
                      className="text-slate-600 hover:underline font-medium py-1 cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Terapkan ke:
                  </span>
                  {(
                    [
                      {
                        id: 'single',
                        label: `Hanya ${HARI_MAP[dailyModal.dayIndex]?.label}`,
                      },
                      { id: 'weekdays', label: 'Senin – Sabtu' },
                      { id: 'all', label: 'Semua Hari (Senin – Minggu)' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDailyModalApplyScope(opt.id);
                        setDailyModalError(null);
                      }}
                      className={`px-2.5 py-1.5 sm:py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                        dailyModalApplyScope === opt.id
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Karyawan yang berstatus <strong>Libur</strong> tidak bisa masuk jadwal shift (klik <strong>Pindah Libur</strong> jika harus masuk). Berlaku juga aturan anti double shift pada hari yang sama.
                  </span>
                </div>

                {dailyOffEmployeesOnModalDay.length > 0 && (
                  <div className="text-[11px] text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <CalendarOff className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">
                        Sedang Libur {HARI_MAP[dailyModal.dayIndex]?.label} ({dailyOffEmployeesOnModalDay.length}):
                      </span>{' '}
                      <span>
                        {dailyOffEmployeesOnModalDay
                          .map((e) => `${e.name} (${e.position || e.department})`)
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {dailyModalError && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{dailyModalError}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {dailyModalGroupedEmployees.length === 0 ? (
                  <div className="px-5 py-8 text-center text-xs text-slate-400">
                    Tidak ada karyawan yang cocok dengan pencarian.
                  </div>
                ) : (
                  dailyModalGroupedEmployees.map((posGroup) => {
                    const modalWeekDate = activeWeekDates[dailyModal.dayIndex];
                    const eligibleInGroup = posGroup.employees.filter(
                      (emp) =>
                        !dailyOtherShiftMap.has(emp.id) &&
                        !isEmployeeOffOnShiftDay(emp, dailyModal.dayIndex, modalWeekDate).isOff
                    );
                    const allEligibleChecked =
                      eligibleInGroup.length > 0 &&
                      eligibleInGroup.every((emp) => dailyModalSelectedIds.has(emp.id));

                    return (
                      <div key={posGroup.key} className="border-b border-slate-200 last:border-b-0">
                        <div
                          className={`sticky top-0 z-10 px-4 sm:px-5 py-2 border-b border-slate-200 flex items-center justify-between gap-2 ${
                            posGroup.isLeader ? 'bg-amber-50' : 'bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
                              {posGroup.label}
                            </span>
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                              {posGroup.employees.length}
                            </span>
                          </div>
                          {eligibleInGroup.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setDailyModalError(null);
                                setDailyModalSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (allEligibleChecked) {
                                    eligibleInGroup.forEach((emp) => next.delete(emp.id));
                                  } else {
                                    eligibleInGroup.forEach((emp) => next.add(emp.id));
                                  }
                                  return next;
                                });
                              }}
                              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              {allEligibleChecked ? 'Lepas Grup' : 'Pilih Grup'}
                            </button>
                          )}
                        </div>

                        <div className="divide-y divide-slate-100">
                          {posGroup.employees.map((emp) => {
                            const offInfo = isEmployeeOffOnShiftDay(
                              emp,
                              dailyModal.dayIndex,
                              modalWeekDate
                            );
                            const isOffBlocked = offInfo.isOff;
                            const checked = !isOffBlocked && dailyModalSelectedIds.has(emp.id);
                            const otherShifts = dailyOtherShiftMap.get(emp.id) ?? [];
                            const isBlockedByOtherShift = otherShifts.length > 0 && !checked;
                            const isDisabledRow = isBlockedByOtherShift || isOffBlocked;
                            const checkboxId = `daily-emp-${emp.id}`;

                            return (
                              <div
                                key={emp.id}
                                className={`px-4 sm:px-5 py-3 sm:py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 ${
                                  isOffBlocked
                                    ? 'bg-amber-50/40'
                                    : isBlockedByOtherShift
                                      ? 'bg-slate-50/80 opacity-65'
                                      : checked
                                        ? 'bg-blue-50/40 hover:bg-blue-50/60'
                                        : 'hover:bg-slate-50'
                                }`}
                              >
                                <label
                                  htmlFor={checkboxId}
                                  className={`flex items-center gap-3 min-w-0 flex-1 ${
                                    isDisabledRow ? 'cursor-not-allowed' : 'cursor-pointer'
                                  }`}
                                >
                                  <input
                                    id={checkboxId}
                                    type="checkbox"
                                    checked={checked}
                                    disabled={isDisabledRow}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      if (isChecked && (otherShifts.length > 0 || isOffBlocked)) {
                                        return;
                                      }
                                      setDailyModalError(null);
                                      setDailyModalSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (isChecked) next.add(emp.id);
                                        else next.delete(emp.id);
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-50"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-semibold text-slate-900 truncate">
                                        {emp.name}
                                      </span>
                                      <span className="font-mono text-[11px] text-slate-500">
                                        ({emp.employeeCode})
                                      </span>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                        {emp.position || emp.department}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {emp.department} · {emp.position}
                                    </div>
                                  </div>
                                </label>

                                <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5 pl-7 sm:pl-0">
                                  {otherShifts.length > 0 && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                                      Sudah di {otherShifts.join(', ')}
                                    </span>
                                  )}
                                  {offInfo.isRoutineOff && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                      Libur Rutin {HARI_MAP[dailyModal.dayIndex]?.short}
                                    </span>
                                  )}
                                  {offInfo.isCustomDateOff && modalWeekDate && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                                      Libur Tgl {modalWeekDate.slice(8, 10)}/{modalWeekDate.slice(5, 7)}
                                    </span>
                                  )}
                                  {isOffBlocked && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openMoveOffModal(emp, dailyModal.dayIndex, {
                                          autoAddToDailyModal: true,
                                          preferredShiftId: dailyModal.shift.id,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer"
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      <span>Pindah Libur</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0 pb-safe">
                <button
                  type="button"
                  onClick={() => setDailyModal(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingDailyModal}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {savingDailyModal ? 'Menyimpan...' : 'Simpan Jadwal Harian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL B: Salin Jadwal Satu Hari ke Hari Lain */}
      {copyDaySource !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Salin Jadwal Hari {HARI_MAP[copyDaySource]?.label}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Terapkan susunan anggota semua shift hari {HARI_MAP[copyDaySource]?.label} ke hari tujuan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyDaySource(null)}
                className="p-2 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto pb-safe">
              <div className="grid grid-cols-2 gap-2">
                {HARI_WEEKDAYS.filter((d) => d.index !== copyDaySource).map((day) => {
                  const checked = copyDayTargets.has(day.index);
                  return (
                    <label
                      key={day.index}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 cursor-pointer ${
                        checked
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setCopyDayTargets((prev) => {
                            const next = new Set(prev);
                            if (isChecked) next.add(day.index);
                            else next.delete(day.index);
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700"
                      />
                      <span>{day.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Karyawan yang berstatus <strong>Libur</strong> pada hari tujuan otomatis tidak akan dimasukkan ke shift hari tersebut.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCopyDaySource(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingCopyDay || copyDayTargets.size === 0}
                  onClick={handleConfirmCopyDay}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {savingCopyDay
                    ? 'Menyalin...'
                    : `Salin ke ${copyDayTargets.size} Hari`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1 REMOVED: Tidak ada shift master/default per karyawan */}

      {/* MODAL 2: Buat / Ubah Shift */}
      {shiftFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold">
                  {editingShift ? `Ubah Shift: ${editingShift.name}` : 'Buat Shift Baru'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Atur nama shift, jam masuk-pulang, dan toleransi keterlambatan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShiftFormOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftForm} className="p-5 space-y-4 overflow-y-auto pb-safe">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Shift
                </label>
                <input
                  type="text"
                  required
                  value={shiftNameInput}
                  onChange={(e) => setShiftNameInput(e.target.value)}
                  placeholder="Contoh: Shift Pagi, Shift Sela, Shift Siang"
                  className="w-full px-3.5 py-2.5 sm:py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jam Masuk
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftStartInput}
                    onChange={(e) => setShiftStartInput(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jam Pulang
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftEndInput}
                    onChange={(e) => setShiftEndInput(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Toleransi (mnt)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={shiftToleranceInput}
                    onChange={(e) => setShiftToleranceInput(Number(e.target.value))}
                    className="w-full px-3 py-2.5 sm:py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              {editingShift ? (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  Perubahan jam kerja atau nama <strong>{editingShift.name}</strong> akan otomatis berlaku pada seluruh jadwal harian yang menggunakan shift ini.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Jadwalkan Anggota Awal ke Hari Kerja (Opsional · {newShiftMemberIds.size} dipilih)
                    </label>
                  </div>
                  <input
                    type="text"
                    value={newShiftMemberSearch}
                    onChange={(e) => setNewShiftMemberSearch(e.target.value)}
                    placeholder="Cari karyawan untuk langsung dijadwalkan..."
                    className="w-full px-3 py-2 sm:py-1.5 text-sm sm:text-xs border border-slate-200 rounded-lg"
                  />
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                    {groupEmployeesByPosition(
                      activeEmployees.filter((emp) => {
                        const q = newShiftMemberSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          emp.name.toLowerCase().includes(q) ||
                          emp.position.toLowerCase().includes(q) ||
                          emp.department.toLowerCase().includes(q) ||
                          emp.employeeCode.toLowerCase().includes(q)
                        );
                      })
                    ).map((posGroup) => (
                      <div key={posGroup.key} className="border-b border-slate-200 last:border-b-0">
                        <div className="px-3 py-1 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                          {posGroup.label} ({posGroup.employees.length})
                        </div>
                        <div className="divide-y divide-slate-100">
                          {posGroup.employees.map((emp) => {
                            const weeklySummary = getEmployeeWeeklyShiftSummary(emp.id, shifts);
                            return (
                              <label
                                key={emp.id}
                                className="px-3 py-2.5 sm:py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 cursor-pointer"
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={newShiftMemberIds.has(emp.id)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setNewShiftMemberIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked) next.add(emp.id);
                                        else next.delete(emp.id);
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                                  />
                                  <span className="font-medium text-slate-800 truncate">
                                    {emp.name}
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase shrink-0">
                                    {emp.position || emp.department}
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-500 shrink-0">
                                  {weeklySummary.scheduledDayCount > 0
                                    ? `${weeklySummary.scheduledDayCount} hr terjadwal`
                                    : 'Belum dijadwalkan'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShiftFormOpen(false)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingShiftForm}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {savingShiftForm
                    ? 'Menyimpan...'
                    : editingShift
                      ? 'Simpan Perubahan'
                      : 'Buat Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Konfirmasi Hapus Shift */}
      {deletingShift && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="px-5 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between shrink-0">
              <h3 className="font-display text-sm font-bold text-red-900">
                Hapus {deletingShift.name}?
              </h3>
              <button
                type="button"
                onClick={() => setDeletingShift(null)}
                className="p-1.5 text-red-700 hover:text-red-950 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto pb-safe">
              {(() => {
                const scheduledDayCount = HARI_WEEKDAYS.filter(
                  (d) => getShiftMembersForWeekday(deletingShift, d.index, activeEmployees).members.length > 0
                ).length;
                return (
                  <>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Anda akan menghapus konfigurasi <strong>{deletingShift.name}</strong> (
                      {deletingShift.startTime} – {deletingShift.endTime}).
                      {scheduledDayCount > 0
                        ? ` Terdapat jadwal harian pada ${scheduledDayCount} hari yang dapat dipindahkan otomatis ke shift lain (jika belum terjadwal di shift lain).`
                        : ' Belum ada jadwal harian pada shift ini.'}
                    </p>
                    {scheduledDayCount > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Pindahkan jadwal ke shift:
                        </label>
                        <select
                          value={deleteTargetShiftId}
                          onChange={(e) => setDeleteTargetShiftId(e.target.value)}
                          className="w-full px-3 py-2.5 sm:py-2 text-xs font-medium border border-slate-300 rounded-lg"
                        >
                          {shifts
                            .filter((s) => s.id !== deletingShift.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.startTime} – {s.endTime})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingShift(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deletingBusy}
                  onClick={handleConfirmDeleteShift}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {deletingBusy ? 'Menghapus...' : 'Ya, Hapus Shift'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 4: Pindah Hari / Tanggal Libur Karyawan */}
      {moveOffModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/65 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span>Pindah Libur Karyawan</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {moveOffModal.emp.name} ({moveOffModal.emp.employeeCode}) ·{' '}
                  {moveOffModal.emp.position || moveOffModal.emp.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoveOffModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmMoveOff} className="p-5 space-y-4 overflow-y-auto pb-safe">
              {/* Info Status Libur Asal */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CalendarOff className="w-3.5 h-3.5 text-amber-700" />
                  <span>
                    Status Saat Ini: Libur pada hari{' '}
                    {HARI_MAP[moveOffModal.sourceDayIndex]?.label} (
                    {formatIndonesianDate(moveOffModal.sourceDateStr)})
                  </span>
                </div>
                <p className="text-[11px] text-amber-900">
                  Agar dapat masuk jadwal shift pada hari tersebut, pindahkan <strong>hari libur rutin</strong> atau <strong>tanggal libur</strong> ke waktu pengganti.
                </p>
              </div>

              {/* Switch Mode: Pindah Hari vs Pindah Tanggal */}
              <div>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMoveOffMode('hari');
                      setMoveOffError(null);
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      moveOffMode === 'hari'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pindah Hari Libur
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveOffMode('tanggal');
                      setMoveOffError(null);
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      moveOffMode === 'tanggal'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pindah Tanggal Libur
                  </button>
                </div>
              </div>

              {moveOffMode === 'hari' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Pilih Hari Libur Pengganti (menggantikan{' '}
                      {HARI_MAP[moveOffModal.sourceDayIndex]?.label})
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {HARI_WEEKDAYS.map((day) => {
                        const isSource = day.index === moveOffModal.sourceDayIndex;
                        const isAlreadyOff = moveOffModal.emp.offDays.includes(day.index);
                        const isSelected = moveTargetDayIndex === day.index;
                        const existingShift = getEmployeeScheduledShiftsForWeekday(
                          moveOffModal.emp.id,
                          day.index,
                          shifts
                        )[0];
                        return (
                          <button
                            key={day.index}
                            type="button"
                            disabled={isSource || isAlreadyOff}
                            onClick={() => {
                              setMoveTargetDayIndex(day.index);
                              setMoveOffError(null);
                            }}
                            className={`py-2 px-1.5 rounded-lg border text-center transition-colors ${
                              isSource || isAlreadyOff
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-blue-700 border-blue-700 text-white font-semibold cursor-pointer'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <div className="text-xs font-semibold">{day.short}</div>
                            <div
                              className={`text-[9px] mt-0.5 truncate ${
                                isSelected ? 'text-blue-100' : 'text-slate-500'
                              }`}
                            >
                              {isSource
                                ? 'Asal'
                                : isAlreadyOff
                                  ? 'Libur'
                                  : existingShift
                                    ? existingShift.name.replace(/^shift\s+/i, '')
                                    : 'Kosong'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(() => {
                    const conflictShift = getEmployeeScheduledShiftsForWeekday(
                      moveOffModal.emp.id,
                      moveTargetDayIndex,
                      shifts
                    )[0];
                    return conflictShift ? (
                      <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                        <span>
                          <strong>{moveOffModal.emp.name}</strong> saat ini terjadwal di{' '}
                          <strong>{conflictShift.name}</strong> hari{' '}
                          {HARI_MAP[moveTargetDayIndex]?.label}. Jika libur dipindah ke hari tersebut, jadwal shift hari {HARI_MAP[moveTargetDayIndex]?.label} otomatis akan dilepas.
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Tanggal Libur Asal
                    </label>
                    {moveOffModal.emp.customOffDates &&
                    moveOffModal.emp.customOffDates.length > 0 &&
                    !moveOffModal.emp.customOffDates.includes(moveOffModal.sourceDateStr) ? (
                      <select
                        value={moveSourceCustomDate}
                        onChange={(e) => {
                          setMoveSourceCustomDate(e.target.value);
                          setMoveOffError(null);
                        }}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                      >
                        <option value={moveOffModal.sourceDateStr}>
                          {moveOffModal.sourceDateStr} ({HARI_MAP[moveOffModal.sourceDayIndex]?.label})
                        </option>
                        {moveOffModal.emp.customOffDates.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt} ({formatIndonesianDate(dt)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800">
                        {moveSourceCustomDate || moveOffModal.sourceDateStr} —{' '}
                        <span className="font-sans font-medium">
                          {formatIndonesianDate(moveSourceCustomDate || moveOffModal.sourceDateStr)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Tanggal Libur Pengganti
                    </label>
                    <input
                      type="date"
                      required
                      value={moveTargetCustomDate}
                      onChange={(e) => {
                        setMoveTargetCustomDate(e.target.value);
                        setMoveOffError(null);
                      }}
                      className="w-full px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    {moveTargetCustomDate && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Pengganti: <strong>{formatIndonesianDate(moveTargetCustomDate)}</strong>
                      </p>
                    )}
                  </div>

                  {moveOffModal.emp.offDays.includes(moveOffModal.sourceDayIndex) && (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-blue-700 shrink-0 mt-0.5" />
                      <span>
                        Hari {HARI_MAP[moveOffModal.sourceDayIndex]?.label} merupakan libur rutin mingguan {moveOffModal.emp.name}. Menyimpan perpindahan tanggal ini akan melepas libur rutin hari {HARI_MAP[moveOffModal.sourceDayIndex]?.label} dan mencatat tanggal pengganti sebagai tanggal libur khusus.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!moveOffModal.autoAddToDailyModal && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Langsung Masukkan ke Shift Hari {HARI_MAP[moveOffModal.sourceDayIndex]?.label} (Opsional)
                  </label>
                  <select
                    value={moveTargetShiftId}
                    onChange={(e) => setMoveTargetShiftId(e.target.value)}
                    className="w-full px-3 py-2.5 sm:py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Hanya pindah libur (atur shift nanti)</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        Masuk ke {s.name} ({s.startTime} – {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {moveOffError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{moveOffError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMoveOffModal(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingMoveOff}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>
                    {savingMoveOff
                      ? 'Menyimpan...'
                      : moveOffModal.autoAddToDailyModal
                        ? 'Pindah & Pilih ke Shift'
                        : moveTargetShiftId
                          ? 'Pindah Libur & Masuk Shift'
                          : 'Simpan Pindah Libur'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
