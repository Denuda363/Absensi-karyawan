import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarOff,
  Download,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ATTENDANCE_STATUS_META,
  AttendanceRecord,
  AttendanceStatus,
  calculateLatenessMinutes,
  calculateWorkDurationLabel,
  Employee,
  evaluateLateness,
  formatOffDaysSummary,
  getCurrentTimeStr,
  getEmployeeShiftTolerance,
  getTodayDateStr,
  isEmployeeOffDay,
  ShiftConfig,
} from '../types';
import {
  bulkMarkScheduledOffDays,
  createAttendanceRecord,
  deleteAttendanceRecord,
  updateAttendanceRecord,
} from '../services/attendanceService';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';

interface ManualAttendanceViewProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  shifts?: ShiftConfig[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  preselectedEmployeeId?: string | null;
  onClearPreselect?: () => void;
}

const STATUS_OPTIONS: AttendanceStatus[] = [
  'hadir',
  'terlambat',
  'izin',
  'sakit',
  'alpha',
  'libur',
];

export const ManualAttendanceView: React.FC<ManualAttendanceViewProps> = ({
  employees,
  attendanceRecords,
  shifts = [],
  loading,
  onRefresh,
  preselectedEmployeeId,
  onClearPreselect,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());
  const [showAllDates, setShowAllDates] = useState<boolean>(false);
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [empPickerQuery, setEmpPickerQuery] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(getTodayDateStr());
  const [formStatus, setFormStatus] = useState<AttendanceStatus>('hadir');
  const [formCheckIn, setFormCheckIn] = useState<string>('08:00');
  const [formCheckOut, setFormCheckOut] = useState<string>('17:00');
  const [formOvertimeHours, setFormOvertimeHours] = useState<string>('0');
  const [formNotes, setFormNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active),
    [employees]
  );

  // If navigated from Dashboard "Input Detail" for a specific employee
  useEffect(() => {
    if (preselectedEmployeeId) {
      const emp = employees.find((e) => e.id === preselectedEmployeeId);
      if (emp) {
        const today = getTodayDateStr();
        const off = isEmployeeOffDay(emp, today);
        setEditingRecord(null);
        setFormEmployeeId(emp.id);
        setEmpPickerQuery('');
        setFormDate(today);
        setFormStatus(off.isOff ? 'libur' : 'hadir');
        setFormCheckIn(emp.shiftStart);
        setFormCheckOut(emp.shiftEnd);
        setFormOvertimeHours('0');
        setFormNotes('');
        setFormError(null);
        setModalOpen(true);
      }
      onClearPreselect?.();
    }
  }, [preselectedEmployeeId, employees, onClearPreselect]);

  const filteredRecords = useMemo(() => {
    return attendanceRecords
      .filter((rec) => {
        if (!showAllDates && rec.date !== selectedDate) return false;
        if (employeeFilter !== 'all' && rec.employeeId !== employeeFilter) return false;
        if (statusFilter !== 'all' && rec.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const emp = employees.find((e) => e.id === rec.employeeId);
          const matchName = rec.employeeName.toLowerCase().includes(q);
          const matchNotes = rec.notes.toLowerCase().includes(q);
          const matchCode = emp ? emp.employeeCode.toLowerCase().includes(q) : false;
          const matchDept = emp ? emp.department.toLowerCase().includes(q) : false;
          if (!matchName && !matchNotes && !matchCode && !matchDept) return false;
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
    showAllDates,
    selectedDate,
    employeeFilter,
    statusFilter,
    searchQuery,
  ]);

  const modalFilteredEmployees = useMemo(() => {
    const q = empPickerQuery.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
    );
  }, [activeEmployees, empPickerQuery]);

  const selectedFormEmployee = useMemo(
    () => employees.find((e) => e.id === formEmployeeId) ?? null,
    [employees, formEmployeeId]
  );

  const selectedFormOffInfo = useMemo(() => {
    if (!selectedFormEmployee || !formDate) return { isOff: false, reason: null };
    return isEmployeeOffDay(selectedFormEmployee, formDate);
  }, [selectedFormEmployee, formDate]);

  const selectedFormTolerance = useMemo(() => {
    if (!selectedFormEmployee) return 0;
    return getEmployeeShiftTolerance(selectedFormEmployee, shifts);
  }, [selectedFormEmployee, shifts]);

  const liveLatenessInfo = useMemo(() => {
    if (!selectedFormEmployee || !formCheckIn) {
      return { rawLateMinutes: 0, isLate: false };
    }
    return evaluateLateness(
      formCheckIn,
      selectedFormEmployee.shiftStart,
      selectedFormTolerance
    );
  }, [selectedFormEmployee, formCheckIn, selectedFormTolerance]);

  const openCreateModal = () => {
    const defaultEmp = activeEmployees[0] || null;
    const dateTarget = selectedDate || getTodayDateStr();
    const offCheck = defaultEmp ? isEmployeeOffDay(defaultEmp, dateTarget) : { isOff: false };
    setEditingRecord(null);
    setFormEmployeeId(defaultEmp?.id ?? '');
    setEmpPickerQuery('');
    setFormDate(dateTarget);
    setFormStatus(offCheck.isOff ? 'libur' : 'hadir');
    setFormCheckIn(defaultEmp?.shiftStart || getCurrentTimeStr());
    setFormCheckOut(defaultEmp?.shiftEnd || '');
    setFormOvertimeHours('0');
    setFormNotes('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setFormEmployeeId(rec.employeeId);
    setFormDate(rec.date);
    setFormStatus(rec.status);
    setFormCheckIn(rec.checkIn || '');
    setFormCheckOut(rec.checkOut || '');
    setFormOvertimeHours(String(rec.overtimeHours || 0));
    setFormNotes(rec.notes || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleQuickCheckOutRow = async (rec: AttendanceRecord) => {
    setBusyId(rec.id);
    try {
      await updateAttendanceRecord(rec.id, {
        checkOut: getCurrentTimeStr(),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkMarkOff = async () => {
    setBulkBusy(true);
    try {
      await bulkMarkScheduledOffDays(selectedDate);
      await onRefresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const emp = employees.find((item) => item.id === formEmployeeId);
    if (!emp) {
      setFormError('Pilih karyawan terlebih dahulu.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setFormError('Format tanggal tidak valid.');
      return;
    }
    if ((formStatus === 'hadir' || formStatus === 'terlambat') && !formCheckIn) {
      setFormError('Jam masuk wajib diisi untuk status Hadir atau Terlambat.');
      return;
    }

    const parsedOt = Math.max(0, Math.min(16, Number(formOvertimeHours) || 0));

    setSaving(true);
    try {
      if (editingRecord) {
        await updateAttendanceRecord(editingRecord.id, {
          status: formStatus,
          checkIn: formCheckIn,
          checkOut: formCheckOut,
          overtimeHours: parsedOt,
          notes: formNotes,
        });
      } else {
        await createAttendanceRecord({
          employeeId: emp.id,
          date: formDate,
          status: formStatus,
          checkIn: formCheckIn,
          checkOut: formCheckOut,
          overtimeHours: parsedOt,
          notes: formNotes,
        });
      }
      await onRefresh();
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan absensi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    await deleteAttendanceRecord(recordId);
    await onRefresh();
  };

  const handleExportCsv = () => {
    const header = [
      'Tanggal',
      'Karyawan',
      'Status',
      'Jam Masuk',
      'Jam Keluar',
      'Durasi Kerja',
      'Lembur Manual (Jam)',
      'Catatan',
    ];
    const rows = filteredRecords.map((r) => [
      r.date,
      `"${r.employeeName.replace(/"/g, '""')}"`,
      ATTENDANCE_STATUS_META[r.status].label,
      r.checkIn || '-',
      r.checkOut || '-',
      calculateWorkDurationLabel(r.checkIn, r.checkOut),
      (r.overtimeHours || 0).toFixed(1),
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `absensi-manual-${showAllDates ? 'semua' : selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const needsTimeFields = formStatus === 'hadir' || formStatus === 'terlambat';

  return (
    <div className="space-y-6">
      {/* Toolbar Enterprise */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        {/* Tier 1: Summary & Primary Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Log Absensi Manual Karyawan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              {filteredRecords.length} catatan ditampilkan ·{' '}
              {showAllDates ? 'Semua tanggal' : `Tanggal ${selectedDate}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!showAllDates && (
              <button
                type="button"
                onClick={handleBulkMarkOff}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CalendarOff className="w-3.5 h-3.5" />
                <span>{bulkBusy ? 'Memproses...' : 'Isi Libur Terjadwal'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              disabled={activeEmployees.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Absensi Manual</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Search, Employee Filter & Date Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, divisi, catatan..."
                className="pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-56"
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

            <SearchableEmployeeSelect
              allowAll
              allLabel="Semua Karyawan"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={activeEmployees.map((emp) => ({
                id: emp.id,
                code: emp.employeeCode,
                name: emp.name,
                department: emp.department,
                subtitle: `${emp.department} · ${emp.shiftName}`,
              }))}
              className="w-60"
            />

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                disabled={showAllDates}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowAllDates((v) => !v)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showAllDates
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {showAllDates ? 'Semua Tanggal' : 'Per Tanggal'}
              </button>
            </div>
          </div>

          {(searchQuery !== '' ||
            employeeFilter !== 'all' ||
            statusFilter !== 'all' ||
            showAllDates) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setEmployeeFilter('all');
                setStatusFilter('all');
                setShowAllDates(false);
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Tier 3: Segmented Status Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto w-fit max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === 'all'
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
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ATTENDANCE_STATUS_META[st].label}
            </button>
          ))}
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900 mb-1">
              Belum ada catatan absensi manual pada filter ini
            </p>
            <p className="text-xs text-slate-500 mb-5">
              Catat jam masuk/pulang, izin, sakit, atau jam lembur manual oleh Admin HR.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              disabled={activeEmployees.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Entri Pertama</span>
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
                  <th className="py-3 px-4">Catatan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRecords.map((rec) => {
                  const meta = ATTENDANCE_STATUS_META[rec.status];
                  const emp = employees.find((e) => e.id === rec.employeeId);
                  const offOnDate = emp ? isEmployeeOffDay(emp, rec.date).isOff : false;
                  const lateMins =
                    emp && rec.checkIn && (rec.status === 'hadir' || rec.status === 'terlambat')
                      ? calculateLatenessMinutes(rec.checkIn, emp.shiftStart)
                      : 0;
                  const canQuickOut =
                    !rec.checkOut &&
                    Boolean(rec.checkIn) &&
                    (rec.status === 'hadir' || rec.status === 'terlambat');

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
                          <span className="ml-2 text-xs text-amber-700">
                            (Hari libur)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                        {rec.checkIn || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                        {rec.checkOut || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        {rec.status === 'hadir' || rec.status === 'terlambat' ? (
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
                        {rec.notes ? (
                          <div className="text-xs text-slate-700 truncate" title={rec.notes}>
                            {rec.notes}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {canQuickOut && (
                            <button
                              type="button"
                              disabled={busyId === rec.id}
                              onClick={() => handleQuickCheckOutRow(rec)}
                              title="Catat jam pulang sekarang"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-800 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors cursor-pointer mr-1"
                            >
                              <LogOut className="w-3 h-3" />
                              <span>Pulang</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            aria-label={`Ubah absensi ${rec.employeeName}`}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rec.id)}
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

      {/* Modal Form Absensi Manual (Admin) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {editingRecord ? 'Ubah Catatan Absensi' : 'Input Absensi Manual (Admin)'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Tutup modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Karyawan
                </label>

                {editingRecord ? (
                  <div className="px-3 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-medium">
                    {selectedFormEmployee
                      ? `${selectedFormEmployee.name} (${selectedFormEmployee.employeeCode}) — ${selectedFormEmployee.department}`
                      : editingRecord.employeeName}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={empPickerQuery}
                        onChange={(e) => setEmpPickerQuery(e.target.value)}
                        placeholder="Cari nama, kode (KRY-...), atau divisi karyawan..."
                        className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                      {empPickerQuery && (
                        <button
                          type="button"
                          onClick={() => setEmpPickerQuery('')}
                          aria-label="Hapus pencarian karyawan"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {modalFilteredEmployees.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-500 text-center">
                          Tidak ada karyawan yang cocok dengan &ldquo;{empPickerQuery}&rdquo;.
                        </div>
                      ) : (
                        modalFilteredEmployees.map((emp) => {
                          const isSelected = emp.id === formEmployeeId;
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setFormEmployeeId(emp.id);
                                setFormCheckIn(emp.shiftStart);
                                setFormCheckOut(emp.shiftEnd);
                                const off = isEmployeeOffDay(emp, formDate);
                                setFormStatus(off.isOff ? 'libur' : 'hadir');
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
                                  {emp.department} · Libur: {formatOffDaysSummary(emp.offDays)}
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
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    disabled={Boolean(editingRecord)}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Status Kehadiran
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AttendanceStatus)}
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

              {selectedFormOffInfo.isOff && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-800">
                  <CalendarOff className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Tanggal {formDate} merupakan jadwal libur{' '}
                    {selectedFormOffInfo.reason === 'khusus' ? 'khusus' : 'mingguan'} bagi{' '}
                    <strong>{selectedFormEmployee?.name}</strong>.
                  </span>
                </div>
              )}

              {needsTimeFields && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Jam Masuk
                      </label>
                      <input
                        type="time"
                        value={formCheckIn}
                        onChange={(e) => {
                          const nextCheckIn = e.target.value;
                          setFormCheckIn(nextCheckIn);
                          if (
                            selectedFormEmployee &&
                            (formStatus === 'hadir' || formStatus === 'terlambat')
                          ) {
                            const tol = getEmployeeShiftTolerance(
                              selectedFormEmployee,
                              shifts
                            );
                            const evalRes = evaluateLateness(
                              nextCheckIn,
                              selectedFormEmployee.shiftStart,
                              tol
                            );
                            setFormStatus(evalRes.isLate ? 'terlambat' : 'hadir');
                          }
                        }}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
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
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {selectedFormEmployee && formCheckIn && (
                    <div
                      className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                        liveLatenessInfo.isLate
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <span>
                        Shift{' '}
                        <span className="font-mono font-semibold">
                          {selectedFormEmployee.shiftStart}
                        </span>
                        {selectedFormTolerance > 0
                          ? ` (toleransi ${selectedFormTolerance} mnt)`
                          : ''}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {liveLatenessInfo.isLate
                          ? `Terlambat +${liveLatenessInfo.rawLateMinutes} menit`
                          : liveLatenessInfo.rawLateMinutes > 0
                          ? `Dalam toleransi (+${liveLatenessInfo.rawLateMinutes} mnt)`
                          : 'Tepat Waktu'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Catatan / Keterangan
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Contoh: Hadir shift pagi, lembur tutup buku 2 jam"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Absensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
