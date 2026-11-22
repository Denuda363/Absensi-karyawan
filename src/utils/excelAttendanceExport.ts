import ExcelJS from 'exceljs';
import {
  AttendanceRecord,
  calculateDurationHours,
  calculateLatenessMinutes,
  CompanyProfile,
  Employee,
  formatOffDaysSummary,
  getDayNameIndonesian,
  getDaysInMonth,
  getEmployeeShiftTolerance,
  getMonthEffectiveWorkDays,
  getMonthMetadata,
  isEmployeeOffDay,
  LateSettlement,
  ShiftConfig,
  statusToMatrixCode,
} from '../types';

function colLetter(colNumber: number): string {
  let n = colNumber;
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF64748B' } },
  left: { style: 'thin', color: { argb: 'FF64748B' } },
  bottom: { style: 'thin', color: { argb: 'FF64748B' } },
  right: { style: 'thin', color: { argb: 'FF64748B' } },
};

const LIGHT_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

function applyBorderToRange(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  border: Partial<ExcelJS.Borders>
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r, c).border = border;
    }
  }
}

function estimateLines(text: string, colWidth: number): number {
  if (!text) return 1;
  const usable = Math.max(6, Math.floor(colWidth - 2));
  const paragraphs = String(text).split('\n');
  let lines = 0;
  for (const p of paragraphs) {
    lines += Math.max(1, Math.ceil(p.length / usable));
  }
  return Math.max(1, lines);
}

function calcDynamicRowHeight(
  cells: { text: string; width: number }[],
  minHeight = 22,
  lineHeight = 14.5,
  verticalPadding = 8
): number {
  let maxLines = 1;
  for (const item of cells) {
    const l = estimateLines(item.text, item.width);
    if (l > maxLines) maxLines = l;
  }
  return Math.max(minHeight, Math.ceil(maxLines * lineHeight + verticalPadding));
}

function sumColWidths(widths: number[], startCol1Based: number, endCol1Based: number): number {
  let total = 0;
  for (let c = startCol1Based; c <= endCol1Based; c++) {
    total += widths[c - 1] ?? 10;
  }
  return total;
}

