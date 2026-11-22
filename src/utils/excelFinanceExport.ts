import ExcelJS from 'exceljs';
import {
  CompanyProfile,
  FinanceAccount,
  FinanceCategory,
  FinanceTransaction,
  FinanceTransfer,
} from '../types';

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

export async function exportFinanceToExcel(params: {
  transactions: FinanceTransaction[];
  allTransactions?: FinanceTransaction[];
  categories: FinanceCategory[];
  accounts?: FinanceAccount[];
  transfers?: FinanceTransfer[];
  periodLabel: string;
  fileSlug: string;
  companyName?: string;
  companyProfile?: CompanyProfile;
}): Promise<void> {
  const {
    transactions,
    allTransactions = transactions,
    categories,
    accounts = [],
    transfers = [],
    periodLabel,
    fileSlug,
    companyName = 'KARYAPRESENSI',
    companyProfile,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${companyName} Finance`;
  workbook.created = new Date();

  const CURRENCY_FMT = '"Rp "#,##0;-"Rp "#,##0;"Rp 0"';
  const legalName = companyProfile?.legalName?.trim() || companyName.toUpperCase();
  const companyContactLine = [
    companyProfile?.address,
    companyProfile?.city,
    companyProfile?.phone ? `Telp: ${companyProfile.phone}` : '',
    companyProfile?.taxId ? `NPWP: ${companyProfile.taxId}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  // Compute totals
  let incomeCash = 0;
  let incomeTransfer = 0;
  let expenseCash = 0;
  let expenseTransfer = 0;

  for (const tx of transactions) {
    if (tx.type === 'pendapatan') {
      if (tx.method === 'cash') incomeCash += tx.amount;
      else incomeTransfer += tx.amount;
    } else {
      if (tx.method === 'cash') expenseCash += tx.amount;
      else expenseTransfer += tx.amount;
    }
  }

  const totalIncome = incomeCash + incomeTransfer;
  const totalExpense = expenseCash + expenseTransfer;
  const netCash = incomeCash - expenseCash;
  const netTransfer = incomeTransfer - expenseTransfer;
  const netBalance = totalIncome - totalExpense;

  // =========================================================================
  // SHEET 1: RINGKASAN KEUANGAN & KATEGORI
  // =========================================================================
  const ws1 = workbook.addWorksheet('Ringkasan Keuangan', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const s1Widths = [7, 30, 18, 18, 20, 14];
  s1Widths.forEach((w, idx) => {
    ws1.getColumn(idx + 1).width = w;
  });

  ws1.mergeCells(1, 1, 1, 6);
  const c1 = ws1.getCell(1, 1);
  c1.value = `${legalName} — LAPORAN PENGELOLAAN KEUANGAN PERUSAHAAN`;
  c1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 28;

  ws1.mergeCells(2, 1, 2, 6);
  const c2 = ws1.getCell(2, 1);
  c2.value = companyContactLine || companyName;
  c2.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF334155' } };
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(2).height = 20;

  ws1.mergeCells(3, 1, 3, 6);
  const c3 = ws1.getCell(3, 1);
  c3.value = `Periode: ${periodLabel}  |  Total Transaksi: ${transactions.length} entri  |  Perpindahan Dana: ${transfers.length} entri`;
  c3.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF1E3A8A' } };
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(3).height = 22;

  ws1.getRow(4).height = 10;

  // Cashflow Matrix Summary Table
  ws1.mergeCells(5, 1, 5, 6);
  const secCashTitle = ws1.getCell(5, 1);
  secCashTitle.value = 'RINGKASAN ARUS KAS (CASH VS TRANSFER BANK)';
  secCashTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws1.getRow(5).height = 22;

  const summaryHeaders = [
    'No',
    'Pos Keuangan',
    'Metode Cash (Tunai)',
    'Metode Transfer Bank',
    'Total Gabungan',
    'Porsi',
  ];
  ws1.getRow(6).height = 24;
  summaryHeaders.forEach((h, idx) => {
    const cell = ws1.getCell(6, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  const summaryRows: [number | string, string, number, number, number, string, string][] = [
    [
      1,
      'Pendapatan Perusahaan',
      incomeCash,
      incomeTransfer,
      totalIncome,
      totalIncome + totalExpense > 0
        ? `${Math.round((totalIncome / (totalIncome + totalExpense)) * 100)}%`
        : '0%',
      'FFECFDF5',
    ],
    [
      2,
      'Pengeluaran Perusahaan',
      expenseCash,
      expenseTransfer,
      totalExpense,
      totalIncome + totalExpense > 0
        ? `${Math.round((totalExpense / (totalIncome + totalExpense)) * 100)}%`
        : '0%',
      'FFFEF2F2',
    ],
    [
      '',
      'Surplus / Defisit Operasional (Tanpa Mutasi Internal)',
      netCash,
      netTransfer,
      netBalance,
      netBalance >= 0 ? 'Surplus' : 'Defisit',
      netBalance >= 0 ? 'FFEFF6FF' : 'FFFFF1F2',
    ],
  ];

  let r1 = 7;
  summaryRows.forEach(([no, label, cashVal, trfVal, totVal, pctLabel, rowBg], idx) => {
    ws1.getRow(r1).height = 24;
    const vals: (string | number)[] = [no, label, cashVal, trfVal, totVal, pctLabel];
    const isNetRow = idx === 2;
    vals.forEach((v, colIdx) => {
      const cell = ws1.getCell(r1, colIdx + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = isNetRow ? THIN_BORDER : LIGHT_BORDER;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: isNetRow || colIdx === 4,
        color: {
          argb:
            idx === 0
              ? 'FF047857'
              : idx === 1
              ? 'FFB91C1C'
              : netBalance >= 0
              ? 'FF1E3A8A'
              : 'FFB91C1C',
        },
      };
      if (colIdx >= 2 && colIdx <= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colIdx === 0 || colIdx === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
    r1 += 1;
  });

  // Expense by Category Breakdown
  r1 += 1;
  ws1.mergeCells(r1, 1, r1, 6);
  const expTitle = ws1.getCell(r1, 1);
  expTitle.value = 'RINCIAN PENGELUARAN PERUSAHAAN PER KATEGORI';
  expTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws1.getRow(r1).height = 22;
  r1 += 1;

  const catHeaders = [
    'No',
    'Kategori Pengeluaran',
    'Pengeluaran Cash',
    'Pengeluaran Transfer',
    'Total Pengeluaran',
    'Porsi (%)',
  ];
  ws1.getRow(r1).height = 24;
  catHeaders.forEach((h, idx) => {
    const cell = ws1.getCell(r1, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  r1 += 1;

  const expenseCategories = categories.filter((c) => c.type === 'pengeluaran');
  const expenseMap = new Map<string, { name: string; cash: number; transfer: number }>();
  for (const cat of expenseCategories) {
    expenseMap.set(cat.id, { name: cat.name, cash: 0, transfer: 0 });
  }
  for (const tx of transactions) {
    if (tx.type !== 'pengeluaran') continue;
    const entry = expenseMap.get(tx.categoryId) || {
      name: tx.categoryName,
      cash: 0,
      transfer: 0,
    };
    if (tx.method === 'cash') entry.cash += tx.amount;
    else entry.transfer += tx.amount;
    expenseMap.set(tx.categoryId, entry);
  }
  const expenseRows = Array.from(expenseMap.values()).sort(
    (a, b) => b.cash + b.transfer - (a.cash + a.transfer)
  );

  expenseRows.forEach((item, idx) => {
    const rowTotal = item.cash + item.transfer;
    const pct = totalExpense > 0 ? Math.round((rowTotal / totalExpense) * 1000) / 10 : 0;
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    ws1.getRow(r1).height = 22;
    const vals: (string | number)[] = [
      idx + 1,
      item.name,
      item.cash,
      item.transfer,
      rowTotal,
      `${pct}%`,
    ];
    vals.forEach((v, cIdx) => {
      const cell = ws1.getCell(r1, cIdx + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = LIGHT_BORDER;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: cIdx === 4,
        color: { argb: cIdx === 4 && rowTotal > 0 ? 'FFB91C1C' : 'FF0F172A' },
      };
      if (cIdx >= 2 && cIdx <= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cIdx === 0 || cIdx === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
    r1 += 1;
  });

  // Total expense row
  ws1.getRow(r1).height = 24;
  ['', 'TOTAL PENGELUARAN', expenseCash, expenseTransfer, totalExpense, '100%'].forEach(
    (v, cIdx) => {
      const cell = ws1.getCell(r1, cIdx + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      cell.border = THIN_BORDER;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF7F1D1D' } };
      if (cIdx >= 2 && cIdx <= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cIdx === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
  );
  r1 += 2;

  // Income by Category Breakdown
  ws1.mergeCells(r1, 1, r1, 6);
  const incTitle = ws1.getCell(r1, 1);
  incTitle.value = 'RINCIAN PENDAPATAN PERUSAHAAN PER KATEGORI';
  incTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws1.getRow(r1).height = 22;
  r1 += 1;

  const incHeaders = [
    'No',
    'Kategori Pendapatan',
    'Pendapatan Cash',
    'Pendapatan Transfer',
    'Total Pendapatan',
    'Porsi (%)',
  ];
  ws1.getRow(r1).height = 24;
  incHeaders.forEach((h, idx) => {
    const cell = ws1.getCell(r1, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  r1 += 1;

  const incomeCategories = categories.filter((c) => c.type === 'pendapatan');
  const incomeMap = new Map<string, { name: string; cash: number; transfer: number }>();
  for (const cat of incomeCategories) {
    incomeMap.set(cat.id, { name: cat.name, cash: 0, transfer: 0 });
  }
  for (const tx of transactions) {
    if (tx.type !== 'pendapatan') continue;
    const entry = incomeMap.get(tx.categoryId) || {
      name: tx.categoryName,
      cash: 0,
      transfer: 0,
    };
    if (tx.method === 'cash') entry.cash += tx.amount;
    else entry.transfer += tx.amount;
    incomeMap.set(tx.categoryId, entry);
  }
  const incomeRows = Array.from(incomeMap.values()).sort(
    (a, b) => b.cash + b.transfer - (a.cash + a.transfer)
  );

  incomeRows.forEach((item, idx) => {
    const rowTotal = item.cash + item.transfer;
    const pct = totalIncome > 0 ? Math.round((rowTotal / totalIncome) * 1000) / 10 : 0;
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
    ws1.getRow(r1).height = 22;
    const vals: (string | number)[] = [
      idx + 1,
      item.name,
      item.cash,
      item.transfer,
      rowTotal,
      `${pct}%`,
    ];
    vals.forEach((v, cIdx) => {
      const cell = ws1.getCell(r1, cIdx + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = LIGHT_BORDER;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: cIdx === 4,
        color: { argb: cIdx === 4 && rowTotal > 0 ? 'FF047857' : 'FF0F172A' },
      };
      if (cIdx >= 2 && cIdx <= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cIdx === 0 || cIdx === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
    r1 += 1;
  });

  ws1.getRow(r1).height = 24;
  ['', 'TOTAL PENDAPATAN', incomeCash, incomeTransfer, totalIncome, '100%'].forEach(
    (v, cIdx) => {
      const cell = ws1.getCell(r1, cIdx + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      cell.border = THIN_BORDER;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF064E3B' } };
      if (cIdx >= 2 && cIdx <= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cIdx === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
  );

  // Sign-off block on Sheet 1
  const signRow = r1 + 3;
  const cityText = companyProfile?.city?.split(',')[0]?.trim() || 'Jakarta';
  const dirName = companyProfile?.directorName || 'Direktur / Pimpinan';
  ws1.mergeCells(signRow, 1, signRow, 2);
  ws1.getCell(signRow, 1).value = 'Disiapkan Oleh (Admin Keuangan),';
  ws1.getCell(signRow, 1).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };

  ws1.mergeCells(signRow, 4, signRow, 6);
  ws1.getCell(signRow, 4).value = `${cityText}, ${new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
  ws1.getCell(signRow, 4).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
  ws1.getCell(signRow, 4).alignment = { horizontal: 'center' };

  ws1.mergeCells(signRow + 1, 4, signRow + 1, 6);
  ws1.getCell(signRow + 1, 4).value = 'Disetujui Oleh,';
  ws1.getCell(signRow + 1, 4).font = { name: 'Calibri', size: 10, bold: true };
  ws1.getCell(signRow + 1, 4).alignment = { horizontal: 'center' };

  ws1.mergeCells(signRow + 5, 1, signRow + 5, 2);
  ws1.getCell(signRow + 5, 1).value = 'Admin Keuangan Perusahaan';
  ws1.getCell(signRow + 5, 1).font = { name: 'Calibri', size: 10, bold: true, underline: true };

  ws1.mergeCells(signRow + 5, 4, signRow + 5, 6);
  ws1.getCell(signRow + 5, 4).value = dirName;
  ws1.getCell(signRow + 5, 4).font = { name: 'Calibri', size: 10, bold: true, underline: true };
  ws1.getCell(signRow + 5, 4).alignment = { horizontal: 'center' };

  // =========================================================================
  // SHEET 2: JURNAL TRANSAKSI KEUANGAN (DIKELOMPOKKAN PER KATEGORI)
  // =========================================================================
  const ws2 = workbook.addWorksheet('Jurnal per Kategori', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  const s2Widths = [6, 13, 14, 13, 24, 28, 22, 24, 16, 17, 17, 17, 17, 26];
  s2Widths.forEach((w, idx) => {
    ws2.getColumn(idx + 1).width = w;
  });

  ws2.mergeCells(1, 1, 1, 14);
  const s2Title = ws2.getCell(1, 1);
  s2Title.value = `${legalName} — JURNAL TRANSAKSI PER KATEGORI (${periodLabel.toUpperCase()})`;
  s2Title.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  s2Title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 26;
  ws2.getRow(2).height = 8;

  const s2Headers = [
    'No',
    'Tanggal',
    'Jenis',
    'Metode',
    'Kategori',
    'Keterangan',
    'Sumber / Penerima',
    'Kas / Rekening Bank',
    'No. Bukti',
    'Pendapatan Cash',
    'Pendapatan Transfer',
    'Pengeluaran Cash',
    'Pengeluaran Transfer',
    'Catatan',
  ];
  ws2.getRow(3).height = 28;
  s2Headers.forEach((h, idx) => {
    const cell = ws2.getCell(3, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb:
          idx === 9 || idx === 10
            ? 'FF065F46'
            : idx === 11 || idx === 12
            ? 'FF991B1B'
            : 'FF1E3A8A',
      },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });

  const sortedTx = [...transactions].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'pendapatan' ? -1 : 1;
    const catCmp = a.categoryName.localeCompare(b.categoryName);
    if (catCmp !== 0) return catCmp;
    return b.date.localeCompare(a.date);
  });

  let r2 = 4;
  if (sortedTx.length === 0) {
    ws2.mergeCells(4, 1, 4, 14);
    const empty = ws2.getCell(4, 1);
    empty.value = 'Belum ada transaksi keuangan pada filter/periode yang dipilih.';
    empty.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(4).height = 26;
    applyBorderToRange(ws2, 4, 1, 4, 14, LIGHT_BORDER);
  } else {
    sortedTx.forEach((tx, idx) => {
      ws2.getRow(r2).height = 24;
      const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const incCash = tx.type === 'pendapatan' && tx.method === 'cash' ? tx.amount : 0;
      const incTrf = tx.type === 'pendapatan' && tx.method === 'transfer' ? tx.amount : 0;
      const expCash = tx.type === 'pengeluaran' && tx.method === 'cash' ? tx.amount : 0;
      const expTrf = tx.type === 'pengeluaran' && tx.method === 'transfer' ? tx.amount : 0;

      const vals: (string | number)[] = [
        idx + 1,
        tx.date,
        tx.type === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran',
        tx.method === 'cash' ? 'Cash' : 'Transfer',
        tx.categoryName,
        tx.title,
        tx.counterparty || '—',
        tx.bankAccount || '—',
        tx.referenceNo || '—',
        incCash,
        incTrf,
        expCash,
        expTrf,
        tx.notes || '—',
      ];

      vals.forEach((v, cIdx) => {
        const cell = ws2.getCell(r2, cIdx + 1);
        cell.value = v;
        cell.border = LIGHT_BORDER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        if (cIdx >= 9 && cIdx <= 12) {
          cell.numFmt = CURRENCY_FMT;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          const num = Number(v);
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: num > 0,
            color: {
              argb:
                num === 0
                  ? 'FF94A3B8'
                  : cIdx <= 10
                  ? 'FF047857'
                  : 'FFB91C1C',
            },
          };
        } else if (cIdx === 0 || cIdx === 1 || cIdx === 2 || cIdx === 3 || cIdx === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: cIdx === 2 || cIdx === 3,
            color: {
              argb:
                cIdx === 2
                  ? tx.type === 'pendapatan'
                    ? 'FF047857'
                    : 'FFB91C1C'
                  : 'FF0F172A',
            },
          };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: cIdx === 5,
            color: { argb: 'FF0F172A' },
          };
        }
      });
      r2 += 1;
    });

    // Total Row
    ws2.getRow(r2).height = 26;
    const totalVals: (string | number)[] = [
      '',
      'TOTAL',
      `${sortedTx.length} Transaksi`,
      '',
      '',
      '',
      '',
      '',
      '',
      incomeCash,
      incomeTransfer,
      expenseCash,
      expenseTransfer,
      `Surplus/Defisit: Rp ${netBalance.toLocaleString('id-ID')}`,
    ];
    totalVals.forEach((v, cIdx) => {
      const cell = ws2.getCell(r2, cIdx + 1);
      cell.value = v;
      cell.border = THIN_BORDER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: {
          argb:
            cIdx === 9 || cIdx === 10
              ? 'FF065F46'
              : cIdx === 11 || cIdx === 12
              ? 'FF991B1B'
              : 'FF0F172A',
        },
      };
      if (cIdx >= 9 && cIdx <= 12) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (cIdx === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  }

  // =========================================================================
  // SHEET 3: SALDO KAS & REKENING BANK SERTA PERPINDAHAN DANA
  // =========================================================================
  const ws3 = workbook.addWorksheet('Saldo Rekening & Mutasi', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const s3Widths = [6, 24, 16, 22, 17, 17, 17, 17, 20];
  s3Widths.forEach((w, idx) => {
    ws3.getColumn(idx + 1).width = w;
  });

  ws3.mergeCells(1, 1, 1, 9);
  const s3Title = ws3.getCell(1, 1);
  s3Title.value = `${legalName} — POSISI SALDO KAS & REKENING BANK SERTA PERPINDAHAN DANA`;
  s3Title.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  s3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  s3Title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getRow(1).height = 26;
  ws3.getRow(2).height = 8;

  ws3.mergeCells(3, 1, 3, 9);
  const accSec = ws3.getCell(3, 1);
  accSec.value = 'SALDO AKHIR PER AKUN KAS TUNAI & REKENING BANK (AKUMULASI KESELURUHAN)';
  accSec.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws3.getRow(3).height = 22;

  const accHeaders = [
    'No',
    'Nama Akun Kas / Rekening',
    'Jenis / Bank',
    'No. Rekening',
    'Saldo Awal',
    'Pendapatan Masuk',
    'Pengeluaran Keluar',
    'Mutasi Bersih',
    'Saldo Akhir',
  ];
  ws3.getRow(4).height = 26;
  accHeaders.forEach((h, idx) => {
    const cell = ws3.getCell(4, idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });

  let r3 = 5;
  accounts.forEach((acc, idx) => {
    let inc = 0;
    let exp = 0;
    for (const tx of allTransactions) {
      if (tx.accountId === acc.id) {
        if (tx.type === 'pendapatan') inc += tx.amount;
        else exp += tx.amount;
      }
    }
    let trIn = 0;
    let trOut = 0;
    for (const tr of transfers) {
      if (tr.toAccountId === acc.id) trIn += tr.amount;
      if (tr.fromAccountId === acc.id) trOut += tr.amount;
    }
    const netMutasi = trIn - trOut;
    const ending = (acc.openingBalance || 0) + inc - exp + netMutasi;
    const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';

    ws3.getRow(r3).height = 22;
    const vals: (string | number)[] = [
      idx + 1,
      acc.name,
      acc.kind === 'cash' ? 'Cash (Tunai)' : acc.bankName,
      acc.accountNumber || '—',
      acc.openingBalance || 0,
      inc,
      exp,
      netMutasi,
      ending,
    ];
    vals.forEach((v, cIdx) => {
      const cell = ws3.getCell(r3, cIdx + 1);
      cell.value = v;
      cell.border = LIGHT_BORDER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      if (cIdx >= 4) {
        cell.numFmt = CURRENCY_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 8,
          color: { argb: cIdx === 8 && ending < 0 ? 'FFB91C1C' : 'FF0F172A' },
        };
      } else if (cIdx === 0 || cIdx === 2) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: cIdx === 1,
          color: { argb: 'FF0F172A' },
        };
      }
    });
    r3 += 1;
  });

  // Internal Transfers List
  r3 += 2;
  ws3.mergeCells(r3, 1, r3, 9);
  const trSec = ws3.getCell(r3, 1);
  trSec.value = 'RIWAYAT PERPINDAHAN DANA (CASH <-> REKENING / ANTAR REKENING)';
  trSec.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  ws3.getRow(r3).height = 22;
  r3 += 1;

  const trHeaders = [
    'No',
    'Tanggal',
    'Dari Kas / Rekening',
    'Ke Kas / Rekening',
    'No. Bukti',
    'Nominal',
    'Catatan',
  ];
  ws3.getRow(r3).height = 24;
  trHeaders.forEach((h, idx) => {
    const colIdx = idx === 6 ? 7 : idx + 1;
    const cell = ws3.getCell(r3, colIdx);
    if (idx === 6) {
      ws3.mergeCells(r3, 7, r3, 9);
    }
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  if (trHeaders.length === 7) {
    applyBorderToRange(ws3, r3, 7, r3, 9, THIN_BORDER);
  }
  r3 += 1;

  const sortedTransfers = [...transfers].sort((a, b) => b.date.localeCompare(a.date));
  if (sortedTransfers.length === 0) {
    ws3.mergeCells(r3, 1, r3, 9);
    const emptyTr = ws3.getCell(r3, 1);
    emptyTr.value = 'Belum ada catatan perpindahan dana antar kas dan rekening.';
    emptyTr.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    emptyTr.alignment = { horizontal: 'center', vertical: 'middle' };
    ws3.getRow(r3).height = 24;
    applyBorderToRange(ws3, r3, 1, r3, 9, LIGHT_BORDER);
  } else {
    sortedTransfers.forEach((tr, idx) => {
      ws3.getRow(r3).height = 22;
      const bg = idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF';
      const cells: [number, string | number][] = [
        [1, idx + 1],
        [2, tr.date],
        [3, tr.fromAccountName],
        [4, tr.toAccountName],
        [5, tr.referenceNo || '—'],
        [6, tr.amount],
        [7, tr.notes || '—'],
      ];
      ws3.mergeCells(r3, 7, r3, 9);
      cells.forEach(([cNum, val]) => {
        const cell = ws3.getCell(r3, cNum);
        cell.value = val;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = LIGHT_BORDER;
        if (cNum === 6) {
          cell.numFmt = CURRENCY_FMT;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        } else if (cNum === 1 || cNum === 2 || cNum === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        }
      });
      applyBorderToRange(ws3, r3, 7, r3, 9, LIGHT_BORDER);
      r3 += 1;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Laporan-Keuangan-Perusahaan-${fileSlug}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
