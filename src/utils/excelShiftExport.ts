import ExcelJS from 'exceljs';
import {
  Employee,
  formatOffDaysSummary,
  getShiftMembersForWeekday,
  HARI_WEEKDAYS,
  ShiftConfig,
} from '../types';
import { buildDailyScheduleBlocks } from './shiftScheduleLayout';

export async function exportShiftScheduleToExcel(params: {
  companyName: string;
  shifts: ShiftConfig[];
  employees: Employee[];
  days?: ReadonlyArray<{ index: number; label: string }>;
}): Promise<void> {
  const { companyName, shifts, employees, days } = params;
  const targetDays = days && days.length > 0 ? days : HARI_WEEKDAYS;
  const isSingleDayExport = targetDays.length === 1;
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
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // =========================================================================
  // Sheet 1: Jadwal Harian (Format blok harian per shift & jabatan)
  // =========================================================================
  const dailySheetName = isSingleDayExport
    ? `Jadwal ${targetDays[0].label}`
    : 'Jadwal Harian';
  const dailySheet = workbook.addWorksheet(dailySheetName, {
    views: [{ showGridLines: true }],
  });

  const colCount = Math.max(1, shifts.length);
  const colWidth = colCount <= 3 ? 30 : colCount === 4 ? 24 : 20;
  dailySheet.columns = Array.from({ length: colCount }, (_, idx) => ({
    key: `shift_${idx}`,
    width: colWidth,
  }));
  dailySheet.pageSetup = {
    paperSize: 9,
    orientation: colCount > 4 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };

  const blackMedium: ExcelJS.Border = { style: 'medium', color: { argb: 'FF000000' } };
  const blackThin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };

  const dayBannerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF00B0F0' },
  };
  const leaderBannerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC000' },
  };
  const roleBannerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
  };
  const offBannerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF0000' },
  };
  const whiteFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' },
  };

  const dailyBlocks = buildDailyScheduleBlocks({
    shifts,
    employees: activeEmployees,
    days: targetDays,
  });

  let dRowIdx = 1;
  for (const block of dailyBlocks) {
    // 1. Day Header Row (e.g., SENIN)
    const dayRowNum = dRowIdx++;
    if (colCount > 1) {
      dailySheet.mergeCells(dayRowNum, 1, dayRowNum, colCount);
    }
    const dayRow = dailySheet.getRow(dayRowNum);
    dayRow.height = 22;
    dayRow.getCell(1).value = block.dayLabel;
    for (let c = 1; c <= colCount; c++) {
      const cell = dayRow.getCell(c);
      cell.fill = dayBannerFill;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: blackMedium,
        bottom: blackMedium,
        left: c === 1 ? blackMedium : undefined,
        right: c === colCount ? blackMedium : undefined,
      };
    }

    // 2. Shift Column Header Row (e.g., PAGI (07:00-17:00) | SELA (10:00-20:00) | ...)
    const shiftHeaderRowNum = dRowIdx++;
    const shiftHeaderRow = dailySheet.getRow(shiftHeaderRowNum);
    shiftHeaderRow.height = 22;
    for (let c = 1; c <= colCount; c++) {
      const cell = shiftHeaderRow.getCell(c);
      cell.value = block.shiftHeaders[c - 1] ?? '-';
      cell.fill = whiteFill;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: blackMedium,
        bottom: blackMedium,
        left: blackMedium,
        right: blackMedium,
      };
    }

    // 3. Role Groups (LEADER orange, others yellow) + member rows
    if (block.roleGroups.length === 0) {
      const emptyRowNum = dRowIdx++;
      const emptyRow = dailySheet.getRow(emptyRowNum);
      emptyRow.height = 20;
      for (let c = 1; c <= colCount; c++) {
        const cell = emptyRow.getCell(c);
        cell.value = '';
        cell.fill = whiteFill;
        cell.border = {
          top: blackThin,
          bottom: blackThin,
          left: blackMedium,
          right: blackMedium,
        };
      }
    } else {
      for (const group of block.roleGroups) {
        const groupRowNum = dRowIdx++;
        if (colCount > 1) {
          dailySheet.mergeCells(groupRowNum, 1, groupRowNum, colCount);
        }
        const groupRow = dailySheet.getRow(groupRowNum);
        groupRow.height = 20;
        groupRow.getCell(1).value = group.label;
        for (let c = 1; c <= colCount; c++) {
          const cell = groupRow.getCell(c);
          cell.fill = group.isLeader ? leaderBannerFill : roleBannerFill;
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = {
            top: blackMedium,
            bottom: blackThin,
            left: c === 1 ? blackMedium : undefined,
            right: c === colCount ? blackMedium : undefined,
          };
        }

        for (const rRow of group.rows) {
          const memRowNum = dRowIdx++;
          const memRow = dailySheet.getRow(memRowNum);
          memRow.height = 19;
          for (let c = 1; c <= colCount; c++) {
            const cell = memRow.getCell(c);
            cell.value = rRow.cells[c - 1] ?? '';
            cell.fill = whiteFill;
            cell.font = { name: 'Calibri', size: 11, bold: false, color: { argb: 'FF000000' } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.border = {
              top: blackThin,
              bottom: blackThin,
              left: blackMedium,
              right: blackMedium,
            };
          }
        }
      }
    }

    // 4. Red OFF Footer Row
    const offRowNum = dRowIdx++;
    if (colCount > 1) {
      dailySheet.mergeCells(offRowNum, 1, offRowNum, colCount);
    }
    const offText = `OFF : ${block.offNames.length > 0 ? block.offNames.join(', ') : '-'}`;
    const offRow = dailySheet.getRow(offRowNum);
    const estLines = Math.max(1, Math.ceil(offText.length / Math.max(40, colCount * 25)));
    offRow.height = Math.max(22, estLines * 16 + 6);
    offRow.getCell(1).value = offText;
    for (let c = 1; c <= colCount; c++) {
      const cell = offRow.getCell(c);
      cell.fill = offBannerFill;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = {
        top: blackMedium,
        bottom: blackMedium,
        left: c === 1 ? blackMedium : undefined,
        right: c === colCount ? blackMedium : undefined,
      };
    }

    // Blank separator row before the next day
    dRowIdx += 1;
  }

  if (!isSingleDayExport) {
  // =========================================================================
  // Sheet 2: Master Roster per Shift
  // =========================================================================
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

  // =========================================================================
  // Sheet 3: Matriks Mingguan per Shift (Senin - Minggu)
  // =========================================================================
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
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const fileDaySlug = isSingleDayExport
    ? targetDays[0].label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : 'karyawan';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jadwal-shift-${fileDaySlug}-${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
