import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarOff,
  CheckCircle2,
  Clock,
  Layers,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  AppSettings,
  ATTENDANCE_STATUS_META,
  AttendanceRecord,
  calculateLatenessMinutes,
  Employee,
  formatEmployeeShiftForDisplay,
  formatIndonesianDate,
  formatOffDaysSummary,
  formatShortDateLabel,
  getCurrentYearMonth,
  getLastNDates,
  getTodayDateStr,
  isEmployeeOffDay,
  NavSection,
  resolveAttendanceShift,
  resolveEmployeeDefaultShiftForDate,
  ShiftConfig,
} from '../types';
import { RealtimeClock } from './RealtimeClock';

interface OverviewViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  shifts?: ShiftConfig[];
  settings?: AppSettings;
  loading: boolean;
  onNavigate: (nav: NavSection) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  employees,
  attendanceRecords,
  shifts = [],
  settings,
  loading,
  onNavigate,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [unloggedSearch, setUnloggedSearch] = useState<string>('');

  const today = getTodayDateStr();
  const currentMonth = getCurrentYearMonth();

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active),
    [employees]
  );

  const todayRecords = useMemo(
    () => attendanceRecords.filter((r) => r.date === today),
    [attendanceRecords, today]
  );

  const employeesOffToday = useMemo(
    () => activeEmployees.filter((emp) => isEmployeeOffDay(emp, today).isOff),
    [activeEmployees, today]
  );

  const employeesWorkingToday = useMemo(
    () => activeEmployees.filter((emp) => !isEmployeeOffDay(emp, today).isOff),
    [activeEmployees, today]
  );

  const unloggedWorkingToday = useMemo(() => {
    const loggedIds = new Set(todayRecords.map((r) => r.employeeId));
    return employeesWorkingToday.filter((emp) => !loggedIds.has(emp.id));
  }, [employeesWorkingToday, todayRecords]);

  const filteredUnloggedToday = useMemo(() => {
    const q = unloggedSearch.trim().toLowerCase();
    if (!q) return unloggedWorkingToday;
    return unloggedWorkingToday.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
    );
  }, [unloggedWorkingToday, unloggedSearch]);

  const unloggedOffToday = useMemo(() => {
    const loggedIds = new Set(todayRecords.map((r) => r.employeeId));
    return employeesOffToday.filter((emp) => !loggedIds.has(emp.id));
  }, [employeesOffToday, todayRecords]);

  const todayMetrics = useMemo(() => {
    const hadirCount = todayRecords.filter((r) => r.status === 'hadir').length;
    const terlambatCount = todayRecords.filter((r) => r.status === 'terlambat').length;
    const izinTerlambatCount = todayRecords.filter(
      (r) => r.status === 'izin_terlambat'
    ).length;
    const izinSakitAlpha = todayRecords.filter(
      (r) => r.status === 'izin' || r.status === 'sakit' || r.status === 'alpha'
    ).length;
    const presentTotal = hadirCount + terlambatCount + izinTerlambatCount;
    const target = employeesWorkingToday.length;
    const ratePct = target > 0 ? Math.round((presentTotal / target) * 100) : 0;

    const totalLateMinutesToday = todayRecords.reduce((acc, rec) => {
      if (rec.status !== 'terlambat' || !rec.checkIn) return acc;
      const emp = employees.find((e) => e.id === rec.employeeId);
      if (!emp) return acc;
      const shiftInfo = rec.shiftName
        ? resolveAttendanceShift(emp, shifts, rec.shiftName)
        : resolveEmployeeDefaultShiftForDate(emp, rec.date, shifts);
      return acc + calculateLatenessMinutes(rec.checkIn, shiftInfo.shiftStart);
    }, 0);

    return {
      hadirCount,
      terlambatCount,
      izinTerlambatCount,
      izinSakitAlpha,
      presentTotal,
      target,
      ratePct,
      totalLateMinutesToday,
    };
  }, [todayRecords, employeesWorkingToday.length, employees, shifts]);

  const monthlyOvertimeHours = useMemo(() => {
    return attendanceRecords
      .filter((r) => r.date.startsWith(currentMonth))
      .reduce((acc, r) => acc + (r.overtimeHours || 0), 0);
  }, [attendanceRecords, currentMonth]);

  // 7-day stacked trend data
  const sevenDayTrend = useMemo(() => {
    const dates = getLastNDates(7);
    return dates.map((dateStr) => {
      const dayRecs = attendanceRecords.filter((r) => r.date === dateStr);
      const hadir = dayRecs.filter(
        (r) => r.status === 'hadir' || r.status === 'izin_terlambat'
      ).length;
      const terlambat = dayRecs.filter((r) => r.status === 'terlambat').length;
      const absen = dayRecs.filter(
        (r) => r.status === 'izin' || r.status === 'sakit' || r.status === 'alpha'
      ).length;
      const libur = dayRecs.filter((r) => r.status === 'libur').length;
      const total = hadir + terlambat + absen + libur;
      return {
        date: dateStr,
        label: formatShortDateLabel(dateStr),
        hadir,
        terlambat,
        absen,
        libur,
        total,
      };
    });
  }, [attendanceRecords]);

  const maxTrendTotal = useMemo(
    () => Math.max(activeEmployees.length, ...sevenDayTrend.map((d) => d.total), 1),
    [sevenDayTrend, activeEmployees.length]
  );

  const activeTrendDay = useMemo(() => {
    if (hoveredDate) {
      return sevenDayTrend.find((d) => d.date === hoveredDate) ?? sevenDayTrend[sevenDayTrend.length - 1];
    }
    return sevenDayTrend[sevenDayTrend.length - 1];
  }, [hoveredDate, sevenDayTrend]);

  // Department analytics (this month)
  const departmentStats = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        staffCount: number;
        presentToday: number;
        targetToday: number;
        monthPresent: number;
        monthLogs: number;
        monthOvertime: number;
      }
    >();

    for (const emp of activeEmployees) {
      const entry = map.get(emp.department) ?? {
        department: emp.department,
        staffCount: 0,
        presentToday: 0,
        targetToday: 0,
        monthPresent: 0,
        monthLogs: 0,
        monthOvertime: 0,
      };
      entry.staffCount += 1;

      const isOff = isEmployeeOffDay(emp, today).isOff;
      if (!isOff) {
        entry.targetToday += 1;
      }

      const recToday = todayRecords.find((r) => r.employeeId === emp.id);
      if (
        recToday &&
        (recToday.status === 'hadir' ||
          recToday.status === 'terlambat' ||
          recToday.status === 'izin_terlambat')
      ) {
        entry.presentToday += 1;
      }

      const monthRecs = attendanceRecords.filter(
        (r) => r.employeeId === emp.id && r.date.startsWith(currentMonth)
      );
      for (const r of monthRecs) {
        if (r.status !== 'libur') {
          entry.monthLogs += 1;
          if (
            r.status === 'hadir' ||
            r.status === 'terlambat' ||
            r.status === 'izin_terlambat'
          ) {
            entry.monthPresent += 1;
          }
        }
        entry.monthOvertime += r.overtimeHours || 0;
      }

      map.set(emp.department, entry);
    }

    return Array.from(map.values())
      .map((d) => ({
        ...d,
        attendanceRate:
          d.monthLogs > 0 ? Math.round((d.monthPresent / d.monthLogs) * 100) : 0,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate);
  }, [activeEmployees, todayRecords, attendanceRecords, today, currentMonth]);

  const _unusedOffCount = employeesOffToday.length;
  void _unusedOffCount;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-5 h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Executive Command Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 sm:gap-5">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>{formatIndonesianDate(today)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeEmployees.length} Karyawan Aktif
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 mt-1">
              Operasional Kehadiran — {settings?.companyName || 'KaryaPresensi'}
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
            <RealtimeClock variant="chronometer" />

            <button
              type="button"
              onClick={() => onNavigate('matriks')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer w-full sm:w-auto min-h-[40px]"
            >
              <span>Buka Matriks Absensi</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column Executive KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500">
            <span className="truncate">Kehadiran Hari Ini</span>
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-1">
            <span className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {todayMetrics.ratePct}%
            </span>
            <span className="font-mono text-[11px] sm:text-xs text-slate-500 tabular-nums">
              {todayMetrics.presentTotal}/{todayMetrics.target} masuk
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-700 transition-all duration-300"
              style={{ width: `${Math.min(100, todayMetrics.ratePct)}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500">
            <span className="truncate">Ketepatan Shift</span>
            <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-lg sm:text-2xl font-bold text-slate-900 tabular-nums leading-tight flex flex-wrap items-baseline gap-x-1">
            <span>
              {todayMetrics.hadirCount}
              <span className="text-[11px] sm:text-sm font-normal text-slate-500"> tepat</span>
            </span>
            <span className="text-[11px] sm:text-sm font-normal text-slate-400">·</span>
            <span>
              <span className={todayMetrics.terlambatCount > 0 ? 'text-amber-700' : 'text-slate-900'}>
                {todayMetrics.terlambatCount}
              </span>
              <span className="text-[11px] sm:text-sm font-normal text-slate-500"> telat</span>
            </span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-500 font-mono tabular-nums truncate">
            {todayMetrics.totalLateMinutesToday > 0
              ? `Telat: +${todayMetrics.totalLateMinutesToday} mnt`
              : 'Belum ada telat'}
            {todayMetrics.izinTerlambatCount > 0 && (
              <span className="text-teal-700 font-semibold">
                {' '}
                · {todayMetrics.izinTerlambatCount} izin
              </span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500">
            <span className="truncate">Libur Hari Ini</span>
            <CalendarOff className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {employeesOffToday.length}
            <span className="text-xs sm:text-sm font-normal text-slate-500">
              {' '}
              / {activeEmployees.length} staf
            </span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-500 truncate">
            {employeesOffToday.length > 0
              ? employeesOffToday.map((e) => e.name.split(' ')[0]).join(', ')
              : 'Semua masuk'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500">
            <span className="truncate">Lembur Bulan Ini</span>
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {monthlyOvertimeHours.toFixed(1)}
            <span className="text-xs sm:text-sm font-normal text-slate-500"> jam</span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-500 truncate">
            Izin/Sakit/Alpha:{' '}
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {todayMetrics.izinSakitAlpha}
            </span>
          </div>
        </div>
      </section>

      {/* Enterprise Analytics Row: 7-Day Trend Chart + Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
        {/* Left: 7-Day Attendance Stacked Bar Chart */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between h-full">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Tren Kehadiran 7 Hari Terakhir
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribusi harian hadir tepat waktu, terlambat, izin/sakit/alpha, dan libur
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                  Hadir
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                  Terlambat
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
                  Izin/Alpha
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 inline-block" />
                  Libur
                </span>
              </div>
            </div>

            {/* Interactive SVG Stacked Bar Chart */}
            <div className="mt-5 sm:mt-6">
              <div className="grid grid-cols-7 gap-1 sm:gap-3 items-end h-40 sm:h-44 px-0.5 sm:px-1">
                {sevenDayTrend.map((day) => {
                  const chartHeight = 132;
                  const scale = (val: number) =>
                    Math.round((val / maxTrendTotal) * chartHeight);
                  const hHadir = scale(day.hadir);
                  const hTelat = scale(day.terlambat);
                  const hAbsen = scale(day.absen);
                  const hLibur = scale(day.libur);
                  const isFocused = activeTrendDay?.date === day.date;

                  return (
                    <button
                      key={day.date}
                      type="button"
                      onMouseEnter={() => setHoveredDate(day.date)}
                      onFocus={() => setHoveredDate(day.date)}
                      onClick={() => setHoveredDate(day.date)}
                      className={`flex flex-col items-center justify-end h-full group cursor-pointer rounded-lg px-0.5 sm:px-1 pt-2 transition-colors ${
                        isFocused ? 'bg-slate-50 ring-1 ring-slate-200/80' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="w-full max-w-[26px] sm:max-w-[34px] flex flex-col-reverse overflow-hidden rounded-t-md">
                        {day.hadir > 0 && (
                          <div
                            style={{ height: `${Math.max(4, hHadir)}px` }}
                            className="w-full bg-emerald-600"
                          />
                        )}
                        {day.terlambat > 0 && (
                          <div
                            style={{ height: `${Math.max(4, hTelat)}px` }}
                            className="w-full bg-amber-500"
                          />
                        )}
                        {day.absen > 0 && (
                          <div
                            style={{ height: `${Math.max(4, hAbsen)}px` }}
                            className="w-full bg-sky-600"
                          />
                        )}
                        {day.libur > 0 && (
                          <div
                            style={{ height: `${Math.max(4, hLibur)}px` }}
                            className="w-full bg-slate-300"
                          />
                        )}
                        {day.total === 0 && (
                          <div className="w-full h-1 bg-slate-200" />
                        )}
                      </div>
                      <div
                        className={`mt-2 font-mono text-[9px] sm:text-[11px] tracking-tighter sm:tracking-normal tabular-nums whitespace-nowrap ${
                          isFocused ? 'font-bold text-blue-700' : 'text-slate-500'
                        }`}
                      >
                        {day.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {activeTrendDay && (
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-medium text-slate-800">
                Rincian {formatIndonesianDate(activeTrendDay.date)}:
              </span>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span className="text-emerald-700 font-semibold">
                  Hadir {activeTrendDay.hadir}
                </span>
                <span className="text-amber-700 font-semibold">
                  Terlambat {activeTrendDay.terlambat}
                </span>
                <span className="text-sky-700 font-semibold">
                  Izin/Alpha {activeTrendDay.absen}
                </span>
                <span className="text-slate-600">
                  Libur {activeTrendDay.libur}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Right: Department Attendance Analytics */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Performa Per Divisi
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rasio kehadiran bulan berjalan &amp; posisi hari ini
                </p>
              </div>
              <Layers className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

          {departmentStats.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Belum ada data divisi.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {departmentStats.map((dept) => (
                <div key={dept.department} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
                    <div className="font-semibold text-slate-900 truncate min-w-0">
                      {dept.department}
                      <span className="font-normal text-slate-500 ml-1.5">
                        ({dept.staffCount} staf)
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-700 shrink-0">
                      <span className="font-semibold text-slate-900">
                        {dept.attendanceRate}%
                      </span>
                      <span className="text-slate-400 mx-1.5">|</span>
                      <span>
                        Hari ini {dept.presentToday}/{dept.targetToday}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        dept.attendanceRate >= 90
                          ? 'bg-emerald-600'
                          : dept.attendanceRate >= 75
                          ? 'bg-blue-600'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, dept.attendanceRate)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Laporan lengkap per karyawan</span>
            <button
              type="button"
              onClick={() => onNavigate('rekap')}
              className="inline-flex items-center gap-1 py-1.5 px-2 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer shrink-0"
            >
              <span>Buka Rekap Bulanan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Operational Action Row: Unlogged Mandatory Staff + Today's Off-Day & Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
        {/* Left: Actionable Unlogged Staff Today */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Wajib Masuk — Belum Diabsen Hari Ini
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar monitoring harian (input absensi hanya dilakukan di halaman Matriks Daftar Hadir)
              </p>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                {unloggedWorkingToday.length} Belum Tercatat
              </span>
              <button
                type="button"
                onClick={() => onNavigate('matriks')}
                className="inline-flex items-center gap-1 py-1 px-2 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
              >
                <span>Ke Matriks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {unloggedWorkingToday.length > 0 && (
            <div className="mt-3 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={unloggedSearch}
                onChange={(e) => setUnloggedSearch(e.target.value)}
                placeholder="Cari nama, kode, atau divisi..."
                className="w-full pl-9 pr-9 py-2.5 sm:py-2 text-sm sm:text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              {unloggedSearch && (
                <button
                  type="button"
                  onClick={() => setUnloggedSearch('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {unloggedWorkingToday.length === 0 ? (
            <div className="py-10 text-center">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Seluruh karyawan wajib masuk hari ini sudah diabsen</span>
              </div>
              <p className="text-xs text-slate-500">
                Untuk mengubah atau menginput absensi, buka menu Matriks Daftar Hadir.
              </p>
            </div>
          ) : filteredUnloggedToday.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Tidak ada karyawan belum absen yang cocok dengan &ldquo;{unloggedSearch}&rdquo;.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
              {filteredUnloggedToday.map((emp) => {
                const shiftDisplay = formatEmployeeShiftForDisplay(emp, today, shifts);
                return (
                  <div
                    key={emp.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {emp.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        <span className="font-mono">{emp.employeeCode}</span> · {emp.department}
                      </div>
                    </div>

                    <span
                      className={`self-start sm:self-auto px-2.5 py-1 text-xs font-medium border rounded-md whitespace-nowrap shrink-0 tabular-nums ${
                        shiftDisplay.hasSchedule
                          ? 'text-slate-700 bg-slate-100 border-slate-200 font-mono'
                          : 'text-slate-500 bg-slate-50 border-slate-200 italic'
                      }`}
                    >
                      {shiftDisplay.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Staff Off Today & Recent Today Records */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Karyawan Libur Hari Ini
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('jadwal-libur')}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
              >
                Atur Jadwal
              </button>
            </div>

            {employeesOffToday.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">
                Tidak ada karyawan yang libur hari ini.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {employeesOffToday.map((emp) => {
                  const reason = isEmployeeOffDay(emp, today).reason;
                  return (
                    <div
                      key={emp.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {emp.name}
                        </div>
                        <div className="text-slate-500 truncate">
                          {emp.department} · Libur rutin: {formatOffDaysSummary(emp.offDays)}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-md whitespace-nowrap shrink-0">
                        {reason === 'khusus' ? 'Libur Khusus' : 'Libur Mingguan'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Tercatat Hari Ini ({todayRecords.length})
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('matriks')}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
              >
                Semua Data
              </button>
            </div>

            {todayRecords.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">
                Belum ada absensi dicatat hari ini.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {todayRecords.slice(0, 5).map((rec) => {
                  const meta = ATTENDANCE_STATUS_META[rec.status];
                  return (
                    <div
                      key={rec.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {rec.employeeName}
                        </div>
                        <div className="font-mono text-slate-500 tabular-nums truncate">
                          {rec.checkIn
                            ? `Masuk ${rec.checkIn}${rec.checkOut ? ` · Pulang ${rec.checkOut}` : ''}`
                            : rec.status === 'izin_terlambat'
                            ? `${
                                rec.latePermitEstimatedArrival
                                  ? `Est. ${rec.latePermitEstimatedArrival}`
                                  : 'Izin telat'
                              }${rec.latePermitReason ? ` · ${rec.latePermitReason}` : ''}`
                            : rec.notes || 'Tanpa jam kerja'}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 font-medium border rounded-md whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.colorClass} ${meta.borderClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
