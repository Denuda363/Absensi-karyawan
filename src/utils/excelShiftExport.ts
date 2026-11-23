import ExcelJS from 'exceljs';
import {
  Employee,
  formatOffDaysSummary,
  getShiftMembersForWeekday,
  HARI_WEEKDAYS,
  ShiftConfig,
} from '../types';

export async function exportShiftScheduleToExcel(params: {
  companyName: string;
  shifts: ShiftConfig[];
  employees: Employee[];
}): Promise<void> {
  const { companyName, shifts, employees } = params;
  const activeEmployees = employees
    .filter((e) => e.active)
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName || 'KaryaPresensi';
  workbook.created = new Date();

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };
  const subHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  const dayHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' },
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // Sheet 1: Jadwal Harian (Senin -> Shift Pagi, Shift Sela, dll.)
  const dailySheet = workbook.addWorksheet('Jadwal Harian');
  dailySheet.columns = [
    { key: 'hari', width: 16 },
    { key: 'shift', width: 20 },
    { key: 'hours', width: 16 },
    { key: 'count', width: 14 },
    { key: 'members', width: 64 },
  ];

  dailySheet.mergeCells('A1:E1');
  const dTitle = dailySheet.getCell('A1');
  dTitle.value = `JADWAL SHIFT HARIAN (SENIN – MINGGU) — ${(companyName || 'KARYAPRESENSI').toUpperCase()}`;
  dTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  dTitle.alignment = { vertical: 'middle', horizontal: 'left' };
  dailySheet.getRow(1).height = 24;

  const dHeader = dailySheet.getRow(3);
  ['Hari', 'Nama Shift', 'Jam Kerja', 'Jumlah', 'Daftar Karyawan Bertugas'].forEach((h, idx) => {
    const cell = dHeader.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: idx === 3 ? 'center' : 'left' };
    cell.border = thinBorder;
  });
  dHeader.height = 22;

  let dRowIdx = 4;
  for (const day of HARI_WEEKDAYS) {
    let firstForDay = true;
    for (const shift of shifts) {
      const { members } = getShiftMembersForWeekday(shift, day.index, activeEmployees);
      const row = dailySheet.getRow(dRowIdx++);
      row.getCell(1).value = firstForDay ? day.label.toUpperCase() : '';
      row.getCell(2).value = shift.name;
      row.getCell(3).value = `${shift.startTime} - ${shift.endTime}`;
      row.getCell(4).value = members.length;
      row.getCell(5).value =
        members.length > 0
          ? members.map((m, i) => `${i + 1}. ${m.name} (${m.department})`).join('\n')
          : '(Belum ada anggota)';

      for (let col = 1; col <= 5; col++) {
        const c = row.getCell(col);
        c.border = thinBorder;
        c.font = {
          name: 'Arial',
          size: 10,
          bold: col === 1 || col === 2,
          italic: col === 5 && members.length === 0,
          color: {
            argb: col === 5 && members.length === 0 ? 'FF94A3B8' : 'FF0F172A',
          },
        };
        if (firstForDay && col === 1) {
          c.fill = dayHeaderFill;
        }
        c.alignment = {
          vertical: 'top',
          horizontal: col === 4 ? 'center' : 'left',
          wrapText: true,
        };
      }
      row.height = Math.max(22, members.length * 14 + 8);
      firstForDay = false;
    }
  }

  // Sheet 2: Master Roster per Shift
  const rosterSheet = workbook.addWorksheet('Master per Shift');
  rosterSheet.columns = [
    { key: 'no', width: 6 },
    { key: 'shift', width: 18 },
    { key: 'hours', width: 15 },
    { key: 'code', width: 14 },
    { key: 'name', width: 28 },
    { key: 'dept', width: 22 },
    { key: 'pos', width: 22 },
    { key: 'offDays', width: 22 },
  ];

  rosterSheet.mergeCells('A1:H1');
  const titleCell = rosterSheet.getCell('A1');
  titleCell.value = `MASTER SHIFT KARYAWAN — ${(companyName || 'KARYAPRESENSI').toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  rosterSheet.getRow(1).height = 24;

  rosterSheet.mergeCells('A2:H2');
  const subCell = rosterSheet.getCell('A2');
  subCell.value = `Total Karyawan Aktif: ${activeEmployees.length} | Total Jenis Shift: ${shifts.length}`;
  subCell.font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };
  rosterSheet.getRow(2).height = 18;

  const headerRow = rosterSheet.getRow(4);
  const headers = [
    'No',
    'Nama Shift',
    'Jam Kerja',
    'Kode',
    'Nama Karyawan',
    'Divisi',
    'Jabatan',
    'Hari Libur Mingguan',
  ];
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: idx === 0 ? 'center' : 'left' };
    cell.border = thinBorder;
  });
  headerRow.height = 22;

  let rowIdx = 5;
  let seq = 1;
  const knownShiftNames = new Set(shifts.map((s) => s.name.toLowerCase()));

  for (const shift of shifts) {
    const members = activeEmployees.filter(
      (e) => e.shiftName.toLowerCase() === shift.name.toLowerCase()
    );
    if (members.length === 0) {
      const r = rosterSheet.getRow(rowIdx++);
      r.values = [
        '-',
        shift.name,
        `${shift.startTime} - ${shift.endTime}`,
        '-',
        '(Belum ada anggota)',
        '-',
        '-',
        '-',
      ];
      r.eachCell((c) => {
        c.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        c.border = thinBorder;
      });
      continue;
    }

    for (const emp of members) {
      const r = rosterSheet.getRow(rowIdx++);
      r.values = [
        seq++,
        shift.name,
        `${emp.shiftStart} - ${emp.shiftEnd}`,
        emp.employeeCode,
        emp.name,
        emp.department,
        emp.position,
        formatOffDaysSummary(emp.offDays),
      ];
      r.eachCell((c, colNum) => {
        c.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
        c.border = thinBorder;
        c.alignment = {
          vertical: 'middle',
          horizontal: colNum === 1 ? 'center' : 'left',
        };
      });
    }
  }

  const customMembers = activeEmployees.filter(
    (e) => !knownShiftNames.has(e.shiftName.toLowerCase())
  );
  for (const emp of customMembers) {
    const r = rosterSheet.getRow(rowIdx++);
    r.values = [
      seq++,
      emp.shiftName || 'Kustom',
      `${emp.shiftStart} - ${emp.shiftEnd}`,
      emp.employeeCode,
      emp.name,
      emp.department,
      emp.position,
      formatOffDaysSummary(emp.offDays),
    ];
    r.eachCell((c, colNum) => {
      c.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
      c.border = thinBorder;
      c.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'center' : 'left' };
    });
  }

  // Sheet 3: Matriks Mingguan per Shift (Senin - Minggu)
  const weeklySheet = workbook.addWorksheet('Matriks Mingguan');
  weeklySheet.columns = [
    { key: 'shift', width: 22 },
    ...HARI_WEEKDAYS.map((d) => ({ key: `day_${d.index}`, width: 26 })),
  ];

  weeklySheet.mergeCells('A1:H1');
  const wTitle = weeklySheet.getCell('A1');
  wTitle.value = `MATRIKS JADWAL SHIFT MINGGUAN (SENIN – MINGGU) — ${(companyName || 'KARYAPRESENSI').toUpperCase()}`;
  wTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  weeklySheet.getRow(1).height = 24;

  const wHeader = weeklySheet.getRow(3);
  ['Shift / Jam Kerja', ...HARI_WEEKDAYS.map((d) => d.label)].forEach((label, idx) => {
    const cell = wHeader.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder;
  });
  wHeader.height = 22;

  let wRowIdx = 4;
  for (const shift of shifts) {
    const row = weeklySheet.getRow(wRowIdx++);
    row.getCell(1).value = `${shift.name}\n(${shift.startTime} - ${shift.endTime})`;
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
    row.getCell(1).fill = subHeaderFill;
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    row.getCell(1).border = thinBorder;

    let maxLen = 1;
    HARI_WEEKDAYS.forEach((day, dIdx) => {
      const { members } = getShiftMembersForWeekday(shift, day.index, activeEmployees);
      if (members.length > maxLen) maxLen = members.length;
      const workingNames = members.map((e, i) => `${i + 1}. ${e.name}`);
      const cell = row.getCell(dIdx + 2);
      cell.value = workingNames.length > 0 ? workingNames.join('\n') : '(Tidak ada)';
      cell.font = {
        name: 'Arial',
        size: 9,
        color: { argb: workingNames.length > 0 ? 'FF0F172A' : 'FF94A3B8' },
      };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = thinBorder;
    });
    row.height = Math.max(36, maxLen * 14 + 10);
  }

  // Off row
  const offRow = weeklySheet.getRow(wRowIdx);
  offRow.getCell(1).value = 'Libur Mingguan';
  offRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF92400E' } };
  offRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF3C7' },
  };
  offRow.getCell(1).alignment = { vertical: 'top', horizontal: 'left' };
  offRow.getCell(1).border = thinBorder;

  let maxOffLen = 1;
  HARI_WEEKDAYS.forEach((day, dIdx) => {
    const offList = activeEmployees
      .filter((e) => e.offDays.includes(day.index))
      .map((e, i) => `${i + 1}. ${e.name} (${e.shiftName})`);
    if (offList.length > maxOffLen) maxOffLen = offList.length;
    const cell = offRow.getCell(dIdx + 2);
    cell.value = offList.length > 0 ? offList.join('\n') : '(Tidak ada libur)';
    cell.font = { name: 'Arial', size: 9, color: { argb: 'FF78350F' } };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    cell.border = thinBorder;
  });
  offRow.height = Math.max(32, maxOffLen * 14 + 10);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jadwal-shift-karyawan-${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
