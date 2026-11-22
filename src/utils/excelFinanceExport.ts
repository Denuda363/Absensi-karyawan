import ExcelJS from 'exceljs';
import {
  CompanyProfile,
  Employee,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransfer,
  getCurrentYearMonth,
  getDayOfWeekFromDateStr,
  getDaysInMonth,
} from '../types';

const BLACK_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF94A3B8' },
};

const YELLOW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

const SUNDAY_RED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFF0000' },
};

const FONT_NAME = 'Arial';
const NUM_FMT = '#,##0;-#,##0;"-"';
const NUM_FMT_PLAIN = '#,##0';
const CURRENCY_RP_FMT = '"Rp"#,##0;-"Rp"#,##0;"Rp"0';
const LONG_DATE_FMT = 'dddd, mmmm d, yyyy';

function toExcelUtcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

function formatMonthApostrophe(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  const monthName = dt.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${monthName} '${String(y).slice(-2)}`;
}

function formatShortDdMm(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[2])}/${Number(parts[1])}`;
}

function applyRangeStyle(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  opts: {
    border?: Partial<ExcelJS.Borders>;
    fill?: ExcelJS.Fill;
    font?: Partial<ExcelJS.Font>;
    alignment?: Partial<ExcelJS.Alignment>;
  }
): void {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      if (opts.border) cell.border = opts.border;
      if (opts.fill) cell.fill = opts.fill;
      if (opts.font) cell.font = { name: FONT_NAME, size: 10, ...opts.font };
      if (opts.alignment) cell.alignment = opts.alignment;
    }
  }
}

function isDistributorExpense(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryId} ${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /stok|supplier|dist|distribusi|distributor|pbf|faktur|tagihan barang|kulak|grosir|kulakan/.test(
    text
  );
}

function isTukarIncome(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /\btukar\b|penukaran/.test(text);
}

function isBonusOrKasbonIncome(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /\bcn\b|bonus|kasbon|cashback|komisi|cicil|pinjam|pelunasan|angsuran/.test(text);
}

function isSalaryExpense(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /\bgaji\b|\bupah\b|\bhonor\b|\bpayroll\b|\bsalary\b|\bthr\b/.test(text);
}

function isLoanOrKasbonKeyword(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /pinjam|obos|cicil|angsuran|kasbon|piutang|hutang/.test(text);
}

function isInstallmentExpense(tx: FinanceTransaction): boolean {
  const text = `${tx.categoryName} ${tx.title} ${tx.notes}`.toLowerCase();
  return /cicil|angsuran|kredit|leasing/.test(text);
}

function shortAccountLabel(acc: FinanceAccount): string {
  const raw = (acc.bankName || acc.name || 'AKUN').trim();
  if (/kas tunai/i.test(raw)) return 'KAS';
  return raw.toUpperCase();
}

export interface ExportFinanceExcelParams {
  transactions: FinanceTransaction[];
  allTransactions?: FinanceTransaction[];
  categories: FinanceCategory[];
  accounts?: FinanceAccount[];
  transfers?: FinanceTransfer[];
  employees?: Employee[];
  selectedMonth?: string;
  periodMode?: 'month' | 'all';
  periodLabel: string;
  fileSlug: string;
  companyName?: string;
  companyProfile?: CompanyProfile;
}

export function buildFinanceExcelWorkbook(params: ExportFinanceExcelParams): {
  workbook: ExcelJS.Workbook;
  filename: string;
} {
  const {
    transactions,
    allTransactions = transactions,
    accounts = [],
    transfers = [],
    employees = [],
    selectedMonth,
    periodMode = 'month',
    fileSlug,
    companyName = 'KARYAPRESENSI',
  } = params;

  // Determine target month (YYYY-MM) for the 5-sheet monthly workbook
  const resolveTargetMonth = (): string => {
    if (periodMode === 'month' && selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      return selectedMonth;
    }
    const candidateMonths = [
      ...allTransactions.map((t) => t.date.slice(0, 7)),
      ...transfers.map((tr) => tr.date.slice(0, 7)),
    ]
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort();
    if (candidateMonths.length > 0) {
      return candidateMonths[candidateMonths.length - 1];
    }
    return selectedMonth || getCurrentYearMonth();
  };

  const targetMonth = resolveTargetMonth();
  const monthDates = getDaysInMonth(targetMonth);
  const firstDateOfMonth = `${targetMonth}-01`;

  const monthTransactions = allTransactions.filter((tx) => tx.date.startsWith(targetMonth));
  const monthTransfers = transfers.filter((tr) => tr.date.startsWith(targetMonth));

  // Opening total balance entering targetMonth (all accounts openingBalance + prior transactions)
  let openingCompanyBalance = accounts.reduce((sum, a) => sum + (a.openingBalance || 0), 0);
  for (const tx of allTransactions) {
    if (tx.date < firstDateOfMonth) {
      openingCompanyBalance += tx.type === 'pendapatan' ? tx.amount : -tx.amount;
    }
  }

  // Opening balance per account entering targetMonth
  const computeAccountOpening = (acc: FinanceAccount): number => {
    let bal = acc.openingBalance || 0;
    for (const tx of allTransactions) {
      if (tx.date < firstDateOfMonth && tx.accountId === acc.id) {
        bal += tx.type === 'pendapatan' ? tx.amount : -tx.amount;
      }
    }
    for (const tr of transfers) {
      if (tr.date < firstDateOfMonth) {
        if (tr.toAccountId === acc.id) bal += tr.amount;
        if (tr.fromAccountId === acc.id) bal -= tr.amount;
      }
    }
    return bal;
  };

  const cashAccounts = accounts.filter((a) => a.kind === 'cash');
  const bankAccounts = accounts.filter((a) => a.kind === 'rekening');
  const primaryCashOpening = cashAccounts.reduce((s, a) => s + computeAccountOpening(a), 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${companyName} Finance`;
  workbook.created = new Date();

  // Create the 5 worksheets in the exact tab order of the reference template
  const wsOmset = workbook.addWorksheet('OMSET + PROFIT', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const wsDetail = workbook.addWorksheet('detail pengeluaran', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const wsShare = workbook.addWorksheet('SHARE BU BOS', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const wsRekapan = workbook.addWorksheet('rekapan obos', {
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const wsGaji = workbook.addWorksheet('gaji', {
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  // =========================================================================
  // 1. POPULATE SHEET 2 ("detail pengeluaran") FIRST TO RECORD EXACT CELL REFS
  // =========================================================================
  const bankColCount = Math.max(1, bankAccounts.length);
  const transferStartCol = 7 + bankColCount; // G + bankColCount
  const kasBalanceCol = transferStartCol + bankColCount;
  const detailTotalCols = kasBalanceCol;

  const detailWidths: number[] = [28, 24, 15, 26, 15, 4];
  for (let i = 0; i < bankColCount; i++) detailWidths.push(15);
  for (let i = 0; i < bankColCount; i++) detailWidths.push(15);
  detailWidths.push(18);
  detailWidths.forEach((w, idx) => {
    wsDetail.getColumn(idx + 1).width = w;
  });

  // Detail Header Rows 1-2
  wsDetail.getRow(1).height = 22;
  wsDetail.getRow(2).height = 20;

  wsDetail.mergeCells(1, 1, 2, 1);
  wsDetail.getCell(1, 1).value = 'TANGGAL';

  wsDetail.mergeCells(1, 2, 1, 5);
  wsDetail.getCell(1, 2).value = 'PENGELUARAN';
  wsDetail.getCell(2, 2).value = 'Nama distribusi';
  wsDetail.getCell(2, 3).value = 'jumlah';
  wsDetail.getCell(2, 4).value = 'nama';
  wsDetail.getCell(2, 5).value = 'jumlah';

  wsDetail.mergeCells(1, 6, 2, 6);
  wsDetail.getCell(1, 6).value = '';

  if (bankAccounts.length > 0) {
    bankAccounts.forEach((acc, i) => {
      const col = 7 + i;
      wsDetail.mergeCells(1, col, 2, col);
      wsDetail.getCell(1, col).value = shortAccountLabel(acc);
    });
    if (bankAccounts.length > 1) {
      wsDetail.mergeCells(1, transferStartCol, 1, transferStartCol + bankColCount - 1);
    }
    wsDetail.getCell(1, transferStartCol).value = 'PEMINDAHAN';
    bankAccounts.forEach((acc, i) => {
      wsDetail.getCell(2, transferStartCol + i).value = shortAccountLabel(acc);
    });
  } else {
    wsDetail.mergeCells(1, 7, 2, 7);
    wsDetail.getCell(1, 7).value = 'REKENING';
    wsDetail.getCell(1, transferStartCol).value = 'PEMINDAHAN';
    wsDetail.getCell(2, transferStartCol).value = 'REKENING';
  }

  wsDetail.getCell(1, kasBalanceCol).value =
    cashAccounts.length > 0 ? shortAccountLabel(cashAccounts[0]) : 'KAS';
  const kasHeaderValCell = wsDetail.getCell(2, kasBalanceCol);
  kasHeaderValCell.value = primaryCashOpening;
  kasHeaderValCell.numFmt = NUM_FMT_PLAIN;

  applyRangeStyle(wsDetail, 1, 1, 2, detailTotalCols, {
    border: BLACK_BORDER,
    fill: HEADER_FILL,
    font: { bold: true, color: { argb: 'FF000000' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  });

  interface DetailDayRef {
    dateStr: string;
    distSubCell: string;
    opSubCell: string;
    distSum: number;
    opSum: number;
    opLabels: string[];
  }
  const detailDayMap = new Map<string, DetailDayRef>();
  const detailDistSubCells: string[] = [];
  const detailOpSubCells: string[] = [];

  let detailRow = 3;
  let runningKasBalance = primaryCashOpening;
  let totalDistMonth = 0;
  let totalOpMonth = 0;

  for (const dateStr of monthDates) {
    const dayExpenses = monthTransactions.filter(
      (tx) => tx.date === dateStr && tx.type === 'pengeluaran'
    );
    const dayIncome = monthTransactions.filter(
      (tx) => tx.date === dateStr && tx.type === 'pendapatan'
    );
    const dayTransfers = monthTransfers.filter((tr) => tr.date === dateStr);

    const distItems = dayExpenses.filter((tx) => isDistributorExpense(tx));
    const opItems = dayExpenses.filter((tx) => !isDistributorExpense(tx));
    const itemCount = Math.max(1, distItems.length, opItems.length);
    const startRow = detailRow;
    const endItemRow = startRow + itemCount - 1;
    const subRow = endItemRow + 1;
    const totRow = subRow + 1;

    // Update running cash balance on this day
    for (const tx of dayIncome) {
      if (tx.method === 'cash') runningKasBalance += tx.amount;
    }
    for (const tx of dayExpenses) {
      if (tx.method === 'cash') runningKasBalance -= tx.amount;
    }
    for (const tr of dayTransfers) {
      const fromIsCash = cashAccounts.some((c) => c.id === tr.fromAccountId);
      const toIsCash = cashAccounts.some((c) => c.id === tr.toAccountId);
      if (toIsCash) runningKasBalance += tr.amount;
      if (fromIsCash) runningKasBalance -= tr.amount;
    }

    for (let i = 0; i < itemCount; i++) {
      const r = startRow + i;
      wsDetail.getRow(r).height = 19;

      if (i === 0) {
        const dtCell = wsDetail.getCell(r, 1);
        dtCell.value = toExcelUtcDate(dateStr);
        dtCell.numFmt = LONG_DATE_FMT;
        dtCell.alignment = { horizontal: 'left', vertical: 'middle' };

        // Bank columns: net tx inflow/outflow on each bank
        bankAccounts.forEach((acc, bIdx) => {
          let netBankTx = 0;
          for (const tx of dayIncome) {
            if (tx.accountId === acc.id) netBankTx += tx.amount;
          }
          for (const tx of dayExpenses) {
            if (tx.accountId === acc.id) netBankTx -= tx.amount;
          }
          if (netBankTx !== 0) {
            const c = wsDetail.getCell(r, 7 + bIdx);
            c.value = netBankTx;
            c.numFmt = NUM_FMT_PLAIN;
            c.alignment = { horizontal: 'right', vertical: 'middle' };
          }

          let netBankTr = 0;
          for (const tr of dayTransfers) {
            if (tr.toAccountId === acc.id) netBankTr += tr.amount;
            if (tr.fromAccountId === acc.id) netBankTr -= tr.amount;
          }
          if (netBankTr !== 0) {
            const c = wsDetail.getCell(r, transferStartCol + bIdx);
            c.value = netBankTr;
            c.numFmt = NUM_FMT_PLAIN;
            c.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });

        const hasCashActivity =
          dayIncome.some((t) => t.method === 'cash') ||
          dayExpenses.some((t) => t.method === 'cash') ||
          dayTransfers.some(
            (tr) =>
              cashAccounts.some((c) => c.id === tr.fromAccountId) ||
              cashAccounts.some((c) => c.id === tr.toAccountId)
          );
        if (hasCashActivity || primaryCashOpening !== 0) {
          const kc = wsDetail.getCell(r, kasBalanceCol);
          kc.value = runningKasBalance;
          kc.numFmt = NUM_FMT_PLAIN;
          kc.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      }

      const dItem = distItems[i];
      if (dItem) {
        const label = dItem.counterparty?.trim()
          ? `${dItem.title} (${dItem.counterparty.trim()})`
          : dItem.title;
        wsDetail.getCell(r, 2).value = label;
        wsDetail.getCell(r, 2).alignment = { horizontal: 'left', vertical: 'middle' };
        const amtCell = wsDetail.getCell(r, 3);
        amtCell.value = dItem.amount;
        amtCell.numFmt = NUM_FMT_PLAIN;
        amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
      }

      const oItem = opItems[i];
      if (oItem) {
        wsDetail.getCell(r, 4).value = oItem.title;
        wsDetail.getCell(r, 4).alignment = { horizontal: 'left', vertical: 'middle' };
        const amtCell = wsDetail.getCell(r, 5);
        amtCell.value = oItem.amount;
        amtCell.numFmt = NUM_FMT_PLAIN;
        amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
      }

      applyRangeStyle(wsDetail, r, 1, r, detailTotalCols, {
        border: BLACK_BORDER,
        font: { color: { argb: 'FF000000' } },
      });
    }

    const distSum = distItems.reduce((s, t) => s + t.amount, 0);
    const opSum = opItems.reduce((s, t) => s + t.amount, 0);
    totalDistMonth += distSum;
    totalOpMonth += opSum;

    // Yellow Subtotal Row
    wsDetail.getRow(subRow).height = 20;
    applyRangeStyle(wsDetail, subRow, 1, subRow, detailTotalCols, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });

    const distSubCell = wsDetail.getCell(subRow, 3);
    distSubCell.value = {
      formula: `SUM(C${startRow}:C${endItemRow})`,
      result: distSum,
    };
    distSubCell.numFmt = NUM_FMT_PLAIN;
    distSubCell.fill = YELLOW_FILL;
    distSubCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
    distSubCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const opSubCell = wsDetail.getCell(subRow, 5);
    opSubCell.value = {
      formula: `SUM(E${startRow}:E${endItemRow})`,
      result: opSum,
    };
    opSubCell.numFmt = NUM_FMT_PLAIN;
    opSubCell.fill = YELLOW_FILL;
    opSubCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
    opSubCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Combined Daily Total Row (yellow on col E)
    wsDetail.getRow(totRow).height = 20;
    applyRangeStyle(wsDetail, totRow, 1, totRow, detailTotalCols, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });
    const combinedCell = wsDetail.getCell(totRow, 5);
    combinedCell.value = {
      formula: `C${subRow}+E${subRow}`,
      result: distSum + opSum,
    };
    combinedCell.numFmt = NUM_FMT_PLAIN;
    combinedCell.fill = YELLOW_FILL;
    combinedCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
    combinedCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Blank separator row with clean borders across table columns
    const sepRow = totRow + 1;
    wsDetail.getRow(sepRow).height = 14;
    applyRangeStyle(wsDetail, sepRow, 1, sepRow, detailTotalCols, {
      border: BLACK_BORDER,
    });

    detailDayMap.set(dateStr, {
      dateStr,
      distSubCell: `C${subRow}`,
      opSubCell: `E${subRow}`,
      distSum,
      opSum,
      opLabels: opItems.map((o) => `# ${o.title}`),
    });
    detailDistSubCells.push(`C${subRow}`);
    detailOpSubCells.push(`E${subRow}`);

    detailRow = sepRow + 1;
  }

  // Grand total row at bottom of detail pengeluaran
  wsDetail.getRow(detailRow).height = 22;
  applyRangeStyle(wsDetail, detailRow, 1, detailRow, detailTotalCols, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
  });
  wsDetail.getCell(detailRow, 2).value = 'TOTAL TAGIHAN DIST';
  const detTotDist = wsDetail.getCell(detailRow, 3);
  detTotDist.value = {
    formula: detailDistSubCells.length ? detailDistSubCells.join('+') : '0',
    result: totalDistMonth,
  };
  detTotDist.numFmt = NUM_FMT_PLAIN;
  detTotDist.fill = YELLOW_FILL;
  detTotDist.alignment = { horizontal: 'right', vertical: 'middle' };

  wsDetail.getCell(detailRow, 4).value = 'TOTAL KELUAR SALDO';
  const detTotOp = wsDetail.getCell(detailRow, 5);
  detTotOp.value = {
    formula: detailOpSubCells.length ? detailOpSubCells.join('+') : '0',
    result: totalOpMonth,
  };
  detTotOp.numFmt = NUM_FMT_PLAIN;
  detTotOp.fill = YELLOW_FILL;
  detTotOp.alignment = { horizontal: 'right', vertical: 'middle' };

  // =========================================================================
  // 2. POPULATE SHEET 1 ("OMSET + PROFIT")
  // =========================================================================
  const omsetWidths = [
    29, // A: TANGGAL
    16, // B: BRUTO CASH
    16, // C: BRUTO TF
    17, // D: TOTAL BRUTO
    16, // E: PROFIT (15%)
    16, // F: PENGELUARAN CASH
    16, // G: PENGELUARAN TF
    16, // H: NETTO CASH
    16, // I: NETTO TF
    18, // J: PENGELUARAN AKHIR CASH
    16, // K: INCOME PERUSAHAAN CASH
    16, // L: INCOME PERUSAHAAN TF
    19, // M: INCOME PERUSAHAAN
    17, // N: PEMINDAHAN
    20, // O: SALDO AWAL PERUSAHAAN
    17, // P: TAGIHAN DIST
    17, // Q: KELUAR SALDO
    18, // R: TOTAL PENGELUARAN
    28, // S: KET. KELUAR SALDO
    15, // T: TUKAR
    18, // U: CN/BONUS/KASBON
    26, // V: KET. MASUK SALDO
    22, // W: SALDO AKHIR PERUSAHAAN
  ];
  omsetWidths.forEach((w, idx) => {
    wsOmset.getColumn(idx + 1).width = w;
  });

  wsOmset.getRow(1).height = 20;
  wsOmset.getCell(1, 1).value = 'REKAP OMSET';
  wsOmset.getCell(1, 1).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF000000' } };

  wsOmset.getRow(2).height = 19;
  wsOmset.getCell(2, 1).value = formatMonthApostrophe(targetMonth);
  wsOmset.getCell(2, 1).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };

  wsOmset.getRow(3).height = 22;
  wsOmset.getRow(4).height = 20;

  wsOmset.mergeCells('A3:A4');
  wsOmset.getCell('A3').value = 'TANGGAL';

  wsOmset.mergeCells('B3:C3');
  wsOmset.getCell('B3').value = 'BRUTO';
  wsOmset.getCell('B4').value = 'CASH';
  wsOmset.getCell('C4').value = 'TF';

  wsOmset.mergeCells('D3:D4');
  wsOmset.getCell('D3').value = 'TOTAL BRUTO';

  wsOmset.mergeCells('E3:E4');
  wsOmset.getCell('E3').value = 'PROFIT (15%)';

  wsOmset.mergeCells('F3:G3');
  wsOmset.getCell('F3').value = 'PENGELUARAN';
  wsOmset.getCell('F4').value = 'CASH';
  wsOmset.getCell('G4').value = 'TF';

  wsOmset.mergeCells('H3:I3');
  wsOmset.getCell('H3').value = 'NETTO';
  wsOmset.getCell('H4').value = 'CASH';
  wsOmset.getCell('I4').value = 'TF';

  wsOmset.getCell('J3').value = 'PENGELUARAN AKHIR';
  wsOmset.getCell('J4').value = 'CASH';

  wsOmset.mergeCells('K3:L3');
  wsOmset.getCell('K3').value = 'INCOME PERUSAHAAN';
  wsOmset.getCell('K4').value = 'CASH';
  wsOmset.getCell('L4').value = 'TF';

  wsOmset.mergeCells('M3:M4');
  wsOmset.getCell('M3').value = 'INCOME PERUSAHAAN';

  wsOmset.mergeCells('N3:N4');
  wsOmset.getCell('N3').value = 'PEMINDAHAN';

  wsOmset.mergeCells('O3:O4');
  wsOmset.getCell('O3').value = 'SALDO AWAL PERUSAHAAN';

  wsOmset.mergeCells('P3:Q3');
  wsOmset.getCell('P3').value = 'PENGELUARAN PERUSAHAAN';
  wsOmset.getCell('P4').value = 'TAGIHAN DIST';
  wsOmset.getCell('Q4').value = 'KELUAR SALDO';

  wsOmset.mergeCells('R3:R4');
  wsOmset.getCell('R3').value = 'TOTAL PENGELUARAN';

  wsOmset.mergeCells('S3:S4');
  wsOmset.getCell('S3').value = 'KET. KELUAR SALDO';

  wsOmset.mergeCells('T3:U3');
  wsOmset.getCell('T3').value = 'MASUK SALDO';
  wsOmset.getCell('T4').value = 'TUKAR';
  wsOmset.getCell('U4').value = 'CN/BONUS/KASBON';

  wsOmset.mergeCells('V3:V4');
  wsOmset.getCell('V3').value = 'KET. MASUK SALDO';

  wsOmset.mergeCells('W3:W4');
  wsOmset.getCell('W3').value = 'SALDO AKHIR PERUSAHAAN';

  applyRangeStyle(wsOmset, 3, 1, 4, 23, {
    border: BLACK_BORDER,
    fill: HEADER_FILL,
    font: { bold: true, size: 9.5, color: { argb: 'FF000000' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  });

  // Row 5: Opening balance row
  wsOmset.getRow(5).height = 20;
  applyRangeStyle(wsOmset, 5, 1, 5, 23, {
    border: BLACK_BORDER,
    font: { size: 10, color: { argb: 'FF000000' } },
  });
  const o5 = wsOmset.getCell(5, 15);
  o5.value = openingCompanyBalance;
  o5.numFmt = NUM_FMT_PLAIN;
  o5.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
  o5.alignment = { horizontal: 'right', vertical: 'middle' };

  const r5Label = wsOmset.getCell(5, 18);
  r5Label.value = 'saldo perusahaan';
  r5Label.font = { name: FONT_NAME, size: 9.5, bold: true, color: { argb: 'FF000000' } };
  r5Label.alignment = { horizontal: 'center', vertical: 'middle' };

  const w5 = wsOmset.getCell(5, 23);
  w5.value = { formula: 'O5', result: openingCompanyBalance };
  w5.numFmt = NUM_FMT_PLAIN;
  w5.fill = HEADER_FILL;
  w5.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
  w5.alignment = { horizontal: 'right', vertical: 'middle' };

  let runningBalance = openingCompanyBalance;
  let sumBrutoCash = 0;
  let sumBrutoTf = 0;
  let sumProfit = 0;
  let sumIncomeTotal = 0;
  let sumPemindahan = 0;
  let sumDist = 0;
  let sumKeluarSaldo = 0;
  let sumTukar = 0;
  let sumBonusKasbon = 0;

  const omsetFirstDayRow = 6;
  const omsetLastDayRow = omsetFirstDayRow + monthDates.length - 1;

  interface OmsetDayInfo {
    omsetRow: number;
    dateStr: string;
    profit: number;
  }
  const omsetRowsInfo: OmsetDayInfo[] = [];

  monthDates.forEach((dateStr, idx) => {
    const r = omsetFirstDayRow + idx;
    const dow = getDayOfWeekFromDateStr(dateStr);
    const isSunday = dow === 0;
    wsOmset.getRow(r).height = 20;

    const dayIncome = monthTransactions.filter(
      (tx) => tx.date === dateStr && tx.type === 'pendapatan'
    );
    const tukarList = dayIncome.filter((tx) => isTukarIncome(tx));
    const bonusList = dayIncome.filter((tx) => !isTukarIncome(tx) && isBonusOrKasbonIncome(tx));
    const brutoList = dayIncome.filter(
      (tx) => !isTukarIncome(tx) && !isBonusOrKasbonIncome(tx)
    );

    const brutoCash = brutoList
      .filter((t) => t.method === 'cash')
      .reduce((s, t) => s + t.amount, 0);
    const brutoTf = brutoList
      .filter((t) => t.method === 'transfer')
      .reduce((s, t) => s + t.amount, 0);
    const brutoTotal = brutoCash + brutoTf;
    const profit = Math.round(brutoTotal * 0.15);

    const tukarVal = tukarList.reduce((s, t) => s + t.amount, 0);
    const bonusVal = bonusList.reduce((s, t) => s + t.amount, 0);
    const pemindahanVal = monthTransfers
      .filter((tr) => tr.date === dateStr)
      .reduce((s, tr) => s + tr.amount, 0);

    const dayDetail = detailDayMap.get(dateStr)!;
    const distVal = dayDetail.distSum;
    const opVal = dayDetail.opSum;
    const totExpVal = distVal + opVal;

    const prevBalance = runningBalance;
    const nextBalance = prevBalance + brutoTotal + tukarVal + bonusVal - totExpVal;
    runningBalance = nextBalance;

    sumBrutoCash += brutoCash;
    sumBrutoTf += brutoTf;
    sumProfit += profit;
    sumIncomeTotal += brutoTotal;
    sumPemindahan += pemindahanVal;
    sumDist += distVal;
    sumKeluarSaldo += opVal;
    sumTukar += tukarVal;
    sumBonusKasbon += bonusVal;

    omsetRowsInfo.push({ omsetRow: r, dateStr, profit });

    const ketKeluar = dayDetail.opLabels.join('; ');
    const ketMasuk = [...tukarList, ...bonusList].map((t) => t.title).join('; ');

    const rowStyleOpts: {
      border: Partial<ExcelJS.Borders>;
      fill?: ExcelJS.Fill;
      font: Partial<ExcelJS.Font>;
    } = {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
      ...(isSunday ? { fill: SUNDAY_RED_FILL } : {}),
    };
    applyRangeStyle(wsOmset, r, 1, r, 23, rowStyleOpts);

    const cDate = wsOmset.getCell(r, 1);
    cDate.value = toExcelUtcDate(dateStr);
    cDate.numFmt = LONG_DATE_FMT;
    cDate.alignment = { horizontal: 'left', vertical: 'middle' };

    const setNum = (col: number, val: ExcelJS.CellValue, fmt = NUM_FMT) => {
      const cell = wsOmset.getCell(r, col);
      cell.value = val;
      cell.numFmt = fmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    };

    setNum(2, brutoCash);
    setNum(3, brutoTf);
    setNum(4, { formula: `B${r}+C${r}`, result: brutoTotal });
    setNum(5, { formula: `ROUND(D${r}*0.15,0)`, result: profit });
    setNum(6, 0);
    setNum(7, 0);
    setNum(8, { formula: `B${r}-F${r}`, result: brutoCash });
    setNum(9, { formula: `C${r}-G${r}`, result: brutoTf });
    setNum(10, 0);
    setNum(11, { formula: `H${r}-J${r}`, result: brutoCash });
    setNum(12, { formula: `I${r}`, result: brutoTf });
    setNum(13, { formula: `K${r}+L${r}`, result: brutoTotal });
    setNum(14, pemindahanVal);
    setNum(15, { formula: `W${r - 1}`, result: prevBalance }, NUM_FMT_PLAIN);
    setNum(16, {
      formula: `'detail pengeluaran'!${dayDetail.distSubCell}`,
      result: distVal,
    });
    setNum(17, {
      formula: `'detail pengeluaran'!${dayDetail.opSubCell}`,
      result: opVal,
    });
    setNum(18, { formula: `P${r}+Q${r}`, result: totExpVal });

    const cKetKeluar = wsOmset.getCell(r, 19);
    cKetKeluar.value = ketKeluar;
    cKetKeluar.alignment = { horizontal: 'left', vertical: 'middle' };

    setNum(20, tukarVal);
    setNum(21, bonusVal);

    const cKetMasuk = wsOmset.getCell(r, 22);
    cKetMasuk.value = ketMasuk;
    cKetMasuk.alignment = { horizontal: 'left', vertical: 'middle' };

    setNum(
      23,
      { formula: `O${r}+M${r}+T${r}+U${r}-R${r}`, result: nextBalance },
      NUM_FMT_PLAIN
    );
  });

  // Blank row + TOTAL row on OMSET + PROFIT
  const omsetGapRow = omsetLastDayRow + 1;
  wsOmset.getRow(omsetGapRow).height = 14;
  const omsetTotRow = omsetGapRow + 1;
  wsOmset.getRow(omsetTotRow).height = 22;

  applyRangeStyle(wsOmset, omsetTotRow, 1, omsetTotRow, 23, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
  });
  wsOmset.getCell(omsetTotRow, 1).value = 'TOTAL';
  wsOmset.getCell(omsetTotRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  const sumCols: { col: number; letter: string; result: number; yellow?: boolean }[] = [
    { col: 2, letter: 'B', result: sumBrutoCash, yellow: true },
    { col: 3, letter: 'C', result: sumBrutoTf, yellow: true },
    { col: 4, letter: 'D', result: sumBrutoCash + sumBrutoTf, yellow: true },
    { col: 5, letter: 'E', result: sumProfit },
    { col: 6, letter: 'F', result: 0, yellow: true },
    { col: 7, letter: 'G', result: 0 },
    { col: 8, letter: 'H', result: sumBrutoCash },
    { col: 9, letter: 'I', result: sumBrutoTf },
    { col: 10, letter: 'J', result: 0 },
    { col: 11, letter: 'K', result: sumBrutoCash },
    { col: 12, letter: 'L', result: sumBrutoTf },
    { col: 13, letter: 'M', result: sumIncomeTotal },
    { col: 14, letter: 'N', result: sumPemindahan },
    { col: 16, letter: 'P', result: sumDist },
    { col: 17, letter: 'Q', result: sumKeluarSaldo },
    { col: 18, letter: 'R', result: sumDist + sumKeluarSaldo },
    { col: 20, letter: 'T', result: sumTukar },
    { col: 21, letter: 'U', result: sumBonusKasbon },
  ];

  sumCols.forEach(({ col, letter, result, yellow }) => {
    const cell = wsOmset.getCell(omsetTotRow, col);
    cell.value = {
      formula: `SUM(${letter}${omsetFirstDayRow}:${letter}${omsetLastDayRow})`,
      result,
    };
    cell.numFmt = NUM_FMT_PLAIN;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    if (yellow) cell.fill = YELLOW_FILL;
  });

  const endBalTotCell = wsOmset.getCell(omsetTotRow, 23);
  endBalTotCell.value = { formula: `W${omsetLastDayRow}`, result: runningBalance };
  endBalTotCell.numFmt = NUM_FMT_PLAIN;
  endBalTotCell.fill = YELLOW_FILL;
  endBalTotCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // Reconciliation sub-cell under PEMINDAHAN (matches screenshot N38)
  const reconRow = omsetTotRow + 1;
  wsOmset.getRow(reconRow).height = 20;
  const reconCell = wsOmset.getCell(reconRow, 14);
  reconCell.value = {
    formula: `M${omsetTotRow}-N${omsetTotRow}`,
    result: sumIncomeTotal - sumPemindahan,
  };
  reconCell.numFmt = NUM_FMT_PLAIN;
  reconCell.border = BLACK_BORDER;
  reconCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
  reconCell.alignment = { horizontal: 'right', vertical: 'middle' };

  // =========================================================================
  // 3. POPULATE SHEET 3 ("SHARE BU BOS")
  // =========================================================================
  wsShare.getColumn(1).width = 29;
  wsShare.getColumn(2).width = 18;
  wsShare.getColumn(3).width = 20;

  wsShare.getRow(1).height = 14;
  wsShare.getRow(2).height = 24;
  wsShare.getCell(2, 1).value = 'TANGGAL';
  wsShare.getCell(2, 2).value = 'PROFIT';
  wsShare.getCell(2, 3).value = 'SHARE PROFIT';
  applyRangeStyle(wsShare, 2, 1, 2, 3, {
    border: BLACK_BORDER,
    fill: HEADER_FILL,
    font: { bold: true, color: { argb: 'FF000000' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  let totalShareProfit = 0;
  const shareFirstRow = 3;
  const shareLastRow = shareFirstRow + omsetRowsInfo.length - 1;

  omsetRowsInfo.forEach((info, idx) => {
    const sr = shareFirstRow + idx;
    wsShare.getRow(sr).height = 20;
    const shareVal = Math.round(info.profit * 0.1);
    totalShareProfit += shareVal;

    applyRangeStyle(wsShare, sr, 1, sr, 3, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });

    const dCell = wsShare.getCell(sr, 1);
    dCell.value = {
      formula: `'OMSET + PROFIT'!A${info.omsetRow}`,
      result: toExcelUtcDate(info.dateStr),
    };
    dCell.numFmt = LONG_DATE_FMT;
    dCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const pCell = wsShare.getCell(sr, 2);
    pCell.value = {
      formula: `'OMSET + PROFIT'!E${info.omsetRow}`,
      result: info.profit,
    };
    pCell.numFmt = NUM_FMT;
    pCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const sCell = wsShare.getCell(sr, 3);
    sCell.value = {
      formula: `ROUND(B${sr}*0.1,0)`,
      result: shareVal,
    };
    sCell.numFmt = CURRENCY_RP_FMT;
    sCell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const shareGapRow = shareLastRow + 1;
  wsShare.getRow(shareGapRow).height = 14;
  const shareTotRow = shareGapRow + 1;
  wsShare.getRow(shareTotRow).height = 22;

  applyRangeStyle(wsShare, shareTotRow, 1, shareTotRow, 3, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
  });
  wsShare.getCell(shareTotRow, 1).value = 'TOTAL';
  wsShare.getCell(shareTotRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  const shareProfitTot = wsShare.getCell(shareTotRow, 2);
  shareProfitTot.value = {
    formula: `SUM(B${shareFirstRow}:B${shareLastRow})`,
    result: sumProfit,
  };
  shareProfitTot.numFmt = NUM_FMT_PLAIN;
  shareProfitTot.fill = YELLOW_FILL;
  shareProfitTot.alignment = { horizontal: 'right', vertical: 'middle' };

  const sharePctTot = wsShare.getCell(shareTotRow, 3);
  sharePctTot.value = {
    formula: `SUM(C${shareFirstRow}:C${shareLastRow})`,
    result: totalShareProfit,
  };
  sharePctTot.numFmt = CURRENCY_RP_FMT;
  sharePctTot.fill = YELLOW_FILL;
  sharePctTot.alignment = { horizontal: 'right', vertical: 'middle' };

  // =========================================================================
  // 4. POPULATE SHEET 4 ("rekapan obos")
  // =========================================================================
  wsRekapan.getColumn(1).width = 9;
  wsRekapan.getColumn(2).width = 26;
  wsRekapan.getColumn(3).width = 16;
  wsRekapan.getColumn(4).width = 19;

  const loanPrincipalTxs = allTransactions.filter(
    (tx) => tx.type === 'pengeluaran' && isLoanOrKasbonKeyword(tx) && !isInstallmentExpense(tx)
  );
  const loanRepaymentTxs = allTransactions
    .filter((tx) => tx.type === 'pendapatan' && isLoanOrKasbonKeyword(tx))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPinjamanPrincipal = loanPrincipalTxs.reduce((s, t) => s + t.amount, 0);

  wsRekapan.getRow(1).height = 22;
  wsRekapan.mergeCells('A1:B1');
  wsRekapan.getCell('A1').value = 'PINJAMAN OBOS';
  wsRekapan.getCell('C1').value = 'TOTAL';
  wsRekapan.getCell('D1').value = totalPinjamanPrincipal;
  wsRekapan.getCell('D1').numFmt = NUM_FMT_PLAIN;

  applyRangeStyle(wsRekapan, 1, 1, 1, 4, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
    alignment: { vertical: 'middle' },
  });
  wsRekapan.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  wsRekapan.getCell('C1').alignment = { horizontal: 'center', vertical: 'middle' };
  wsRekapan.getCell('D1').alignment = { horizontal: 'right', vertical: 'middle' };

  wsRekapan.getRow(2).height = 20;
  ['NO', 'KETERANGAN', 'MASUK', 'SISA PINJAMAN'].forEach((hdr, i) => {
    const cell = wsRekapan.getCell(2, i + 1);
    cell.value = hdr;
  });
  applyRangeStyle(wsRekapan, 2, 1, 2, 4, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  const rekapanRowsCount = Math.max(10, loanRepaymentTxs.length);
  let remainingLoan = totalPinjamanPrincipal;

  for (let i = 0; i < rekapanRowsCount; i++) {
    const rr = 3 + i;
    wsRekapan.getRow(rr).height = 19;
    applyRangeStyle(wsRekapan, rr, 1, rr, 4, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });

    const noCell = wsRekapan.getCell(rr, 1);
    noCell.value = i + 1;
    noCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const rep = loanRepaymentTxs[i];
    if (rep) {
      remainingLoan -= rep.amount;
      const ketCell = wsRekapan.getCell(rr, 2);
      ketCell.value = `${rep.title} (${formatShortDdMm(rep.date)})`;
      ketCell.alignment = { horizontal: 'left', vertical: 'middle' };

      const inCell = wsRekapan.getCell(rr, 3);
      inCell.value = rep.amount;
      inCell.numFmt = NUM_FMT_PLAIN;
      inCell.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    const remCell = wsRekapan.getCell(rr, 4);
    remCell.value = {
      formula: i === 0 ? 'D1-C3' : `D${rr - 1}-C${rr}`,
      result: remainingLoan,
    };
    remCell.numFmt = NUM_FMT_PLAIN;
    remCell.alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // Installment block below (matches screenshot "cicilan bjb / 13/11 / 22,800,000")
  const cicilanHeaderRow = 3 + rekapanRowsCount + 3;
  wsRekapan.getRow(cicilanHeaderRow).height = 20;
  wsRekapan.getCell(cicilanHeaderRow, 1).value = 'cicilan / angsuran';
  wsRekapan.getCell(cicilanHeaderRow, 1).font = {
    name: FONT_NAME,
    size: 10,
    bold: true,
    color: { argb: 'FF000000' },
  };

  const installmentTxs = monthTransactions
    .filter((tx) => tx.type === 'pengeluaran' && isInstallmentExpense(tx))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (installmentTxs.length === 0) {
    const cr = cicilanHeaderRow + 1;
    wsRekapan.getRow(cr).height = 20;
    wsRekapan.getCell(cr, 1).value = '-';
    wsRekapan.getCell(cr, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    const amtCell = wsRekapan.getCell(cr, 2);
    amtCell.value = 0;
    amtCell.numFmt = NUM_FMT_PLAIN;
    amtCell.fill = YELLOW_FILL;
    amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    applyRangeStyle(wsRekapan, cr, 1, cr, 2, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });
  } else {
    installmentTxs.forEach((tx, idx) => {
      const cr = cicilanHeaderRow + 1 + idx;
      wsRekapan.getRow(cr).height = 20;
      const dCell = wsRekapan.getCell(cr, 1);
      dCell.value = formatShortDdMm(tx.date);
      dCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const amtCell = wsRekapan.getCell(cr, 2);
      amtCell.value = tx.amount;
      amtCell.numFmt = NUM_FMT_PLAIN;
      amtCell.fill = YELLOW_FILL;
      amtCell.alignment = { horizontal: 'right', vertical: 'middle' };

      const noteCell = wsRekapan.getCell(cr, 3);
      noteCell.value = tx.title;
      noteCell.alignment = { horizontal: 'left', vertical: 'middle' };

      applyRangeStyle(wsRekapan, cr, 1, cr, 3, {
        border: BLACK_BORDER,
        font: { color: { argb: 'FF000000' } },
      });
    });
  }

  // =========================================================================
  // 5. POPULATE SHEET 5 ("gaji") — uses Finance salary expenses & public employee names only
  // =========================================================================
  wsGaji.getColumn(1).width = 7;
  wsGaji.getColumn(2).width = 26;
  wsGaji.getColumn(3).width = 18;

  wsGaji.getRow(1).height = 20;
  ['No', 'Nama', 'gaji'].forEach((h, idx) => {
    const cell = wsGaji.getCell(1, idx + 1);
    cell.value = h;
    cell.border = BLACK_BORDER;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: idx === 0 ? 'center' : 'left', vertical: 'middle' };
  });

  const salaryExpenseTxs = monthTransactions.filter(
    (tx) => tx.type === 'pengeluaran' && isSalaryExpense(tx)
  );
  const consumedSalaryTxIds = new Set<string>();

  const gajiRows: { name: string; amount: number | null }[] = [];
  const activeRoster = employees.filter((e) => e.active !== false);

  for (const emp of activeRoster) {
    const empLower = emp.name.trim().toLowerCase();
    let sumEmp = 0;
    for (const tx of salaryExpenseTxs) {
      const hay = `${tx.counterparty} ${tx.title} ${tx.notes}`.toLowerCase();
      if (empLower && hay.includes(empLower)) {
        sumEmp += tx.amount;
        consumedSalaryTxIds.add(tx.id);
      }
    }
    gajiRows.push({ name: emp.name, amount: sumEmp > 0 ? sumEmp : null });
  }

  // Include any salary expense transactions recorded in Finance that didn't match roster names
  for (const tx of salaryExpenseTxs) {
    if (consumedSalaryTxIds.has(tx.id)) continue;
    const recipient = tx.counterparty?.trim() || tx.title;
    const existing = gajiRows.find(
      (r) => r.name.trim().toLowerCase() === recipient.trim().toLowerCase()
    );
    if (existing) {
      existing.amount = (existing.amount || 0) + tx.amount;
    } else {
      gajiRows.push({ name: recipient, amount: tx.amount });
    }
  }

  if (gajiRows.length === 0) {
    gajiRows.push({ name: 'Belum ada data gaji pada periode ini', amount: null });
  }

  let totalGajiSum = 0;
  const gajiFirstDataRow = 2;
  const gajiLastDataRow = gajiFirstDataRow + gajiRows.length - 1;

  gajiRows.forEach((rowItem, idx) => {
    const gr = gajiFirstDataRow + idx;
    wsGaji.getRow(gr).height = 19;
    applyRangeStyle(wsGaji, gr, 1, gr, 3, {
      border: BLACK_BORDER,
      font: { color: { argb: 'FF000000' } },
    });

    const noCell = wsGaji.getCell(gr, 1);
    noCell.value = idx + 1;
    noCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const nameCell = wsGaji.getCell(gr, 2);
    nameCell.value = rowItem.name;
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const amtCell = wsGaji.getCell(gr, 3);
    if (rowItem.amount !== null && rowItem.amount > 0) {
      amtCell.value = rowItem.amount;
      totalGajiSum += rowItem.amount;
    }
    amtCell.numFmt = CURRENCY_RP_FMT;
    amtCell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const gajiTotRow = gajiLastDataRow + 1;
  wsGaji.getRow(gajiTotRow).height = 21;
  applyRangeStyle(wsGaji, gajiTotRow, 1, gajiTotRow, 3, {
    border: BLACK_BORDER,
    font: { bold: true, color: { argb: 'FF000000' } },
  });
  wsGaji.getCell(gajiTotRow, 2).value = 'TOTAL';
  wsGaji.getCell(gajiTotRow, 2).alignment = { horizontal: 'left', vertical: 'middle' };

  const gajiTotCell = wsGaji.getCell(gajiTotRow, 3);
  gajiTotCell.value = {
    formula: `SUM(C${gajiFirstDataRow}:C${gajiLastDataRow})`,
    result: totalGajiSum,
  };
  gajiTotCell.numFmt = CURRENCY_RP_FMT;
  gajiTotCell.fill = YELLOW_FILL;
  gajiTotCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const filename = `Laporan-Keuangan-Perusahaan-${fileSlug || targetMonth}.xlsx`;
  return { workbook, filename };
}

export async function exportFinanceToExcel(params: ExportFinanceExcelParams): Promise<void> {
  const { workbook, filename } = buildFinanceExcelWorkbook(params);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
