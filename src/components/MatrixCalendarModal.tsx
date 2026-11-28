import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Plus,
  X,
} from 'lucide-react';
import {
  AttendanceRecord,
  Employee,
  formatIndonesianDate,
  formatIndonesianMonth,
  getDayNameIndonesian,
  getDayOfWeekFromDateStr,
  getDaysInMonth,
  getTodayDateStr,
  HARI_WEEKDAYS,
  isEmployeeOffDay,
  statusToMatrixCode,
} from '../types';
import {
  getHolidayMapForYear,
  getHolidaysForYear,
  HolidayCategory,
  isCuratedHolidayYear,
} from '../utils/indonesianHolidays';

interface MatrixCalendarModalProps {
  open: boolean;
  onClose: () => void;
  initialMonth: string; // YYYY-MM
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  isAttendanceAdmin: boolean;
  onSelectMonthForMatrix: (yearMonth: string) => void;
  onOpenDateInLog: (dateStr: string) => void;
  onQuickInputForDate?: (dateStr: string) => void;
}

type CalendarViewTab = 'bulanan' | 'tahunan';
type HolidayFilterTab = 'semua' | HolidayCategory;

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || 1;
  const dt = new Date(y, m - 1 + deltaMonths, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function formatCompactHolidayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTH_NAMES_ID[m - 1]?.slice(0, 3) ?? ''} ${y}`;
}

export const MatrixCalendarModal: React.FC<MatrixCalendarModalProps> = ({
  open,
  onClose,
  initialMonth,
  employees,
  attendanceRecords,
  isAttendanceAdmin,
  onSelectMonthForMatrix,
  onOpenDateInLog,
  onQuickInputForDate,
}) => {
  const todayStr = getTodayDateStr();
  const [viewTab, setViewTab] = useState<CalendarViewTab>('bulanan');
  const [viewMonth, setViewMonth] = useState<string>(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    todayStr.startsWith(initialMonth) ? todayStr : `${initialMonth}-01`
  );
  const [holidayFilter, setHolidayFilter] = useState<HolidayFilterTab>('semua');

  useEffect(() => {
    if (!open) return;
    setViewMonth(initialMonth);
    setSelectedDate(
      todayStr.startsWith(initialMonth) ? todayStr : `${initialMonth}-01`
    );
  }, [open, initialMonth, todayStr]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const viewYear = useMemo(
    () => Number(viewMonth.slice(0, 4)) || new Date().getFullYear(),
    [viewMonth]
  );

  const yearHolidays = useMemo(() => getHolidaysForYear(viewYear), [viewYear]);
  const yearHolidayMap = useMemo(
    () => getHolidayMapForYear(viewYear),
    [viewYear]
  );
  const curatedYear = useMemo(() => isCuratedHolidayYear(viewYear), [viewYear]);

  const monthHolidays = useMemo(
    () => yearHolidays.filter((h) => h.date.startsWith(viewMonth)),
    [yearHolidays, viewMonth]
  );

  const monthDays = useMemo(() => getDaysInMonth(viewMonth), [viewMonth]);

  const leadingBlankCells = useMemo(() => {
    if (monthDays.length === 0) return 0;
    const dow = getDayOfWeekFromDateStr(monthDays[0]);
    return dow === 0 ? 6 : dow - 1;
  }, [monthDays]);

  const attendanceStatsByDate = useMemo(() => {
    const empIds = new Set(employees.map((e) => e.id));
    const map = new Map<
      string,
      {
        h: number;
        late: number;
        i: number;
        s: number;
        a: number;
        l: number;
        scheduledOffCount: number;
        records: AttendanceRecord[];
      }
    >();

    for (const dateStr of monthDays) {
      let scheduledOffCount = 0;
      for (const emp of employees) {
        if (isEmployeeOffDay(emp, dateStr).isOff) {
          scheduledOffCount++;
        }
      }
      map.set(dateStr, {
        h: 0,
        late: 0,
        i: 0,
        s: 0,
        a: 0,
        l: 0,
        scheduledOffCount,
        records: [],
      });
    }

    for (const rec of attendanceRecords) {
      if (!rec.date.startsWith(viewMonth) || !empIds.has(rec.employeeId)) continue;
      const entry = map.get(rec.date);
      if (!entry) continue;
      entry.records.push(rec);
      const code = statusToMatrixCode(rec.status);
      if (code === 'H') {
        entry.h++;
        if (rec.status === 'terlambat' || rec.status === 'izin_terlambat') {
          entry.late++;
        }
      } else if (code === 'I') {
        entry.i++;
      } else if (code === 'S') {
        entry.s++;
      } else if (code === 'A') {
        entry.a++;
      } else if (code === 'L') {
        entry.l++;
      }
    }

    return map;
  }, [employees, attendanceRecords, monthDays, viewMonth]);

  const selectedDateHoliday = useMemo(
    () => yearHolidayMap.get(selectedDate) ?? null,
    [yearHolidayMap, selectedDate]
  );

  const selectedDateDetail = useMemo(() => {
    const stats = attendanceStatsByDate.get(selectedDate);
    const empOffScheduled = employees.filter(
      (emp) => isEmployeeOffDay(emp, selectedDate).isOff
    );
    const records = stats?.records ?? [];
    const notPresentOrLate = records.filter((r) => r.status !== 'hadir');

    return {
      stats,
      empOffScheduled,
      records,
      notPresentOrLate,
    };
  }, [attendanceStatsByDate, employees, selectedDate]);

  const yearSummary = useMemo(() => {
    const nasionalCount = yearHolidays.filter(
      (h) => h.category === 'libur_nasional'
    ).length;
    const cutiCount = yearHolidays.filter(
      (h) => h.category === 'cuti_bersama'
    ).length;
    return {
      nasionalCount,
      cutiCount,
      total: yearHolidays.length,
    };
  }, [yearHolidays]);

  const filteredYearHolidays = useMemo(() => {
    if (holidayFilter === 'semua') return yearHolidays;
    return yearHolidays.filter((h) => h.category === holidayFilter);
  }, [yearHolidays, holidayFilter]);

  const annualMonthsGrid = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const mNum = idx + 1;
      const ym = `${viewYear}-${String(mNum).padStart(2, '0')}`;
      const days = getDaysInMonth(ym);
      const firstDow = days.length > 0 ? getDayOfWeekFromDateStr(days[0]) : 1;
      const blanks = firstDow === 0 ? 6 : firstDow - 1;
      return {
        monthNumber: mNum,
        monthName: MONTH_NAMES_ID[idx],
        yearMonth: ym,
        days,
        blanks,
      };
    });
  }, [viewYear]);

  if (!open) return null;

  const handleJumpToMonthAndDate = (yearMonth: string, dateStr?: string) => {
    setViewMonth(yearMonth);
    setSelectedDate(dateStr || `${yearMonth}-01`);
    setViewTab('bulanan');
  };

  const handleChangeYear = (deltaYear: number) => {
    const nextYear = Math.max(1990, Math.min(2099, viewYear + deltaYear));
    const currentMonthPart = viewMonth.slice(5, 7) || '01';
    const nextYm = `${nextYear}-${currentMonthPart}`;
    setViewMonth(nextYm);
    setSelectedDate(`${nextYm}-01`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-[2px] no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="matrix-calendar-modal-title"
    >
      <div className="animate-popup-3d bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl w-full max-w-6xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl pb-safe">
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-950 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 border border-blue-300/35 flex items-center justify-center text-white shrink-0">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  id="matrix-calendar-modal-title"
                  className="font-display text-base sm:text-lg font-bold text-white tracking-tight truncate"
                >
                  Kalender Lengkap &amp; Hari Libur Nasional
                </h3>
                <p className="text-xs text-slate-300 truncate">
                  {viewTab === 'bulanan'
                    ? `${formatIndonesianMonth(viewMonth)} · ${monthHolidays.length} hari libur nasional/cuti bersama`
                    : `Tahun ${viewYear} · ${yearSummary.nasionalCount} Libur Nasional · ${yearSummary.cutiCount} Cuti Bersama`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup kalender"
              className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2.5">
            <div className="grid grid-cols-2 sm:inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl w-full md:w-auto">
              <button
                type="button"
                onClick={() => setViewTab('bulanan')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewTab === 'bulanan'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Kalender Bulanan
              </button>
              <button
                type="button"
                onClick={() => setViewTab('tahunan')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewTab === 'tahunan'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Kalender 1 Tahun
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup kalender"
              className="hidden md:inline-flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/60">
          {viewTab === 'bulanan' ? (
            <>
              {/* Monthly Navigation Toolbar */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = shiftYearMonth(viewMonth, -1);
                      setViewMonth(prev);
                      setSelectedDate(
                        todayStr.startsWith(prev) ? todayStr : `${prev}-01`
                      );
                    }}
                    aria-label="Bulan sebelumnya"
                    className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Sebelumnya</span>
                  </button>

                  <input
                    type="month"
                    value={viewMonth}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      setViewMonth(val);
                      setSelectedDate(
                        todayStr.startsWith(val) ? todayStr : `${val}-01`
                      );
                    }}
                    aria-label="Pilih bulan dan tahun kalender"
                    className="min-h-[38px] px-3 py-1.5 text-xs font-mono font-semibold text-slate-900 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const next = shiftYearMonth(viewMonth, 1);
                      setViewMonth(next);
                      setSelectedDate(
                        todayStr.startsWith(next) ? todayStr : `${next}-01`
                      );
                    }}
                    aria-label="Bulan berikutnya"
                    className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span className="hidden sm:inline">Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const ym = todayStr.slice(0, 7);
                      setViewMonth(ym);
                      setSelectedDate(todayStr);
                    }}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Hari Ini
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" />
                      <span>Libur Nasional / Minggu</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                      <span>Cuti Bersama</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs border-2 border-blue-600 inline-block" />
                      <span>Hari Ini</span>
                    </span>
                  </div>

                  {viewMonth !== initialMonth && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMonthForMatrix(viewMonth);
                        onClose();
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      <span>Tampilkan di Matriks</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Calendar Grid + Selected Date Side Detail */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* 7-Column Calendar Grid */}
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <h4 className="font-display text-base font-bold text-slate-900">
                      {formatIndonesianMonth(viewMonth)}
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Ketuk tanggal untuk rincian absensi &amp; libur
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[11px] font-semibold pb-2">
                    {HARI_WEEKDAYS.map((d) => (
                      <div
                        key={d.index}
                        className={`py-1 ${
                          d.index === 0 ? 'text-red-600' : 'text-slate-600'
                        }`}
                      >
                        {d.short}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                    {Array.from({ length: leadingBlankCells }).map((_, idx) => (
                      <div
                        key={`blank_${idx}`}
                        className="min-h-[68px] sm:min-h-[88px] rounded-lg bg-slate-50/70 border border-slate-100/80"
                      />
                    ))}

                    {monthDays.map((dateStr) => {
                      const dayNum = Number(dateStr.slice(8, 10));
                      const dow = getDayOfWeekFromDateStr(dateStr);
                      const isSunday = dow === 0;
                      const holiday = yearHolidayMap.get(dateStr) ?? null;
                      const isNational = holiday?.category === 'libur_nasional';
                      const isCuti = holiday?.category === 'cuti_bersama';
                      const isToday = dateStr === todayStr;
                      const isSelected = dateStr === selectedDate;
                      const stats = attendanceStatsByDate.get(dateStr);

                      let cellSurface =
                        'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80';
                      if (isNational) {
                        cellSurface =
                          'bg-red-50/85 border-red-200 hover:bg-red-50';
                      } else if (isCuti) {
                        cellSurface =
                          'bg-amber-50/85 border-amber-200 hover:bg-amber-50';
                      } else if (isSunday) {
                        cellSurface =
                          'bg-rose-50/45 border-rose-200/80 hover:bg-rose-50/70';
                      }

                      if (isSelected) {
                        cellSurface = `${cellSurface} ring-2 ring-blue-600 border-blue-600`;
                      } else if (isToday) {
                        cellSurface = `${cellSurface} ring-2 ring-blue-400/70 border-blue-500`;
                      }

                      const hasAttendanceCounts =
                        stats &&
                        (stats.h > 0 ||
                          stats.i > 0 ||
                          stats.s > 0 ||
                          stats.a > 0 ||
                          stats.scheduledOffCount > 0);

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => setSelectedDate(dateStr)}
                          title={
                            holiday
                              ? `${formatIndonesianDate(dateStr)} — ${holiday.name}`
                              : formatIndonesianDate(dateStr)
                          }
                          className={`min-h-[68px] sm:min-h-[88px] p-1.5 sm:p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${cellSurface}`}
                        >
                          <div className="flex items-start justify-between gap-1 w-full">
                            <span
                              className={`font-mono text-xs sm:text-sm font-bold tabular-nums leading-none ${
                                isNational || isSunday
                                  ? 'text-red-700'
                                  : isCuti
                                  ? 'text-amber-800'
                                  : isSelected
                                  ? 'text-blue-800'
                                  : 'text-slate-900'
                              }`}
                            >
                              {dayNum}
                            </span>

                            {isToday ? (
                              <span className="text-[9px] font-bold text-blue-700 uppercase tracking-tight">
                                Kini
                              </span>
                            ) : holiday ? (
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${
                                  isNational ? 'bg-red-600' : 'bg-amber-500'
                                }`}
                              />
                            ) : null}
                          </div>

                          {holiday ? (
                            <div
                              className={`text-[9.5px] sm:text-[10px] font-semibold leading-tight line-clamp-2 mt-1 ${
                                isNational ? 'text-red-800' : 'text-amber-900'
                              }`}
                            >
                              {holiday.name}
                            </div>
                          ) : (
                            <div className="text-[9.5px] text-slate-400 leading-tight mt-1">
                              {isSunday ? 'Hari Minggu' : '\u00A0'}
                            </div>
                          )}

                          {hasAttendanceCounts && stats && (
                            <div className="mt-1 pt-1 border-t border-slate-200/70 flex items-center justify-between gap-1 font-mono text-[9.5px] tabular-nums text-slate-600 w-full">
                              <span className="text-emerald-700 font-semibold">
                                {stats.h > 0 ? `${stats.h}H` : ''}
                              </span>
                              <span className="text-slate-500 truncate">
                                {stats.i + stats.s + stats.a > 0
                                  ? `${stats.i + stats.s + stats.a}ISA`
                                  : stats.scheduledOffCount > 0
                                  ? `${stats.scheduledOffCount}L`
                                  : ''}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right-Hand Side Detail Panel */}
                <div className="lg:col-span-4 space-y-4">
                  {/* Selected Date Detail Card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
                    <div className="pb-3 border-b border-slate-100">
                      <div className="text-[11px] font-medium text-slate-500">
                        Detail Tanggal Terpilih
                      </div>
                      <h4 className="font-display text-base font-bold text-slate-900 mt-0.5">
                        {formatIndonesianDate(selectedDate)}
                      </h4>
                    </div>

                    {selectedDateHoliday ? (
                      <div
                        className={`p-3 rounded-lg border ${
                          selectedDateHoliday.category === 'libur_nasional'
                            ? 'bg-red-50 border-red-200 text-red-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <div className="text-[11px] font-bold uppercase tracking-wide">
                          {selectedDateHoliday.category === 'libur_nasional'
                            ? 'Hari Libur Nasional'
                            : 'Cuti Bersama Resmi'}
                        </div>
                        <div className="text-sm font-bold mt-0.5">
                          {selectedDateHoliday.name}
                        </div>
                      </div>
                    ) : getDayOfWeekFromDateStr(selectedDate) === 0 ? (
                      <div className="p-3 rounded-lg border border-rose-200 bg-rose-50/70 text-rose-900">
                        <div className="text-[11px] font-bold uppercase tracking-wide">
                          Akhir Pekan
                        </div>
                        <div className="text-xs font-semibold mt-0.5">
                          Hari Minggu (Operasional sesuai jadwal shift &amp; libur masing-masing karyawan)
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600">
                        Hari kerja normal (bukan hari libur nasional).
                      </div>
                    )}

                    {/* Attendance Summary for Selected Date */}
                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-semibold text-slate-800">
                        Ringkasan Presensi Matriks ({employees.length} Karyawan)
                      </div>
                      <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/80 text-center">
                          <div className="text-[10px] text-emerald-700 font-sans font-semibold">
                            Hadir
                          </div>
                          <div className="text-sm font-bold text-emerald-900">
                            {selectedDateDetail.stats?.h ?? 0}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/80 text-center">
                          <div className="text-[10px] text-amber-800 font-sans font-semibold">
                            I / S / A
                          </div>
                          <div className="text-sm font-bold text-amber-900">
                            {(selectedDateDetail.stats?.i ?? 0) +
                              (selectedDateDetail.stats?.s ?? 0) +
                              (selectedDateDetail.stats?.a ?? 0)}
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-600 font-sans font-semibold">
                            Libur
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            {selectedDateDetail.empOffScheduled.length}
                          </div>
                        </div>
                      </div>

                      {selectedDateDetail.empOffScheduled.length > 0 && (
                        <div className="text-[11px] text-slate-600 leading-relaxed">
                          <span className="font-semibold text-slate-700">
                            Jadwal libur karyawan:
                          </span>{' '}
                          {selectedDateDetail.empOffScheduled
                            .slice(0, 5)
                            .map((e) => e.name)
                            .join(', ')}
                          {selectedDateDetail.empOffScheduled.length > 5 &&
                            ` (+${selectedDateDetail.empOffScheduled.length - 5} lainnya)`}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenDateInLog(selectedDate);
                          onClose();
                        }}
                        className="w-full min-h-[38px] px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        <span>Lihat Log Tanggal Ini</span>
                      </button>

                      {isAttendanceAdmin && onQuickInputForDate && (
                        <button
                          type="button"
                          onClick={() => {
                            onQuickInputForDate(selectedDate);
                            onClose();
                          }}
                          className="w-full min-h-[38px] px-3 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Input Absensi Tanggal Ini</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Holidays in Viewed Month */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <h4 className="font-display text-sm font-bold text-slate-900">
                        Libur Nasional Bulan Ini
                      </h4>
                      <button
                        type="button"
                        onClick={() => setViewTab('tahunan')}
                        className="text-[11px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Lihat Setahun</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    {monthHolidays.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Tidak ada hari libur nasional atau cuti bersama pada{' '}
                        {formatIndonesianMonth(viewMonth)}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {monthHolidays.map((h) => {
                          const isNat = h.category === 'libur_nasional';
                          return (
                            <button
                              key={h.date}
                              type="button"
                              onClick={() => setSelectedDate(h.date)}
                              className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                                selectedDate === h.date
                                  ? 'border-blue-500 bg-blue-50/40'
                                  : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-mono font-bold text-slate-900 tabular-nums">
                                  {formatCompactHolidayDate(h.date)} ·{' '}
                                  {getDayNameIndonesian(h.date)}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    isNat ? 'text-red-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isNat ? 'Libur Nasional' : 'Cuti Bersama'}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-slate-800 mt-0.5">
                                {h.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Full 12-Month Annual Calendar + National Holiday Directory */
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleChangeYear(-1)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{viewYear - 1}</span>
                  </button>

                  <div className="px-4 py-1.5 text-sm font-display font-bold text-slate-900 bg-slate-100 border border-slate-200 rounded-lg font-mono tabular-nums">
                    Kalender {viewYear}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleChangeYear(1)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>{viewYear + 1}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const ym = todayStr.slice(0, 7);
                      setViewMonth(ym);
                      setSelectedDate(todayStr);
                    }}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                  >
                    Tahun Berjalan
                  </button>
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-red-700">
                    {yearSummary.nasionalCount} Libur Nasional
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-semibold text-amber-700">
                    {yearSummary.cutiCount} Cuti Bersama
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    {curatedYear
                      ? 'Mengacu Kalender Resmi SKB Nasional'
                      : 'Hari Libur Nasional Tetap & Hari Raya Kristiani'}
                  </span>
                </div>
              </div>

              {/* 12 Mini-Months Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {annualMonthsGrid.map((m) => {
                  const isMatrixMonth = m.yearMonth === initialMonth;
                  const holidaysInThisMonth = yearHolidays.filter((h) =>
                    h.date.startsWith(m.yearMonth)
                  );
                  return (
                    <div
                      key={m.yearMonth}
                      className={`bg-white border rounded-xl p-3 flex flex-col justify-between ${
                        isMatrixMonth
                          ? 'border-blue-500 ring-1 ring-blue-500/30'
                          : 'border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => handleJumpToMonthAndDate(m.yearMonth)}
                            className="font-display text-xs font-bold text-slate-900 hover:text-blue-700 transition-colors cursor-pointer"
                          >
                            {m.monthName} {viewYear}
                          </button>
                          {holidaysInThisMonth.length > 0 && (
                            <span className="text-[10px] font-mono font-semibold text-red-700 tabular-nums">
                              {holidaysInThisMonth.length} libur
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-7 gap-0.5 text-center text-[9.5px] font-semibold mb-1">
                          {HARI_WEEKDAYS.map((d) => (
                            <div
                              key={d.index}
                              className={
                                d.index === 0 ? 'text-red-600' : 'text-slate-500'
                              }
                            >
                              {d.short.slice(0, 1)}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[10.5px] tabular-nums">
                          {Array.from({ length: m.blanks }).map((_, i) => (
                            <div key={`b_${i}`} className="h-6" />
                          ))}
                          {m.days.map((dateStr) => {
                            const dayNum = Number(dateStr.slice(8, 10));
                            const dow = getDayOfWeekFromDateStr(dateStr);
                            const holiday = yearHolidayMap.get(dateStr);
                            const isToday = dateStr === todayStr;

                            let cls =
                              'text-slate-700 hover:bg-slate-100';
                            if (holiday?.category === 'libur_nasional') {
                              cls =
                                'bg-red-600 text-white font-bold hover:bg-red-700';
                            } else if (holiday?.category === 'cuti_bersama') {
                              cls =
                                'bg-amber-400 text-slate-950 font-bold hover:bg-amber-500';
                            } else if (dow === 0) {
                              cls =
                                'text-red-600 font-semibold hover:bg-red-50';
                            }

                            if (isToday) {
                              cls = `${cls} ring-2 ring-blue-600 ring-offset-1`;
                            }

                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() =>
                                  handleJumpToMonthAndDate(m.yearMonth, dateStr)
                                }
                                title={
                                  holiday
                                    ? `${formatIndonesianDate(dateStr)} — ${holiday.name}`
                                    : formatIndonesianDate(dateStr)
                                }
                                className={`h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${cls}`}
                              >
                                {dayNum}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {holidaysInThisMonth.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                          {holidaysInThisMonth.slice(0, 3).map((h) => (
                            <div
                              key={h.date}
                              className="text-[10px] leading-tight truncate flex items-center gap-1.5"
                              title={h.name}
                            >
                              <span
                                className={`font-mono font-bold tabular-nums shrink-0 ${
                                  h.category === 'libur_nasional'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {h.date.slice(8, 10)}
                              </span>
                              <span className="text-slate-700 truncate">
                                {h.name}
                              </span>
                            </div>
                          ))}
                          {holidaysInThisMonth.length > 3 && (
                            <button
                              type="button"
                              onClick={() => handleJumpToMonthAndDate(m.yearMonth)}
                              className="text-[10px] font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              +{holidaysInThisMonth.length - 3} libur lainnya
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Complete Directory of National Holidays & Cuti Bersama */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div>
                    <h4 className="font-display text-sm font-bold text-slate-900">
                      Daftar Hari Libur Nasional &amp; Cuti Bersama {viewYear}
                    </h4>
                    <p className="text-xs text-slate-500">
                      Klik salah satu baris untuk membuka tanggal tersebut pada kalender bulanan
                    </p>
                  </div>

                  <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80 self-start sm:self-auto">
                    {(
                      [
                        { id: 'semua', label: 'Semua' },
                        { id: 'libur_nasional', label: 'Libur Nasional' },
                        { id: 'cuti_bersama', label: 'Cuti Bersama' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setHolidayFilter(tab.id)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          holidayFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredYearHolidays.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Tidak ada daftar hari libur pada kategori filter ini untuk tahun{' '}
                    {viewYear}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-4 whitespace-nowrap">Tanggal</th>
                          <th className="py-2.5 px-4 whitespace-nowrap">Hari</th>
                          <th className="py-2.5 px-4">Keterangan Hari Libur</th>
                          <th className="py-2.5 px-4 whitespace-nowrap">Kategori</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredYearHolidays.map((h) => {
                          const isNat = h.category === 'libur_nasional';
                          return (
                            <tr
                              key={h.date}
                              onClick={() =>
                                handleJumpToMonthAndDate(h.date.slice(0, 7), h.date)
                              }
                              className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                {formatCompactHolidayDate(h.date)}
                              </td>
                              <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                                {getDayNameIndonesian(h.date)}
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-slate-900">
                                {h.name}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    isNat ? 'text-red-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isNat ? 'Libur Nasional' : 'Cuti Bersama'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
