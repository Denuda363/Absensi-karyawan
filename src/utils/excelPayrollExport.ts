import ExcelJS from 'exceljs';
import {
  CompanyProfile,
  getMonthMetadata,
  PayrollAdjustment,
  SalaryRaiseRecord,
} from '../types';
import { EmployeePayrollCalculation } from './payrollCalculator';

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

export async function exportPayrollToExcel(params: {
  rows: EmployeePayrollCalculation[];
  adjustments: PayrollAdjustment[];
  salaryRaises?: SalaryRaiseRecord[];
  yearMonth: string;
  departmentFilter?: string;
  companyName?: string;
  companyProfile?: CompanyProfile;
}): Promise<void> {
  const {
    rows,
    adjustments,
    salaryRaises = [],
    yearMonth,
    departmentFilter,
    companyName = 'KARYAPRESENSI',
    companyProfile,
  } = params;

  const meta = getMonthMetadata(yearMonth);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${companyName} Payroll`;
  workbook.created = new Date();

  const legalName = companyProfile?.legalName?.trim() || companyName.toUpperCase();
  const companyContactLine = [
    companyProfile?.address,
    companyProfile?.city,
    companyProfile?.phone ? `Telp: ${companyProfile.phone}` : '',
    companyProfile?.taxId ? `NPWP: ${companyProfile.taxId}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  // =========================================================================
  // SHEET 1: REKAP GAJI KARYAWAN
  // =========================================================================
  const ws = workbook.addWorksheet('Rekap Gaji Karyawan', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 8 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const colWidths = [
    6,  // A: No
    12, // B: Kode
    24, // C: Nama Karyawan
    20, // D: Divisi & Jabatan
    12, // E: Tgl Gajian
    12, // F: Hadir / Efektif
    11, // G: Lembur (Jam)
    16, // H: Gaji Pokok
    16, // I: Tunj. Jabatan
    16, // J: Tunj. Transp/Mkn
    15, // K: Tunj. Lain Tetap
    15, // L: Uang Lembur
    16, // M: Bonus & Tambahan
    18, // N: Total Bruto
    15, // O: Pot. Telat
    15, // P: Pot. Alpha/Izin
    14, // Q: Pot. BPJS
    15, // R: Pot. Lainnya
    19, // S: Gaji Bersih (THP)
    17, // T: Pembayaran
    13, // U: Status
  ];
  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  const LAST_COL = colWidths.length; // 21 (U)
  const THP_COL_IDX = 18; // 0-based index for col S (19)
  const CURRENCY_FMT = '"Rp "#,##0;-"Rp "#,##0;"Rp 0"';

  // Row 1-3: Corporate Header
  ws.mergeCells(1, 1, 1, LAST_COL);
  const cTitle = ws.getCell(1, 1);
  cTitle.value = `${legalName} — REKAPITULASI GAJI KARYAWAN (DOKUMEN RAHASIA)`;
  cTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, LAST_COL);
  const cSub = ws.getCell(2, 1);
  cSub.value = companyContactLine || companyName;
  cSub.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF334155' } };
  cSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cSub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.mergeCells(3, 1, 3, LAST_COL);
  const cPeriod = ws.getCell(3, 1);
  const deptLabel =
    departmentFilter && departmentFilter !== 'all'
      ? `Divisi: ${departmentFilter}`
      : 'Semua Divisi';
  cPeriod.value = `Periode: ${meta.monthName} ${meta.year}  |  ${deptLabel}  |  Jumlah Karyawan: ${rows.length} orang`;
  cPeriod.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF1E3A8A' } };
  cPeriod.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  cPeriod.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 22;

  ws.getRow(4).height = 10;

  // Row 5-6: Summary KPI strip
  const totalGross = rows.reduce((a, r) => a + r.grossSalary, 0);
  const totalDeduction = rows.reduce((a, r) => a + r.totalDeductions, 0);
  const totalNet = rows.reduce((a, r) => a + r.netSalary, 0);
  const paidCount = rows.filter((r) => r.status === 'dibayar').length;

  const kpiPairs: [number, number, string, number | string, string][] = [
    [1, 5, 'TOTAL PENDAPATAN BRUTO', totalGross, 'FFEFF6FF'],
    [6, 10, 'TOTAL POTONGAN', totalDeduction, 'FFFEF2F2'],
    [11, 16, 'TOTAL GAJI BERSIH (THP)', totalNet, 'FFECFDF5'],
    [17, 21, 'STATUS DIBAYAR', `${paidCount} dari ${rows.length} Karyawan`, 'FFF8FAFC'],
  ];

  ws.getRow(5).height = 18;
  ws.getRow(6).height = 24;
  for (const [cStart, cEnd, label, val, bg] of kpiPairs) {
    ws.mergeCells(5, cStart, 5, cEnd);
    ws.mergeCells(6, cStart, 6, cEnd);
    const lblCell = ws.getCell(5, cStart);
    lblCell.value = label;
    lblCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: 'FF475569' } };
    lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    lblCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const valCell = ws.getCell(6, cStart);
    valCell.value = val;
    if (typeof val === 'number') {
      valCell.numFmt = CURRENCY_FMT;
    }
    valCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    valCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderToRange(ws, 5, cStart, 6, cEnd, LIGHT_BORDER);
  }

  ws.getRow(7).height = 10;

  // Row 8: Table Header
  const headers = [
    'No',
    'Kode',
    'Nama Karyawan',
    'Divisi & Jabatan',
    'Tgl Gajian',
    'Hadir / Efektif',
    'Lembur (Jam)',
    'Gaji Pokok',
    'Tunj. Jabatan',
    'Tunj. Transp/Mkn',
    'Tunj. Lain Tetap',
    'Uang Lembur',
    'Bonus & Tambahan',
    'Total Bruto',
    'Pot. Terlambat',
    'Pot. Alpha/Izin',
    'Pot. BPJS',
    'Pot. Lainnya',
    'Gaji Bersih (THP)',
    'Rekening / Metode',
    'Status Bayar',
  ];
  ws.getRow(8).height = 30;
  headers.forEach((h, idx) => {
    const cell = ws.getCell(8, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: idx === THP_COL_IDX ? 'FF065F46' : 'FF1E3A8A' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });

  // Data Rows
  let curRow = 9;
  rows.forEach((item, idx) => {
    const bgColor = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    const paymentText =
      item.profile.paymentMethod === 'tunai'
        ? 'Tunai'
        : [item.profile.bankName, item.profile.bankAccountNumber]
            .filter(Boolean)
            .join(' • ') || 'Transfer';
    const statusText =
      item.status === 'dibayar'
        ? 'Dibayar'
        : item.status === 'disetujui'
        ? 'Disetujui'
        : 'Draft';

    const values: (string | number)[] = [
      idx + 1,
      item.employee.employeeCode,
      item.employee.name,
      `${item.employee.department}\n${item.employee.position}`,
      `Tgl ${item.paydayDay}`,
      `${item.presentDays} / ${item.effectiveWorkDays}`,
      item.overtimeHours,
      item.baseSalary,
      item.positionAllowance,
      item.transportMealAllowance,
      item.otherAllowance,
      item.overtimePay,
      item.totalBonus + item.totalExtraAllowance,
      item.grossSalary,
      item.totalLateDeduction,
      item.alphaDeduction + item.izinDeduction,
      item.bpjsKesehatanDeduction + item.bpjsTkDeduction,
      item.totalOtherDeduction,
      item.netSalary,
      paymentText,
      statusText,
    ];

    ws.getRow(curRow).height = 28;
    values.forEach((v, colIdx) => {
      const cell = ws.getCell(curRow, colIdx + 1);
      cell.value = v;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colIdx === THP_COL_IDX ? 'FFECFDF5' : bgColor },
      };
      cell.border = LIGHT_BORDER;

      if (colIdx >= 7 && colIdx <= 18) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 13 || colIdx === THP_COL_IDX,
          color: {
            argb:
              colIdx === THP_COL_IDX
                ? 'FF065F46'
                : colIdx >= 14 && colIdx <= 17 && Number(v) > 0
                ? 'FFB91C1C'
                : 'FF0F172A',
          },
        };
      } else if (
        colIdx === 0 ||
        colIdx === 1 ||
        colIdx === 4 ||
        colIdx === 5 ||
        colIdx === 6 ||
        colIdx === 20
      ) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 4 || colIdx === 20,
          color: {
            argb:
              colIdx === 20
                ? item.status === 'dibayar'
                  ? 'FF047857'
                  : item.status === 'disetujui'
                  ? 'FF1D4ED8'
                  : 'FF475569'
                : 'FF0F172A',
          },
        };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: colIdx === 2,
          color: { argb: 'FF0F172A' },
        };
      }
    });

    curRow += 1;
  });

  // Total Row
  const sumField = (fn: (r: EmployeePayrollCalculation) => number) =>
    rows.reduce((acc, r) => acc + fn(r), 0);

  const totalsRowValues: (string | number)[] = [
    '',
    'TOTAL',
    `${rows.length} Karyawan`,
    '',
    '',
    '',
    Math.round(sumField((r) => r.overtimeHours) * 10) / 10,
    sumField((r) => r.baseSalary),
    sumField((r) => r.positionAllowance),
    sumField((r) => r.transportMealAllowance),
    sumField((r) => r.otherAllowance),
    sumField((r) => r.overtimePay),
    sumField((r) => r.totalBonus + r.totalExtraAllowance),
    sumField((r) => r.grossSalary),
    sumField((r) => r.totalLateDeduction),
    sumField((r) => r.alphaDeduction + r.izinDeduction),
    sumField((r) => r.bpjsKesehatanDeduction + r.bpjsTkDeduction),
    sumField((r) => r.totalOtherDeduction),
    sumField((r) => r.netSalary),
    '',
    '',
  ];

  ws.getRow(curRow).height = 26;
  totalsRowValues.forEach((v, colIdx) => {
    const cell = ws.getCell(curRow, colIdx + 1);
    cell.value = v;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colIdx === THP_COL_IDX ? 'FF065F46' : 'FFE2E8F0' },
    };
    cell.border = THIN_BORDER;
    cell.font = {
      name: 'Calibri',
      size: 10.5,
      bold: true,
      color: { argb: colIdx === THP_COL_IDX ? 'FFFFFFFF' : 'FF0F172A' },
    };
    if (colIdx >= 7 && colIdx <= 18) {
      cell.numFmt = CURRENCY_FMT;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (colIdx === 1 || colIdx === 6) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }
  });

  // Sign-off Block
  const signRow = curRow + 3;
  const cityText = companyProfile?.city?.split(',')[0]?.trim() || 'Jakarta';
  const hrName = companyProfile?.hrManagerName || 'Manajer HRD';
  const hrTitle = companyProfile?.hrManagerTitle || 'Manajer Sumber Daya Manusia';
  const dirName = companyProfile?.directorName || 'Direktur Utama';

  ws.mergeCells(signRow, 2, signRow, 6);
  ws.getCell(signRow, 2).value = 'Disiapkan Oleh,';
  ws.getCell(signRow, 2).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };

  ws.mergeCells(signRow, 15, signRow, 20);
  ws.getCell(signRow, 15).value = `${cityText}, ${new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
  ws.getCell(signRow, 15).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
  ws.getCell(signRow, 15).alignment = { horizontal: 'center' };

  ws.mergeCells(signRow + 1, 2, signRow + 1, 6);
  ws.getCell(signRow + 1, 2).value = hrTitle;
  ws.getCell(signRow + 1, 2).font = { name: 'Calibri', size: 10, bold: true };

  ws.mergeCells(signRow + 1, 15, signRow + 1, 20);
  ws.getCell(signRow + 1, 15).value = 'Disetujui Oleh, Direktur / Pimpinan';
  ws.getCell(signRow + 1, 15).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(signRow + 1, 15).alignment = { horizontal: 'center' };

  ws.mergeCells(signRow + 5, 2, signRow + 5, 6);
  ws.getCell(signRow + 5, 2).value = hrName;
  ws.getCell(signRow + 5, 2).font = { name: 'Calibri', size: 10, bold: true, underline: true };

  ws.mergeCells(signRow + 5, 15, signRow + 5, 20);
  ws.getCell(signRow + 5, 15).value = dirName;
  ws.getCell(signRow + 5, 15).font = { name: 'Calibri', size: 10, bold: true, underline: true };
  ws.getCell(signRow + 5, 15).alignment = { horizontal: 'center' };

  // =========================================================================
  // SHEET 2: RINCIAN BONUS, TUNJANGAN TAMBAHAN & POTONGAN
  // =========================================================================
  const ws2 = workbook.addWorksheet('Bonus, Tunj. & Potongan', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  const s2Widths = [6, 13, 24, 20, 12, 26, 18, 28];
  s2Widths.forEach((w, idx) => {
    ws2.getColumn(idx + 1).width = w;
  });

  ws2.mergeCells(1, 1, 1, 8);
  const s2Title = ws2.getCell(1, 1);
  s2Title.value = `${legalName} — RINCIAN BONUS, TUNJANGAN TAMBAHAN & POTONGAN (${meta.monthName.toUpperCase()} ${meta.year})`;
  s2Title.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  s2Title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 26;

  ws2.getRow(2).height = 10;

  const s2Headers = ['No', 'Tanggal', 'Nama Karyawan', 'Jenis', 'Periode', 'Keterangan', 'Nominal', 'Catatan'];
  ws2.getRow(3).height = 24;
  s2Headers.forEach((h, idx) => {
    const cell = ws2.getCell(3, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  const scopedEmpIds = new Set(rows.map((r) => r.employee.id));
  const monthAdjustments = adjustments
    .filter((a) => a.yearMonth === yearMonth && scopedEmpIds.has(a.employeeId))
    .sort((a, b) => b.date.localeCompare(a.date));

  let r2 = 4;
  if (monthAdjustments.length === 0) {
    ws2.mergeCells(4, 1, 4, 8);
    const emptyCell = ws2.getCell(4, 1);
    emptyCell.value = 'Belum ada catatan bonus, tunjangan tambahan, atau potongan pada periode ini.';
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(4).height = 26;
    applyBorderToRange(ws2, 4, 1, 4, 8, LIGHT_BORDER);
  } else {
    monthAdjustments.forEach((adj, idx) => {
      ws2.getRow(r2).height = 22;
      const typeLabel =
        adj.type === 'bonus'
          ? 'Bonus / Insentif'
          : adj.type === 'tunjangan'
          ? 'Tunjangan / Lainnya'
          : 'Potongan / Kasbon';
      const rowVals: (string | number)[] = [
        idx + 1,
        adj.date,
        adj.employeeName,
        typeLabel,
        adj.yearMonth,
        adj.title,
        adj.amount,
        adj.notes || '—',
      ];
      rowVals.forEach((v, cIdx) => {
        const cell = ws2.getCell(r2, cIdx + 1);
        cell.value = v;
        cell.border = LIGHT_BORDER;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 6,
          color: {
            argb:
              cIdx === 3 || cIdx === 6
                ? adj.type === 'potongan'
                  ? 'FFB91C1C'
                  : adj.type === 'tunjangan'
                  ? 'FF1D4ED8'
                  : 'FF047857'
                : 'FF0F172A',
          },
        };
        if (cIdx === 6) {
          cell.numFmt = CURRENCY_FMT;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (cIdx === 0 || cIdx === 1 || cIdx === 3 || cIdx === 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      });
      r2 += 1;
    });
  }

  // =========================================================================
  // SHEET 3: RIWAYAT KENAIKAN GAJI
  // =========================================================================
  const ws3 = workbook.addWorksheet('Riwayat Kenaikan Gaji', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  const s3Widths = [6, 13, 13, 24, 18, 18, 16, 14, 24, 28];
  s3Widths.forEach((w, idx) => {
    ws3.getColumn(idx + 1).width = w;
  });

  ws3.mergeCells(1, 1, 1, 10);
  const s3Title = ws3.getCell(1, 1);
  s3Title.value = `${legalName} — RIWAYAT PENYESUAIAN & KENAIKAN GAJI KARYAWAN`;
  s3Title.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  s3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  s3Title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getRow(1).height = 26;
  ws3.getRow(2).height = 10;

  const s3Headers = [
    'No',
    'Tgl SK',
    'Efektif Bln',
    'Nama Karyawan',
    'Gaji Pokok Lama',
    'Gaji Pokok Baru',
    'Selisih Naik',
    'Metode',
    'Alasan / SK',
    'Catatan',
  ];
  ws3.getRow(3).height = 24;
  s3Headers.forEach((h, idx) => {
    const cell = ws3.getCell(3, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  const sortedRaises = [...salaryRaises]
    .filter((sr) => scopedEmpIds.has(sr.employeeId))
    .sort((a, b) => (b.raiseDate || '').localeCompare(a.raiseDate || ''));

  let r3 = 4;
  if (sortedRaises.length === 0) {
    ws3.mergeCells(4, 1, 4, 10);
    const empty3 = ws3.getCell(4, 1);
    empty3.value = 'Belum ada riwayat kenaikan gaji karyawan yang tercatat.';
    empty3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    empty3.alignment = { horizontal: 'center', vertical: 'middle' };
    ws3.getRow(4).height = 26;
    applyBorderToRange(ws3, 4, 1, 4, 10, LIGHT_BORDER);
  } else {
    sortedRaises.forEach((sr, idx) => {
      ws3.getRow(r3).height = 24;
      const diffBase = sr.newBaseSalary - sr.previousBaseSalary;
      const methodText =
        sr.method === 'persentase' && sr.percentIncrease !== undefined
          ? `+${sr.percentIncrease}%`
          : 'Nominal';
      const vals: (string | number)[] = [
        idx + 1,
        sr.raiseDate,
        sr.effectiveMonth,
        sr.employeeName,
        sr.previousBaseSalary,
        sr.newBaseSalary,
        diffBase,
        methodText,
        sr.reason,
        sr.notes || '—',
      ];
      vals.forEach((v, cIdx) => {
        const cell = ws3.getCell(r3, cIdx + 1);
        cell.value = v;
        cell.border = LIGHT_BORDER;
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 5 || cIdx === 6,
          color: {
            argb: cIdx === 6 ? (diffBase >= 0 ? 'FF047857' : 'FFB91C1C') : 'FF0F172A',
          },
        };
        if (cIdx >= 4 && cIdx <= 6) {
          cell.numFmt = CURRENCY_FMT;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (cIdx === 0 || cIdx === 1 || cIdx === 2 || cIdx === 7) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      });
      r3 += 1;
    });
  }

  // Trigger Browser Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Rekap-Gaji-Karyawan-${meta.monthName}-${meta.year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