export async function exportAttendanceMatrixToExcel(params: {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  lateSettlements?: LateSettlement[];
  shifts?: ShiftConfig[];
  yearMonth: string;
  departmentFilter?: string;
  companyName?: string;
  companySubtitle?: string;
  companyProfile?: CompanyProfile;
}): Promise<void> {
  const {
    employees,
    attendanceRecords,
    lateSettlements = [],
    shifts = [],
    yearMonth,
    departmentFilter,
    companyName = 'KARYAPRESENSI',
    companySubtitle = 'HRIS PERUSAHAAN',
    companyProfile,
  } = params;

  const meta = getMonthMetadata(yearMonth);
  const days = getDaysInMonth(yearMonth);
  const daysCount = days.length;

  const sortedEmployees = [...employees]
    .filter((e) => e.active)
    .filter((e) =>
      departmentFilter && departmentFilter !== 'all'
        ? e.department === departmentFilter
        : true
    )
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  const recMap = new Map<string, AttendanceRecord>();
  for (const r of attendanceRecords) {
    if (r.date.startsWith(yearMonth)) {
      recMap.set(`${r.employeeId}__${r.date}`, r);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();

  const deptSuffix =
    departmentFilter && departmentFilter !== 'all'
      ? ` — DIVISI ${departmentFilter.toUpperCase()}`
      : '';

  // =========================================================================
  // SHEET 1: MATRIKS DAFTAR HADIR BULANAN
  // =========================================================================
  const sheetName = `${meta.monthName} ${meta.year}`.slice(0, 31);
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    },
  });

  const DAY_START_COL = 9; // Column I
  const DAY_END_COL = DAY_START_COL + daysCount - 1;
  const SPACER_RIGHT_COL = DAY_END_COL + 1;
  const SUM_H_COL = SPACER_RIGHT_COL + 1;
  const SUM_I_COL = SPACER_RIGHT_COL + 2;
  const SUM_S_COL = SPACER_RIGHT_COL + 3;
  const SUM_A_COL = SPACER_RIGHT_COL + 4;

  const firstDayColLetter = colLetter(DAY_START_COL);
  const lastDayColLetter = colLetter(DAY_END_COL);
  const sumHColLetter = colLetter(SUM_H_COL);
  const sumIColLetter = colLetter(SUM_I_COL);
  const sumSColLetter = colLetter(SUM_S_COL);
  const sumAColLetter = colLetter(SUM_A_COL);

  // Auto-fit widths on Sheet 1 employee columns so names, IDs & off-days never clip
  const maxCodeLen = Math.max(8, ...sortedEmployees.map((e) => e.employeeCode.length));
  const maxNameLen = Math.max(18, ...sortedEmployees.map((e) => e.name.length));
  const maxOffLen = Math.max(
    12,
    ...sortedEmployees.map((e) => formatOffDaysSummary(e.offDays).length)
  );

  const col6Width = Math.min(18, maxCodeLen + 4);
  const col7Width = Math.min(36, maxNameLen + 5);
  const col8Width = Math.min(26, maxOffLen + 4);

  ws.getColumn(1).width = 2.5;
  ws.getColumn(2).width = 14.5;
  ws.getColumn(3).width = 2.5;
  ws.getColumn(4).width = 14.5;
  ws.getColumn(5).width = 3;
  ws.getColumn(6).width = col6Width;
  ws.getColumn(7).width = col7Width;
  ws.getColumn(8).width = col8Width;
  for (let c = DAY_START_COL; c <= DAY_END_COL; c++) {
    ws.getColumn(c).width = 4.2;
  }
  ws.getColumn(SPACER_RIGHT_COL).width = 2.5;
  ws.getColumn(SUM_H_COL).width = 5.5;
  ws.getColumn(SUM_I_COL).width = 5.5;
  ws.getColumn(SUM_S_COL).width = 5.5;
  ws.getColumn(SUM_A_COL).width = 5.5;

  ws.getRow(1).height = 28;
  ws.mergeCells(`F1:${sumAColLetter}1`);
  const titleCell = ws.getCell('F1');
  titleCell.value = `DAFTAR HADIR KARYAWAN BULAN ${meta.monthName.toUpperCase()} ${meta.year}${deptSuffix}`;
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 1, 6, 1, SUM_A_COL, THIN_BORDER);

  ws.getRow(2).height = 8;
  ws.getRow(3).height = 42;
  ws.getRow(4).height = 42;

  ws.mergeCells('B3:D4');
  const brandCell = ws.getCell('B3');
  brandCell.value = `${companyName}\n${companySubtitle}`;
  brandCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  brandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
  brandCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBorderToRange(ws, 3, 2, 4, 4, THIN_BORDER);

  ws.mergeCells('F3:H4');
  const pegawaiHdr = ws.getCell('F3');
  pegawaiHdr.value = 'PEGAWAI';
  pegawaiHdr.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  pegawaiHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  pegawaiHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 3, 6, 4, 8, THIN_BORDER);

  days.forEach((dateStr, idx) => {
    const col = DAY_START_COL + idx;
    const cLetter = colLetter(col);
    ws.mergeCells(`${cLetter}3:${cLetter}4`);
    const cell = ws.getCell(3, col);
    cell.value = getDayNameIndonesian(dateStr);
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.alignment = {
      textRotation: 90,
      horizontal: 'center',
      vertical: 'middle',
    };
    applyBorderToRange(ws, 3, col, 4, col, THIN_BORDER);
  });

  ws.mergeCells(`${sumHColLetter}3:${sumAColLetter}4`);
  const rightRingkasanHdr = ws.getCell(`${sumHColLetter}3`);
  rightRingkasanHdr.value = 'RINGKASAN';
  rightRingkasanHdr.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  rightRingkasanHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  rightRingkasanHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 3, SUM_H_COL, 4, SUM_A_COL, THIN_BORDER);

  ws.getRow(5).height = 23;
  ws.mergeCells('B5:D5');
  const sheetKehadiranCell = ws.getCell('B5');
  sheetKehadiranCell.value = 'SHEET KEHADIRAN';
  sheetKehadiranCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  sheetKehadiranCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  sheetKehadiranCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 5, 2, 5, 4, THIN_BORDER);

  const subheaders: { col: number; label: string }[] = [
    { col: 6, label: 'ID' },
    { col: 7, label: 'Nama' },
    { col: 8, label: 'Hari Libur' },
    ...days.map((d, i) => ({
      col: DAY_START_COL + i,
      label: d.slice(8, 10),
    })),
    { col: SUM_H_COL, label: 'h' },
    { col: SUM_I_COL, label: 'i' },
    { col: SUM_S_COL, label: 's' },
    { col: SUM_A_COL, label: 'a' },
  ];

  for (const sh of subheaders) {
    const c = ws.getCell(5, sh.col);
    c.value = sh.label;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  }

  const firstEmpRow = 6;
  const rowCount = Math.max(1, sortedEmployees.length);
  const lastEmpRow = firstEmpRow + rowCount - 1;

  let grandTotalH = 0;
  let grandTotalI = 0;
  let grandTotalS = 0;
  let grandTotalA = 0;

  const dayTotalsH = new Array<number>(daysCount).fill(0);
  const dayTotalsI = new Array<number>(daysCount).fill(0);
  const dayTotalsS = new Array<number>(daysCount).fill(0);
  const dayTotalsA = new Array<number>(daysCount).fill(0);

  if (sortedEmployees.length === 0) {
    ws.getRow(firstEmpRow).height = 22;
    for (let col = 6; col <= SUM_A_COL; col++) {
      if (col === SPACER_RIGHT_COL) continue;
      ws.getCell(firstEmpRow, col).border = THIN_BORDER;
    }
  } else {
    sortedEmployees.forEach((emp, empIdx) => {
      const r = firstEmpRow + empIdx;
      const offSummary = formatOffDaysSummary(emp.offDays);
      ws.getRow(r).height = calcDynamicRowHeight(
        [
          { text: emp.name, width: col7Width },
          { text: offSummary, width: col8Width },
        ],
        22,
        14,
        6
      );

      const idCell = ws.getCell(r, 6);
      idCell.value = emp.employeeCode;
      idCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0F172A' } };
      idCell.alignment = { horizontal: 'center', vertical: 'middle' };
      idCell.border = THIN_BORDER;

      const nameCell = ws.getCell(r, 7);
      nameCell.value = emp.name;
      nameCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      nameCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      nameCell.border = THIN_BORDER;

      const offCell = ws.getCell(r, 8);
      offCell.value = offSummary;
      offCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
      offCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      offCell.border = THIN_BORDER;

      let empH = 0;
      let empI = 0;
      let empS = 0;
      let empA = 0;

      days.forEach((dateStr, dIdx) => {
        const col = DAY_START_COL + dIdx;
        const cell = ws.getCell(r, col);
        const rec = recMap.get(`${emp.id}__${dateStr}`);
        const scheduledOff = isEmployeeOffDay(emp, dateStr).isOff;

        const code = rec ? statusToMatrixCode(rec.status) : '';
        cell.value = code || null;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = THIN_BORDER;

        if (code === 'h') {
          empH++;
          dayTotalsH[dIdx]++;
          grandTotalH++;
          if (rec?.status === 'terlambat') {
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
          } else {
            cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };
          }
        } else if (code === 'i') {
          empI++;
          dayTotalsI[dIdx]++;
          grandTotalI++;
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF833C0C' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        } else if (code === 's') {
          empS++;
          dayTotalsS[dIdx]++;
          grandTotalS++;
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
        } else if (code === 'a') {
          empA++;
          dayTotalsA[dIdx]++;
          grandTotalA++;
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
        } else if (scheduledOff || rec?.status === 'libur') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        }
      });

      const hSumCell = ws.getCell(r, SUM_H_COL);
      hSumCell.value = {
        formula: `COUNTIF(${firstDayColLetter}${r}:${lastDayColLetter}${r},"h")`,
        result: empH,
      };
      hSumCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      hSumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      hSumCell.border = THIN_BORDER;

      const iSumCell = ws.getCell(r, SUM_I_COL);
      iSumCell.value = {
        formula: `COUNTIF(${firstDayColLetter}${r}:${lastDayColLetter}${r},"i")`,
        result: empI,
      };
      iSumCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0F172A' } };
      iSumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      iSumCell.border = THIN_BORDER;

      const sSumCell = ws.getCell(r, SUM_S_COL);
      sSumCell.value = {
        formula: `COUNTIF(${firstDayColLetter}${r}:${lastDayColLetter}${r},"s")`,
        result: empS,
      };
      sSumCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0F172A' } };
      sSumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sSumCell.border = THIN_BORDER;

      const aSumCell = ws.getCell(r, SUM_A_COL);
      aSumCell.value = {
        formula: `COUNTIF(${firstDayColLetter}${r}:${lastDayColLetter}${r},"a")`,
        result: empA,
      };
      aSumCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0F172A' } };
      aSumCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aSumCell.border = THIN_BORDER;
    });
  }

  const bottomStart = lastEmpRow + 1;
  const bottomLabels: { offset: number; code: 'h' | 'i' | 's' | 'a' | 'TOTAL' }[] = [
    { offset: 0, code: 'h' },
    { offset: 1, code: 'i' },
    { offset: 2, code: 's' },
    { offset: 3, code: 'a' },
    { offset: 4, code: 'TOTAL' },
  ];

  ws.mergeCells(`F${bottomStart}:G${bottomStart + 4}`);
  const bottomRingkasanHdr = ws.getCell(`F${bottomStart}`);
  bottomRingkasanHdr.value = 'RINGKASAN';
  bottomRingkasanHdr.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  bottomRingkasanHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  bottomRingkasanHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, bottomStart, 6, bottomStart + 4, 7, THIN_BORDER);

  for (const bl of bottomLabels) {
    const rowNum = bottomStart + bl.offset;
    ws.getRow(rowNum).height = 21;

    const lblCell = ws.getCell(rowNum, 8);
    lblCell.value = bl.code;
    lblCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    lblCell.alignment = { horizontal: 'center', vertical: 'middle' };
    lblCell.border = THIN_BORDER;

    days.forEach((_d, dIdx) => {
      const col = DAY_START_COL + dIdx;
      const cLetter = colLetter(col);
      const c = ws.getCell(rowNum, col);

      if (bl.code === 'TOTAL') {
        c.value = {
          formula: `SUM(${cLetter}${bottomStart}:${cLetter}${bottomStart + 3})`,
          result:
            dayTotalsH[dIdx] +
            dayTotalsI[dIdx] +
            dayTotalsS[dIdx] +
            dayTotalsA[dIdx],
        };
        c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      } else {
        const resVal =
          bl.code === 'h'
            ? dayTotalsH[dIdx]
            : bl.code === 'i'
            ? dayTotalsI[dIdx]
            : bl.code === 's'
            ? dayTotalsS[dIdx]
            : dayTotalsA[dIdx];
        c.value = {
          formula: `COUNTIF(${cLetter}${firstEmpRow}:${cLetter}${lastEmpRow},"${bl.code}")`,
          result: resVal,
        };
        c.font = { name: 'Calibri', size: 9, color: { argb: 'FF0F172A' } };
      }
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = THIN_BORDER;
    });

    if (bl.code === 'TOTAL') {
      const rightTotals: { col: number; letter: string; val: number }[] = [
        { col: SUM_H_COL, letter: sumHColLetter, val: grandTotalH },
        { col: SUM_I_COL, letter: sumIColLetter, val: grandTotalI },
        { col: SUM_S_COL, letter: sumSColLetter, val: grandTotalS },
        { col: SUM_A_COL, letter: sumAColLetter, val: grandTotalA },
      ];
      for (const rt of rightTotals) {
        const rc = ws.getCell(rowNum, rt.col);
        rc.value = {
          formula: `SUM(${rt.letter}${firstEmpRow}:${rt.letter}${lastEmpRow})`,
          result: rt.val,
        };
        rc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        rc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        rc.alignment = { horizontal: 'center', vertical: 'middle' };
        rc.border = THIN_BORDER;
      }
    }
  }

  // Ensure left panel rows 6..26 have clean minimum heights even with few employees
  for (let r = 6; r <= 26; r++) {
    const existingH = ws.getRow(r).height || 0;
    const minH = r === 12 || r === 16 || r === 20 ? 8 : 22;
    if (r === 12 || r === 16 || r === 20) {
      if (existingH === 0) ws.getRow(r).height = 8;
    } else if (existingH < minH) {
      ws.getRow(r).height = minH;
    }
  }

  const infoRows: { row: number; label: string; value: string | number }[] = [
    { row: 6, label: 'Tahun', value: meta.year },
    { row: 7, label: 'Bulan', value: meta.monthName },
  ];
  for (const ir of infoRows) {
    const lbl = ws.getCell(ir.row, 2);
    lbl.value = ir.label;
    lbl.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    lbl.alignment = { horizontal: 'left', vertical: 'middle' };
    lbl.border = THIN_BORDER;

    ws.mergeCells(`C${ir.row}:D${ir.row}`);
    const val = ws.getCell(ir.row, 3);
    val.value = ir.value;
    val.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    val.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(ws, ir.row, 3, ir.row, 4, THIN_BORDER);
  }

  ws.getCell('B8').value = meta.startDateLabel;
  ws.getCell('B8').font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
  ws.getCell('B8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  ws.getCell('B8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('B8').border = THIN_BORDER;

  ws.getCell('C8').value = '-';
  ws.getCell('C8').font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
  ws.getCell('C8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  ws.getCell('C8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C8').border = THIN_BORDER;

  ws.getCell('D8').value = meta.endDateLabel;
  ws.getCell('D8').font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
  ws.getCell('D8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  ws.getCell('D8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('D8').border = THIN_BORDER;

  const totalRecordedLogs = grandTotalH + grandTotalI + grandTotalS + grandTotalA;
  const hadirRatio = totalRecordedLogs > 0 ? grandTotalH / totalRecordedLogs : 0;

  const pegawaiHdrCell = ws.getCell('B9');
  pegawaiHdrCell.value = 'PEGAWAI';
  pegawaiHdrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  pegawaiHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  pegawaiHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  pegawaiHdrCell.border = THIN_BORDER;

  ws.mergeCells('B10:B11');
  const pegawaiValCell = ws.getCell('B10');
  pegawaiValCell.value = {
    formula: `COUNTA(G${firstEmpRow}:G${lastEmpRow})`,
    result: sortedEmployees.length,
  };
  pegawaiValCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  pegawaiValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEEF7' } };
  pegawaiValCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 10, 2, 11, 2, THIN_BORDER);

  const hadirHdrCell = ws.getCell('D9');
  hadirHdrCell.value = 'HADIR';
  hadirHdrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  hadirHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };
  hadirHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  hadirHdrCell.border = THIN_BORDER;

  ws.mergeCells('D10:D11');
  const hadirValCell = ws.getCell('D10');
  hadirValCell.value = {
    formula: `IFERROR(SUM(${sumHColLetter}${firstEmpRow}:${sumHColLetter}${lastEmpRow})/(SUM(${sumHColLetter}${firstEmpRow}:${sumHColLetter}${lastEmpRow})+SUM(${sumIColLetter}${firstEmpRow}:${sumIColLetter}${lastEmpRow})+SUM(${sumSColLetter}${firstEmpRow}:${sumSColLetter}${lastEmpRow})+SUM(${sumAColLetter}${firstEmpRow}:${sumAColLetter}${lastEmpRow})),0)`,
    result: hadirRatio,
  };
  hadirValCell.numFmt = '0%';
  hadirValCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  hadirValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  hadirValCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 10, 4, 11, 4, THIN_BORDER);

  const ijinHdrCell = ws.getCell('B13');
  ijinHdrCell.value = 'IJIN';
  ijinHdrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF833C0C' } };
  ijinHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
  ijinHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ijinHdrCell.border = THIN_BORDER;

  ws.mergeCells('B14:B15');
  const ijinValCell = ws.getCell('B14');
  ijinValCell.value = {
    formula: `SUM(${sumIColLetter}${firstEmpRow}:${sumIColLetter}${lastEmpRow})`,
    result: grandTotalI,
  };
  ijinValCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  ijinValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  ijinValCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 14, 2, 15, 2, THIN_BORDER);

  const sakitHdrCell = ws.getCell('D13');
  sakitHdrCell.value = 'SAKIT';
  sakitHdrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  sakitHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
  sakitHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sakitHdrCell.border = THIN_BORDER;

  ws.mergeCells('D14:D15');
  const sakitValCell = ws.getCell('D14');
  sakitValCell.value = {
    formula: `SUM(${sumSColLetter}${firstEmpRow}:${sumSColLetter}${lastEmpRow})`,
    result: grandTotalS,
  };
  sakitValCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  sakitValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
  sakitValCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 14, 4, 15, 4, THIN_BORDER);

  ws.mergeCells('B17:D17');
  const alphaHdrCell = ws.getCell('B17');
  alphaHdrCell.value = 'ALPHA';
  alphaHdrCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  alphaHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
  alphaHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 17, 2, 17, 4, THIN_BORDER);

  ws.mergeCells('B18:D19');
  const alphaValCell = ws.getCell('B18');
  alphaValCell.value = {
    formula: `SUM(${sumAColLetter}${firstEmpRow}:${sumAColLetter}${lastEmpRow})`,
    result: grandTotalA,
  };
  alphaValCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  alphaValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };
  alphaValCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 18, 2, 19, 4, THIN_BORDER);

  ws.mergeCells('B21:D21');
  const legHdr = ws.getCell('B21');
  legHdr.value = 'KETERANGAN';
  legHdr.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
  legHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  legHdr.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorderToRange(ws, 21, 2, 21, 4, THIN_BORDER);

  const legendItems = [
    'h = hadir (termasuk telat)',
    'i = ijin',
    's = sakit',
    'a = alpha',
    'abu-abu = hari libur',
  ];
  legendItems.forEach((txt, idx) => {
    const r = 22 + idx;
    ws.mergeCells(`B${r}:D${r}`);
    const c = ws.getCell(`B${r}`);
    c.value = txt;
    c.font = { name: 'Calibri', size: 9, color: { argb: 'FF334155' } };
    c.alignment = { horizontal: 'left', vertical: 'middle' };
    applyBorderToRange(ws, r, 2, r, 4, THIN_BORDER);
  });

  // =========================================================================
  // SHEET 2: RINGKASAN ABSENSI
  // =========================================================================
  const wsSummary = workbook.addWorksheet('Ringkasan Absensi', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const summaryHeaders = [
    'No',
    'Kode',
    'Nama Karyawan',
    'Divisi',
    'Shift Kerja',
    'Hari Libur',
    'Wajib Kerja',
    'Hadir Tepat',
    'Terlambat',
    'Total Masuk',
    'Izin',
    'Sakit',
    'Alpha',
    'Libur',
    'Jam Kerja (Jam)',
    'Lembur (Jam)',
    'Rasio Hadir',
  ];

  // Precompute all Sheet 2 row data so column widths and row heights auto-fit cleanly
  interface SummarySheetRow {
    emp: Employee;
    shiftLabel: string;
    offLabel: string;
    effectiveWorkDays: number;
    hadirCount: number;
    terlambatCount: number;
    attendedTotal: number;
    izinCount: number;
    sakitCount: number;
    alphaCount: number;
    liburCount: number;
    workHours: number;
    otHours: number;
    pct: number;
  }

  const summaryRowData: SummarySheetRow[] = sortedEmployees.map((emp) => {
    const monthAtt = attendanceRecords.filter(
      (rec) => rec.employeeId === emp.id && rec.date.startsWith(yearMonth)
    );
    const effectiveWorkDays = getMonthEffectiveWorkDays(emp, yearMonth);
    const hadirCount = monthAtt.filter((rec) => rec.status === 'hadir').length;
    const terlambatCount = monthAtt.filter((rec) => rec.status === 'terlambat').length;
    const izinCount = monthAtt.filter((rec) => rec.status === 'izin').length;
    const sakitCount = monthAtt.filter((rec) => rec.status === 'sakit').length;
    const alphaCount = monthAtt.filter((rec) => rec.status === 'alpha').length;
    const liburCount = monthAtt.filter((rec) => rec.status === 'libur').length;

    const workHours =
      Math.round(
        monthAtt.reduce((acc, rec) => {
          if (!rec.checkIn || !rec.checkOut) return acc;
          const h = calculateDurationHours(rec.checkIn, rec.checkOut);
          return h > 0 && h <= 20 ? acc + h : acc;
        }, 0) * 10
      ) / 10;

    const otHours =
      Math.round(
        monthAtt.reduce((acc, rec) => acc + (rec.overtimeHours || 0), 0) * 10
      ) / 10;

    const attendedTotal = hadirCount + terlambatCount;
    const denom = attendedTotal + izinCount + sakitCount + alphaCount;
    const pct = denom > 0 ? attendedTotal / denom : 0;

    return {
      emp,
      shiftLabel: `${emp.shiftName} (${emp.shiftStart}-${emp.shiftEnd})`,
      offLabel: formatOffDaysSummary(emp.offDays),
      effectiveWorkDays,
      hadirCount,
      terlambatCount,
      attendedTotal,
      izinCount,
      sakitCount,
      alphaCount,
      liburCount,
      workHours,
      otHours,
      pct,
    };
  });

  const sumWidths = [
    6,
    Math.min(18, Math.max(10, ...summaryRowData.map((r) => r.emp.employeeCode.length + 4))),
    Math.min(36, Math.max(20, ...summaryRowData.map((r) => r.emp.name.length + 5))),
    Math.min(28, Math.max(16, ...summaryRowData.map((r) => r.emp.department.length + 4))),
    Math.min(30, Math.max(20, ...summaryRowData.map((r) => r.shiftLabel.length + 4))),
    Math.min(26, Math.max(14, ...summaryRowData.map((r) => r.offLabel.length + 4))),
    13,
    12.5,
    12,
    13,
    10,
    10,
    10,
    10,
    16,
    15,
    13,
  ];
  sumWidths.forEach((w, idx) => {
    wsSummary.getColumn(idx + 1).width = w;
  });

  wsSummary.getRow(1).height = 30;
  wsSummary.mergeCells('A1:Q1');
  const sumTitle = wsSummary.getCell('A1');
  sumTitle.value = `${companyName} — RINGKASAN ABSENSI KARYAWAN BULAN ${meta.monthName.toUpperCase()} ${meta.year}${deptSuffix}`;
  sumTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  sumTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  wsSummary.getRow(2).height = 22;
  wsSummary.mergeCells('A2:Q2');
  const sumSubtitle = wsSummary.getCell('A2');
  const companyContactLine = [
    companyProfile?.legalName,
    companyProfile?.city,
    companyProfile?.phone ? `Telp: ${companyProfile.phone}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  sumSubtitle.value = `Periode: ${meta.startDateLabel} s/d ${meta.endDateLabel} | Total Karyawan Aktif: ${sortedEmployees.length} orang${
    companyContactLine ? ` | ${companyContactLine}` : ''
  }`;
  sumSubtitle.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  sumSubtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sumSubtitle.alignment = { horizontal: 'center', vertical: 'middle' };

  wsSummary.getRow(3).height = 8;

  const sumHeaderRow = wsSummary.getRow(4);
  sumHeaderRow.height = 30;
  summaryHeaders.forEach((label, idx) => {
    const c = sumHeaderRow.getCell(idx + 1);
    c.value = label;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: idx === 0 || idx >= 6 ? 'center' : 'left', vertical: 'middle', wrapText: true };
    c.border = THIN_BORDER;
  });

  const sumFirstRow = 5;
  let sumTotalWorkDays = 0;
  let sumTotalHadir = 0;
  let sumTotalLate = 0;
  let sumTotalIzin = 0;
  let sumTotalSakit = 0;
  let sumTotalAlpha = 0;
  let sumTotalLibur = 0;
  let sumTotalWorkHours = 0;
  let sumTotalOvertime = 0;

  if (summaryRowData.length === 0) {
    wsSummary.getRow(5).height = 24;
    wsSummary.mergeCells('A5:Q5');
    const emptyCell = wsSummary.getCell('A5');
    emptyCell.value = 'Belum ada data karyawan pada periode ini.';
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsSummary, 5, 1, 5, 17, LIGHT_BORDER);
  } else {
    summaryRowData.forEach((item, idx) => {
      const r = sumFirstRow + idx;
      const row = wsSummary.getRow(r);
      row.height = calcDynamicRowHeight(
        [
          { text: item.emp.name, width: sumWidths[2] },
          { text: item.emp.department, width: sumWidths[3] },
          { text: item.shiftLabel, width: sumWidths[4] },
          { text: item.offLabel, width: sumWidths[5] },
        ],
        23,
        15,
        8
      );

      sumTotalWorkDays += item.effectiveWorkDays;
      sumTotalHadir += item.hadirCount;
      sumTotalLate += item.terlambatCount;
      sumTotalIzin += item.izinCount;
      sumTotalSakit += item.sakitCount;
      sumTotalAlpha += item.alphaCount;
      sumTotalLibur += item.liburCount;
      sumTotalWorkHours += item.workHours;
      sumTotalOvertime += item.otHours;

      const rowBg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';

      const values: (string | number | { formula: string; result: number })[] = [
        idx + 1,
        item.emp.employeeCode,
        item.emp.name,
        item.emp.department,
        item.shiftLabel,
        item.offLabel,
        item.effectiveWorkDays,
        item.hadirCount,
        item.terlambatCount,
        { formula: `H${r}+I${r}`, result: item.attendedTotal },
        item.izinCount,
        item.sakitCount,
        item.alphaCount,
        item.liburCount,
        item.workHours,
        item.otHours,
        {
          formula: `IFERROR((H${r}+I${r})/(H${r}+I${r}+K${r}+L${r}+M${r}),0)`,
          result: item.pct,
        },
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.border = LIGHT_BORDER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 2 || cIdx === 9 || cIdx === 16,
          color: { argb: 'FF0F172A' },
        };
        cell.alignment = {
          horizontal: cIdx === 0 || cIdx === 1 || cIdx >= 6 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: cIdx >= 2 && cIdx <= 5,
        };
        if (cIdx === 14 || cIdx === 15) {
          cell.numFmt = '0.0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        if (cIdx === 16) {
          cell.numFmt = '0%';
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: true,
            color: { argb: item.pct >= 0.9 ? 'FF15803D' : item.pct >= 0.75 ? 'FFB45309' : 'FFB91C1C' },
          };
        }
      });
    });

    const sumLastRow = sumFirstRow + summaryRowData.length - 1;
    const totalRowIdx = sumLastRow + 1;
    const totalRow = wsSummary.getRow(totalRowIdx);
    totalRow.height = 26;

    wsSummary.mergeCells(`A${totalRowIdx}:F${totalRowIdx}`);
    const totalLbl = totalRow.getCell(1);
    totalLbl.value = 'TOTAL KESELURUHAN';
    totalLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    totalLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    totalLbl.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsSummary, totalRowIdx, 1, totalRowIdx, 6, THIN_BORDER);

    const totalColsConfig: { col: number; res: number; fmt?: string }[] = [
      { col: 7, res: sumTotalWorkDays },
      { col: 8, res: sumTotalHadir },
      { col: 9, res: sumTotalLate },
      { col: 10, res: sumTotalHadir + sumTotalLate },
      { col: 11, res: sumTotalIzin },
      { col: 12, res: sumTotalSakit },
      { col: 13, res: sumTotalAlpha },
      { col: 14, res: sumTotalLibur },
      { col: 15, res: Math.round(sumTotalWorkHours * 10) / 10, fmt: '0.0' },
      { col: 16, res: Math.round(sumTotalOvertime * 10) / 10, fmt: '0.0' },
    ];

    for (const tc of totalColsConfig) {
      const letter = colLetter(tc.col);
      const cell = totalRow.getCell(tc.col);
      cell.value = {
        formula: `SUM(${letter}${sumFirstRow}:${letter}${sumLastRow})`,
        result: tc.res,
      };
      if (tc.fmt) cell.numFmt = tc.fmt;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { horizontal: tc.fmt ? 'right' : 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    }

    const totalAttAll = sumTotalHadir + sumTotalLate;
    const totalDenomAll = totalAttAll + sumTotalIzin + sumTotalSakit + sumTotalAlpha;
    const totalPctCell = totalRow.getCell(17);
    totalPctCell.value = {
      formula: `IFERROR(J${totalRowIdx}/(J${totalRowIdx}+K${totalRowIdx}+L${totalRowIdx}+M${totalRowIdx}),0)`,
      result: totalDenomAll > 0 ? totalAttAll / totalDenomAll : 0,
    };
    totalPctCell.numFmt = '0%';
    totalPctCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    totalPctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    totalPctCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalPctCell.border = THIN_BORDER;

    if (companyProfile?.hrManagerName) {
      const signStart = totalRowIdx + 2;
      wsSummary.getRow(signStart).height = 18;
      wsSummary.mergeCells(`N${signStart}:Q${signStart}`);
      const signTitleCell = wsSummary.getCell(`N${signStart}`);
      signTitleCell.value = `Mengetahui, ${companyProfile.hrManagerTitle || 'Manajer HRD'}`;
      signTitleCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
      signTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      wsSummary.getRow(signStart + 1).height = 24;
      wsSummary.getRow(signStart + 2).height = 24;

      wsSummary.getRow(signStart + 3).height = 20;
      wsSummary.mergeCells(`N${signStart + 3}:Q${signStart + 3}`);
      const signNameCell = wsSummary.getCell(`N${signStart + 3}`);
      signNameCell.value = companyProfile.hrManagerName;
      signNameCell.font = { name: 'Calibri', size: 10, bold: true, underline: true, color: { argb: 'FF0F172A' } };
      signNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // =========================================================================
  // SHEET 3: DATA KETERLAMBATAN KARYAWAN & PENYELESAIAN (CICILAN / POTONG GAJI)
  // =========================================================================
  const wsLate = workbook.addWorksheet('Data Keterlambatan', {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const scopedIds = new Set(sortedEmployees.map((e) => e.id));
  const scopedMonthSettlements = lateSettlements
    .filter((s) => s.yearMonth === yearMonth && scopedIds.has(s.employeeId))
    .sort((a, b) => b.date.localeCompare(a.date));

  interface ExportLateEmpRow {
    emp: Employee;
    shiftDisplay: string;
    tolerance: number;
    lateCount: number;
    totalLateMinutes: number;
    maxLateMinutes: number;
    lateDatesSummary: string;
    workSettledMinutes: number;
    salarySettledMinutes: number;
    totalDeductionAmount: number;
  }

  interface ExportLateDetailRow {
    rec: AttendanceRecord;
    emp: Employee;
    tolerance: number;
    lateMinutes: number;
  }

  const lateSummaryRows: ExportLateEmpRow[] = [];
  const lateDetailRows: ExportLateDetailRow[] = [];

  for (const emp of sortedEmployees) {
    const tol = getEmployeeShiftTolerance(emp, shifts);
    const monthAtt = attendanceRecords.filter(
      (r) => r.employeeId === emp.id && r.date.startsWith(yearMonth)
    );

    let empLateCount = 0;
    let empLateMins = 0;
    let empMaxLate = 0;
    const empLateEntries: { date: string; minutes: number }[] = [];

    for (const rec of monthAtt) {
      const rawLate = rec.checkIn
        ? calculateLatenessMinutes(rec.checkIn, emp.shiftStart)
        : 0;
      const isLate =
        rec.status === 'terlambat' ||
        (rec.status === 'hadir' && Boolean(rec.checkIn) && rawLate > tol);
      if (isLate) {
        empLateCount++;
        empLateMins += rawLate;
        if (rawLate > empMaxLate) empMaxLate = rawLate;
        empLateEntries.push({ date: rec.date, minutes: rawLate });
        lateDetailRows.push({
          rec,
          emp,
          tolerance: tol,
          lateMinutes: rawLate,
        });
      }
    }

    const empSettles = scopedMonthSettlements.filter(
      (s) => s.employeeId === emp.id
    );
    const workSettled = empSettles
      .filter((s) => s.method === 'tambahan_jam_kerja')
      .reduce((acc, s) => acc + s.minutesSettled, 0);
    const salarySettled = empSettles
      .filter((s) => s.method === 'potongan_gaji')
      .reduce((acc, s) => acc + s.minutesSettled, 0);
    const deductionRp = empSettles
      .filter((s) => s.method === 'potongan_gaji')
      .reduce((acc, s) => acc + (s.deductionAmount || 0), 0);

    if (empLateCount > 0 || empSettles.length > 0) {
      const sortedDates = [...empLateEntries].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const lateDatesSummary =
        sortedDates.length > 0
          ? sortedDates
              .map((d) => `${d.date.slice(8, 10)}/${d.date.slice(5, 7)} (+${d.minutes} mnt)`)
              .join(', ')
          : '-';

      lateSummaryRows.push({
        emp,
        shiftDisplay: `${emp.shiftName} (${emp.shiftStart}-${emp.shiftEnd})`,
        tolerance: tol,
        lateCount: empLateCount,
        totalLateMinutes: empLateMins,
        maxLateMinutes: empMaxLate,
        lateDatesSummary,
        workSettledMinutes: workSettled,
        salarySettledMinutes: salarySettled,
        totalDeductionAmount: deductionRp,
      });
    }
  }

  lateSummaryRows.sort((a, b) => b.totalLateMinutes - a.totalLateMinutes);
  lateDetailRows.sort((a, b) => b.rec.date.localeCompare(a.rec.date));

  // Auto-fit Sheet 3 column widths across all 3 sections
  const maxLateCodeLen = Math.max(
    10,
    ...lateSummaryRows.map((r) => r.emp.employeeCode.length),
    ...lateDetailRows.map((d) => d.emp.employeeCode.length)
  );
  const maxLateNameLen = Math.max(
    20,
    ...lateSummaryRows.map((r) => r.emp.name.length),
    ...scopedMonthSettlements.map((s) => s.employeeName.length),
    ...lateDetailRows.map((d) => d.emp.name.length)
  );
  const maxLateDeptLen = Math.max(
    16,
    ...lateSummaryRows.map((r) => r.emp.department.length),
    ...lateDetailRows.map((d) => d.emp.department.length)
  );
  const maxLateShiftLen = Math.max(
    19,
    ...lateSummaryRows.map((r) => r.shiftDisplay.length)
  );

  const lateWidths = [
    6, // A: No
    Math.min(18, Math.max(14, maxLateCodeLen + 4)), // B: Kode / Tanggal
    Math.min(34, maxLateNameLen + 5), // C: Nama Karyawan
    Math.min(26, maxLateDeptLen + 4), // D: Divisi
    Math.min(30, Math.max(22, maxLateShiftLen + 4)), // E: Shift & Jam Kerja / Kode
    14, // F: Toleransi (Mnt)
    12, // G: Kali Telat
    14, // H: Total Telat (Mnt)
    13, // I: Rata2 (Mnt)
    13, // J: Terlama (Mnt)
    17, // K: Ganti Jam Kerja (Mnt)
    15, // L: Potong Gaji (Mnt)
    19, // M: Nominal Potongan (Rp)
    16, // N: Sisa Tunggakan (Mnt)
    16, // O: Status
    34, // P: Daftar Tanggal & Menit Terlambat
  ];
  lateWidths.forEach((w, idx) => {
    wsLate.getColumn(idx + 1).width = w;
  });

  wsLate.getRow(1).height = 30;
  wsLate.mergeCells('A1:P1');
  const lateTitle = wsLate.getCell('A1');
  lateTitle.value = `${companyName} — DATA KETERLAMBATAN & PENYELESAIAN KARYAWAN BULAN ${meta.monthName.toUpperCase()} ${meta.year}${deptSuffix}`;
  lateTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  lateTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
  lateTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  wsLate.getRow(2).height = 22;
  wsLate.mergeCells('A2:P2');
  const lateSubtitle = wsLate.getCell('A2');
  lateSubtitle.value = `Periode: ${meta.startDateLabel} s/d ${meta.endDateLabel} | Rekap keterlambatan, shift kerja, tanggal terlambat, cicilan jam kerja, dan potongan gaji`;
  lateSubtitle.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  lateSubtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  lateSubtitle.alignment = { horizontal: 'center', vertical: 'middle' };

  wsLate.getRow(3).height = 8;

  // Section 1 Banner
  wsLate.getRow(4).height = 24;
  wsLate.mergeCells('A4:P4');
  const sec1Hdr = wsLate.getCell('A4');
  sec1Hdr.value = '1. RINGKASAN & SALDO PENYELESAIAN KETERLAMBATAN PER KARYAWAN';
  sec1Hdr.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  sec1Hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  sec1Hdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  applyBorderToRange(wsLate, 4, 1, 4, 16, THIN_BORDER);

  const lateSumHeaders = [
    'No',
    'Kode',
    'Nama Karyawan',
    'Divisi',
    'Shift & Jam Kerja',
    'Toleransi (Mnt)',
    'Kali Telat',
    'Total Telat (Mnt)',
    'Rata2 (Mnt)',
    'Terlama (Mnt)',
    'Ganti Jam Kerja (Mnt)',
    'Potong Gaji (Mnt)',
    'Nominal Potongan (Rp)',
    'Sisa Tunggakan (Mnt)',
    'Status',
    'Rincian Tanggal & Menit Terlambat',
  ];

  const lateSumHeaderRow = wsLate.getRow(5);
  lateSumHeaderRow.height = 32;
  lateSumHeaders.forEach((lbl, idx) => {
    const c = lateSumHeaderRow.getCell(idx + 1);
    c.value = lbl;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: idx === 0 || (idx >= 5 && idx <= 14) ? 'center' : 'left', vertical: 'middle', wrapText: true };
    c.border = THIN_BORDER;
  });

  let cursorRow = 6;

  if (lateSummaryRows.length === 0) {
    wsLate.getRow(cursorRow).height = 24;
    wsLate.mergeCells(`A${cursorRow}:P${cursorRow}`);
    const emptyLate = wsLate.getCell(`A${cursorRow}`);
    emptyLate.value = 'Tidak ada data keterlambatan karyawan pada bulan ini.';
    emptyLate.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    emptyLate.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 16, LIGHT_BORDER);
    cursorRow += 1;
  } else {
    const firstLateRow = cursorRow;
    let sumLateCount = 0;
    let sumLateMins = 0;
    let sumWorkSettle = 0;
    let sumSalarySettle = 0;
    let sumDeductionRp = 0;
    let sumRemaining = 0;

    lateSummaryRows.forEach((item, idx) => {
      const r = firstLateRow + idx;
      const row = wsLate.getRow(r);
      row.height = calcDynamicRowHeight(
        [
          { text: item.emp.name, width: lateWidths[2] },
          { text: item.emp.department, width: lateWidths[3] },
          { text: item.shiftDisplay, width: lateWidths[4] },
          { text: item.lateDatesSummary, width: lateWidths[15] },
        ],
        23,
        15,
        8
      );

      const avg = item.lateCount > 0 ? Math.round(item.totalLateMinutes / item.lateCount) : 0;
      const remaining = Math.max(
        0,
        item.totalLateMinutes - item.workSettledMinutes - item.salarySettledMinutes
      );
      sumLateCount += item.lateCount;
      sumLateMins += item.totalLateMinutes;
      sumWorkSettle += item.workSettledMinutes;
      sumSalarySettle += item.salarySettledMinutes;
      sumDeductionRp += item.totalDeductionAmount;
      sumRemaining += remaining;

      const rowBg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const cells: (string | number | { formula: string; result: number | string })[] = [
        idx + 1,
        item.emp.employeeCode,
        item.emp.name,
        item.emp.department,
        item.shiftDisplay,
        item.tolerance,
        item.lateCount,
        item.totalLateMinutes,
        { formula: `IFERROR(ROUND(H${r}/G${r},0),0)`, result: avg },
        item.maxLateMinutes,
        item.workSettledMinutes,
        item.salarySettledMinutes,
        item.totalDeductionAmount,
        { formula: `MAX(0,H${r}-K${r}-L${r})`, result: remaining },
        { formula: `IF(N${r}=0,"Lunas","Belum Lunas")`, result: remaining === 0 ? 'Lunas' : 'Belum Lunas' },
        item.lateDatesSummary,
      ];

      cells.forEach((val, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = val;
        cell.border = LIGHT_BORDER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.font = {
          name: 'Calibri',
          size: cIdx === 15 ? 9 : 10,
          bold: cIdx === 2 || cIdx === 7 || cIdx === 13 || cIdx === 14,
          color: { argb: 'FF0F172A' },
        };
        cell.alignment = {
          horizontal: cIdx === 0 || cIdx === 1 || (cIdx >= 5 && cIdx <= 14) ? 'center' : 'left',
          vertical: 'middle',
          wrapText: (cIdx >= 2 && cIdx <= 4) || cIdx === 15,
        };
        if (cIdx === 12) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        if (cIdx === 14) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: remaining === 0 ? 'FFDCFCE7' : 'FFFEF3C7' },
          };
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: true,
            color: { argb: remaining === 0 ? 'FF15803D' : 'FFB45309' },
          };
        }
      });
    });

    const lastLateRow = firstLateRow + lateSummaryRows.length - 1;
    cursorRow = lastLateRow + 1;
    const totalRow = wsLate.getRow(cursorRow);
    totalRow.height = 26;

    wsLate.mergeCells(`A${cursorRow}:F${cursorRow}`);
    const totLbl = totalRow.getCell(1);
    totLbl.value = 'TOTAL KETERLAMBATAN & PENYELESAIAN';
    totLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    totLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    totLbl.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 6, THIN_BORDER);

    const lateTotalConfigs: { col: number; res: number; fmt?: string }[] = [
      { col: 7, res: sumLateCount },
      { col: 8, res: sumLateMins },
      { col: 9, res: sumLateCount > 0 ? Math.round(sumLateMins / sumLateCount) : 0 },
      { col: 10, res: Math.max(0, ...lateSummaryRows.map((x) => x.maxLateMinutes)) },
      { col: 11, res: sumWorkSettle },
      { col: 12, res: sumSalarySettle },
      { col: 13, res: sumDeductionRp, fmt: '#,##0' },
      { col: 14, res: sumRemaining },
    ];

    for (const ltc of lateTotalConfigs) {
      const cLetter = colLetter(ltc.col);
      const cell = totalRow.getCell(ltc.col);
      if (ltc.col === 9) {
        cell.value = { formula: `IFERROR(ROUND(H${cursorRow}/G${cursorRow},0),0)`, result: ltc.res };
      } else if (ltc.col === 10) {
        cell.value = { formula: `MAX(J${firstLateRow}:J${lastLateRow})`, result: ltc.res };
      } else {
        cell.value = { formula: `SUM(${cLetter}${firstLateRow}:${cLetter}${lastLateRow})`, result: ltc.res };
      }
      if (ltc.fmt) cell.numFmt = ltc.fmt;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.alignment = { horizontal: ltc.fmt ? 'right' : 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    }
    const statusTot = totalRow.getCell(15);
    statusTot.value = {
      formula: `IF(N${cursorRow}=0,"Semua Lunas","Ada Tunggakan")`,
      result: sumRemaining === 0 ? 'Semua Lunas' : 'Ada Tunggakan',
    };
    statusTot.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    statusTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    statusTot.alignment = { horizontal: 'center', vertical: 'middle' };
    statusTot.border = THIN_BORDER;

    const datesTot = totalRow.getCell(16);
    datesTot.value = `${lateDetailRows.length} kejadian terlambat`;
    datesTot.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF334155' } };
    datesTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    datesTot.alignment = { horizontal: 'center', vertical: 'middle' };
    datesTot.border = THIN_BORDER;

    cursorRow += 1;
  }

  wsLate.getRow(cursorRow).height = 12;
  cursorRow += 1; // spacer row

  // Section 2: Riwayat Cicilan & Potongan Gaji Keterlambatan
  wsLate.getRow(cursorRow).height = 24;
  wsLate.mergeCells(`A${cursorRow}:P${cursorRow}`);
  const sec2Hdr = wsLate.getCell(`A${cursorRow}`);
  sec2Hdr.value = '2. RIWAYAT CICILAN JAM KERJA & POTONGAN GAJI KETERLAMBATAN';
  sec2Hdr.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  sec2Hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  sec2Hdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 16, THIN_BORDER);
  cursorRow += 1;

  const settleHeaders = [
    { startCol: 1, endCol: 1, label: 'No' },
    { startCol: 2, endCol: 2, label: 'Tanggal Ganti' },
    { startCol: 3, endCol: 3, label: 'Nama Karyawan' },
    { startCol: 4, endCol: 5, label: 'Metode Penyelesaian' },
    { startCol: 6, endCol: 7, label: 'Menit Diganti' },
    { startCol: 8, endCol: 9, label: 'Jam Tambahan' },
    { startCol: 10, endCol: 11, label: 'Potongan Gaji (Rp)' },
    { startCol: 12, endCol: 16, label: 'Catatan Admin' },
  ];

  wsLate.getRow(cursorRow).height = 26;
  for (const sh of settleHeaders) {
    if (sh.endCol > sh.startCol) {
      wsLate.mergeCells(cursorRow, sh.startCol, cursorRow, sh.endCol);
    }
    const c = wsLate.getCell(cursorRow, sh.startCol);
    c.value = sh.label;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = {
      horizontal: sh.startCol === 1 || sh.startCol === 2 || (sh.startCol >= 6 && sh.startCol <= 11) ? 'center' : 'left',
      vertical: 'middle',
      wrapText: true,
    };
    applyBorderToRange(wsLate, cursorRow, sh.startCol, cursorRow, sh.endCol, THIN_BORDER);
  }
  cursorRow += 1;

  if (scopedMonthSettlements.length === 0) {
    wsLate.getRow(cursorRow).height = 24;
    wsLate.mergeCells(`A${cursorRow}:P${cursorRow}`);
    const emptySettle = wsLate.getCell(`A${cursorRow}`);
    emptySettle.value = 'Belum ada catatan cicilan jam kerja atau potongan gaji keterlambatan pada bulan ini.';
    emptySettle.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptySettle.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 16, LIGHT_BORDER);
    cursorRow += 1;
  } else {
    const methodColWidth = sumColWidths(lateWidths, 4, 5);
    const notesColWidth = sumColWidths(lateWidths, 12, 16);

    scopedMonthSettlements.forEach((st, idx) => {
      const r = cursorRow;
      const methodLabel =
        st.method === 'tambahan_jam_kerja' ? 'Tambahan Jam Kerja (Cicilan)' : 'Potongan Gaji';
      const extraWindow =
        st.method === 'tambahan_jam_kerja' && st.extraWorkStart && st.extraWorkEnd
          ? `${st.extraWorkStart} - ${st.extraWorkEnd}`
          : '-';
      const notesVal = st.notes || '-';

      wsLate.getRow(r).height = calcDynamicRowHeight(
        [
          { text: st.employeeName, width: lateWidths[2] },
          { text: methodLabel, width: methodColWidth },
          { text: notesVal, width: notesColWidth },
        ],
        23,
        15,
        8
      );

      wsLate.mergeCells(r, 4, r, 5);
      wsLate.mergeCells(r, 6, r, 7);
      wsLate.mergeCells(r, 8, r, 9);
      wsLate.mergeCells(r, 10, r, 11);
      wsLate.mergeCells(r, 12, r, 16);

      const rowBg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const mapping: {
        startCol: number;
        endCol: number;
        val: string | number;
        align: 'left' | 'center' | 'right';
        numFmt?: string;
        wrap?: boolean;
      }[] = [
        { startCol: 1, endCol: 1, val: idx + 1, align: 'center' },
        { startCol: 2, endCol: 2, val: st.date, align: 'center' },
        { startCol: 3, endCol: 3, val: st.employeeName, align: 'left', wrap: true },
        { startCol: 4, endCol: 5, val: methodLabel, align: 'left', wrap: true },
        { startCol: 6, endCol: 7, val: st.minutesSettled, align: 'center' },
        { startCol: 8, endCol: 9, val: extraWindow, align: 'center' },
        { startCol: 10, endCol: 11, val: st.deductionAmount || 0, align: 'right', numFmt: '#,##0' },
        { startCol: 12, endCol: 16, val: notesVal, align: 'left', wrap: true },
      ];

      for (const m of mapping) {
        const cell = wsLate.getCell(r, m.startCol);
        cell.value = m.val;
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' }, bold: m.startCol === 3 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = {
          horizontal: m.align,
          vertical: 'middle',
          wrapText: Boolean(m.wrap),
        };
        if (m.numFmt) cell.numFmt = m.numFmt;
        applyBorderToRange(wsLate, r, m.startCol, r, m.endCol, LIGHT_BORDER);
      }
      cursorRow += 1;
    });
  }

  wsLate.getRow(cursorRow).height = 12;
  cursorRow += 1; // spacer row

  // Section 3: Rincian Log Tanggal Terlambat
  wsLate.getRow(cursorRow).height = 24;
  wsLate.mergeCells(`A${cursorRow}:P${cursorRow}`);
  const sec3Hdr = wsLate.getCell(`A${cursorRow}`);
  sec3Hdr.value = '3. RINCIAN LOG TANGGAL KETERLAMBATAN KARYAWAN';
  sec3Hdr.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  sec3Hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  sec3Hdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 16, THIN_BORDER);
  cursorRow += 1;

  const logHeaders = [
    { startCol: 1, endCol: 1, label: 'No' },
    { startCol: 2, endCol: 2, label: 'Tanggal' },
    { startCol: 3, endCol: 3, label: 'Nama Karyawan' },
    { startCol: 4, endCol: 4, label: 'Divisi' },
    { startCol: 5, endCol: 5, label: 'Kode' },
    { startCol: 6, endCol: 7, label: 'Shift & Jam Kerja' },
    { startCol: 8, endCol: 9, label: 'Jam Masuk Aktual' },
    { startCol: 10, endCol: 11, label: 'Terlambat (Mnt)' },
    { startCol: 12, endCol: 16, label: 'Catatan Admin' },
  ];

  wsLate.getRow(cursorRow).height = 26;
  for (const lh of logHeaders) {
    if (lh.endCol > lh.startCol) {
      wsLate.mergeCells(cursorRow, lh.startCol, cursorRow, lh.endCol);
    }
    const c = wsLate.getCell(cursorRow, lh.startCol);
    c.value = lh.label;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = {
      horizontal: lh.startCol === 1 || lh.startCol === 2 || (lh.startCol >= 5 && lh.startCol <= 11) ? 'center' : 'left',
      vertical: 'middle',
      wrapText: true,
    };
    applyBorderToRange(wsLate, cursorRow, lh.startCol, cursorRow, lh.endCol, THIN_BORDER);
  }
  cursorRow += 1;

  if (lateDetailRows.length === 0) {
    wsLate.getRow(cursorRow).height = 24;
    wsLate.mergeCells(`A${cursorRow}:P${cursorRow}`);
    const emptyLog = wsLate.getCell(`A${cursorRow}`);
    emptyLog.value = 'Tidak ada log keterlambatan pada periode ini.';
    emptyLog.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptyLog.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(wsLate, cursorRow, 1, cursorRow, 16, LIGHT_BORDER);
  } else {
    const shiftLogWidth = sumColWidths(lateWidths, 6, 7);
    const notesLogWidth = sumColWidths(lateWidths, 12, 16);

    lateDetailRows.forEach((d, idx) => {
      const r = cursorRow;
      const shiftStr = `${d.emp.shiftName} (${d.emp.shiftStart}-${d.emp.shiftEnd}, tol. ${d.tolerance}m)`;
      const notesStr = d.rec.notes || '-';

      wsLate.getRow(r).height = calcDynamicRowHeight(
        [
          { text: d.emp.name, width: lateWidths[2] },
          { text: d.emp.department, width: lateWidths[3] },
          { text: shiftStr, width: shiftLogWidth },
          { text: notesStr, width: notesLogWidth },
        ],
        23,
        15,
        8
      );

      wsLate.mergeCells(r, 6, r, 7);
      wsLate.mergeCells(r, 8, r, 9);
      wsLate.mergeCells(r, 10, r, 11);
      wsLate.mergeCells(r, 12, r, 16);

      const rowBg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const mapping: {
        startCol: number;
        endCol: number;
        val: string | number;
        align: 'left' | 'center';
        wrap?: boolean;
      }[] = [
        { startCol: 1, endCol: 1, val: idx + 1, align: 'center' },
        { startCol: 2, endCol: 2, val: d.rec.date, align: 'center' },
        { startCol: 3, endCol: 3, val: d.emp.name, align: 'left', wrap: true },
        { startCol: 4, endCol: 4, val: d.emp.department, align: 'left', wrap: true },
        { startCol: 5, endCol: 5, val: d.emp.employeeCode, align: 'center' },
        { startCol: 6, endCol: 7, val: shiftStr, align: 'center', wrap: true },
        { startCol: 8, endCol: 9, val: d.rec.checkIn || '-', align: 'center' },
        { startCol: 10, endCol: 11, val: d.lateMinutes, align: 'center' },
        { startCol: 12, endCol: 16, val: notesStr, align: 'left', wrap: true },
      ];

      for (const m of mapping) {
        const cell = wsLate.getCell(r, m.startCol);
        cell.value = m.val;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: m.startCol === 3 || m.startCol === 10,
          color: { argb: m.startCol === 10 ? 'FFB45309' : 'FF0F172A' },
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = {
          horizontal: m.align,
          vertical: 'middle',
          wrapText: Boolean(m.wrap),
        };
        applyBorderToRange(wsLate, r, m.startCol, r, m.endCol, LIGHT_BORDER);
      }
      cursorRow += 1;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Daftar-Hadir-Karyawan-${meta.monthName}-${meta.year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
