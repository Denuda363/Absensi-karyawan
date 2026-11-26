import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Employee,
  formatEmployeeShiftForDisplay,
  formatIndonesianDate,
  formatIndonesianMonth,
  formatOffDaysSummary,
  getCurrentYearMonth,
  getDaysInMonth,
  getDayOfWeekFromDateStr,
  getEmployeeScheduledShiftsForWeekday,
  getTodayDateStr,
  HARI_WEEKDAYS,
  isEmployeeOffDay,
  ShiftConfig,
  UNASSIGNED_SHIFT_NAME,
} from '../types';
import {
  createEmployee,
  deleteEmployee,
  updateEmployee,
} from '../services/attendanceService';
import { ReadOnlyModeBanner } from './ReadOnlyModeBanner';

interface DayOffScheduleViewProps {
  employees: Employee[];
  shifts?: ShiftConfig[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  isAttendanceAdmin?: boolean;
  onRequestAttendanceAdmin?: () => void;
}

export const DayOffScheduleView: React.FC<DayOffScheduleViewProps> = ({
  employees,
  shifts = [],
  loading,
  onRefresh,
  isAttendanceAdmin = false,
  onRequestAttendanceAdmin,
}) => {
  const [viewMode, setViewMode] = useState<'matriks' | 'kalender'>('matriks');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Monthly calendar state
  const [calendarMonth, setCalendarMonth] = useState<string>(getCurrentYearMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(getTodayDateStr());

  // Schedule editor modal
  const [editingScheduleEmp, setEditingScheduleEmp] = useState<Employee | null>(null);
  const [editOffDays, setEditOffDays] = useState<number[]>([]);
  const [editCustomDates, setEditCustomDates] = useState<string[]>([]);
  const [newCustomDate, setNewCustomDate] = useState<string>(getTodayDateStr());
  const [savingSchedule, setSavingSchedule] = useState<boolean>(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Add / Edit employee profile modal
  const [empModalOpen, setEmpModalOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empCode, setEmpCode] = useState<string>('');
  const [empName, setEmpName] = useState<string>('');
  const [empDept, setEmpDept] = useState<string>('Operasional');
  const [empPosition, setEmpPosition] = useState<string>('Staf');
  const [empOffDays, setEmpOffDays] = useState<number[]>([1]);
  const [empActive, setEmpActive] = useState<boolean>(true);
  const [empSaving, setEmpSaving] = useState<boolean>(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState<Employee | null>(null);
  const [deletingEmp, setDeletingEmp] = useState<boolean>(false);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active),
    [employees]
  );

  const departments = useMemo(() => {
    const set = new Set(activeEmployees.map((e) => e.department));
    return ['all', ...Array.from(set).sort()];
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => {
        if (deptFilter !== 'all' && emp.department !== deptFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            emp.name.toLowerCase().includes(q) ||
            emp.employeeCode.toLowerCase().includes(q) ||
            emp.department.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  }, [employees, deptFilter, searchQuery]);

  const weekdayCoverage = useMemo(() => {
    return HARI_WEEKDAYS.map((day) => {
      const offStaff = activeEmployees.filter((e) => e.offDays.includes(day.index));
      return {
        ...day,
        offCount: offStaff.length,
        onDutyCount: activeEmployees.length - offStaff.length,
      };
    });
  }, [activeEmployees]);

  const monthDays = useMemo(() => getDaysInMonth(calendarMonth), [calendarMonth]);

  const leadingBlankCells = useMemo(() => {
    if (monthDays.length === 0) return 0;
    const firstDow = getDayOfWeekFromDateStr(monthDays[0]);
    return firstDow === 0 ? 6 : firstDow - 1;
  }, [monthDays]);

  const selectedDateBreakdown = useMemo(() => {
    const offList: { emp: Employee; reason: 'mingguan' | 'khusus' }[] = [];
    const workList: Employee[] = [];
    for (const emp of activeEmployees) {
      const info = isEmployeeOffDay(emp, selectedCalendarDate);
      if (info.isOff && info.reason) {
        offList.push({ emp, reason: info.reason });
      } else {
        workList.push(emp);
      }
    }
    return { offList, workList };
  }, [activeEmployees, selectedCalendarDate]);

  const today = getTodayDateStr();

  const openScheduleModal = (emp: Employee) => {
    if (!isAttendanceAdmin) {
      setPageError(
        'Mode Biasa hanya dapat melihat data. Masuk Admin Absensi (PIN 1234) untuk mengubah jadwal libur.'
      );
      return;
    }
    setEditingScheduleEmp(emp);
    setEditOffDays([...emp.offDays]);
    setEditCustomDates([...(emp.customOffDates || [])]);
    setNewCustomDate(today);
    setScheduleError(null);
  };

  const toggleDayIndex = (
    dayIndex: number,
    list: number[],
    setter: (next: number[]) => void
  ) => {
    if (list.includes(dayIndex)) {
      setter(list.filter((d) => d !== dayIndex));
    } else {
      setter([...list, dayIndex]);
    }
  };

  const handleAddCustomDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newCustomDate)) return;
    if (editCustomDates.includes(newCustomDate)) return;
    if (editCustomDates.length >= 31) {
      setScheduleError('Maksimal 31 tanggal libur khusus per karyawan.');
      return;
    }
    setEditCustomDates([...editCustomDates, newCustomDate].sort());
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScheduleEmp) return;
    setScheduleError(null);
    setSavingSchedule(true);
    try {
      await updateEmployee(editingScheduleEmp.id, {
        offDays: editOffDays,
        customOffDates: editCustomDates,
      });
      await onRefresh();
      setEditingScheduleEmp(null);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : 'Gagal memperbarui jadwal libur.'
      );
    } finally {
      setSavingSchedule(false);
    }
  };

  const openAddEmployeeModal = () => {
    if (!isAttendanceAdmin) {
      setPageError('Mode Biasa hanya dapat melihat data. Masuk Admin Absensi untuk menambah karyawan.');
      return;
    }
    const nextNum = 101 + employees.length;
    setEditingEmployee(null);
    setEmpCode(`KRY-${nextNum}`);
    setEmpName('');
    setEmpDept('Operasional');
    setEmpPosition('Staf Operasional');
    setEmpOffDays([]);
    setEmpActive(true);
    setEmpError(null);
    setEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    if (!isAttendanceAdmin) {
      setPageError('Mode Biasa hanya dapat melihat data. Masuk Admin Absensi untuk mengubah data karyawan.');
      return;
    }
    setEditingEmployee(emp);
    setEmpCode(emp.employeeCode);
    setEmpName(emp.name);
    setEmpDept(emp.department);
    setEmpPosition(emp.position);
    setEmpOffDays([...emp.offDays]);
    setEmpActive(emp.active);
    setEmpError(null);
    setEmpModalOpen(true);
  };

  const handleSaveEmployeeModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpError(null);
    if (empName.trim().length < 2) {
      setEmpError('Nama karyawan minimal 2 karakter.');
      return;
    }
    if (empCode.trim().length < 2) {
      setEmpError('Kode karyawan minimal 2 karakter.');
      return;
    }

    setEmpSaving(true);
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, {
          employeeCode: empCode.trim().toUpperCase(),
          name: empName.trim(),
          department: empDept.trim() || 'Operasional',
          position: empPosition.trim() || 'Staf',
          offDays: empOffDays,
          active: empActive,
        });
      } else {
        await createEmployee({
          employeeCode: empCode.trim().toUpperCase(),
          name: empName.trim(),
          department: empDept.trim() || 'Operasional',
          position: empPosition.trim() || 'Staf',
          shiftName: UNASSIGNED_SHIFT_NAME,
          shiftStart: '00:00',
          shiftEnd: '00:00',
          offDays: empOffDays,
          customOffDates: [],
          active: empActive,
        });
      }
      await onRefresh();
      setEmpModalOpen(false);
    } catch (err) {
      setEmpError(err instanceof Error ? err.message : 'Gagal menyimpan karyawan.');
    } finally {
      setEmpSaving(false);
    }
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!deleteConfirmEmp) return;
    setDeletingEmp(true);
    setPageError(null);
    try {
      await deleteEmployee(deleteConfirmEmp.id);
      await onRefresh();
      setDeleteConfirmEmp(null);
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Gagal menghapus data karyawan.'
      );
      setDeleteConfirmEmp(null);
    } finally {
      setDeletingEmp(false);
    }
  };

  return (
    <div className="space-y-6">
      {pageError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pageError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageError(null)}
            className="text-red-700 hover:text-red-900 cursor-pointer"
            aria-label="Tutup pesan error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!isAttendanceAdmin && (
        <ReadOnlyModeBanner
          areaLabel="jadwal libur karyawan"
          onRequestAttendanceAdmin={onRequestAttendanceAdmin}
        />
      )}
      {/* Executive 3D Daily Coverage Strip (Mon-Sun) */}
      <section className="surface-3d-dark rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-indigo-500/15 blur-3xl"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/90">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 border border-indigo-300/35 text-white flex items-center justify-center shrink-0">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white tracking-tight">
                Sebaran Hari Libur Mingguan Tim
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Setiap karyawan memiliki hari libur berbeda agar operasional berjalan penuh setiap hari
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-sky-300 font-semibold tabular-nums px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 self-start sm:self-auto">
            Total {activeEmployees.length} Karyawan Aktif
          </span>
        </div>

        <div className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
          {weekdayCoverage.map((day) => {
            const isTodayWeekday = new Date().getDay() === day.index;
            return (
              <div
                key={day.index}
                className={`p-3 rounded-xl border transition-all ${
                  isTodayWeekday
                    ? 'bg-gradient-to-br from-blue-600/30 to-indigo-600/20 border-blue-400/50 shadow-[0_6px_16px_-6px_rgba(37,99,235,0.45)]'
                    : 'bg-slate-900/75 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-xs font-semibold ${
                      isTodayWeekday ? 'text-white' : 'text-slate-200'
                    }`}
                  >
                    {day.label}
                  </span>
                  {isTodayWeekday && (
                    <span className="text-[10px] font-semibold text-sky-200 bg-blue-500/30 border border-blue-400/40 px-1.5 py-0.5 rounded-md">
                      Hari Ini
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline justify-between font-mono text-xs tabular-nums">
                  <span className="text-emerald-400 font-semibold">{day.onDutyCount} masuk</span>
                  <span className="text-slate-400">{day.offCount} libur</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Filter & View Switcher */}
      <div className="surface-3d rounded-2xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 flex-1">
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('matriks')}
              className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'matriks'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriks Mingguan
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kalender')}
              className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'kalender'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kalender Bulanan
            </button>
          </div>

          {viewMode === 'matriks' ? (
            <>
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, kode, divisi..."
                  className="pl-9 sm:pl-8 pr-8 py-2.5 sm:py-2 text-sm sm:text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-full"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Hapus pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Filter Divisi"
                className="w-full sm:w-auto px-3 py-2.5 sm:py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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

              {(searchQuery !== '' || deptFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDeptFilter('all');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
                >
                  Reset Filter
                </button>
              )}
            </>
          ) : (
            <input
              type="month"
              value={calendarMonth}
              onChange={(e) => {
                setCalendarMonth(e.target.value);
                setSelectedCalendarDate(`${e.target.value}-01`);
              }}
              aria-label="Pilih Bulan Kalender"
              className="w-full sm:w-auto px-3 py-2.5 sm:py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          )}
        </div>

        {isAttendanceAdmin && (
          <button
            type="button"
            onClick={openAddEmployeeModal}
            className="btn-3d-primary inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 rounded-xl hover:from-blue-500 hover:to-blue-600 whitespace-nowrap shrink-0 cursor-pointer w-full lg:w-auto min-h-[40px]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Tambah Karyawan</span>
          </button>
        )}
      </div>

      {viewMode === 'matriks' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((r) => (
                <div key={r} className="h-12 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">
                Belum ada data karyawan pada filter ini
              </p>
              <p className="text-xs text-slate-500">
                Tambahkan karyawan untuk mulai mengatur hari libur masing-masing individu.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const todayStatus = isEmployeeOffDay(emp, today);
                  const shiftDisplay = formatEmployeeShiftForDisplay(emp, today, shifts);
                  return (
                    <div
                      key={emp.id}
                      className={`p-4 space-y-3 ${!emp.active ? 'opacity-65' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {emp.name}
                            </span>
                            {!emp.active && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                Nonaktif
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate">
                            <span className="font-mono">{emp.employeeCode}</span> · {emp.department} ({emp.position})
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1 tabular-nums">
                            {shiftDisplay.label}
                          </div>
                        </div>
                        {todayStatus.isOff && emp.active && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-md whitespace-nowrap shrink-0">
                            Libur Hari Ini
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {HARI_WEEKDAYS.map((day) => {
                          const isOff = emp.offDays.includes(day.index);
                          const scheduledDay = getEmployeeScheduledShiftsForWeekday(
                            emp.id,
                            day.index,
                            shifts
                          )[0];
                          return (
                            <div
                              key={day.index}
                              className={`py-1.5 rounded-md text-center border ${
                                isOff
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                                  : scheduledDay
                                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                                    : 'bg-slate-50 border-slate-200/80 text-slate-400'
                              }`}
                            >
                              <div className="text-[10px] leading-tight">{day.short}</div>
                              <div className="text-[9px] font-mono mt-0.5">
                                {isOff ? 'OFF' : scheduledDay ? scheduledDay.startTime : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {emp.customOffDates && emp.customOffDates.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-slate-500">Libur khusus:</span>
                          {emp.customOffDates.slice(0, 3).map((dt) => (
                            <span
                              key={dt}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono"
                            >
                              {dt}
                            </span>
                          ))}
                          {emp.customOffDates.length > 3 && (
                            <span className="text-slate-500">
                              +{emp.customOffDates.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {isAttendanceAdmin && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openScheduleModal(emp)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>Atur Jadwal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditEmployeeModal(emp)}
                            aria-label={`Edit profil ${emp.name}`}
                            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmEmp(emp)}
                            aria-label={`Hapus karyawan ${emp.name}`}
                            className="p-2 text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4 min-w-[210px]">Karyawan &amp; Shift</th>
                    {HARI_WEEKDAYS.map((day) => {
                      const isTodayCol = new Date().getDay() === day.index;
                      return (
                        <th
                          key={day.index}
                          className={`py-3 px-2 text-center min-w-[76px] ${
                            isTodayCol ? 'bg-blue-50/90 text-blue-800' : ''
                          }`}
                        >
                          <span>{day.short}</span>
                          {isTodayCol && (
                            <span className="block text-[10px] font-medium text-blue-600">
                              Hari Ini
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th className="py-3 px-4 min-w-[140px]">Libur Khusus</th>
                    {isAttendanceAdmin && (
                      <th className="py-3 px-4 text-right">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredEmployees.map((emp) => {
                    const todayStatus = isEmployeeOffDay(emp, today);
                    const shiftDisplay = formatEmployeeShiftForDisplay(emp, today, shifts);
                    return (
                      <tr
                        key={emp.id}
                        className={`hover:bg-slate-50/70 ${!emp.active ? 'opacity-60' : ''}`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{emp.name}</span>
                            {!emp.active && (
                              <span className="text-[11px] font-medium text-slate-500">
                                (Nonaktif)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono">{emp.employeeCode}</span> · {emp.department} · {emp.position}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className={shiftDisplay.hasSchedule ? 'font-mono text-slate-700' : 'text-slate-400 italic'}>
                              {shiftDisplay.label}
                            </span>
                            {todayStatus.isOff && emp.active && (
                              <span className="ml-2 font-sans text-amber-700 font-medium">
                                · Libur Hari Ini
                              </span>
                            )}
                          </div>
                        </td>

                        {HARI_WEEKDAYS.map((day) => {
                          const isOff = emp.offDays.includes(day.index);
                          const scheduledDay = getEmployeeScheduledShiftsForWeekday(
                            emp.id,
                            day.index,
                            shifts
                          )[0];
                          return (
                            <td key={day.index} className="py-3 px-1.5 text-center">
                              {isOff ? (
                                <div className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md w-full">
                                  <CalendarOff className="w-3 h-3 shrink-0" />
                                  <span>Libur</span>
                                </div>
                              ) : scheduledDay ? (
                                <div
                                  title={`${scheduledDay.name} (${scheduledDay.startTime}–${scheduledDay.endTime})`}
                                  className="px-1.5 py-1 text-[11px] font-mono text-blue-900 bg-blue-50/70 border border-blue-200/80 rounded-md tabular-nums"
                                >
                                  {scheduledDay.startTime}
                                </div>
                              ) : (
                                <div
                                  title="Belum dijadwalkan di menu Jadwal Shift"
                                  className="px-1.5 py-1 text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-200/80 rounded-md"
                                >
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-3.5 px-4">
                          {emp.customOffDates && emp.customOffDates.length > 0 ? (
                            <div className="space-y-1">
                              {emp.customOffDates.slice(0, 2).map((dt) => (
                                <div
                                  key={dt}
                                  className="font-mono text-xs text-slate-700 tabular-nums"
                                >
                                  {dt}
                                </div>
                              ))}
                              {emp.customOffDates.length > 2 && (
                                <div className="text-[11px] text-slate-500">
                                  +{emp.customOffDates.length - 2} tanggal lainnya
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Tidak ada</span>
                          )}
                        </td>

                        {isAttendanceAdmin && (
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openScheduleModal(emp)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                              >
                                <CalendarDays className="w-3.5 h-3.5" />
                                <span>Jadwal</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditEmployeeModal(emp)}
                                aria-label={`Edit profil ${emp.name}`}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmEmp(emp)}
                                aria-label={`Hapus karyawan ${emp.name}`}
                                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      ) : (
        /* Monthly Calendar View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-4 border-b border-slate-100">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Kalender Libur — {formatIndonesianMonth(calendarMonth)}
              </h3>
              <span className="text-xs text-slate-500">
                Ketuk tanggal untuk melihat detail staf libur &amp; masuk
              </span>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2 text-center text-[11px] sm:text-xs font-semibold text-slate-500 pb-2">
              {HARI_WEEKDAYS.map((d) => (
                <div key={d.index}>{d.short}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: leadingBlankCells }).map((_, idx) => (
                <div key={`blank_${idx}`} className="h-14 sm:h-20 rounded-lg bg-slate-50/50" />
              ))}

              {monthDays.map((dateStr) => {
                const dayNum = Number(dateStr.slice(8, 10));
                const offStaff = activeEmployees.filter(
                  (e) => isEmployeeOffDay(e, dateStr).isOff
                );
                const isSelected = selectedCalendarDate === dateStr;
                const isTodayCell = today === dateStr;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedCalendarDate(dateStr)}
                    className={`h-14 sm:h-20 p-1 sm:p-2 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70'
                        : isTodayCell
                        ? 'border-slate-400 bg-white'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-0.5">
                      <span
                        className={`font-mono text-[11px] sm:text-xs font-semibold tabular-nums ${
                          isSelected ? 'text-blue-800' : 'text-slate-900'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {isTodayCell && (
                        <span className="hidden sm:inline text-[10px] font-medium text-blue-700">
                          Hari Ini
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] sm:text-[11px] font-mono tabular-nums leading-tight truncate">
                      {offStaff.length > 0 ? (
                        <span className="text-amber-800 font-medium">
                          {offStaff.length} <span className="hidden sm:inline">libur</span>
                          <span className="sm:hidden">off</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700">
                          <span className="hidden sm:inline">Penuh</span>
                          <span className="sm:hidden">OK</span>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <div className="text-xs text-slate-500">Detail Tanggal</div>
              <h4 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                {formatIndonesianDate(selectedCalendarDate)}
              </h4>
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-800 mb-2">
                Karyawan Libur ({selectedDateBreakdown.offList.length})
              </div>
              {selectedDateBreakdown.offList.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Tidak ada karyawan yang libur pada tanggal ini.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDateBreakdown.offList.map(({ emp, reason }) => (
                    <div
                      key={emp.id}
                      className="p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-lg flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {emp.name}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {emp.department}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-amber-800 whitespace-nowrap shrink-0">
                        {reason === 'khusus' ? 'Libur Khusus' : 'Libur Mingguan'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-800 mb-2">
                Karyawan Bertugas ({selectedDateBreakdown.workList.length})
              </div>
              <div className="space-y-1.5">
                {selectedDateBreakdown.workList.map((emp) => (
                  <div
                    key={emp.id}
                    className="py-1.5 flex items-center justify-between text-xs border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-800 font-medium truncate">{emp.name}</span>
                    <span className="font-mono text-slate-500 tabular-nums shrink-0">
                      {emp.shiftStart}–{emp.shiftEnd}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor Jadwal Libur Individu */}
      {editingScheduleEmp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/45">
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Atur Jadwal Libur Individu
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingScheduleEmp.name} · {editingScheduleEmp.employeeCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingScheduleEmp(null)}
                aria-label="Tutup modal"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="mt-4 space-y-5">
              {scheduleError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {scheduleError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Hari Libur Mingguan Tetap
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Pilih satu atau beberapa hari libur khusus untuk karyawan ini.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {HARI_WEEKDAYS.map((day) => {
                    const active = editOffDays.includes(day.index);
                    return (
                      <button
                        key={day.index}
                        type="button"
                        onClick={() =>
                          toggleDayIndex(day.index, editOffDays, setEditOffDays)
                        }
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  Terpilih: <strong>{formatOffDaysSummary(editOffDays)}</strong>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Tanggal Libur Khusus / Tukar Libur
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newCustomDate}
                    onChange={(e) => setNewCustomDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomDate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>Tambah Tanggal</span>
                  </button>
                </div>

                {editCustomDates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {editCustomDates.map((dt) => (
                      <div
                        key={dt}
                        className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono text-slate-800"
                      >
                        <span>{dt}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditCustomDates(editCustomDates.filter((d) => d !== dt))
                          }
                          aria-label={`Hapus tanggal ${dt}`}
                          className="text-slate-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
                <strong>Catatan Shift Kerja:</strong> Tidak ada shift default per karyawan. Penempatan shift masuk karyawan diatur penuh melalui menu <strong>Jadwal Shift</strong>.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingScheduleEmp(null)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingSchedule ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Profil Karyawan */}
      {empModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/45">
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl w-full max-w-lg p-5 sm:p-6 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto pb-safe">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingEmployee ? 'Ubah Data Karyawan' : 'Tambah Karyawan & Hari Libur'}
              </h3>
              <button
                type="button"
                onClick={() => setEmpModalOpen(false)}
                aria-label="Tutup modal"
                className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeModal} className="mt-4 space-y-4">
              {empError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {empError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kode Karyawan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={empCode}
                    onChange={(e) => setEmpCode(e.target.value)}
                    placeholder="KRY-109"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    placeholder="Contoh: Arif Budiman"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Divisi / Departemen
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={empDept}
                    onChange={(e) => setEmpDept(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Jabatan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={empPosition}
                    onChange={(e) => setEmpPosition(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
                <strong>Jadwal Shift:</strong> Karyawan baru tidak memiliki shift default. Penempatan shift harian diatur langsung di halaman <strong>Jadwal Shift</strong>.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Hari Libur Mingguan Karyawan Ini
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {HARI_WEEKDAYS.map((day) => {
                    const active = empOffDays.includes(day.index);
                    return (
                      <button
                        key={day.index}
                        type="button"
                        onClick={() => toggleDayIndex(day.index, empOffDays, setEmpOffDays)}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-amber-50 border-amber-400 text-amber-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editingEmployee && (
                <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 pt-1">
                  <input
                    type="checkbox"
                    checked={empActive}
                    onChange={(e) => setEmpActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>Status Karyawan Aktif</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEmpModalOpen(false)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={empSaving}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{empSaving ? 'Menyimpan...' : 'Simpan Karyawan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Hapus Karyawan */}
      {deleteConfirmEmp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/45">
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl w-full max-w-md p-5 sm:p-6 space-y-4 pb-safe">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Hapus Karyawan Permanen?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Anda akan menghapus <strong className="text-slate-900">{deleteConfirmEmp.name}</strong> ({deleteConfirmEmp.employeeCode}). Seluruh riwayat absensi dan data gaji terkait karyawan ini juga akan dibersihkan.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deletingEmp}
                onClick={() => setDeleteConfirmEmp(null)}
                className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingEmp}
                onClick={handleConfirmDeleteEmployee}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingEmp ? 'Menghapus...' : 'Ya, Hapus Karyawan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
