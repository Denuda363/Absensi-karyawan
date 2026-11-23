import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  CalendarOff,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
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
  formatOffDaysSummary,
  getShiftMembersForWeekday,
  getTodayDateStr,
  HARI_MAP,
  HARI_WEEKDAYS,
  isEmployeeOffDay,
  NavSection,
  ShiftConfig,
} from '../types';
import { updateAppSettings, updateEmployee } from '../services/attendanceService';
import { exportShiftScheduleToExcel } from '../utils/excelShiftExport';
import { buildDailyScheduleBlocks } from '../utils/shiftScheduleLayout';

interface ShiftScheduleViewProps {
  employees: Employee[];
  settings: AppSettings;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate?: (nav: NavSection) => void;
}

type ShiftSubTab = 'harian' | 'roster' | 'mingguan';

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const ShiftScheduleView: React.FC<ShiftScheduleViewProps> = ({
  employees,
  settings,
  loading,
  onRefresh,
  onNavigate,
}) => {
  const today = getTodayDateStr();
  const todayWeekday = useMemo(() => {
    const parts = today.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return new Date().getDay();
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }, [today]);

  const [subTab, setSubTab] = useState<ShiftSubTab>('harian');
  const [selectedWeekdayFilter, setSelectedWeekdayFilter] = useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');

  const [busyEmployeeId, setBusyEmployeeId] = useState<string | null>(null);
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
  const [savingDailyModal, setSavingDailyModal] = useState<boolean>(false);

  // Modal B: Salin Jadwal Satu Hari ke Hari Lain
  const [copyDaySource, setCopyDaySource] = useState<number | null>(null);
  const [copyDayTargets, setCopyDayTargets] = useState<Set<number>>(new Set());
  const [savingCopyDay, setSavingCopyDay] = useState<boolean>(false);

  // Modal 1: Atur Anggota Master Shift (multi-select)
  const [memberModalShift, setMemberModalShift] = useState<ShiftConfig | null>(null);
  const [memberModalSelectedIds, setMemberModalSelectedIds] = useState<Set<string>>(new Set());
  const [memberModalSearch, setMemberModalSearch] = useState<string>('');
  const [memberModalOnlyUnassigned, setMemberModalOnlyUnassigned] = useState<boolean>(false);
  const [memberModalFallbackShiftId, setMemberModalFallbackShiftId] = useState<string>('');
  const [savingMembers, setSavingMembers] = useState<boolean>(false);

  // Modal 2: Buat / Edit Shift
  const [shiftFormOpen, setShiftFormOpen] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<ShiftConfig | null>(null);
  const [shiftNameInput, setShiftNameInput] = useState<string>('');
  const [shiftStartInput, setShiftStartInput] = useState<string>('08:00');
  const [shiftEndInput, setShiftEndInput] = useState<string>('17:00');
  const [shiftToleranceInput, setShiftToleranceInput] = useState<number>(10);
  const [syncEmployeesOnEdit, setSyncEmployeesOnEdit] = useState<boolean>(true);
  const [newShiftMemberIds, setNewShiftMemberIds] = useState<Set<string>>(new Set());
  const [newShiftMemberSearch, setNewShiftMemberSearch] = useState<string>('');
  const [savingShiftForm, setSavingShiftForm] = useState<boolean>(false);

  // Modal 3: Konfirmasi Hapus Shift
  const [deletingShift, setDeletingShift] = useState<ShiftConfig | null>(null);
  const [deleteTargetShiftId, setDeleteTargetShiftId] = useState<string>('');
  const [deletingBusy, setDeletingBusy] = useState<boolean>(false);

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
        const hit =
          emp.name.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q) ||
          emp.shiftName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [activeEmployees, departmentFilter, searchQuery]);

  const knownShiftNamesLower = useMemo(
    () => new Set(shifts.map((s) => s.name.toLowerCase())),
    [shifts]
  );

  const customShiftEmployees = useMemo(
    () =>
      filteredEmployees.filter(
        (e) => !knownShiftNamesLower.has(e.shiftName.toLowerCase())
      ),
    [filteredEmployees, knownShiftNamesLower]
  );

  const shiftSummaries = useMemo(() => {
    return shifts.map((shift, idx) => {
      const allMembers = activeEmployees.filter(
        (e) => e.shiftName.toLowerCase() === shift.name.toLowerCase()
      );
      const filteredMembers = filteredEmployees.filter(
        (e) => e.shiftName.toLowerCase() === shift.name.toLowerCase()
      );
      const todayDaily = getShiftMembersForWeekday(shift, todayWeekday, activeEmployees);
      const onDutyToday = todayDaily.members.filter(
        (e) => !isEmployeeOffDay(e, today).isOff
      ).length;
      const offToday = Math.max(0, todayDaily.members.length - onDutyToday);
      return {
        shift,
        style: getShiftVisualStyle(shift.name, idx),
        allMembers,
        filteredMembers,
        todayAssignedCount: todayDaily.members.length,
        onDutyToday,
        offToday,
        durationHours: calculateDurationHours(shift.startTime, shift.endTime),
      };
    });
  }, [shifts, activeEmployees, filteredEmployees, today, todayWeekday]);

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

  const showToast = (msg: string) => {
    setErrorMessage(null);
    setBannerMessage(msg);
  };

  // Daily roster modal handlers
  const openDailyMemberModal = (shift: ShiftConfig, dayIndex: number) => {
    const { members } = getShiftMembersForWeekday(shift, dayIndex, activeEmployees);
    setDailyModal({ shift, dayIndex });
    setDailyModalSelectedIds(new Set(members.map((m) => m.id)));
    setDailyModalSearch('');
    setDailyModalApplyScope('single');
    setErrorMessage(null);
  };

  const dailyModalFilteredEmployees = useMemo(() => {
    const q = dailyModalSearch.trim().toLowerCase();
    return activeEmployees.filter((emp) => {
      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.shiftName.toLowerCase().includes(q)
      );
    });
  }, [activeEmployees, dailyModalSearch]);

  const handleSaveDailyModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyModal) return;

    const targetDays: number[] =
      dailyModalApplyScope === 'all'
        ? [1, 2, 3, 4, 5, 6, 0]
        : dailyModalApplyScope === 'weekdays'
          ? [1, 2, 3, 4, 5, 6]
          : [dailyModal.dayIndex];

    const orderedSelectedIds = activeEmployees
      .filter((emp) => dailyModalSelectedIds.has(emp.id))
      .map((emp) => emp.id);

    setSavingDailyModal(true);
    setErrorMessage(null);
    try {
      const nextShifts = shifts.map((s) => {
        if (s.id !== dailyModal.shift.id) return s;
        const nextDaily: Record<string, string[]> = { ...(s.dailyMemberIds ?? {}) };
        for (const d of targetDays) {
          nextDaily[String(d)] = orderedSelectedIds;
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
          : `Jadwal ${shiftName} diterapkan ke ${targetDays.length} hari (${orderedSelectedIds.length} karyawan).`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyimpan jadwal shift harian.'
      );
    } finally {
      setSavingDailyModal(false);
    }
  };

  const handleRemoveEmployeeFromDailyShift = async (
    shift: ShiftConfig,
    dayIndex: number,
    emp: Employee
  ) => {
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

  const handleResetDailyShiftToDefault = async (
    shift: ShiftConfig,
    dayIndex: number
  ) => {
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
        `Jadwal ${shift.name} hari ${HARI_MAP[dayIndex]?.label ?? ''} dikembalikan ke daftar master shift.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mereset jadwal harian.'
      );
    } finally {
      setBusyDailyKey(null);
    }
  };

  // Copy one day's entire shift setup (all shifts) to other weekdays
  const openCopyDayModal = (sourceDayIndex: number) => {
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
      const nextShifts = shifts.map((s) => {
        const { members } = getShiftMembersForWeekday(s, copyDaySource, activeEmployees);
        const sourceIds = members.map((m) => m.id);
        const nextDaily: Record<string, string[]> = { ...(s.dailyMemberIds ?? {}) };
        for (const targetDay of copyDayTargets) {
          nextDaily[String(targetDay)] = sourceIds;
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
      showToast(`Susunan seluruh shift hari ${srcLabel} berhasil disalin ke ${count} hari lainnya.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyalin jadwal hari.'
      );
    } finally {
      setSavingCopyDay(false);
    }
  };

  // Direct 1-click master shift reassignment per employee
  const handleQuickAssignShift = async (emp: Employee, targetShiftId: string) => {
    const targetShift = shifts.find((s) => s.id === targetShiftId);
    if (!targetShift) return;

    setBusyEmployeeId(emp.id);
    setErrorMessage(null);
    try {
      await updateEmployee(emp.id, {
        shiftName: targetShift.name,
        shiftStart: targetShift.startTime,
        shiftEnd: targetShift.endTime,
      });
      await onRefresh();
      showToast(
        `${emp.name} dipindahkan ke ${targetShift.name} (${targetShift.startTime} – ${targetShift.endTime}).`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengubah shift karyawan.'
      );
    } finally {
      setBusyEmployeeId(null);
    }
  };

  // Sync an employee whose hours differ from preset shift hours
  const handleSyncEmployeeHours = async (emp: Employee, shift: ShiftConfig) => {
    setBusyEmployeeId(emp.id);
    setErrorMessage(null);
    try {
      await updateEmployee(emp.id, {
        shiftName: shift.name,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
      });
      await onRefresh();
      showToast(`Jam kerja ${emp.name} disinkronkan ke ${shift.startTime} – ${shift.endTime}.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyinkronkan jam kerja karyawan.'
      );
    } finally {
      setBusyEmployeeId(null);
    }
  };

  // Open Atur Anggota Master Modal
  const openMemberModal = (shift: ShiftConfig) => {
    const currentMemberIds = new Set(
      activeEmployees
        .filter((e) => e.shiftName.toLowerCase() === shift.name.toLowerCase())
        .map((e) => e.id)
    );
    const otherShift = shifts.find((s) => s.id !== shift.id);
    setMemberModalShift(shift);
    setMemberModalSelectedIds(currentMemberIds);
    setMemberModalSearch('');
    setMemberModalOnlyUnassigned(false);
    setMemberModalFallbackShiftId(otherShift ? otherShift.id : '');
    setErrorMessage(null);
  };

  const memberModalFilteredEmployees = useMemo(() => {
    if (!memberModalShift) return [];
    const q = memberModalSearch.trim().toLowerCase();
    return activeEmployees.filter((emp) => {
      const isCurrentlyInTarget =
        emp.shiftName.toLowerCase() === memberModalShift.name.toLowerCase();
      if (memberModalOnlyUnassigned && isCurrentlyInTarget) return false;
      if (q) {
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.employeeCode.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.shiftName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeEmployees, memberModalShift, memberModalSearch, memberModalOnlyUnassigned]);

  const removedFromTargetCount = useMemo(() => {
    if (!memberModalShift) return 0;
    return activeEmployees.filter(
      (emp) =>
        emp.shiftName.toLowerCase() === memberModalShift.name.toLowerCase() &&
        !memberModalSelectedIds.has(emp.id)
    ).length;
  }, [activeEmployees, memberModalShift, memberModalSelectedIds]);

  const addedToTargetCount = useMemo(() => {
    if (!memberModalShift) return 0;
    return activeEmployees.filter(
      (emp) =>
        emp.shiftName.toLowerCase() !== memberModalShift.name.toLowerCase() &&
        memberModalSelectedIds.has(emp.id)
    ).length;
  }, [activeEmployees, memberModalShift, memberModalSelectedIds]);

  const handleSaveMembersModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberModalShift) return;

    const toAssign = activeEmployees.filter(
      (emp) =>
        memberModalSelectedIds.has(emp.id) &&
        emp.shiftName.toLowerCase() !== memberModalShift.name.toLowerCase()
    );
    const toRemove = activeEmployees.filter(
      (emp) =>
        !memberModalSelectedIds.has(emp.id) &&
        emp.shiftName.toLowerCase() === memberModalShift.name.toLowerCase()
    );

    const fallbackShift = shifts.find((s) => s.id === memberModalFallbackShiftId);
    if (toRemove.length > 0 && !fallbackShift) {
      setErrorMessage(
        'Pilih shift tujuan pengganti untuk karyawan yang dikeluarkan dari shift ini.'
      );
      return;
    }

    if (toAssign.length === 0 && toRemove.length === 0) {
      setMemberModalShift(null);
      return;
    }

    setSavingMembers(true);
    setErrorMessage(null);
    try {
      for (const emp of toAssign) {
        await updateEmployee(emp.id, {
          shiftName: memberModalShift.name,
          shiftStart: memberModalShift.startTime,
          shiftEnd: memberModalShift.endTime,
        });
      }
      if (fallbackShift) {
        for (const emp of toRemove) {
          await updateEmployee(emp.id, {
            shiftName: fallbackShift.name,
            shiftStart: fallbackShift.startTime,
            shiftEnd: fallbackShift.endTime,
          });
        }
      }
      await onRefresh();
      const targetName = memberModalShift.name;
      setMemberModalShift(null);
      showToast(
        `Anggota master ${targetName} diperbarui: ${toAssign.length} masuk${
          toRemove.length > 0 && fallbackShift
            ? `, ${toRemove.length} dipindah ke ${fallbackShift.name}`
            : ''
        }.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyimpan daftar anggota shift.'
      );
    } finally {
      setSavingMembers(false);
    }
  };

  // Open Create Shift Modal
  const openCreateShiftModal = () => {
    setEditingShift(null);
    setShiftNameInput('');
    setShiftStartInput('08:00');
    setShiftEndInput('17:00');
    setShiftToleranceInput(10);
    setSyncEmployeesOnEdit(true);
    setNewShiftMemberIds(new Set());
    setNewShiftMemberSearch('');
    setShiftFormOpen(true);
    setErrorMessage(null);
  };

  // Open Edit Shift Modal
  const openEditShiftModal = (shift: ShiftConfig) => {
    setEditingShift(shift);
    setShiftNameInput(shift.name);
    setShiftStartInput(shift.startTime);
    setShiftEndInput(shift.endTime);
    setShiftToleranceInput(shift.lateToleranceMinutes);
    setSyncEmployeesOnEdit(true);
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

        const nameChanged = editingShift.name.toLowerCase() !== cleanName.toLowerCase();
        await updateAppSettings({
          shifts: nextShifts,
          syncEmployees: syncEmployeesOnEdit && !nameChanged,
        });

        if (syncEmployeesOnEdit && nameChanged) {
          const affected = employees.filter(
            (emp) => emp.shiftName.toLowerCase() === editingShift.name.toLowerCase()
          );
          for (const emp of affected) {
            await updateEmployee(emp.id, {
              shiftName: cleanName,
              shiftStart: shiftStartInput,
              shiftEnd: shiftEndInput,
            });
          }
        }

        await onRefresh();
        setShiftFormOpen(false);
        showToast(`Shift "${cleanName}" berhasil diperbarui (${shiftStartInput} – ${shiftEndInput}).`);
      } else {
        const newShift: ShiftConfig = {
          id: `shift_${Date.now()}`,
          name: cleanName,
          startTime: shiftStartInput,
          endTime: shiftEndInput,
          lateToleranceMinutes: Math.max(0, Math.min(120, Number(shiftToleranceInput) || 0)),
        };
        const nextShifts = [...shifts, newShift];
        await updateAppSettings({ shifts: nextShifts });

        const selectedEmps = activeEmployees.filter((emp) =>
          newShiftMemberIds.has(emp.id)
        );
        for (const emp of selectedEmps) {
          await updateEmployee(emp.id, {
            shiftName: newShift.name,
            shiftStart: newShift.startTime,
            shiftEnd: newShift.endTime,
          });
        }

        await onRefresh();
        setShiftFormOpen(false);
        showToast(
          `Shift baru "${cleanName}" (${shiftStartInput} – ${shiftEndInput}) dibuat${
            selectedEmps.length > 0 ? ` dengan ${selectedEmps.length} anggota.` : '.'
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
    const fallback = shifts.find((s) => s.id !== shift.id);
    setDeletingShift(shift);
    setDeleteTargetShiftId(fallback ? fallback.id : '');
    setErrorMessage(null);
  };

  const handleConfirmDeleteShift = async () => {
    if (!deletingShift || shifts.length <= 1) return;
    const affected = employees.filter(
      (emp) => emp.shiftName.toLowerCase() === deletingShift.name.toLowerCase()
    );
    const fallback = shifts.find((s) => s.id === deleteTargetShiftId);
    if (affected.length > 0 && !fallback) {
      setErrorMessage('Pilih shift tujuan untuk memindahkan anggota shift ini.');
      return;
    }

    setDeletingBusy(true);
    setErrorMessage(null);
    try {
      if (affected.length > 0 && fallback) {
        for (const emp of affected) {
          await updateEmployee(emp.id, {
            shiftName: fallback.name,
            shiftStart: fallback.startTime,
            shiftEnd: fallback.endTime,
          });
        }
      }
      const nextShifts = shifts.filter((s) => s.id !== deletingShift.id);
      await updateAppSettings({ shifts: nextShifts });
      if (shiftFilter === deletingShift.id) {
        setShiftFilter('ALL');
      }
      await onRefresh();
      const deletedName = deletingShift.name;
      setDeletingShift(null);
      showToast(
        `Shift "${deletedName}" dihapus.${
          affected.length > 0 && fallback
            ? ` ${affected.length} anggota dipindahkan ke ${fallback.name}.`
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

      {/* Top Shift Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {shiftSummaries.map(
          ({ shift, style, todayAssignedCount, onDutyToday, offToday, durationHours }) => {
            const isSelected = shiftFilter === shift.id;
            return (
              <div
                key={shift.id}
                onClick={() => setShiftFilter(isSelected ? 'ALL' : shift.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShiftFilter(isSelected ? 'ALL' : shift.id);
                  }
                }}
                className={`bg-white rounded-xl border p-3.5 sm:p-4 shadow-xs transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? `border-blue-600 ring-2 ${style.cardRing}`
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${style.accentBar}`} />
                <div className="flex items-start justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconText}`}
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
                    className={`hidden sm:inline-block font-mono text-xs font-bold px-2 py-0.5 rounded-md border tabular-nums shrink-0 ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
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
            );
          }
        )}
      </div>

      {/* Main Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs space-y-3.5 sm:space-y-4 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Sub-Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSubTab('harian')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'harian'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Jadwal Harian</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('roster')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'roster'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Master per Shift</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('mingguan')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'mingguan'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Matriks Mingguan</span>
            </button>
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateShiftModal}
              className="col-span-2 sm:col-span-1 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Shift Baru</span>
            </button>

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
                Atur Jadwal Libur →
              </button>
            )}
          </div>

          {/* Stacked Day Cards: Senin -> Shift Pagi (a, b, c) / Shift Sela (a, b, c) ... */}
          <div className="space-y-4 sm:space-y-5">
            {visibleWeekdays.map((day) => {
              const isTodayDay = day.index === todayWeekday;
              const offEmployeesOnDay = filteredEmployees.filter((emp) =>
                emp.offDays.includes(day.index)
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

                    <div className="flex flex-wrap items-center gap-1.5 no-print">
                      <button
                        type="button"
                        disabled={exportingExcel || loading}
                        onClick={() => handleExportExcel(day.index)}
                        title={`Ekspor Excel jadwal hari ${day.label}`}
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintSchedule(day.index)}
                        title={`Cetak jadwal hari ${day.label}`}
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCopyDayModal(day.index)}
                        className="px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Jadwal {day.short}</span>
                      </button>
                    </div>
                  </div>

                  {/* Shifts within this Day */}
                  <div className="p-3.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                    {visibleShiftSummaries.map(({ shift, style }) => {
                      const { members: allDayMembers, isCustomDayRoster } =
                        getShiftMembersForWeekday(shift, day.index, activeEmployees);
                      const filteredIds = new Set(filteredEmployees.map((e) => e.id));
                      const displayMembers = allDayMembers.filter((m) =>
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

                            <div className="flex items-center gap-1.5 shrink-0 no-print">
                              {isCustomDayRoster && (
                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() =>
                                    handleResetDailyShiftToDefault(shift, day.index)
                                  }
                                  title="Kembalikan ke daftar master shift"
                                  className="p-2 sm:p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
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
                          </div>

                          {/* Member list: a, b, c */}
                          <div className="divide-y divide-slate-100 flex-1">
                            {displayMembers.length === 0 ? (
                              <div className="px-4 py-5 text-center">
                                <p className="text-xs text-slate-400 italic">
                                  {allDayMembers.length === 0
                                    ? `Belum ada karyawan di ${shift.name} hari ${day.label}.`
                                    : 'Tidak ada yang cocok dengan filter.'}
                                </p>
                                {allDayMembers.length === 0 && (
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
                              displayMembers.map((emp, idx) => {
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
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Master per Shift */}
      {subTab === 'roster' && (
        <div className="space-y-6 no-print">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {visibleShiftSummaries.map(
              ({ shift, style, allMembers, filteredMembers, onDutyToday, durationHours }) => (
                <div
                  key={shift.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col"
                >
                  {/* Shift Card Header */}
                  <div
                    className={`px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 ${style.headerBg}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconText}`}
                      >
                        {renderShiftIcon(style.icon, 'w-5 h-5')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-base font-bold text-slate-900">
                            {shift.name}
                          </h3>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
                          >
                            {allMembers.length} Karyawan
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                          {shift.startTime} – {shift.endTime} ({durationHours} jam) • Toleransi{' '}
                          {shift.lateToleranceMinutes} menit • {onDutyToday} masuk hari ini
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 no-print">
                      <button
                        type="button"
                        onClick={() => openMemberModal(shift)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Atur Anggota</span>
                      </button>
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
                  </div>

                  {/* Employee List */}
                  <div className="divide-y divide-slate-100 flex-1">
                    {filteredMembers.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-xs text-slate-500">
                          {allMembers.length === 0
                            ? `Belum ada karyawan dengan shift utama ${shift.name}.`
                            : 'Tidak ada karyawan yang cocok dengan filter pencarian.'}
                        </p>
                        {allMembers.length === 0 && (
                          <button
                            type="button"
                            onClick={() => openMemberModal(shift)}
                            className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer no-print"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Tambah Karyawan ke {shift.name}</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredMembers.map((emp) => {
                        const offToday = isEmployeeOffDay(emp, today);
                        const hasCustomHours =
                          emp.shiftStart !== shift.startTime ||
                          emp.shiftEnd !== shift.endTime;
                        const isBusy = busyEmployeeId === emp.id;

                        return (
                          <div
                            key={emp.id}
                            className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-display text-xs font-bold flex items-center justify-center shrink-0">
                                {getInitials(emp.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-slate-900 truncate">
                                    {emp.name}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    {emp.employeeCode}
                                  </span>
                                  {offToday.isOff ? (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                      Libur Hari Ini
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Bertugas
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                  <span>
                                    {emp.department} · {emp.position}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span>Libur: {formatOffDaysSummary(emp.offDays)}</span>
                                  {hasCustomHours && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-amber-700 font-mono font-medium">
                                        Jam khusus: {emp.shiftStart}–{emp.shiftEnd}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => handleSyncEmployeeHours(emp, shift)}
                                        className="text-blue-700 hover:underline font-medium cursor-pointer no-print"
                                      >
                                        Samakan
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 no-print">
                              <select
                                aria-label={`Pindahkan shift ${emp.name}`}
                                value={shift.id}
                                disabled={isBusy}
                                onChange={(e) => handleQuickAssignShift(emp, e.target.value)}
                                className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:opacity-50 cursor-pointer"
                              >
                                {shifts.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.id === shift.id
                                      ? `${opt.name} (${opt.startTime})`
                                      : `Pindah → ${opt.name}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {shiftFilter === 'ALL' && customShiftEmployees.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-amber-950">
                    Shift Kustom / Belum Terdaftar di Master Shift ({customShiftEmployees.length})
                  </h3>
                  <p className="text-xs text-amber-800">
                    Pindahkan karyawan berikut ke salah satu shift resmi agar jadwal terstandardisasi.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {customShiftEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {emp.name}{' '}
                        <span className="font-mono text-xs text-slate-500">
                          ({emp.employeeCode})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {emp.department} · Saat ini: <strong>{emp.shiftName || 'Kosong'}</strong> (
                        {emp.shiftStart}–{emp.shiftEnd})
                      </div>
                    </div>
                    <select
                      value=""
                      disabled={busyEmployeeId === emp.id}
                      onChange={(e) => {
                        if (e.target.value) handleQuickAssignShift(emp, e.target.value);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold border border-amber-300 rounded-lg bg-white text-slate-800 cursor-pointer no-print"
                    >
                      <option value="" disabled>
                        Pilih Shift Resmi...
                      </option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          Masukkan ke {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
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

          <div className="md:hidden px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 font-medium no-print">
            Geser kiri/kanan untuk melihat semua hari (Senin–Minggu) →
          </div>

          <div className="overflow-x-auto">
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
                {visibleShiftSummaries.map(({ shift, style, filteredMembers }) => (
                  <tr key={shift.id} className="align-top">
                    <td className={`px-4 py-3.5 border-r border-slate-200 ${style.headerBg}`}>
                      <div className="font-display font-bold text-slate-900">
                        {shift.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                        {shift.startTime} – {shift.endTime}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Master: {filteredMembers.length} anggota
                      </div>
                    </td>

                    {HARI_WEEKDAYS.map((day) => {
                      const isTodayCol = day.index === todayWeekday;
                      const filteredIds = new Set(filteredEmployees.map((e) => e.id));
                      const { members, isCustomDayRoster } = getShiftMembersForWeekday(
                        shift,
                        day.index,
                        activeEmployees
                      );
                      const workingToday = members.filter((e) => filteredIds.has(e.id));

                      return (
                        <td
                          key={day.index}
                          onClick={() => openDailyMemberModal(shift, day.index)}
                          title={`Klik untuk atur anggota ${shift.name} hari ${day.label}`}
                          className={`px-3 py-3 border-r border-slate-100 last:border-r-0 cursor-pointer hover:bg-blue-50/60 transition-colors ${
                            isTodayCol ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          {isCustomDayRoster && (
                            <div className="text-[9px] font-bold uppercase text-blue-700 mb-1">
                              Khusus {day.short}
                            </div>
                          )}
                          {workingToday.length === 0 ? (
                            <span className="text-[11px] italic text-slate-400">
                              Tidak ada
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {workingToday.map((emp) => (
                                <div
                                  key={emp.id}
                                  className="px-2 py-1 rounded bg-slate-50 border border-slate-200/80 text-slate-800 font-medium leading-tight"
                                >
                                  <div className="truncate">{emp.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {emp.department}
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
                      Jadwal istirahat rutin per hari
                    </div>
                  </td>
                  {HARI_WEEKDAYS.map((day) => {
                    const isTodayCol = day.index === todayWeekday;
                    const offEmployees = filteredEmployees.filter((emp) =>
                      emp.offDays.includes(day.index)
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
                                className="px-2 py-1 rounded bg-white border border-amber-200 text-amber-950 text-[11px]"
                              >
                                <span className="font-semibold">{emp.name}</span>{' '}
                                <span className="text-amber-700">({emp.shiftName})</span>
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
                    placeholder="Cari nama karyawan, kode, divisi, atau shift utama..."
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
                        setDailyModalSelectedIds((prev) => {
                          const next = new Set(prev);
                          dailyModalFilteredEmployees.forEach((emp) => next.add(emp.id));
                          return next;
                        });
                      }}
                      className="text-blue-700 hover:underline font-semibold py-1 cursor-pointer"
                    >
                      Pilih semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyModalSelectedIds(new Set())}
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
                      onClick={() => setDailyModalApplyScope(opt.id)}
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
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {dailyModalFilteredEmployees.map((emp) => {
                  const checked = dailyModalSelectedIds.has(emp.id);
                  const isOffOnDay = emp.offDays.includes(dailyModal.dayIndex);
                  return (
                    <label
                      key={emp.id}
                      className={`px-4 sm:px-5 py-3 sm:py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 ${
                        checked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setDailyModalSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (isChecked) next.add(emp.id);
                              else next.delete(emp.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {emp.name}{' '}
                            <span className="font-mono text-[11px] text-slate-500">
                              ({emp.employeeCode})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {emp.department} · Shift utama: {emp.shiftName}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isOffOnDay && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Libur Rutin {HARI_MAP[dailyModal.dayIndex]?.short}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
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

      {/* MODAL 1: Atur Anggota Master Shift (Multi-select Roster Builder) */}
      {memberModalShift && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh]">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Atur Anggota Master — {memberModalShift.name}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Jam Kerja: {memberModalShift.startTime} – {memberModalShift.endTime} • Menetapkan shift utama karyawan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMemberModalShift(null)}
                className="p-2 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMembersModal} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberModalSearch}
                      onChange={(e) => setMemberModalSearch(e.target.value)}
                      placeholder="Cari nama, kode, divisi, atau shift saat ini..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={memberModalOnlyUnassigned}
                      onChange={(e) => setMemberModalOnlyUnassigned(e.target.checked)}
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span>Dari shift lain saja</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-700">
                      Terpilih: {memberModalSelectedIds.size} karyawan
                    </span>
                    {addedToTargetCount > 0 && (
                      <span className="text-emerald-700 font-medium">
                        +{addedToTargetCount} masuk
                      </span>
                    )}
                    {removedFromTargetCount > 0 && (
                      <span className="text-amber-700 font-medium">
                        -{removedFromTargetCount} keluar
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberModalSelectedIds((prev) => {
                        const next = new Set(prev);
                        memberModalFilteredEmployees.forEach((emp) => next.add(emp.id));
                        return next;
                      });
                    }}
                    className="text-blue-700 hover:underline font-semibold cursor-pointer"
                  >
                    Pilih semua yang tampil
                  </button>
                </div>

                {removedFromTargetCount > 0 && shifts.length > 1 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-amber-900">
                      {removedFromTargetCount} karyawan dikeluarkan dari {memberModalShift.name}. Pindahkan ke:
                    </span>
                    <select
                      value={memberModalFallbackShiftId}
                      onChange={(e) => setMemberModalFallbackShiftId(e.target.value)}
                      className="px-2.5 py-1 text-xs font-semibold border border-amber-300 rounded-md bg-white text-slate-800"
                    >
                      {shifts
                        .filter((s) => s.id !== memberModalShift.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime}–{s.endTime})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {memberModalFilteredEmployees.map((emp) => {
                  const checked = memberModalSelectedIds.has(emp.id);
                  const isCurrentlyInTarget =
                    emp.shiftName.toLowerCase() === memberModalShift.name.toLowerCase();
                  const cannotUncheck = isCurrentlyInTarget && shifts.length <= 1;

                  return (
                    <label
                      key={emp.id}
                      className={`px-5 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 ${
                        checked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={cannotUncheck}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setMemberModalSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (isChecked) next.add(emp.id);
                              else next.delete(emp.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {emp.name}{' '}
                            <span className="font-mono text-[11px] text-slate-500">
                              ({emp.employeeCode})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {emp.department} · {emp.position}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {isCurrentlyInTarget ? (
                          checked ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Anggota Saat Ini
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Akan Dipindah
                            </span>
                          )
                        ) : checked ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {emp.shiftName} → {memberModalShift.name}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            Saat ini: {emp.shiftName}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0 pb-safe">
                <button
                  type="button"
                  onClick={() => setMemberModalShift(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingMembers}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {savingMembers ? 'Menyimpan...' : 'Simpan Anggota Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncEmployeesOnEdit}
                    onChange={(e) => setSyncEmployeesOnEdit(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span className="text-xs text-slate-700">
                    Terapkan perubahan nama & jam kerja ini ke seluruh karyawan yang saat ini berada di <strong>{editingShift.name}</strong>.
                  </span>
                </label>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Pilih Anggota Awal (Opsional · {newShiftMemberIds.size} dipilih)
                    </label>
                  </div>
                  <input
                    type="text"
                    value={newShiftMemberSearch}
                    onChange={(e) => setNewShiftMemberSearch(e.target.value)}
                    placeholder="Cari karyawan untuk langsung dimasukkan..."
                    className="w-full px-3 py-2 sm:py-1.5 text-sm sm:text-xs border border-slate-200 rounded-lg"
                  />
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {activeEmployees
                      .filter((emp) => {
                        const q = newShiftMemberSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          emp.name.toLowerCase().includes(q) ||
                          emp.department.toLowerCase().includes(q) ||
                          emp.employeeCode.toLowerCase().includes(q)
                        );
                      })
                      .map((emp) => (
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
                          </span>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            {emp.shiftName}
                          </span>
                        </label>
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
                const affectedCount = employees.filter(
                  (e) => e.shiftName.toLowerCase() === deletingShift.name.toLowerCase()
                ).length;
                return (
                  <>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Anda akan menghapus konfigurasi <strong>{deletingShift.name}</strong> (
                      {deletingShift.startTime} – {deletingShift.endTime}).
                      {affectedCount > 0
                        ? ` Terdapat ${affectedCount} karyawan pada shift ini yang akan dipindahkan otomatis.`
                        : ' Belum ada karyawan di shift ini.'}
                    </p>
                    {affectedCount > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          Pindahkan {affectedCount} karyawan ke shift:
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
    </div>
  );
};
