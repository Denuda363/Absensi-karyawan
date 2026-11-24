import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderCog,
  Landmark,
  Layers,
  Pencil,
  Plus,
  Printer,
  Search,
  Tags,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  AppSettings,
  Employee,
  FinanceAccount,
  FinanceAccountKind,
  FinanceCategory,
  FinanceDatabaseState,
  FinancePaymentMethod,
  FinanceTransaction,
  FinanceTransactionType,
  FinanceTransfer,
  formatIndonesianDate,
  formatIndonesianMonth,
  formatShortDateLabel,
  getCurrentYearMonth,
  getDaysInMonth,
  getTodayDateStr,
} from '../types';
import {
  AdminModeUnauthorizedError,
  createFinanceAccount,
  createFinanceCategory,
  createFinanceTransaction,
  createFinanceTransfer,
  deleteFinanceAccount,
  deleteFinanceCategory,
  deleteFinanceTransaction,
  deleteFinanceTransfer,
  downloadFinanceBackupJson,
  fetchFinanceState,
  restoreFinanceBackup,
  updateFinanceAccount,
  updateFinanceCategory,
  updateFinanceTransaction,
} from '../services/financeService';
import { subscribeRealtimeScopes } from '../services/realtimeService';
import { formatRupiah } from '../utils/payrollCalculator';
import { exportFinanceToExcel } from '../utils/excelFinanceExport';

interface FinanceViewProps {
  adminToken: string;
  settings: AppSettings;
  employees?: Employee[];
  onExitAdminMode: () => void;
}

type MainLedgerTab = 'dashboard' | 'per-kategori' | 'kronologis' | 'perpindahan';
type ManageModalTab = 'rekening' | 'kategori-pengeluaran' | 'kategori-pendapatan';
type TransferPreset = 'cash-to-bank' | 'bank-to-cash' | 'bank-to-bank';
type ChartGranularity = 'harian' | 'bulanan';

function formatSignedRupiah(amount: number): string {
  if (amount < 0) return `-${formatRupiah(Math.abs(amount))}`;
  return formatRupiah(amount);
}

function formatCompactRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)}rb`;
  }
  return `${sign}Rp ${abs}`;
}

function buildTrailingYearMonths(anchorMonth: string, count: number): string[] {
  const parts = anchorMonth.split('-').map(Number);
  const baseYear = parts[0] || new Date().getFullYear();
  const baseMonth = parts[1] || new Date().getMonth() + 1;
  const baseIndex = baseYear * 12 + (baseMonth - 1);
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const idx = baseIndex - offset;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    result.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return result;
}

function formatShortMonthLabel(yearMonth: string): string {
  const parts = yearMonth.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return yearMonth;
  const dt = new Date(parts[0], parts[1] - 1, 1);
  return dt.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  adminToken,
  settings,
  employees = [],
  onExitAdminMode,
}) => {
  const [financeData, setFinanceData] = useState<FinanceDatabaseState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter states
  const [periodMode, setPeriodMode] = useState<'month' | 'all'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [typeFilter, setTypeFilter] = useState<'all' | FinanceTransactionType>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | FinancePaymentMethod>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ledgerTab, setLedgerTab] = useState<MainLedgerTab>('dashboard');
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('harian');
  const [chartMonthRange, setChartMonthRange] = useState<6 | 12>(6);
  const [focusedMovementKey, setFocusedMovementKey] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  // Transaction Form Modal
  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [txType, setTxType] = useState<FinanceTransactionType>('pengeluaran');
  const [txMethod, setTxMethod] = useState<FinancePaymentMethod>('cash');
  const [txDate, setTxDate] = useState<string>(getTodayDateStr());
  const [txCategoryId, setTxCategoryId] = useState<string>('');
  const [txAccountId, setTxAccountId] = useState<string>('');
  const [txTitle, setTxTitle] = useState<string>('');
  const [txCounterparty, setTxCounterparty] = useState<string>('');
  const [txReferenceNo, setTxReferenceNo] = useState<string>('');
  const [txAmount, setTxAmount] = useState<number>(0);
  const [txNotes, setTxNotes] = useState<string>('');
  const [savingTx, setSavingTx] = useState<boolean>(false);

  // Internal Transfer Modal (Cash <-> Rekening / Antar Rekening)
  const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
  const [transferPreset, setTransferPreset] = useState<TransferPreset>('cash-to-bank');
  const [trDate, setTrDate] = useState<string>(getTodayDateStr());
  const [trFromAccountId, setTrFromAccountId] = useState<string>('');
  const [trToAccountId, setTrToAccountId] = useState<string>('');
  const [trAmount, setTrAmount] = useState<number>(0);
  const [trRefNo, setTrRefNo] = useState<string>('');
  const [trNotes, setTrNotes] = useState<string>('');
  const [savingTransfer, setSavingTransfer] = useState<boolean>(false);
  const [transferModalError, setTransferModalError] = useState<string | null>(null);

  // Delete Confirmation Modal (Transaction or Transfer)
  const [deletingTxTarget, setDeletingTxTarget] = useState<FinanceTransaction | null>(null);
  const [deletingTransferTarget, setDeletingTransferTarget] = useState<FinanceTransfer | null>(
    null
  );
  const [deletingItem, setDeletingItem] = useState<boolean>(false);

  // Manage Accounts & Categories Modal
  const [manageModalOpen, setManageModalOpen] = useState<boolean>(false);
  const [manageTab, setManageTab] = useState<ManageModalTab>('rekening');
  const [manageError, setManageError] = useState<string | null>(null);

  // Category CRUD inside Manage Modal
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState<string>('');
  const [savingCat, setSavingCat] = useState<boolean>(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState<string>('');
  const [editCatDesc, setEditCatDesc] = useState<string>('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // Account CRUD inside Manage Modal
  const [newAccKind, setNewAccKind] = useState<FinanceAccountKind>('rekening');
  const [newAccBankName, setNewAccBankName] = useState<string>('BRI');
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccNumber, setNewAccNumber] = useState<string>('');
  const [newAccHolder, setNewAccHolder] = useState<string>('');
  const [newAccOpening, setNewAccOpening] = useState<number>(0);
  const [savingAcc, setSavingAcc] = useState<boolean>(false);
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editAccName, setEditAccName] = useState<string>('');
  const [editAccBankName, setEditAccBankName] = useState<string>('');
  const [editAccNumber, setEditAccNumber] = useState<string>('');
  const [editAccHolder, setEditAccHolder] = useState<string>('');
  const [editAccOpening, setEditAccOpening] = useState<number>(0);
  const [confirmDeleteAccId, setConfirmDeleteAccId] = useState<string | null>(null);
  const [deletingAccId, setDeletingAccId] = useState<string | null>(null);

  // Backup / Restore Modal
  const [backupModalOpen, setBackupModalOpen] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : fallback);
    },
    [onExitAdminMode]
  );

  const loadFinanceData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
        setErrorMessage(null);
      }
      try {
        const data = await fetchFinanceState(adminToken);
        setFinanceData(data);
        if (options?.silent) {
          setErrorMessage(null);
        }
      } catch (err) {
        if (err instanceof AdminModeUnauthorizedError || !options?.silent) {
          handleApiError(err, 'Gagal memuat data keuangan perusahaan.');
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [adminToken, handleApiError]
  );

  useEffect(() => {
    void loadFinanceData();
  }, [loadFinanceData]);

  useEffect(() => {
    const unsub = subscribeRealtimeScopes(
      ['finance'],
      () => {
        void loadFinanceData({ silent: true });
      },
      { ignoreImmediateLocalEcho: true }
    );
    return () => unsub();
  }, [loadFinanceData]);

  const accounts = useMemo(() => financeData?.accounts ?? [], [financeData]);
  const categories = useMemo(() => financeData?.categories ?? [], [financeData]);
  const allTransactions = useMemo(() => financeData?.transactions ?? [], [financeData]);
  const allTransfers = useMemo(() => financeData?.transfers ?? [], [financeData]);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'cash'),
    [accounts]
  );
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'rekening'),
    [accounts]
  );

  // Live Account Balances (Opening + All Income - All Expense + Transfers In - Transfers Out)
  const accountBalances = useMemo(() => {
    return accounts.map((acc) => {
      let totalIn = 0;
      let totalOut = 0;
      let txCount = 0;
      for (const tx of allTransactions) {
        if (tx.accountId === acc.id) {
          txCount += 1;
          if (tx.type === 'pendapatan') totalIn += tx.amount;
          else totalOut += tx.amount;
        }
      }
      let transferIn = 0;
      let transferOut = 0;
      let trCount = 0;
      for (const tr of allTransfers) {
        if (tr.toAccountId === acc.id) {
          transferIn += tr.amount;
          trCount += 1;
        }
        if (tr.fromAccountId === acc.id) {
          transferOut += tr.amount;
          trCount += 1;
        }
      }
      const netTransfer = transferIn - transferOut;
      const balance = (acc.openingBalance || 0) + totalIn - totalOut + netTransfer;
      return {
        account: acc,
        totalIn,
        totalOut,
        transferIn,
        transferOut,
        netTransfer,
        balance,
        usageCount: txCount + trCount,
      };
    });
  }, [accounts, allTransactions, allTransfers]);

  const accountBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of accountBalances) {
      map.set(item.account.id, item.balance);
    }
    return map;
  }, [accountBalances]);

  const totalCashBalance = useMemo(
    () =>
      accountBalances
        .filter((b) => b.account.kind === 'cash')
        .reduce((acc, b) => acc + b.balance, 0),
    [accountBalances]
  );

  const totalBankBalance = useMemo(
    () =>
      accountBalances
        .filter((b) => b.account.kind === 'rekening')
        .reduce((acc, b) => acc + b.balance, 0),
    [accountBalances]
  );

  // Reset category filter if type filter hides selected category
  const availableFilterCategories = useMemo(() => {
    if (typeFilter === 'all') return categories;
    return categories.filter((c) => c.type === typeFilter);
  }, [categories, typeFilter]);

  useEffect(() => {
    if (
      categoryFilter !== 'all' &&
      !availableFilterCategories.some((c) => c.id === categoryFilter)
    ) {
      setCategoryFilter('all');
    }
  }, [availableFilterCategories, categoryFilter]);

  // Period-scoped transactions & transfers
  const periodTransactions = useMemo(() => {
    if (periodMode === 'all') return allTransactions;
    return allTransactions.filter((tx) => tx.date.startsWith(selectedMonth));
  }, [allTransactions, periodMode, selectedMonth]);

  const periodTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...allTransfers]
      .filter((tr) => (periodMode === 'all' ? true : tr.date.startsWith(selectedMonth)))
      .filter((tr) =>
        accountFilter === 'all'
          ? true
          : tr.fromAccountId === accountFilter || tr.toAccountId === accountFilter
      )
      .filter((tr) => {
        if (!q) return true;
        return (
          tr.fromAccountName.toLowerCase().includes(q) ||
          tr.toAccountName.toLowerCase().includes(q) ||
          tr.referenceNo.toLowerCase().includes(q) ||
          tr.notes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [allTransfers, periodMode, selectedMonth, accountFilter, searchQuery]);

  // Fully filtered transactions
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...periodTransactions]
      .filter((tx) => (typeFilter === 'all' ? true : tx.type === typeFilter))
      .filter((tx) => (methodFilter === 'all' ? true : tx.method === methodFilter))
      .filter((tx) => (categoryFilter === 'all' ? true : tx.categoryId === categoryFilter))
      .filter((tx) => (accountFilter === 'all' ? true : tx.accountId === accountFilter))
      .filter((tx) => {
        if (!q) return true;
        return (
          tx.title.toLowerCase().includes(q) ||
          tx.categoryName.toLowerCase().includes(q) ||
          tx.counterparty.toLowerCase().includes(q) ||
          tx.bankAccount.toLowerCase().includes(q) ||
          tx.referenceNo.toLowerCase().includes(q) ||
          tx.notes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [
    periodTransactions,
    typeFilter,
    methodFilter,
    categoryFilter,
    accountFilter,
    searchQuery,
  ]);

  // Period KPI totals
  const periodMetrics = useMemo(() => {
    let incomeCash = 0;
    let incomeTransfer = 0;
    let expenseCash = 0;
    let expenseTransfer = 0;

    for (const tx of periodTransactions) {
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
    const netBalance = totalIncome - totalExpense;

    return {
      incomeCash,
      incomeTransfer,
      totalIncome,
      expenseCash,
      expenseTransfer,
      totalExpense,
      netBalance,
      totalCount: periodTransactions.length,
    };
  }, [periodTransactions]);

  // Filtered table totals
  const filteredMetrics = useMemo(() => {
    let incomeCash = 0;
    let incomeTransfer = 0;
    let expenseCash = 0;
    let expenseTransfer = 0;
    for (const tx of filteredTransactions) {
      if (tx.type === 'pendapatan') {
        if (tx.method === 'cash') incomeCash += tx.amount;
        else incomeTransfer += tx.amount;
      } else {
        if (tx.method === 'cash') expenseCash += tx.amount;
        else expenseTransfer += tx.amount;
      }
    }
    return {
      incomeCash,
      incomeTransfer,
      totalIncome: incomeCash + incomeTransfer,
      expenseCash,
      expenseTransfer,
      totalExpense: expenseCash + expenseTransfer,
      net: incomeCash + incomeTransfer - (expenseCash + expenseTransfer),
    };
  }, [filteredTransactions]);

  // Category Breakdowns (Period-level)
  const buildCategorySummary = useCallback(
    (kind: FinanceTransactionType, baseAmount: number) => {
      const cats = categories.filter((c) => c.type === kind);
      const map = new Map<
        string,
        {
          id: string;
          name: string;
          description: string;
          cash: number;
          transfer: number;
          count: number;
        }
      >();
      for (const c of cats) {
        map.set(c.id, {
          id: c.id,
          name: c.name,
          description: c.description,
          cash: 0,
          transfer: 0,
          count: 0,
        });
      }
      for (const tx of periodTransactions) {
        if (tx.type !== kind) continue;
        const entry = map.get(tx.categoryId) || {
          id: tx.categoryId,
          name: tx.categoryName,
          description: '',
          cash: 0,
          transfer: 0,
          count: 0,
        };
        if (tx.method === 'cash') entry.cash += tx.amount;
        else entry.transfer += tx.amount;
        entry.count += 1;
        map.set(tx.categoryId, entry);
      }
      return Array.from(map.values())
        .map((item) => ({
          ...item,
          total: item.cash + item.transfer,
          pct:
            baseAmount > 0
              ? Math.round(((item.cash + item.transfer) / baseAmount) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    },
    [categories, periodTransactions]
  );

  const incomeCategoryBreakdown = useMemo(
    () => buildCategorySummary('pendapatan', periodMetrics.totalIncome),
    [buildCategorySummary, periodMetrics.totalIncome]
  );

  const expenseCategoryBreakdown = useMemo(
    () => buildCategorySummary('pengeluaran', periodMetrics.totalExpense),
    [buildCategorySummary, periodMetrics.totalExpense]
  );

  // Grouped Transactions by Type -> Category (for clean "Dikelompokkan per Kategori" view)
  const groupedTransactions = useMemo(() => {
    const buildGroups = (kind: FinanceTransactionType) => {
      const map = new Map<
        string,
        {
          categoryId: string;
          categoryName: string;
          cashTotal: number;
          transferTotal: number;
          total: number;
          items: FinanceTransaction[];
        }
      >();

      for (const tx of filteredTransactions) {
        if (tx.type !== kind) continue;
        const existing = map.get(tx.categoryId) || {
          categoryId: tx.categoryId,
          categoryName: tx.categoryName,
          cashTotal: 0,
          transferTotal: 0,
          total: 0,
          items: [],
        };
        if (tx.method === 'cash') existing.cashTotal += tx.amount;
        else existing.transferTotal += tx.amount;
        existing.total += tx.amount;
        existing.items.push(tx);
        map.set(tx.categoryId, existing);
      }

      return Array.from(map.values()).sort(
        (a, b) => b.total - a.total || a.categoryName.localeCompare(b.categoryName)
      );
    };

    return {
      pendapatan: buildGroups('pendapatan'),
      pengeluaran: buildGroups('pengeluaran'),
    };
  }, [filteredTransactions]);

  // Usage counts for category delete protection
  const categoryUsageCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of allTransactions) {
      counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [allTransactions]);

  const periodLabel =
    periodMode === 'all' ? 'Semua Periode' : formatIndonesianMonth(selectedMonth);

  // Dashboard Keuangan: Filtered non-period transactions & transfers for consistent chart analytics
  const chartScopedTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTransactions
      .filter((tx) => (typeFilter === 'all' ? true : tx.type === typeFilter))
      .filter((tx) => (methodFilter === 'all' ? true : tx.method === methodFilter))
      .filter((tx) => (categoryFilter === 'all' ? true : tx.categoryId === categoryFilter))
      .filter((tx) => (accountFilter === 'all' ? true : tx.accountId === accountFilter))
      .filter((tx) => {
        if (!q) return true;
        return (
          tx.title.toLowerCase().includes(q) ||
          tx.categoryName.toLowerCase().includes(q) ||
          tx.counterparty.toLowerCase().includes(q) ||
          tx.bankAccount.toLowerCase().includes(q) ||
          tx.referenceNo.toLowerCase().includes(q) ||
          tx.notes.toLowerCase().includes(q)
        );
      });
  }, [
    allTransactions,
    typeFilter,
    methodFilter,
    categoryFilter,
    accountFilter,
    searchQuery,
  ]);

  const chartScopedTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTransfers
      .filter((tr) =>
        accountFilter === 'all'
          ? true
          : tr.fromAccountId === accountFilter || tr.toAccountId === accountFilter
      )
      .filter((tr) => {
        if (!q) return true;
        return (
          tr.fromAccountName.toLowerCase().includes(q) ||
          tr.toAccountName.toLowerCase().includes(q) ||
          tr.referenceNo.toLowerCase().includes(q) ||
          tr.notes.toLowerCase().includes(q)
        );
      });
  }, [allTransfers, accountFilter, searchQuery]);

  const movementAnchorMonth = useMemo(() => {
    if (periodMode === 'month') return selectedMonth;
    const latestTx = allTransactions.reduce(
      (max, tx) => (tx.date.slice(0, 7) > max ? tx.date.slice(0, 7) : max),
      ''
    );
    const latestTr = allTransfers.reduce(
      (max, tr) => (tr.date.slice(0, 7) > max ? tr.date.slice(0, 7) : max),
      ''
    );
    const currentYm = getCurrentYearMonth();
    const candidates = [latestTx, latestTr, currentYm].filter(Boolean).sort();
    return candidates[candidates.length - 1] || currentYm;
  }, [periodMode, selectedMonth, allTransactions, allTransfers]);

  const movementSeries = useMemo(() => {
    const keys =
      chartGranularity === 'harian'
        ? getDaysInMonth(selectedMonth)
        : buildTrailingYearMonths(movementAnchorMonth, chartMonthRange);

    let runningNet = 0;
    const points = keys.map((key) => {
      let incomeCash = 0;
      let incomeTransfer = 0;
      let expenseCash = 0;
      let expenseTransfer = 0;
      let txCount = 0;

      for (const tx of chartScopedTransactions) {
        const match =
          chartGranularity === 'harian' ? tx.date === key : tx.date.startsWith(key);
        if (!match) continue;
        txCount += 1;
        if (tx.type === 'pendapatan') {
          if (tx.method === 'cash') incomeCash += tx.amount;
          else incomeTransfer += tx.amount;
        } else {
          if (tx.method === 'cash') expenseCash += tx.amount;
          else expenseTransfer += tx.amount;
        }
      }

      let transferVolume = 0;
      let transferCount = 0;
      for (const tr of chartScopedTransfers) {
        const match =
          chartGranularity === 'harian' ? tr.date === key : tr.date.startsWith(key);
        if (!match) continue;
        transferVolume += tr.amount;
        transferCount += 1;
      }

      const totalIncome = incomeCash + incomeTransfer;
      const totalExpense = expenseCash + expenseTransfer;
      const net = totalIncome - totalExpense;
      runningNet += net;

      return {
        key,
        shortLabel:
          chartGranularity === 'harian' ? key.slice(8, 10) : formatShortMonthLabel(key),
        fullLabel:
          chartGranularity === 'harian'
            ? `${formatShortDateLabel(key)} · ${formatIndonesianDate(key)}`
            : formatIndonesianMonth(key),
        incomeCash,
        incomeTransfer,
        totalIncome,
        expenseCash,
        expenseTransfer,
        totalExpense,
        net,
        cumulativeNet: runningNet,
        transferVolume,
        txCount,
        transferCount,
      };
    });

    const maxFlow = Math.max(
      1,
      ...points.map((p) => Math.max(p.totalIncome, p.totalExpense))
    );
    const hasFlow = points.some(
      (p) => p.totalIncome > 0 || p.totalExpense > 0 || p.transferVolume > 0
    );
    const minCum = Math.min(0, ...points.map((p) => p.cumulativeNet));
    const maxCum = Math.max(0, ...points.map((p) => p.cumulativeNet));
    const cumSpan = Math.max(1, maxCum - minCum);

    const totalSeriesIncome = points.reduce((s, p) => s + p.totalIncome, 0);
    const totalSeriesExpense = points.reduce((s, p) => s + p.totalExpense, 0);
    const totalSeriesTransferVol = points.reduce((s, p) => s + p.transferVolume, 0);
    const activeBuckets = points.filter((p) => p.txCount > 0 || p.transferCount > 0).length;

    return {
      points,
      maxFlow,
      hasFlow,
      minCum,
      maxCum,
      cumSpan,
      totalSeriesIncome,
      totalSeriesExpense,
      totalSeriesNet: totalSeriesIncome - totalSeriesExpense,
      totalSeriesTransferVol,
      activeBuckets,
    };
  }, [
    chartGranularity,
    selectedMonth,
    movementAnchorMonth,
    chartMonthRange,
    chartScopedTransactions,
    chartScopedTransfers,
  ]);

  const activeMovementPoint = useMemo(() => {
    if (movementSeries.points.length === 0) return null;
    if (focusedMovementKey) {
      const found = movementSeries.points.find((p) => p.key === focusedMovementKey);
      if (found) return found;
    }
    const todayStr = getTodayDateStr();
    const todayKey =
      chartGranularity === 'harian' ? todayStr : todayStr.slice(0, 7);
    const todayMatch = movementSeries.points.find((p) => p.key === todayKey);
    if (todayMatch && (todayMatch.txCount > 0 || todayMatch.transferCount > 0)) {
      return todayMatch;
    }
    for (let i = movementSeries.points.length - 1; i >= 0; i--) {
      if (
        movementSeries.points[i].txCount > 0 ||
        movementSeries.points[i].transferCount > 0
      ) {
        return movementSeries.points[i];
      }
    }
    return movementSeries.points[movementSeries.points.length - 1];
  }, [movementSeries.points, focusedMovementKey, chartGranularity]);

  // Account-level Period Movement Summary (for Dashboard)
  const accountPeriodMovements = useMemo(() => {
    return accountBalances.map(({ account, balance }) => {
      let periodIn = 0;
      let periodOut = 0;
      let periodTransferIn = 0;
      let periodTransferOut = 0;

      for (const tx of periodTransactions) {
        if (tx.accountId !== account.id) continue;
        if (tx.type === 'pendapatan') periodIn += tx.amount;
        else periodOut += tx.amount;
      }

      for (const tr of allTransfers) {
        if (periodMode === 'month' && !tr.date.startsWith(selectedMonth)) continue;
        if (tr.toAccountId === account.id) periodTransferIn += tr.amount;
        if (tr.fromAccountId === account.id) periodTransferOut += tr.amount;
      }

      return {
        account,
        periodIn,
        periodOut,
        periodNetTransfer: periodTransferIn - periodTransferOut,
        periodNet: periodIn - periodOut + (periodTransferIn - periodTransferOut),
        liveBalance: balance,
      };
    });
  }, [accountBalances, periodTransactions, allTransfers, periodMode, selectedMonth]);

  // Transfer Direction Breakdown (Cash -> Bank, Bank -> Cash, Bank -> Bank)
  const transferDirectionSummary = useMemo(() => {
    const accKindMap = new Map<string, FinanceAccountKind>();
    for (const acc of accounts) {
      accKindMap.set(acc.id, acc.kind);
    }

    let cashToBank = 0;
    let bankToCash = 0;
    let bankToBank = 0;
    let count = 0;

    for (const tr of periodTransfers) {
      count += 1;
      const fromKind = accKindMap.get(tr.fromAccountId) ?? 'rekening';
      const toKind = accKindMap.get(tr.toAccountId) ?? 'rekening';
      if (fromKind === 'cash' && toKind === 'rekening') cashToBank += tr.amount;
      else if (fromKind === 'rekening' && toKind === 'cash') bankToCash += tr.amount;
      else bankToBank += tr.amount;
    }

    return {
      cashToBank,
      bankToCash,
      bankToBank,
      totalVolume: cashToBank + bankToCash + bankToBank,
      count,
    };
  }, [accounts, periodTransfers]);

  // Unified Recent Movements Feed (Transactions + Internal Transfers)
  const recentCombinedMovements = useMemo(() => {
    type MovementFeedItem =
      | {
          kind: 'transaction';
          id: string;
          date: string;
          sortKey: string;
          tx: FinanceTransaction;
        }
      | {
          kind: 'transfer';
          id: string;
          date: string;
          sortKey: string;
          tr: FinanceTransfer;
        };

    const items: MovementFeedItem[] = [];
    for (const tx of filteredTransactions) {
      items.push({
        kind: 'transaction',
        id: `tx-${tx.id}`,
        date: tx.date,
        sortKey: `${tx.date}_${tx.createdAt || ''}`,
        tx,
      });
    }
    if (typeFilter === 'all' && categoryFilter === 'all' && methodFilter === 'all') {
      for (const tr of periodTransfers) {
        items.push({
          kind: 'transfer',
          id: `tr-${tr.id}`,
          date: tr.date,
          sortKey: `${tr.date}_${tr.createdAt || ''}`,
          tr,
        });
      }
    }

    return items
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, 10);
  }, [
    filteredTransactions,
    periodTransfers,
    typeFilter,
    categoryFilter,
    methodFilter,
  ]);

  // Transaction Modal Helpers
  const openCreateTxModal = (
    defaultType: FinanceTransactionType,
    presetMethod?: FinancePaymentMethod,
    presetCategoryId?: string
  ) => {
    const matchingCats = categories.filter((c) => c.type === defaultType);
    const chosenMethod: FinancePaymentMethod =
      presetMethod ?? (defaultType === 'pendapatan' ? 'transfer' : 'cash');
    const matchingAccounts = chosenMethod === 'cash' ? cashAccounts : bankAccounts;

    setEditingTx(null);
    setTxType(defaultType);
    setTxMethod(chosenMethod);
    setTxDate(getTodayDateStr());
    setTxCategoryId(
      presetCategoryId && matchingCats.some((c) => c.id === presetCategoryId)
        ? presetCategoryId
        : matchingCats[0]?.id || ''
    );
    setTxAccountId(matchingAccounts[0]?.id || '');
    setTxTitle('');
    setTxCounterparty('');
    setTxReferenceNo('');
    setTxAmount(0);
    setTxNotes('');
    setTxModalOpen(true);
  };

  const openEditTxModal = (tx: FinanceTransaction) => {
    const matchingAccounts = tx.method === 'cash' ? cashAccounts : bankAccounts;
    setEditingTx(tx);
    setTxType(tx.type);
    setTxMethod(tx.method);
    setTxDate(tx.date);
    setTxCategoryId(tx.categoryId);
    setTxAccountId(tx.accountId || matchingAccounts[0]?.id || '');
    setTxTitle(tx.title);
    setTxCounterparty(tx.counterparty);
    setTxReferenceNo(tx.referenceNo);
    setTxAmount(tx.amount);
    setTxNotes(tx.notes);
    setTxModalOpen(true);
  };

  const handleTxTypeSwitch = (nextType: FinanceTransactionType) => {
    setTxType(nextType);
    const matching = categories.filter((c) => c.type === nextType);
    if (!matching.some((c) => c.id === txCategoryId)) {
      setTxCategoryId(matching[0]?.id || '');
    }
  };

  const handleTxMethodSwitch = (nextMethod: FinancePaymentMethod) => {
    setTxMethod(nextMethod);
    const list = nextMethod === 'cash' ? cashAccounts : bankAccounts;
    if (!list.some((a) => a.id === txAccountId)) {
      setTxAccountId(list[0]?.id || '');
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txTitle.trim() || !txCategoryId || !txAccountId || txAmount <= 0) {
      setErrorMessage(
        'Keterangan transaksi, kategori, kas/rekening tujuan, dan nominal lebih dari Rp 0 wajib diisi.'
      );
      return;
    }
    setSavingTx(true);
    setErrorMessage(null);
    setBannerMessage(null);
    try {
      if (editingTx) {
        const updated = await updateFinanceTransaction(adminToken, editingTx.id, {
          date: txDate,
          type: txType,
          method: txMethod,
          categoryId: txCategoryId,
          accountId: txAccountId,
          title: txTitle.trim(),
          counterparty: txCounterparty.trim(),
          referenceNo: txReferenceNo.trim(),
          amount: Math.round(txAmount),
          notes: txNotes.trim(),
        });
        setFinanceData((prev) =>
          prev
            ? {
                ...prev,
                transactions: prev.transactions.map((t) =>
                  t.id === updated.id ? updated : t
                ),
              }
            : prev
        );
        setBannerMessage(`Transaksi "${updated.title}" berhasil diperbarui.`);
      } else {
        const created = await createFinanceTransaction(adminToken, {
          date: txDate,
          type: txType,
          method: txMethod,
          categoryId: txCategoryId,
          accountId: txAccountId,
          title: txTitle.trim(),
          counterparty: txCounterparty.trim(),
          referenceNo: txReferenceNo.trim(),
          amount: Math.round(txAmount),
          notes: txNotes.trim(),
        });
        setFinanceData((prev) =>
          prev
            ? {
                ...prev,
                transactions: [...prev.transactions, created],
              }
            : prev
        );
        setBannerMessage(
          `${created.type === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'} via ${
            created.bankAccount
          } sebesar ${formatRupiah(created.amount)} berhasil dicatat.`
        );
      }
      setTxModalOpen(false);
    } catch (err) {
      handleApiError(err, 'Gagal menyimpan transaksi keuangan.');
    } finally {
      setSavingTx(false);
    }
  };

  // Internal Transfer Modal Helpers
  const applyTransferPreset = (preset: TransferPreset) => {
    setTransferPreset(preset);
    setTransferModalError(null);
    if (preset === 'cash-to-bank') {
      setTrFromAccountId(cashAccounts[0]?.id || accounts[0]?.id || '');
      setTrToAccountId(bankAccounts[0]?.id || accounts[1]?.id || '');
    } else if (preset === 'bank-to-cash') {
      setTrFromAccountId(bankAccounts[0]?.id || accounts[0]?.id || '');
      setTrToAccountId(cashAccounts[0]?.id || accounts[1]?.id || '');
    } else {
      setTrFromAccountId(bankAccounts[0]?.id || accounts[0]?.id || '');
      setTrToAccountId(bankAccounts[1]?.id || bankAccounts[0]?.id || '');
    }
  };

  const openTransferModal = (preset: TransferPreset = 'cash-to-bank') => {
    setTrDate(getTodayDateStr());
    setTrAmount(0);
    setTrRefNo('');
    setTrNotes('');
    applyTransferPreset(preset);
    setTransferModalOpen(true);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trFromAccountId || !trToAccountId) {
      setTransferModalError('Akun sumber dan akun tujuan wajib dipilih.');
      return;
    }
    if (trFromAccountId === trToAccountId) {
      setTransferModalError('Akun sumber dan akun tujuan tidak boleh sama.');
      return;
    }
    if (trAmount <= 0) {
      setTransferModalError('Nominal perpindahan dana harus lebih dari Rp 0.');
      return;
    }
    setSavingTransfer(true);
    setTransferModalError(null);
    try {
      const created = await createFinanceTransfer(adminToken, {
        date: trDate,
        fromAccountId: trFromAccountId,
        toAccountId: trToAccountId,
        amount: Math.round(trAmount),
        referenceNo: trRefNo.trim(),
        notes: trNotes.trim(),
      });
      setFinanceData((prev) =>
        prev ? { ...prev, transfers: [...prev.transfers, created] } : prev
      );
      setTransferModalOpen(false);
      setLedgerTab('perpindahan');
      setBannerMessage(
        `Perpindahan dana ${formatRupiah(created.amount)} dari ${created.fromAccountName} ke ${created.toAccountName} berhasil dicatat.`
      );
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setTransferModalError(
        err instanceof Error ? err.message : 'Gagal mencatat perpindahan dana.'
      );
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeletingItem(true);
    setErrorMessage(null);
    try {
      if (deletingTxTarget) {
        await deleteFinanceTransaction(adminToken, deletingTxTarget.id);
        setFinanceData((prev) =>
          prev
            ? {
                ...prev,
                transactions: prev.transactions.filter(
                  (t) => t.id !== deletingTxTarget.id
                ),
              }
            : prev
        );
        setBannerMessage(`Transaksi "${deletingTxTarget.title}" telah dihapus.`);
        setDeletingTxTarget(null);
      } else if (deletingTransferTarget) {
        await deleteFinanceTransfer(adminToken, deletingTransferTarget.id);
        setFinanceData((prev) =>
          prev
            ? {
                ...prev,
                transfers: prev.transfers.filter(
                  (tr) => tr.id !== deletingTransferTarget.id
                ),
              }
            : prev
        );
        setBannerMessage(
          `Catatan perpindahan dana ${formatRupiah(deletingTransferTarget.amount)} telah dihapus.`
        );
        setDeletingTransferTarget(null);
      }
    } catch (err) {
      handleApiError(err, 'Gagal menghapus data.');
    } finally {
      setDeletingItem(false);
    }
  };

  // Manage Accounts & Categories Modal Helpers
  const openManageModal = (initialTab: ManageModalTab = 'rekening') => {
    setManageTab(initialTab);
    setManageError(null);
    setNewCatName('');
    setNewCatDesc('');
    setEditingCatId(null);
    setConfirmDeleteCatId(null);
    setNewAccKind('rekening');
    setNewAccBankName('BRI');
    setNewAccName('');
    setNewAccNumber('');
    setNewAccHolder('');
    setNewAccOpening(0);
    setEditingAccId(null);
    setConfirmDeleteAccId(null);
    setManageModalOpen(true);
  };

  const activeCategoryType: FinanceTransactionType =
    manageTab === 'kategori-pendapatan' ? 'pendapatan' : 'pengeluaran';

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) {
      setManageError('Nama kategori wajib diisi.');
      return;
    }
    setSavingCat(true);
    setManageError(null);
    try {
      const created = await createFinanceCategory(adminToken, {
        name: newCatName.trim(),
        type: activeCategoryType,
        description: newCatDesc.trim(),
      });
      setFinanceData((prev) =>
        prev ? { ...prev, categories: [...prev.categories, created] } : prev
      );
      setNewCatName('');
      setNewCatDesc('');
      setBannerMessage(`Kategori ${activeCategoryType} "${created.name}" ditambahkan.`);
      if (txModalOpen && txType === created.type) {
        setTxCategoryId(created.id);
      }
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal menambah kategori.');
    } finally {
      setSavingCat(false);
    }
  };

  const handleSaveEditCategory = async (catId: string) => {
    if (!editCatName.trim()) {
      setManageError('Nama kategori tidak boleh kosong.');
      return;
    }
    setSavingCat(true);
    setManageError(null);
    try {
      const updated = await updateFinanceCategory(adminToken, catId, {
        name: editCatName.trim(),
        description: editCatDesc.trim(),
      });
      setFinanceData((prev) =>
        prev
          ? {
              ...prev,
              categories: prev.categories.map((c) => (c.id === updated.id ? updated : c)),
              transactions: prev.transactions.map((t) =>
                t.categoryId === updated.id ? { ...t, categoryName: updated.name } : t
              ),
            }
          : prev
      );
      setEditingCatId(null);
      setBannerMessage(`Kategori "${updated.name}" berhasil diperbarui.`);
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal mengubah kategori.');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingCatId(catId);
    setManageError(null);
    try {
      await deleteFinanceCategory(adminToken, catId);
      setFinanceData((prev) =>
        prev
          ? { ...prev, categories: prev.categories.filter((c) => c.id !== catId) }
          : prev
      );
      setConfirmDeleteCatId(null);
      setBannerMessage('Kategori keuangan berhasil dihapus.');
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal menghapus kategori.');
    } finally {
      setDeletingCatId(null);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) {
      setManageError('Nama rekening atau kas wajib diisi.');
      return;
    }
    setSavingAcc(true);
    setManageError(null);
    try {
      const created = await createFinanceAccount(adminToken, {
        name: newAccName.trim(),
        kind: newAccKind,
        bankName: newAccKind === 'cash' ? 'Kas Tunai' : newAccBankName.trim() || 'Bank',
        accountNumber: newAccKind === 'cash' ? '-' : newAccNumber.trim(),
        holderName: newAccHolder.trim(),
        openingBalance: Math.max(0, Math.round(newAccOpening || 0)),
      });
      setFinanceData((prev) =>
        prev ? { ...prev, accounts: [...prev.accounts, created] } : prev
      );
      setNewAccName('');
      setNewAccNumber('');
      setNewAccHolder('');
      setNewAccOpening(0);
      setBannerMessage(`Akun "${created.name}" berhasil ditambahkan.`);
      if (
        txModalOpen &&
        ((txMethod === 'cash' && created.kind === 'cash') ||
          (txMethod === 'transfer' && created.kind === 'rekening'))
      ) {
        setTxAccountId(created.id);
      }
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal menambah rekening/kas.');
    } finally {
      setSavingAcc(false);
    }
  };

  const startEditAccount = (acc: FinanceAccount) => {
    setEditingAccId(acc.id);
    setEditAccName(acc.name);
    setEditAccBankName(acc.bankName);
    setEditAccNumber(acc.accountNumber === '-' ? '' : acc.accountNumber);
    setEditAccHolder(acc.holderName);
    setEditAccOpening(acc.openingBalance || 0);
    setConfirmDeleteAccId(null);
    setManageError(null);
  };

  const handleSaveEditAccount = async (accId: string) => {
    if (!editAccName.trim()) {
      setManageError('Nama rekening atau kas tidak boleh kosong.');
      return;
    }
    setSavingAcc(true);
    setManageError(null);
    try {
      const updated = await updateFinanceAccount(adminToken, accId, {
        name: editAccName.trim(),
        bankName: editAccBankName.trim(),
        accountNumber: editAccNumber.trim(),
        holderName: editAccHolder.trim(),
        openingBalance: Math.max(0, Math.round(editAccOpening || 0)),
      });
      await loadFinanceData();
      setEditingAccId(null);
      setBannerMessage(`Akun "${updated.name}" berhasil diperbarui.`);
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal memperbarui akun.');
    } finally {
      setSavingAcc(false);
    }
  };

  const handleDeleteAccount = async (accId: string) => {
    setDeletingAccId(accId);
    setManageError(null);
    try {
      await deleteFinanceAccount(adminToken, accId);
      setFinanceData((prev) =>
        prev ? { ...prev, accounts: prev.accounts.filter((a) => a.id !== accId) } : prev
      );
      setConfirmDeleteAccId(null);
      setBannerMessage('Rekening / kas berhasil dihapus.');
    } catch (err) {
      if (err instanceof AdminModeUnauthorizedError) {
        onExitAdminMode();
        return;
      }
      setManageError(err instanceof Error ? err.message : 'Gagal menghapus akun.');
    } finally {
      setDeletingAccId(null);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    setErrorMessage(null);
    try {
      await exportFinanceToExcel({
        transactions: filteredTransactions,
        allTransactions,
        categories,
        accounts,
        transfers: allTransfers,
        employees,
        selectedMonth,
        periodMode,
        periodLabel,
        fileSlug: periodMode === 'all' ? 'Semua-Periode' : selectedMonth,
        companyName: settings.companyName,
        companyProfile: settings.companyProfile,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal mengekspor data keuangan ke Excel.'
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'No',
      'Tanggal',
      'Jenis',
      'Metode',
      'Kategori',
      'Keterangan',
      'Sumber/Penerima',
      'Kas/Rekening Bank',
      'No Bukti',
      'Nominal',
      'Catatan',
    ];
    const sortedByCat = [...filteredTransactions].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'pendapatan' ? -1 : 1;
      const catCmp = a.categoryName.localeCompare(b.categoryName);
      if (catCmp !== 0) return catCmp;
      return b.date.localeCompare(a.date);
    });
    const rows = sortedByCat.map((tx, idx) => [
      idx + 1,
      tx.date,
      tx.type === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran',
      tx.method === 'cash' ? 'Cash' : 'Transfer',
      tx.categoryName,
      tx.title,
      tx.counterparty,
      tx.bankAccount,
      tx.referenceNo,
      tx.amount,
      tx.notes,
    ]);
    const csvLines = [header, ...rows]
      .map((r) =>
        r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${csvLines}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Keuangan-Per-Kategori-${
      periodMode === 'all' ? 'Semua-Periode' : selectedMonth
    }.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setErrorMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const restored = await restoreFinanceBackup(adminToken, parsed);
      setFinanceData(restored);
      setBannerMessage('Data keuangan perusahaan berhasil dipulihkan dari file backup.');
      setBackupModalOpen(false);
    } catch (err) {
      handleApiError(err, 'File backup keuangan tidak valid atau gagal dipulihkan.');
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  };

  const modalCategories = useMemo(
    () => categories.filter((c) => c.type === txType),
    [categories, txType]
  );
  const modalAccounts = useMemo(
    () => (txMethod === 'cash' ? cashAccounts : bankAccounts),
    [txMethod, cashAccounts, bankAccounts]
  );
  const manageTabCategories = useMemo(
    () => categories.filter((c) => c.type === activeCategoryType),
    [categories, activeCategoryType]
  );

  // Category tabs data for "Tab Kategori"
  const categoryTabItems = useMemo(() => {
    const inc = incomeCategoryBreakdown.map((c) => ({
      ...c,
      type: 'pendapatan' as FinanceTransactionType,
    }));
    const exp = expenseCategoryBreakdown.map((c) => ({
      ...c,
      type: 'pengeluaran' as FinanceTransactionType,
    }));
    if (typeFilter === 'pendapatan') return inc;
    if (typeFilter === 'pengeluaran') return exp;
    return [...inc, ...exp];
  }, [incomeCategoryBreakdown, expenseCategoryBreakdown, typeFilter]);

  const focusedCategoryDetail = useMemo(() => {
    if (categoryFilter === 'all') return null;
    return categoryTabItems.find((c) => c.id === categoryFilter) ?? null;
  }, [categoryFilter, categoryTabItems]);

  const renderTransactionActions = (tx: FinanceTransaction) => (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => openEditTxModal(tx)}
        title="Edit transaksi"
        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setDeletingTxTarget(tx)}
        title="Hapus transaksi"
        className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 1. Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <Landmark className="w-3.5 h-3.5 text-blue-700" />
            <span>Mode Admin Eksklusif</span>
            <span aria-hidden="true">·</span>
            <span>Periode {periodLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {accounts.length} kas/rekening · {categories.length} kategori
            </span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Pengelolaan Keuangan Perusahaan
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openCreateTxModal('pendapatan', 'transfer')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Pendapatan</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateTxModal('pengeluaran', 'cash')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Pengeluaran</span>
          </button>

          <button
            type="button"
            onClick={() => openTransferModal('cash-to-bank')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Pindah Dana (Cash ↔ Rekening)</span>
          </button>

          <button
            type="button"
            onClick={() => openManageModal('rekening')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <FolderCog className="w-3.5 h-3.5" />
            <span>Rekening &amp; Kategori</span>
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          {(settings.companyProfile?.legalName || settings.companyName).toUpperCase()} — LAPORAN KEUANGAN PER KATEGORI
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Periode: {periodLabel} · Dicetak pada {formatIndonesianDate(getTodayDateStr())}
        </p>
      </div>

      {/* Status Banners */}
      {bannerMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{bannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-800 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && !financeData ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-xl p-5 h-32 animate-pulse"
              >
                <div className="h-3 w-28 bg-slate-200 rounded mb-4" />
                <div className="h-7 w-44 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-36 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl h-72 animate-pulse" />
        </div>
      ) : (
        <>
          {/* 2. 4-Column KPI Summary Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pendapatan ({periodLabel})</span>
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                {formatRupiah(periodMetrics.totalIncome)}
              </div>
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Cash (Tunai)</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(periodMetrics.incomeCash)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Transfer Rekening</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(periodMetrics.incomeTransfer)}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pengeluaran ({periodLabel})</span>
                <ArrowUpRight className="w-4 h-4 text-red-600" />
              </div>
              <div className="font-mono text-2xl font-bold text-red-700 tabular-nums">
                {formatRupiah(periodMetrics.totalExpense)}
              </div>
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Cash (Tunai)</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(periodMetrics.expenseCash)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Transfer Rekening</div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(periodMetrics.expenseTransfer)}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>
                  {periodMetrics.netBalance >= 0
                    ? 'Surplus Operasional'
                    : 'Defisit Operasional'}
                </span>
                <Wallet className="w-4 h-4 text-blue-700" />
              </div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums ${
                  periodMetrics.netBalance >= 0 ? 'text-blue-700' : 'text-red-700'
                }`}
              >
                {formatSignedRupiah(periodMetrics.netBalance)}
              </div>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                Selisih Pendapatan &amp; Pengeluaran pada {periodLabel} (tidak termasuk mutasi internal).
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Saldo Kas &amp; Rekening</span>
                <Building2 className="w-4 h-4 text-slate-700" />
              </div>
              <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {formatSignedRupiah(totalCashBalance + totalBankBalance)}
              </div>
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Saldo Kas Tunai</div>
                  <div className="font-mono font-semibold text-amber-700 tabular-nums mt-0.5">
                    {formatSignedRupiah(totalCashBalance)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Saldo Rekening Bank</div>
                  <div className="font-mono font-semibold text-blue-700 tabular-nums mt-0.5">
                    {formatSignedRupiah(totalBankBalance)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Global Period & Export Control Strip */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setPeriodMode('month');
                    setChartGranularity('harian');
                    setFocusedMovementKey(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    periodMode === 'month'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Per Bulan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodMode('all');
                    setChartGranularity('bulanan');
                    setFocusedMovementKey(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    periodMode === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Periode
                </button>
              </div>

              {periodMode === 'month' && (
                <input
                  type="month"
                  aria-label="Pilih bulan laporan keuangan"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              )}

              {(accountFilter !== 'all' ||
                categoryFilter !== 'all' ||
                typeFilter !== 'all' ||
                methodFilter !== 'all' ||
                searchQuery !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter('all');
                    setMethodFilter('all');
                    setCategoryFilter('all');
                    setAccountFilter('all');
                    setSearchQuery('');
                    setFocusedMovementKey(null);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Reset Filter Aktif
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{exportingExcel ? 'Menyiapkan...' : 'Excel (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          {/* 4. Workspace Section: Dashboard Keuangan / Tab Kategori / Jurnal Transaksi / Kas, Rekening & Mutasi */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start no-print">
                <button
                  type="button"
                  onClick={() => setLedgerTab('dashboard')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    ledgerTab === 'dashboard'
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Dashboard Keuangan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerTab('per-kategori')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    ledgerTab === 'per-kategori'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tab Kategori ({categories.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerTab('kronologis')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    ledgerTab === 'kronologis'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Jurnal Transaksi ({filteredTransactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerTab('perpindahan')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    ledgerTab === 'perpindahan'
                      ? 'bg-white text-blue-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Kas, Rekening &amp; Mutasi ({periodTransfers.length})</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 font-mono tabular-nums">
                <span className="text-emerald-700">
                  Masuk: {formatRupiah(filteredMetrics.totalIncome)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-red-700">
                  Keluar: {formatRupiah(filteredMetrics.totalExpense)}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    filteredMetrics.net >= 0 ? 'text-blue-800' : 'text-red-700'
                  }`}
                >
                  Bersih: {formatSignedRupiah(filteredMetrics.net)}
                </span>
              </div>
            </div>

            {/* TAB 0: DASHBOARD KHUSUS KEUANGAN (PERGERAKAN KEUANGAN) */}
            {ledgerTab === 'dashboard' && (
              <div className="p-5 space-y-6">
                {/* A. Grafik Pergerakan Arus Kas & Saldo Kumulatif */}
                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50/40 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-slate-200">
                    <div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-700" />
                        <h3 className="font-display text-sm font-bold text-slate-900">
                          Grafik Pergerakan Arus Kas{' '}
                          {chartGranularity === 'harian'
                            ? `Harian (${formatIndonesianMonth(selectedMonth)})`
                            : `Bulanan (${chartMonthRange} Bulan Terakhir)`}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pantau naik-turunnya pendapatan, pengeluaran, serta kurva saldo pergerakan kumulatif. Arahkan kursor atau klik batang tanggal/bulan untuk rincian detail.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 no-print">
                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setChartGranularity('harian');
                            setFocusedMovementKey(null);
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                            chartGranularity === 'harian'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Harian
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChartGranularity('bulanan');
                            setFocusedMovementKey(null);
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                            chartGranularity === 'bulanan'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Bulanan
                        </button>
                      </div>

                      {chartGranularity === 'bulanan' && (
                        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                          {([6, 12] as const).map((months) => (
                            <button
                              key={months}
                              type="button"
                              onClick={() => {
                                setChartMonthRange(months);
                                setFocusedMovementKey(null);
                              }}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                                chartMonthRange === months
                                  ? 'bg-white text-blue-800 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {months} Bulan
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Legend & Summary Totals for Active Chart Window */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-4 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                        Pendapatan
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" />
                        Pengeluaran
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-0.5 bg-blue-700 inline-block" />
                        Kurva Saldo Kumulatif
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
                        Ada Mutasi Cash ↔ Rekening
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-xs">
                      <span className="text-emerald-700 font-semibold">
                        +{formatCompactRupiah(movementSeries.totalSeriesIncome)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-red-700 font-semibold">
                        -{formatCompactRupiah(movementSeries.totalSeriesExpense)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span
                        className={`font-bold ${
                          movementSeries.totalSeriesNet >= 0
                            ? 'text-blue-800'
                            : 'text-red-700'
                        }`}
                      >
                        Bersih: {formatSignedRupiah(movementSeries.totalSeriesNet)}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Dual-Bar + Synchronized Cumulative Curve */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
                    <div
                      className={
                        chartGranularity === 'harian' ? 'min-w-[680px]' : 'min-w-[460px]'
                      }
                    >
                      {/* Y-axis Top Reference + Dual Bars */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums mb-2">
                        <span>Skala Puncak: {formatRupiah(movementSeries.maxFlow)}</span>
                        <span>
                          {movementSeries.activeBuckets} titik waktu aktif
                          {accountFilter !== 'all' && ' · Filter akun aktif'}
                        </span>
                      </div>

                      <div
                        className="grid gap-1 items-end h-44 border-b border-slate-200 pb-1 relative"
                        style={{
                          gridTemplateColumns: `repeat(${movementSeries.points.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {/* Mid reference line */}
                        <div
                          className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100 pointer-events-none"
                          aria-hidden="true"
                        />

                        {movementSeries.points.map((pt) => {
                          const isFocused = activeMovementPoint?.key === pt.key;
                          const incPct =
                            pt.totalIncome > 0
                              ? Math.max(4, Math.round((pt.totalIncome / movementSeries.maxFlow) * 100))
                              : 0;
                          const expPct =
                            pt.totalExpense > 0
                              ? Math.max(4, Math.round((pt.totalExpense / movementSeries.maxFlow) * 100))
                              : 0;
                          return (
                            <button
                              key={pt.key}
                              type="button"
                              onMouseEnter={() => setFocusedMovementKey(pt.key)}
                              onFocus={() => setFocusedMovementKey(pt.key)}
                              onClick={() => setFocusedMovementKey(pt.key)}
                              title={`${pt.fullLabel}\nPendapatan: ${formatRupiah(
                                pt.totalIncome
                              )}\nPengeluaran: ${formatRupiah(pt.totalExpense)}`}
                              className={`h-full flex flex-col justify-end items-center rounded-md px-0.5 pt-2 transition-colors cursor-pointer relative ${
                                isFocused
                                  ? 'bg-blue-50/80 ring-1 ring-blue-200'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              {pt.transferCount > 0 && (
                                <span
                                  className="w-1.5 h-1.5 rounded-xs bg-amber-500 absolute top-1"
                                  title={`${pt.transferCount} mutasi dana (${formatRupiah(
                                    pt.transferVolume
                                  )})`}
                                />
                              )}
                              <div className="w-full h-36 flex items-end justify-center gap-0.5">
                                <div
                                  className={`rounded-t-xs transition-all duration-200 ${
                                    chartGranularity === 'harian' ? 'w-2' : 'w-4'
                                  } ${
                                    pt.totalIncome > 0 ? 'bg-emerald-600' : 'bg-slate-100'
                                  }`}
                                  style={{
                                    height: pt.totalIncome > 0 ? `${incPct}%` : '2px',
                                  }}
                                />
                                <div
                                  className={`rounded-t-xs transition-all duration-200 ${
                                    chartGranularity === 'harian' ? 'w-2' : 'w-4'
                                  } ${
                                    pt.totalExpense > 0 ? 'bg-red-600' : 'bg-slate-100'
                                  }`}
                                  style={{
                                    height: pt.totalExpense > 0 ? `${expPct}%` : '2px',
                                  }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Synchronized Cumulative Cashflow Curve */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums mb-1">
                          <span>Pergerakan Arus Kas Kumulatif</span>
                          <span>
                            Rentang: {formatCompactRupiah(movementSeries.minCum)} s.d.{' '}
                            {formatCompactRupiah(movementSeries.maxCum)}
                          </span>
                        </div>
                        <div className="relative h-20 w-full border border-slate-100 rounded-lg bg-slate-50/50 overflow-hidden">
                          {(() => {
                            const pts = movementSeries.points;
                            const n = pts.length || 1;
                            const zeroTopPct =
                              ((movementSeries.maxCum - 0) / movementSeries.cumSpan) * 80 + 10;
                            const polylinePoints = pts
                              .map((p, idx) => {
                                const x = ((idx + 0.5) / n) * 1000;
                                const y =
                                  ((movementSeries.maxCum - p.cumulativeNet) /
                                    movementSeries.cumSpan) *
                                    80 +
                                  10;
                                return `${x.toFixed(1)},${y.toFixed(1)}`;
                              })
                              .join(' ');
                            const areaPoints =
                              n > 0
                                ? `${(0.5 / n) * 1000},${zeroTopPct.toFixed(
                                    1
                                  )} ${polylinePoints} ${((n - 0.5) / n) * 1000},${zeroTopPct.toFixed(
                                    1
                                  )}`
                                : '';

                            return (
                              <>
                                <div
                                  className="absolute inset-x-0 border-t border-dashed border-slate-300 pointer-events-none"
                                  style={{ top: `${zeroTopPct}%` }}
                                />
                                <svg
                                  viewBox="0 0 1000 100"
                                  preserveAspectRatio="none"
                                  className="w-full h-full block"
                                >
                                  {areaPoints && (
                                    <polygon
                                      points={areaPoints}
                                      fill="rgba(29, 78, 216, 0.08)"
                                    />
                                  )}
                                  {polylinePoints && (
                                    <polyline
                                      fill="none"
                                      stroke="#1d4ed8"
                                      strokeWidth="2.2"
                                      vectorEffect="non-scaling-stroke"
                                      points={polylinePoints}
                                    />
                                  )}
                                </svg>
                                {pts.map((p, idx) => {
                                  const leftPct = ((idx + 0.5) / n) * 100;
                                  const topPct =
                                    ((movementSeries.maxCum - p.cumulativeNet) /
                                      movementSeries.cumSpan) *
                                      80 +
                                    10;
                                  const isFocused = activeMovementPoint?.key === p.key;
                                  return (
                                    <button
                                      key={p.key}
                                      type="button"
                                      aria-label={`Kumulatif ${p.fullLabel}`}
                                      onMouseEnter={() => setFocusedMovementKey(p.key)}
                                      onClick={() => setFocusedMovementKey(p.key)}
                                      style={{
                                        left: `${leftPct}%`,
                                        top: `${topPct}%`,
                                      }}
                                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-transform ${
                                        isFocused
                                          ? 'w-3 h-3 bg-blue-700 ring-2 ring-white shadow-sm scale-110 z-10'
                                          : 'w-1.5 h-1.5 bg-blue-600/70 hover:scale-150'
                                      }`}
                                    />
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>

                        {/* X-Axis Labels */}
                        <div
                          className="grid gap-1 mt-1.5"
                          style={{
                            gridTemplateColumns: `repeat(${movementSeries.points.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {movementSeries.points.map((pt) => {
                            const isFocused = activeMovementPoint?.key === pt.key;
                            return (
                              <button
                                key={pt.key}
                                type="button"
                                onClick={() => setFocusedMovementKey(pt.key)}
                                className={`text-center font-mono text-[10px] tabular-nums truncate cursor-pointer ${
                                  isFocused
                                    ? 'font-bold text-blue-700'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {pt.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Point Inspector Bar */}
                  {activeMovementPoint && (
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Inspektor Pergerakan: {activeMovementPoint.fullLabel}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {activeMovementPoint.txCount} transaksi operasional ·{' '}
                          {activeMovementPoint.transferCount} mutasi Cash ↔ Rekening
                          {!movementSeries.hasFlow &&
                            ' · Belum ada transaksi tercatat pada rentang waktu ini.'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
                        <div>
                          <div className="font-sans text-[11px] text-slate-500">
                            Pendapatan
                          </div>
                          <div className="font-bold text-emerald-700">
                            +{formatRupiah(activeMovementPoint.totalIncome)}
                          </div>
                          <div className="font-sans text-[10px] text-slate-500">
                            C: {formatCompactRupiah(activeMovementPoint.incomeCash)} · T:{' '}
                            {formatCompactRupiah(activeMovementPoint.incomeTransfer)}
                          </div>
                        </div>
                        <div>
                          <div className="font-sans text-[11px] text-slate-500">
                            Pengeluaran
                          </div>
                          <div className="font-bold text-red-700">
                            -{formatRupiah(activeMovementPoint.totalExpense)}
                          </div>
                          <div className="font-sans text-[10px] text-slate-500">
                            C: {formatCompactRupiah(activeMovementPoint.expenseCash)} · T:{' '}
                            {formatCompactRupiah(activeMovementPoint.expenseTransfer)}
                          </div>
                        </div>
                        <div>
                          <div className="font-sans text-[11px] text-slate-500">
                            Arus Kas Bersih
                          </div>
                          <div
                            className={`font-bold ${
                              activeMovementPoint.net >= 0
                                ? 'text-blue-800'
                                : 'text-red-700'
                            }`}
                          >
                            {formatSignedRupiah(activeMovementPoint.net)}
                          </div>
                        </div>
                        <div>
                          <div className="font-sans text-[11px] text-slate-500">
                            Saldo Kumulatif
                          </div>
                          <div
                            className={`font-bold ${
                              activeMovementPoint.cumulativeNet >= 0
                                ? 'text-slate-900'
                                : 'text-red-700'
                            }`}
                          >
                            {formatSignedRupiah(activeMovementPoint.cumulativeNet)}
                          </div>
                        </div>
                        <div>
                          <div className="font-sans text-[11px] text-slate-500">
                            Mutasi Dana
                          </div>
                          <div className="font-bold text-amber-700">
                            {formatRupiah(activeMovementPoint.transferVolume)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* B. 2-Column Movement Breakdown: Per Akun Kas/Rekening & Dinamika Cash vs Transfer */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: Pergerakan Saldo per Kas Tunai & Rekening Bank */}
                  <div className="lg:col-span-7 border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="font-display text-sm font-bold text-slate-900">
                          Pergerakan Dana per Kas &amp; Rekening ({periodLabel})
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Aliran masuk, keluar, mutasi perpindahan internal, dan posisi saldo akhir setiap akun.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openTransferModal('cash-to-bank')}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer no-print"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>Pindah Dana</span>
                      </button>
                    </div>

                    {/* Visual Liquidity Split: Kas Tunai vs Rekening Bank */}
                    {(() => {
                      const positiveCash = Math.max(0, totalCashBalance);
                      const positiveBank = Math.max(0, totalBankBalance);
                      const sumPos = positiveCash + positiveBank;
                      const cashPct = sumPos > 0 ? Math.round((positiveCash / sumPos) * 100) : 0;
                      const bankPct = sumPos > 0 ? 100 - cashPct : 0;
                      return (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700">
                              Proporsi Likuiditas Kas Tunai vs Rekening Bank
                            </span>
                            <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                              Tunai {cashPct}% · Rekening {bankPct}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                            {cashPct > 0 && (
                              <div
                                className="h-full bg-amber-500"
                                style={{ width: `${cashPct}%` }}
                              />
                            )}
                            {bankPct > 0 && (
                              <div
                                className="h-full bg-blue-700"
                                style={{ width: `${bankPct}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                            <th className="py-2 pr-3">Kas / Rekening</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">Masuk</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">Keluar</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">Mutasi Net</th>
                            <th className="py-2 pl-2 text-right whitespace-nowrap">Saldo Akhir</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {accountPeriodMovements.map((row) => {
                            const isSelected = accountFilter === row.account.id;
                            return (
                              <tr
                                key={row.account.id}
                                onClick={() =>
                                  setAccountFilter((prev) =>
                                    prev === row.account.id ? 'all' : row.account.id
                                  )
                                }
                                className={`cursor-pointer transition-colors ${
                                  isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2.5 pr-3">
                                  <div className="font-semibold text-slate-900">
                                    {row.account.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {row.account.kind === 'cash'
                                      ? 'Kas Tunai'
                                      : `${row.account.bankName}${
                                          row.account.accountNumber
                                            ? ` · ${row.account.accountNumber}`
                                            : ''
                                        }`}
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                                  +{formatRupiah(row.periodIn)}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                                  -{formatRupiah(row.periodOut)}
                                </td>
                                <td
                                  className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                                    row.periodNetTransfer > 0
                                      ? 'text-blue-700'
                                      : row.periodNetTransfer < 0
                                      ? 'text-amber-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {row.periodNetTransfer === 0
                                    ? '—'
                                    : `${row.periodNetTransfer > 0 ? '+' : '-'}${formatRupiah(
                                        Math.abs(row.periodNetTransfer)
                                      )}`}
                                </td>
                                <td
                                  className={`py-2.5 pl-2 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                    row.liveBalance >= 0 ? 'text-slate-900' : 'text-red-700'
                                  }`}
                                >
                                  {formatSignedRupiah(row.liveBalance)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right: Dinamika Arus Kas, Jalur Cash/Transfer & Kategori Teratas */}
                  <div className="lg:col-span-5 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <h4 className="font-display text-sm font-bold text-slate-900">
                            Dinamika Cash, Transfer &amp; Mutasi
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Rasio serapan biaya &amp; komposisi metode ({periodLabel})
                          </p>
                        </div>
                        {periodMetrics.netBalance >= 0 ? (
                          <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                      </div>

                      {/* Expense-to-Income Burn Ratio */}
                      {(() => {
                        const ratio =
                          periodMetrics.totalIncome > 0
                            ? Math.round(
                                (periodMetrics.totalExpense / periodMetrics.totalIncome) * 100
                              )
                            : periodMetrics.totalExpense > 0
                            ? 100
                            : 0;
                        const incCashPct =
                          periodMetrics.totalIncome > 0
                            ? Math.round(
                                (periodMetrics.incomeCash / periodMetrics.totalIncome) * 100
                              )
                            : 0;
                        const expCashPct =
                          periodMetrics.totalExpense > 0
                            ? Math.round(
                                (periodMetrics.expenseCash / periodMetrics.totalExpense) * 100
                              )
                            : 0;

                        return (
                          <div className="space-y-3">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700">
                                  Rasio Pengeluaran vs Pendapatan
                                </span>
                                <span
                                  className={`font-mono font-bold tabular-nums ${
                                    ratio <= 80
                                      ? 'text-emerald-700'
                                      : ratio <= 100
                                      ? 'text-amber-700'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {ratio}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    ratio <= 80
                                      ? 'bg-emerald-600'
                                      : ratio <= 100
                                      ? 'bg-amber-500'
                                      : 'bg-red-600'
                                  }`}
                                  style={{ width: `${Math.min(100, ratio)}%` }}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="p-3 border border-slate-200 rounded-lg space-y-1">
                                <div className="text-[11px] text-slate-500">
                                  Pendapatan Cash vs Transfer
                                </div>
                                <div className="font-mono font-bold text-emerald-700 tabular-nums">
                                  {incCashPct}% Cash · {100 - incCashPct}% Transfer
                                </div>
                              </div>
                              <div className="p-3 border border-slate-200 rounded-lg space-y-1">
                                <div className="text-[11px] text-slate-500">
                                  Pengeluaran Cash vs Transfer
                                </div>
                                <div className="font-mono font-bold text-red-700 tabular-nums">
                                  {expCashPct}% Cash · {100 - expCashPct}% Transfer
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Ringkasan Mutasi Internal Cash <-> Rekening */}
                      <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span>Volume Perpindahan Dana ({transferDirectionSummary.count}x)</span>
                          <span className="font-mono text-blue-800 tabular-nums">
                            {formatRupiah(transferDirectionSummary.totalVolume)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <div className="text-slate-500">Cash → Bank</div>
                            <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                              {formatCompactRupiah(transferDirectionSummary.cashToBank)}
                            </div>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <div className="text-slate-500">Bank → Cash</div>
                            <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                              {formatCompactRupiah(transferDirectionSummary.bankToCash)}
                            </div>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-lg">
                            <div className="text-slate-500">Antar Bank</div>
                            <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                              {formatCompactRupiah(transferDirectionSummary.bankToBank)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Top Moving Categories Preview */}
                      <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            Kategori Pergerakan Terbesar
                          </span>
                          <button
                            type="button"
                            onClick={() => setLedgerTab('per-kategori')}
                            className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer no-print"
                          >
                            Buka Semua Kategori →
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {incomeCategoryBreakdown
                            .filter((c) => c.total > 0)
                            .slice(0, 2)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setTypeFilter('all');
                                  setCategoryFilter(c.id);
                                  setLedgerTab('per-kategori');
                                }}
                                className="w-full flex items-center justify-between text-xs py-1 px-1.5 -mx-1.5 rounded hover:bg-emerald-50/70 transition-colors cursor-pointer text-left"
                              >
                                <span className="text-slate-700 truncate pr-2">
                                  [Masuk] {c.name}
                                </span>
                                <span className="font-mono font-semibold text-emerald-700 tabular-nums shrink-0">
                                  +{formatRupiah(c.total)} ({c.pct}%)
                                </span>
                              </button>
                            ))}
                          {expenseCategoryBreakdown
                            .filter((c) => c.total > 0)
                            .slice(0, 2)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setTypeFilter('all');
                                  setCategoryFilter(c.id);
                                  setLedgerTab('per-kategori');
                                }}
                                className="w-full flex items-center justify-between text-xs py-1 px-1.5 -mx-1.5 rounded hover:bg-red-50/70 transition-colors cursor-pointer text-left"
                              >
                                <span className="text-slate-700 truncate pr-2">
                                  [Keluar] {c.name}
                                </span>
                                <span className="font-mono font-semibold text-red-700 tabular-nums shrink-0">
                                  -{formatRupiah(c.total)} ({c.pct}%)
                                </span>
                              </button>
                            ))}
                          {incomeCategoryBreakdown.every((c) => c.total === 0) &&
                            expenseCategoryBreakdown.every((c) => c.total === 0) && (
                              <p className="text-[11px] text-slate-400">
                                Belum ada pergerakan kategori pada {periodLabel}.
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* C. Lini Masa Pergerakan Keuangan Terbaru (Gabungan Transaksi & Mutasi Dana) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900">
                        Aktivitas Pergerakan Keuangan Terbaru ({periodLabel})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Menampilkan 10 pergerakan terakhir (Pendapatan, Pengeluaran, dan Mutasi Cash ↔ Rekening).
                      </p>
                    </div>
                    <div className="flex items-center gap-2 no-print">
                      <button
                        type="button"
                        onClick={() => setLedgerTab('kronologis')}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Lihat Urutan Tanggal
                      </button>
                      <button
                        type="button"
                        onClick={() => setLedgerTab('perpindahan')}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                      >
                        Lihat Mutasi Dana
                      </button>
                    </div>
                  </div>

                  {recentCombinedMovements.length === 0 ? (
                    <div className="py-10 px-6 text-center space-y-2">
                      <p className="text-xs font-semibold text-slate-700">
                        Belum ada pergerakan keuangan tercatat pada filter ini
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Catat pendapatan, pengeluaran, atau pindah dana untuk melihat pergerakan keuangan secara langsung.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {recentCombinedMovements.map((item) => {
                        if (item.kind === 'transfer') {
                          const tr = item.tr;
                          return (
                            <div
                              key={item.id}
                              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 text-xs"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <span className="font-mono text-slate-500 tabular-nums shrink-0 pt-0.5">
                                  {tr.date}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-blue-800 truncate">
                                    Mutasi Dana · {tr.fromAccountName} → {tr.toAccountName}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {[tr.referenceNo, tr.notes].filter(Boolean).join(' · ') ||
                                      'Perpindahan saldo internal'}
                                  </div>
                                </div>
                              </div>
                              <div className="font-mono font-bold text-blue-800 tabular-nums whitespace-nowrap text-right">
                                {formatRupiah(tr.amount)}
                              </div>
                            </div>
                          );
                        }

                        const tx = item.tx;
                        const isIncome = tx.type === 'pendapatan';
                        return (
                          <div
                            key={item.id}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 text-xs"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="font-mono text-slate-500 tabular-nums shrink-0 pt-0.5">
                                {tx.date}
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate">
                                  {tx.title}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {isIncome ? 'Pendapatan' : 'Pengeluaran'} ·{' '}
                                  {tx.method === 'cash' ? 'Cash' : 'Transfer'} ·{' '}
                                  {tx.bankAccount} · {tx.categoryName}
                                </div>
                              </div>
                            </div>
                            <div
                              className={`font-mono font-bold tabular-nums whitespace-nowrap text-right ${
                                isIncome ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {isIncome ? '+' : '-'}
                              {formatRupiah(tx.amount)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 1: TAB KATEGORI (NAVIGASI PER KATEGORI + DETAIL TERFOKUS) */}
            {ledgerTab === 'per-kategori' && (
              <div className="p-5 space-y-6">
                {/* Category Tab Control Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200 no-print">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Semua ({incomeCategoryBreakdown.length + expenseCategoryBreakdown.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('pendapatan')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'pendapatan'
                            ? 'bg-white text-emerald-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pendapatan ({incomeCategoryBreakdown.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('pengeluaran')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'pengeluaran'
                            ? 'bg-white text-red-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pengeluaran ({expenseCategoryBreakdown.length})
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari transaksi / pihak..."
                        className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-48 sm:w-56"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Hapus pencarian"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openManageModal(
                          typeFilter === 'pendapatan'
                            ? 'kategori-pendapatan'
                            : 'kategori-pengeluaran'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Tags className="w-3.5 h-3.5 text-blue-700" />
                      <span>Kelola / Tambah Kategori</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Horizontal Category Tab Strip */}
                <div className="flex flex-wrap items-center gap-2 no-print" role="tablist" aria-label="Pilih Tab Kategori Keuangan">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={categoryFilter === 'all'}
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Semua Kategori ({periodTransactions.length})
                  </button>

                  {categoryTabItems.map((cat) => {
                    const isSelected = categoryFilter === cat.id;
                    const isIncomeCat = cat.type === 'pendapatan';
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setCategoryFilter(isSelected ? 'all' : cat.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? isIncomeCat
                              ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                              : 'bg-red-700 text-white border-red-700 font-semibold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-sm shrink-0 ${
                            isSelected
                              ? 'bg-white'
                              : isIncomeCat
                                ? 'bg-emerald-500'
                                : 'bg-red-500'
                          }`}
                        />
                        <span>{cat.name}</span>
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            isSelected ? 'text-white/85' : 'text-slate-400'
                          }`}
                        >
                          ({cat.count})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Focused Single Category View OR All Categories Overview */}
                {focusedCategoryDetail ? (
                  <div className="space-y-5">
                    {/* Focused Category Summary Banner */}
                    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
                                focusedCategoryDetail.type === 'pendapatan'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              {focusedCategoryDetail.type === 'pendapatan'
                                ? 'Kategori Pendapatan'
                                : 'Kategori Pengeluaran'}
                            </span>
                            <span className="text-xs font-mono text-slate-500 tabular-nums">
                              {focusedCategoryDetail.count} transaksi · {focusedCategoryDetail.pct}% porsi periode
                            </span>
                          </div>
                          <h3 className="font-display text-lg font-bold text-slate-900">
                            {focusedCategoryDetail.name}
                          </h3>
                          {focusedCategoryDetail.description && (
                            <p className="text-xs text-slate-500">
                              {focusedCategoryDetail.description}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
                          <button
                            type="button"
                            onClick={() => setCategoryFilter('all')}
                            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            ← Semua Kategori
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openCreateTxModal(
                                focusedCategoryDetail.type,
                                focusedCategoryDetail.type === 'pendapatan' ? 'transfer' : 'cash',
                                focusedCategoryDetail.id
                              )
                            }
                            className={`px-3.5 py-2 text-xs font-semibold text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                              focusedCategoryDetail.type === 'pendapatan'
                                ? 'bg-emerald-700 hover:bg-emerald-800'
                                : 'bg-slate-900 hover:bg-slate-800'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Catat ke Kategori Ini</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200">
                        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                          <div className="text-[11px] font-medium text-slate-500">
                            Total {periodLabel}
                          </div>
                          <div
                            className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${
                              focusedCategoryDetail.type === 'pendapatan'
                                ? 'text-emerald-700'
                                : 'text-red-700'
                            }`}
                          >
                            {formatRupiah(focusedCategoryDetail.total)}
                          </div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                          <div className="text-[11px] font-medium text-slate-500">
                            Melalui Cash (Tunai)
                          </div>
                          <div className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                            {formatRupiah(focusedCategoryDetail.cash)}
                          </div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
                          <div className="text-[11px] font-medium text-slate-500">
                            Melalui Transfer Rekening
                          </div>
                          <div className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                            {formatRupiah(focusedCategoryDetail.transfer)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Method & Account Quick Filter inside Focused Category */}
                    <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setMethodFilter('all')}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                            methodFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Semua Metode
                        </button>
                        <button
                          type="button"
                          onClick={() => setMethodFilter('cash')}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                            methodFilter === 'cash'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setMethodFilter('transfer')}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                            methodFilter === 'transfer'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Transfer Bank
                        </button>
                      </div>

                      <select
                        value={accountFilter}
                        onChange={(e) => setAccountFilter(e.target.value)}
                        aria-label="Filter Kas atau Rekening"
                        className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      >
                        <option value="all">Semua Kas &amp; Rekening</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.kind === 'cash' ? 'Cash: ' : `${acc.bankName}: `}
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Focused Category Transactions Table */}
                    {filteredTransactions.length === 0 ? (
                      <div className="border border-slate-200 rounded-xl py-10 px-6 text-center space-y-3">
                        <p className="text-sm font-semibold text-slate-800">
                          Belum ada transaksi pada kategori &ldquo;{focusedCategoryDetail.name}&rdquo;
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Catat transaksi baru atau ubah filter metode/periode di atas.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            openCreateTxModal(
                              focusedCategoryDetail.type,
                              focusedCategoryDetail.type === 'pendapatan' ? 'transfer' : 'cash',
                              focusedCategoryDetail.id
                            )
                          }
                          className={`px-3.5 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer no-print ${
                            focusedCategoryDetail.type === 'pendapatan'
                              ? 'bg-emerald-700 hover:bg-emerald-800'
                              : 'bg-slate-900 hover:bg-slate-800'
                          }`}
                        >
                          + Catat Transaksi Pertama
                        </button>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                                <th className="py-2.5 px-4 whitespace-nowrap">Tanggal</th>
                                <th className="py-2.5 px-4 whitespace-nowrap">Metode</th>
                                <th className="py-2.5 px-4">Kas / Rekening &amp; Bukti</th>
                                <th className="py-2.5 px-4">Keterangan &amp; Pihak Terkait</th>
                                <th className="py-2.5 px-4 text-right whitespace-nowrap">Nominal</th>
                                <th className="py-2.5 px-4 text-right whitespace-nowrap no-print">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredTransactions.map((tx) => {
                                const isIncome = tx.type === 'pendapatan';
                                return (
                                  <tr key={tx.id} className="hover:bg-slate-50/70">
                                    <td className="py-2.5 px-4 w-28 whitespace-nowrap font-mono tabular-nums text-slate-600">
                                      {tx.date}
                                    </td>
                                    <td className="py-2.5 px-4 w-24 whitespace-nowrap font-medium text-slate-700">
                                      {tx.method === 'cash' ? 'Cash' : 'Transfer'}
                                    </td>
                                    <td className="py-2.5 px-4 w-56 text-slate-700">
                                      <div className="truncate max-w-[220px]">
                                        {tx.bankAccount}
                                      </div>
                                      {tx.referenceNo && (
                                        <div className="text-[11px] font-mono text-slate-400">
                                          {tx.referenceNo}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-4">
                                      <div className="font-semibold text-slate-900">
                                        {tx.title}
                                      </div>
                                      {(tx.counterparty || tx.notes) && (
                                        <div className="text-[11px] text-slate-500">
                                          {[tx.counterparty, tx.notes].filter(Boolean).join(' · ')}
                                        </div>
                                      )}
                                    </td>
                                    <td
                                      className={`py-2.5 px-4 text-right whitespace-nowrap font-mono font-bold tabular-nums ${
                                        isIncome ? 'text-emerald-700' : 'text-red-700'
                                      }`}
                                    >
                                      {isIncome ? '+' : '-'}
                                      {formatRupiah(tx.amount)}
                                    </td>
                                    <td className="py-2.5 px-4 w-20 text-right whitespace-nowrap no-print">
                                      {renderTransactionActions(tx)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Ringkasan Kelompok Kategori */}
                    <div
                      className={`grid grid-cols-1 ${
                        typeFilter === 'all' ? 'lg:grid-cols-2' : ''
                      } gap-6 items-stretch`}
                    >
                      {typeFilter !== 'pengeluaran' && (
                        <section className="bg-slate-50/40 border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-200">
                              <div>
                                <h3 className="font-display text-sm font-bold text-slate-900">
                                  Kelompok Kategori Pendapatan
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Klik kategori untuk membuka tab detail ({periodLabel})
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => openManageModal('kategori-pendapatan')}
                                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer no-print"
                              >
                                Atur Kategori Masuk
                              </button>
                            </div>

                            <div className="divide-y divide-slate-100 mt-2">
                              {incomeCategoryBreakdown.map((cat) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setCategoryFilter(cat.id)}
                                  className="w-full text-left py-3 px-2 -mx-2 rounded-lg hover:bg-white transition-colors cursor-pointer block"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-slate-900 truncate">
                                        {cat.name}
                                      </div>
                                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                        <span>
                                          Cash:{' '}
                                          <span className="font-mono tabular-nums text-slate-700">
                                            {formatRupiah(cat.cash)}
                                          </span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span>
                                          Transfer:{' '}
                                          <span className="font-mono tabular-nums text-slate-700">
                                            {formatRupiah(cat.transfer)}
                                          </span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums">
                                          {cat.count} entri
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                                        {formatRupiah(cat.total)}
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                        {cat.pct}%
                                      </div>
                                    </div>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden flex mt-2">
                                    {periodMetrics.totalIncome > 0 && cat.cash > 0 && (
                                      <div
                                        className="h-full bg-emerald-400"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            (cat.cash / periodMetrics.totalIncome) * 100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                    {periodMetrics.totalIncome > 0 && cat.transfer > 0 && (
                                      <div
                                        className="h-full bg-emerald-700"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            (cat.transfer / periodMetrics.totalIncome) * 100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                            <div className="flex items-center gap-4">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                                Cash
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-700 inline-block" />
                                Transfer Rekening
                              </span>
                            </div>
                            <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                              Total: {formatRupiah(periodMetrics.totalIncome)}
                            </span>
                          </div>
                        </section>
                      )}

                      {typeFilter !== 'pendapatan' && (
                        <section className="bg-slate-50/40 border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-200">
                              <div>
                                <h3 className="font-display text-sm font-bold text-slate-900">
                                  Kelompok Kategori Pengeluaran
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Klik kategori untuk membuka tab detail ({periodLabel})
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => openManageModal('kategori-pengeluaran')}
                                className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer no-print"
                              >
                                Atur Kategori Keluar
                              </button>
                            </div>

                            <div className="divide-y divide-slate-100 mt-2">
                              {expenseCategoryBreakdown.map((cat) => (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => setCategoryFilter(cat.id)}
                                  className="w-full text-left py-3 px-2 -mx-2 rounded-lg hover:bg-white transition-colors cursor-pointer block"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-slate-900 truncate">
                                        {cat.name}
                                      </div>
                                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                        <span>
                                          Cash:{' '}
                                          <span className="font-mono tabular-nums text-slate-700">
                                            {formatRupiah(cat.cash)}
                                          </span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span>
                                          Transfer:{' '}
                                          <span className="font-mono tabular-nums text-slate-700">
                                            {formatRupiah(cat.transfer)}
                                          </span>
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums">
                                          {cat.count} entri
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="font-mono text-xs font-bold text-red-700 tabular-nums">
                                        {formatRupiah(cat.total)}
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                        {cat.pct}%
                                      </div>
                                    </div>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden flex mt-2">
                                    {periodMetrics.totalExpense > 0 && cat.cash > 0 && (
                                      <div
                                        className="h-full bg-amber-500"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            (cat.cash / periodMetrics.totalExpense) * 100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                    {periodMetrics.totalExpense > 0 && cat.transfer > 0 && (
                                      <div
                                        className="h-full bg-red-600"
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            (cat.transfer / periodMetrics.totalExpense) * 100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                            <div className="flex items-center gap-4">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                                Cash
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-red-600 inline-block" />
                                Transfer Rekening
                              </span>
                            </div>
                            <span className="font-mono font-semibold text-red-800 tabular-nums">
                              Total: {formatRupiah(periodMetrics.totalExpense)}
                            </span>
                          </div>
                        </section>
                      )}
                    </div>

                    {filteredTransactions.length === 0 ? (
                      <div className="py-10 text-center space-y-3 border border-slate-200 rounded-xl">
                        <p className="text-sm font-semibold text-slate-800">
                          Belum ada transaksi keuangan pada filter ini
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Catat pendapatan masuk (Cash atau Transfer Rekening BRI/BCA/Mandiri) atau pengeluaran perusahaan agar otomatis dikelompokkan rapi per kategori.
                        </p>
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2 no-print">
                          <button
                            type="button"
                            onClick={() => openCreateTxModal('pendapatan', 'transfer')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
                          >
                            + Catat Pendapatan
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreateTxModal('pengeluaran', 'cash')}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            + Catat Pengeluaran
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Kelompok Pendapatan per Kategori */}
                        {groupedTransactions.pendapatan.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                              <h4 className="font-display text-sm font-bold text-emerald-800">
                                A. Kelompok Pendapatan Perusahaan
                              </h4>
                              <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                                Subtotal: {formatRupiah(filteredMetrics.totalIncome)}
                              </span>
                            </div>

                            <div className="space-y-4">
                              {groupedTransactions.pendapatan.map((grp) => (
                                <div
                                  key={grp.categoryId}
                                  className="border border-slate-200 rounded-xl overflow-hidden"
                                >
                                  <div className="px-4 py-2.5 bg-emerald-50/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => setCategoryFilter(grp.categoryId)}
                                        className="font-bold text-slate-900 hover:text-emerald-800 hover:underline cursor-pointer"
                                      >
                                        {grp.categoryName}
                                      </button>
                                      <span className="text-slate-500 font-mono tabular-nums">
                                        · {grp.items.length} entri
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                                      <span className="text-slate-600">
                                        Cash: {formatRupiah(grp.cashTotal)}
                                      </span>
                                      <span className="text-slate-600">
                                        Transfer: {formatRupiah(grp.transferTotal)}
                                      </span>
                                      <span className="font-bold text-emerald-700">
                                        Total: {formatRupiah(grp.total)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openCreateTxModal(
                                            'pendapatan',
                                            'transfer',
                                            grp.categoryId
                                          )
                                        }
                                        className="font-sans text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer no-print"
                                      >
                                        + Tambah
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <tbody className="divide-y divide-slate-100">
                                        {grp.items.map((tx) => (
                                          <tr key={tx.id} className="hover:bg-slate-50/70">
                                            <td className="py-2.5 px-4 w-28 whitespace-nowrap font-mono tabular-nums text-slate-600">
                                              {tx.date}
                                            </td>
                                            <td className="py-2.5 px-4 w-24 whitespace-nowrap font-medium text-slate-700">
                                              {tx.method === 'cash' ? 'Cash' : 'Transfer'}
                                            </td>
                                            <td className="py-2.5 px-4 w-56 text-slate-700">
                                              <div className="truncate max-w-[220px]">
                                                {tx.bankAccount}
                                              </div>
                                              {tx.referenceNo && (
                                                <div className="text-[11px] font-mono text-slate-400">
                                                  {tx.referenceNo}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4">
                                              <div className="font-semibold text-slate-900">
                                                {tx.title}
                                              </div>
                                              {(tx.counterparty || tx.notes) && (
                                                <div className="text-[11px] text-slate-500">
                                                  {[tx.counterparty, tx.notes]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono font-bold text-emerald-700 tabular-nums">
                                              +{formatRupiah(tx.amount)}
                                            </td>
                                            <td className="py-2.5 px-4 w-20 text-right whitespace-nowrap no-print">
                                              {renderTransactionActions(tx)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Kelompok Pengeluaran per Kategori */}
                        {groupedTransactions.pengeluaran.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-red-200">
                              <h4 className="font-display text-sm font-bold text-red-800">
                                {groupedTransactions.pendapatan.length > 0 ? 'B. ' : ''}
                                Kelompok Pengeluaran Perusahaan
                              </h4>
                              <span className="font-mono text-xs font-bold text-red-700 tabular-nums">
                                Subtotal: {formatRupiah(filteredMetrics.totalExpense)}
                              </span>
                            </div>

                            <div className="space-y-4">
                              {groupedTransactions.pengeluaran.map((grp) => (
                                <div
                                  key={grp.categoryId}
                                  className="border border-slate-200 rounded-xl overflow-hidden"
                                >
                                  <div className="px-4 py-2.5 bg-red-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => setCategoryFilter(grp.categoryId)}
                                        className="font-bold text-slate-900 hover:text-red-800 hover:underline cursor-pointer"
                                      >
                                        {grp.categoryName}
                                      </button>
                                      <span className="text-slate-500 font-mono tabular-nums">
                                        · {grp.items.length} entri
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                                      <span className="text-slate-600">
                                        Cash: {formatRupiah(grp.cashTotal)}
                                      </span>
                                      <span className="text-slate-600">
                                        Transfer: {formatRupiah(grp.transferTotal)}
                                      </span>
                                      <span className="font-bold text-red-700">
                                        Total: {formatRupiah(grp.total)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openCreateTxModal(
                                            'pengeluaran',
                                            'cash',
                                            grp.categoryId
                                          )
                                        }
                                        className="font-sans text-[11px] font-semibold text-red-800 hover:underline cursor-pointer no-print"
                                      >
                                        + Tambah
                                      </button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <tbody className="divide-y divide-slate-100">
                                        {grp.items.map((tx) => (
                                          <tr key={tx.id} className="hover:bg-slate-50/70">
                                            <td className="py-2.5 px-4 w-28 whitespace-nowrap font-mono tabular-nums text-slate-600">
                                              {tx.date}
                                            </td>
                                            <td className="py-2.5 px-4 w-24 whitespace-nowrap font-medium text-slate-700">
                                              {tx.method === 'cash' ? 'Cash' : 'Transfer'}
                                            </td>
                                            <td className="py-2.5 px-4 w-56 text-slate-700">
                                              <div className="truncate max-w-[220px]">
                                                {tx.bankAccount}
                                              </div>
                                              {tx.referenceNo && (
                                                <div className="text-[11px] font-mono text-slate-400">
                                                  {tx.referenceNo}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4">
                                              <div className="font-semibold text-slate-900">
                                                {tx.title}
                                              </div>
                                              {(tx.counterparty || tx.notes) && (
                                                <div className="text-[11px] text-slate-500">
                                                  {[tx.counterparty, tx.notes]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono font-bold text-red-700 tabular-nums">
                                              -{formatRupiah(tx.amount)}
                                            </td>
                                            <td className="py-2.5 px-4 w-20 text-right whitespace-nowrap no-print">
                                              {renderTransactionActions(tx)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: JURNAL TRANSAKSI (URUTAN TANGGAL & FILTER LENGKAP) */}
            {ledgerTab === 'kronologis' && (
              <div>
                {/* Contextual Filter Toolbar */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3 no-print">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTypeFilter('all')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Semua Jenis
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('pendapatan')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'pendapatan'
                            ? 'bg-white text-emerald-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pendapatan
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeFilter('pengeluaran')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          typeFilter === 'pengeluaran'
                            ? 'bg-white text-red-800 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pengeluaran
                      </button>
                    </div>

                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setMethodFilter('all')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          methodFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Semua Metode
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethodFilter('cash')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          methodFilter === 'cash'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethodFilter('transfer')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                          methodFilter === 'transfer'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Transfer
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      aria-label="Filter Kategori"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    >
                      <option value="all">Semua Kategori</option>
                      {availableFilterCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.type === 'pendapatan' ? '[Masuk] ' : '[Keluar] '}
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                      aria-label="Filter Kas atau Rekening"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    >
                      <option value="all">Semua Kas &amp; Rekening</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.kind === 'cash' ? 'Cash: ' : `${acc.bankName}: `}
                          {acc.name}
                        </option>
                      ))}
                    </select>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari uraian, bukti, pihak..."
                        className="pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-48"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Hapus pencarian"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="py-12 px-6 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Tidak ada transaksi pada filter yang dipilih
                    </p>
                    <p className="text-xs text-slate-500">
                      Ubah filter jenis, metode, kategori, atau periode bulan di atas.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                          <th className="py-2.5 px-4 whitespace-nowrap">Tanggal</th>
                          <th className="py-2.5 px-4 whitespace-nowrap">Jenis &amp; Metode</th>
                          <th className="py-2.5 px-4 whitespace-nowrap">Kategori</th>
                          <th className="py-2.5 px-4">Keterangan &amp; Pihak Terkait</th>
                          <th className="py-2.5 px-4">Kas / Rekening &amp; Bukti</th>
                          <th className="py-2.5 px-4 text-right whitespace-nowrap">Nominal</th>
                          <th className="py-2.5 px-4 text-right whitespace-nowrap no-print">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredTransactions.map((tx) => {
                          const isIncome = tx.type === 'pendapatan';
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50/80 align-top">
                              <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-slate-700">
                                {tx.date}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div
                                  className={`font-semibold ${
                                    isIncome ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  {isIncome ? 'Pendapatan' : 'Pengeluaran'}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {tx.method === 'cash' ? 'Cash (Tunai)' : 'Transfer Bank'}
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategoryFilter(tx.categoryId);
                                    setLedgerTab('per-kategori');
                                  }}
                                  className="hover:text-blue-700 hover:underline cursor-pointer text-left"
                                >
                                  {tx.categoryName}
                                </button>
                              </td>
                              <td className="py-3 px-4 min-w-[220px]">
                                <div className="font-semibold text-slate-900">{tx.title}</div>
                                {(tx.counterparty || tx.notes) && (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {[tx.counterparty, tx.notes].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 min-w-[180px]">
                                <div className="text-slate-700">{tx.bankAccount || '—'}</div>
                                {tx.referenceNo && (
                                  <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                                    {tx.referenceNo}
                                  </div>
                                )}
                              </td>
                              <td
                                className={`py-3 px-4 text-right whitespace-nowrap font-mono font-bold tabular-nums ${
                                  isIncome ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {isIncome ? '+' : '-'}
                                {formatRupiah(tx.amount)}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                                {renderTransactionActions(tx)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: KAS, REKENING BANK & MUTASI INTERNAL */}
            {ledgerTab === 'perpindahan' && (
              <div className="p-5 space-y-6">
                {/* Saldo Kas Tunai & Rekening Bank Perusahaan */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        Saldo Kas Tunai &amp; Rekening Bank Perusahaan
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Rekap saldo real-time tiap akun (BRI, BCA, Mandiri, Kas Tunai) termasuk mutasi perpindahan dana.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
                      {accountFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setAccountFilter('all')}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Reset Filter Akun
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openManageModal('rekening')}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Landmark className="w-3.5 h-3.5 text-blue-700" />
                        <span>Kelola Rekening / Kas</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openTransferModal('cash-to-bank')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>Pindah Dana (Cash ↔ Bank)</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {accountBalances.map((item) => {
                      const isSelected = accountFilter === item.account.id;
                      const isCash = item.account.kind === 'cash';
                      return (
                        <div
                          key={item.account.id}
                          className={`border rounded-xl p-4 transition-colors flex flex-col justify-between gap-3 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/40'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                                <span
                                  className={`px-2 py-0.5 rounded border ${
                                    isCash
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-blue-50 text-blue-800 border-blue-200'
                                  }`}
                                >
                                  {isCash ? 'Kas Tunai' : item.account.bankName}
                                </span>
                                {item.account.accountNumber &&
                                  item.account.accountNumber !== '-' && (
                                    <span className="font-mono text-slate-500 tabular-nums truncate">
                                      {item.account.accountNumber}
                                    </span>
                                  )}
                              </div>
                              <div className="text-sm font-bold text-slate-900 mt-1.5 truncate">
                                {item.account.name}
                              </div>
                              {item.account.holderName && (
                                <div className="text-[11px] text-slate-500 truncate">
                                  a.n. {item.account.holderName}
                                </div>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[11px] text-slate-500">Saldo Saat Ini</div>
                              <div
                                className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                                  item.balance >= 0 ? 'text-slate-900' : 'text-red-700'
                                }`}
                              >
                                {formatSignedRupiah(item.balance)}
                              </div>
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                            <div>
                              <span className="text-slate-400 font-sans block">Masuk</span>
                              <span className="text-emerald-700 font-semibold">
                                +{formatRupiah(item.totalIn)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-sans block">Keluar</span>
                              <span className="text-red-700 font-semibold">
                                -{formatRupiah(item.totalOut)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 font-sans block">Mutasi Net</span>
                              <span
                                className={`font-semibold ${
                                  item.netTransfer >= 0 ? 'text-blue-700' : 'text-amber-700'
                                }`}
                              >
                                {formatSignedRupiah(item.netTransfer)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 no-print">
                            <button
                              type="button"
                              onClick={() =>
                                setAccountFilter((prev) =>
                                  prev === item.account.id ? 'all' : item.account.id
                                )
                              }
                              className={`text-[11px] font-semibold cursor-pointer ${
                                isSelected
                                  ? 'text-blue-800 underline'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {isSelected ? 'Sedang Difilter (Klik Reset)' : 'Filter Mutasi Akun Ini'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAccountFilter(item.account.id);
                                setLedgerTab('kronologis');
                              }}
                              className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                            >
                              Lihat Jurnal →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Riwayat Perpindahan Dana (Cash <-> Rekening) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-bold text-slate-900">
                        Riwayat Perpindahan Dana Internal ({periodLabel})
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mutasi internal Cash ke Rekening Bank, Rekening ke Cash, atau antar rekening bank (misal BCA ↔ BRI).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openTransferModal('cash-to-bank')}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer no-print"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Catat Perpindahan Dana</span>
                    </button>
                  </div>

                  {periodTransfers.length === 0 ? (
                    <div className="py-12 px-6 text-center space-y-3">
                      <p className="text-sm font-semibold text-slate-800">
                        Belum ada perpindahan dana pada filter/periode ini
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Gunakan fitur Pindah Dana untuk menyetor uang kas tunai ke rekening bank (BRI, BCA, Mandiri) atau menarik tunai dari rekening ke kas perusahaan.
                      </p>
                      <button
                        type="button"
                        onClick={() => openTransferModal('cash-to-bank')}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer no-print"
                      >
                        + Pindah Dana Pertama
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                            <th className="py-2.5 px-4 whitespace-nowrap">Tanggal</th>
                            <th className="py-2.5 px-4">Dari Akun (Sumber)</th>
                            <th className="py-2.5 px-4">Ke Akun (Tujuan)</th>
                            <th className="py-2.5 px-4 whitespace-nowrap">No. Referensi</th>
                            <th className="py-2.5 px-4">Catatan</th>
                            <th className="py-2.5 px-4 text-right whitespace-nowrap">Nominal</th>
                            <th className="py-2.5 px-4 text-right whitespace-nowrap no-print">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {periodTransfers.map((tr) => (
                            <tr key={tr.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-slate-700">
                                {tr.date}
                              </td>
                              <td className="py-3 px-4 font-medium text-red-700">
                                {tr.fromAccountName}
                              </td>
                              <td className="py-3 px-4 font-medium text-emerald-700">
                                {tr.toAccountName}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-500">
                                {tr.referenceNo || '—'}
                              </td>
                              <td className="py-3 px-4 text-slate-600">{tr.notes || '—'}</td>
                              <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-blue-800 tabular-nums">
                                {formatRupiah(tr.amount)}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap no-print">
                                <button
                                  type="button"
                                  onClick={() => setDeletingTransferTarget(tr)}
                                  title="Hapus perpindahan dana"
                                  className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* =================================================================== */}
      {/* MODAL CATAT / EDIT TRANSAKSI (PILIH KAS ATAU REKENING BRI/BCA/DLL) */}
      {/* =================================================================== */}
      {txModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  {editingTx ? 'Edit Transaksi Keuangan' : 'Catat Transaksi Keuangan'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Pilih metode Cash atau Transfer dan tentukan rekening tujuan (BRI, BCA, Mandiri, dll)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTxModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jenis Transaksi
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleTxTypeSwitch('pendapatan')}
                      className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                        txType === 'pendapatan'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pendapatan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTxTypeSwitch('pengeluaran')}
                      className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                        txType === 'pengeluaran'
                          ? 'bg-red-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pengeluaran
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Metode Pembayaran
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleTxMethodSwitch('cash')}
                      className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                        txMethod === 'cash'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Cash (Tunai)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTxMethodSwitch('transfer')}
                      className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                        txMethod === 'transfer'
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Transfer Rekening
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Transaksi
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Kategori {txType === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        openManageModal(
                          txType === 'pendapatan'
                            ? 'kategori-pendapatan'
                            : 'kategori-pengeluaran'
                        )
                      }
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                    >
                      + Kelola Kategori
                    </button>
                  </div>
                  <select
                    required
                    value={txCategoryId}
                    onChange={(e) => setTxCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {modalCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Akun Kas / Rekening Bank Tujuan/Sumber */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {txMethod === 'cash'
                      ? txType === 'pendapatan'
                        ? 'Masuk ke Kas Tunai'
                        : 'Keluar dari Kas Tunai'
                      : txType === 'pendapatan'
                      ? 'Masuk ke Rekening Bank (BRI / BCA / Lainnya)'
                      : 'Keluar dari Rekening Bank'}
                  </label>
                  <button
                    type="button"
                    onClick={() => openManageModal('rekening')}
                    className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                  >
                    + Tambah Rekening
                  </button>
                </div>
                <select
                  required
                  value={txAccountId}
                  onChange={(e) => setTxAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {modalAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.kind === 'cash'
                        ? `${acc.name} (Saldo: ${formatSignedRupiah(
                            accountBalanceMap.get(acc.id) ?? 0
                          )})`
                        : `${acc.bankName} — ${acc.name} (${acc.accountNumber}) · Saldo: ${formatSignedRupiah(
                            accountBalanceMap.get(acc.id) ?? 0
                          )}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan / Uraian Transaksi
                </label>
                <input
                  type="text"
                  required
                  value={txTitle}
                  onChange={(e) => setTxTitle(e.target.value)}
                  placeholder={
                    txType === 'pendapatan'
                      ? 'Contoh: Pembayaran Invoice Klien via Transfer BRI'
                      : 'Contoh: Pembelian Perlengkapan Kantor'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={txAmount > 0 ? String(txAmount) : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setTxAmount(digits ? Number(digits) : 0);
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  {txAmount > 0 && (
                    <div className="text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
                      {formatRupiah(txAmount)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {txType === 'pendapatan' ? 'Sumber / Pelanggan' : 'Vendor / Penerima'}
                  </label>
                  <input
                    type="text"
                    value={txCounterparty}
                    onChange={(e) => setTxCounterparty(e.target.value)}
                    placeholder={
                      txType === 'pendapatan'
                        ? 'Nama klien / sumber dana'
                        : 'Nama vendor / toko / penerima'
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Bukti / Invoice / Kwitansi
                  </label>
                  <input
                    type="text"
                    value={txReferenceNo}
                    onChange={(e) => setTxReferenceNo(e.target.value)}
                    placeholder="Opsional (INV-2026-001)"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Tambahan
                  </label>
                  <input
                    type="text"
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTxModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingTx}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer disabled:bg-slate-400 ${
                    txType === 'pendapatan'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {savingTx
                    ? 'Menyimpan...'
                    : editingTx
                    ? 'Simpan Perubahan'
                    : `Simpan ${txType === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL PERPINDAHAN DANA (CASH <-> REKENING / ANTAR REKENING) */}
      {/* =================================================================== */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-white">
                    Perpindahan Dana (Cash ↔ Rekening)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Setor tunai ke rekening, tarik tunai ke kas, atau pindah antar bank
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="p-5 space-y-4 overflow-y-auto pb-safe">
              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => applyTransferPreset('cash-to-bank')}
                  className={`py-2 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                    transferPreset === 'cash-to-bank'
                      ? 'bg-white text-blue-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cash → Rekening
                </button>
                <button
                  type="button"
                  onClick={() => applyTransferPreset('bank-to-cash')}
                  className={`py-2 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                    transferPreset === 'bank-to-cash'
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rekening → Cash
                </button>
                <button
                  type="button"
                  onClick={() => applyTransferPreset('bank-to-bank')}
                  className={`py-2 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                    transferPreset === 'bank-to-bank'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Antar Rekening
                </button>
              </div>

              {transferModalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{transferModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dari Akun (Sumber Dana)
                  </label>
                  <select
                    required
                    value={trFromAccountId}
                    onChange={(e) => setTrFromAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.kind === 'cash'
                          ? `${acc.name} (${formatSignedRupiah(
                              accountBalanceMap.get(acc.id) ?? 0
                            )})`
                          : `${acc.bankName} — ${acc.name} (${formatSignedRupiah(
                              accountBalanceMap.get(acc.id) ?? 0
                            )})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ke Akun (Tujuan Dana)
                  </label>
                  <select
                    required
                    value={trToAccountId}
                    onChange={(e) => setTrToAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.kind === 'cash'
                          ? `${acc.name} (${formatSignedRupiah(
                              accountBalanceMap.get(acc.id) ?? 0
                            )})`
                          : `${acc.bankName} — ${acc.name} (${formatSignedRupiah(
                              accountBalanceMap.get(acc.id) ?? 0
                            )})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Perpindahan
                  </label>
                  <input
                    type="date"
                    required
                    value={trDate}
                    onChange={(e) => setTrDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal Dipindahkan (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={trAmount > 0 ? String(trAmount) : ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setTrAmount(digits ? Number(digits) : 0);
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  {trAmount > 0 && (
                    <div className="text-[11px] font-mono text-blue-700 mt-1 tabular-nums">
                      {formatRupiah(trAmount)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    No. Bukti / Slip Setor
                  </label>
                  <input
                    type="text"
                    value={trRefNo}
                    onChange={(e) => setTrRefNo(e.target.value)}
                    placeholder="Opsional (MUT-001)"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan
                  </label>
                  <input
                    type="text"
                    value={trNotes}
                    onChange={(e) => setTrNotes(e.target.value)}
                    placeholder="Contoh: Setor uang kas toko ke BRI"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {savingTransfer ? 'Memproses...' : 'Simpan Perpindahan Dana'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL KONFIRMASI HAPUS TRANSAKSI / PERPINDAHAN DANA */}
      {/* =================================================================== */}
      {(deletingTxTarget || deletingTransferTarget) && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                {deletingTxTarget
                  ? 'Hapus Transaksi Keuangan?'
                  : 'Hapus Catatan Perpindahan Dana?'}
              </h3>
              {deletingTxTarget ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Transaksi{' '}
                  <strong className="text-slate-900">{deletingTxTarget.title}</strong>{' '}
                  sebesar{' '}
                  <strong className="font-mono text-slate-900">
                    {formatRupiah(deletingTxTarget.amount)}
                  </strong>{' '}
                  ({deletingTxTarget.bankAccount}) pada tanggal{' '}
                  <span className="font-mono">{deletingTxTarget.date}</span> akan dihapus
                  permanen.
                </p>
              ) : deletingTransferTarget ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Perpindahan dana{' '}
                  <strong className="font-mono text-slate-900">
                    {formatRupiah(deletingTransferTarget.amount)}
                  </strong>{' '}
                  dari <strong>{deletingTransferTarget.fromAccountName}</strong> ke{' '}
                  <strong>{deletingTransferTarget.toAccountName}</strong> akan dihapus dan
                  saldo masing-masing akun akan disesuaikan kembali.
                </p>
              ) : null}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingTxTarget(null);
                    setDeletingTransferTarget(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deletingItem}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {deletingItem ? 'Menghapus...' : 'Ya, Hapus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL KELOLA REKENING BANK & KATEGORI */}
      {/* =================================================================== */}
      {manageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  Kelola Rekening Bank, Kas &amp; Kategori Keuangan
                </h3>
                <p className="text-[11px] text-slate-400">
                  Atur daftar rekening (BRI, BCA, Mandiri, dll), kas tunai, dan kategori pos keuangan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setManageTab('rekening');
                    setManageError(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    manageTab === 'rekening'
                      ? 'bg-white text-blue-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rekening &amp; Kas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManageTab('kategori-pengeluaran');
                    setManageError(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    manageTab === 'kategori-pengeluaran'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kategori Pengeluaran
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManageTab('kategori-pendapatan');
                    setManageError(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    manageTab === 'kategori-pendapatan'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kategori Pendapatan
                </button>
              </div>

              {manageError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{manageError}</span>
                </div>
              )}

              {/* TAB REKENING & KAS */}
              {manageTab === 'rekening' && (
                <div className="space-y-4">
                  <form
                    onSubmit={handleCreateAccount}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        Tambah Rekening Bank atau Kas Tunai Baru
                      </span>
                      <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-md">
                        <button
                          type="button"
                          onClick={() => setNewAccKind('rekening')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                            newAccKind === 'rekening'
                              ? 'bg-white text-blue-800'
                              : 'text-slate-600'
                          }`}
                        >
                          Rekening Bank
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewAccKind('cash')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                            newAccKind === 'cash'
                              ? 'bg-white text-slate-900'
                              : 'text-slate-600'
                          }`}
                        >
                          Kas Tunai
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {newAccKind === 'rekening' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Nama Bank
                          </label>
                          <select
                            value={
                              ['BRI', 'BCA', 'Mandiri', 'BNI', 'BSI', 'CIMB Niaga'].includes(
                                newAccBankName
                              )
                                ? newAccBankName
                                : 'Lainnya'
                            }
                            onChange={(e) =>
                              setNewAccBankName(
                                e.target.value === 'Lainnya' ? '' : e.target.value
                              )
                            }
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="BRI">BRI</option>
                            <option value="BCA">BCA</option>
                            <option value="Mandiri">Mandiri</option>
                            <option value="BNI">BNI</option>
                            <option value="BSI">BSI</option>
                            <option value="CIMB Niaga">CIMB Niaga</option>
                            <option value="Lainnya">Bank Lainnya...</option>
                          </select>
                        </div>
                      )}

                      {newAccKind === 'rekening' &&
                        !['BRI', 'BCA', 'Mandiri', 'BNI', 'BSI', 'CIMB Niaga'].includes(
                          newAccBankName
                        ) && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Ketik Nama Bank
                            </label>
                            <input
                              type="text"
                              required
                              value={newAccBankName}
                              onChange={(e) => setNewAccBankName(e.target.value)}
                              placeholder="Misal: Bank Permata / Danamon"
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                            />
                          </div>
                        )}

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          {newAccKind === 'cash' ? 'Nama Kas Tunai' : 'Label Rekening'}
                        </label>
                        <input
                          type="text"
                          required
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          placeholder={
                            newAccKind === 'cash'
                              ? 'Contoh: Kas Kecil Cabang'
                              : 'Contoh: BRI Operasional Cabang'
                          }
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>

                      {newAccKind === 'rekening' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Nomor Rekening
                          </label>
                          <input
                            type="text"
                            value={newAccNumber}
                            onChange={(e) => setNewAccNumber(e.target.value)}
                            placeholder="Contoh: 0234-01-009821-30-5"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Atas Nama / Pemegang Kas
                        </label>
                        <input
                          type="text"
                          value={newAccHolder}
                          onChange={(e) => setNewAccHolder(e.target.value)}
                          placeholder="PT / Penanggung jawab"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Saldo Awal (Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={newAccOpening || ''}
                          onChange={(e) => setNewAccOpening(Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingAcc}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{savingAcc ? 'Menyimpan...' : 'Tambah Akun'}</span>
                      </button>
                    </div>
                  </form>

                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {accountBalances.map(({ account, balance, usageCount }) => {
                      const isEditing = editingAccId === account.id;
                      const isConfirming = confirmDeleteAccId === account.id;
                      return (
                        <div key={account.id} className="p-3.5 bg-white">
                          {isEditing ? (
                            <div className="space-y-2.5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editAccName}
                                  onChange={(e) => setEditAccName(e.target.value)}
                                  placeholder="Nama akun"
                                  className="px-2.5 py-1.5 text-xs font-medium border border-blue-400 rounded-lg"
                                />
                                {account.kind === 'rekening' && (
                                  <input
                                    type="text"
                                    value={editAccBankName}
                                    onChange={(e) => setEditAccBankName(e.target.value)}
                                    placeholder="Nama bank (BRI, BCA, dll)"
                                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                                  />
                                )}
                                {account.kind === 'rekening' && (
                                  <input
                                    type="text"
                                    value={editAccNumber}
                                    onChange={(e) => setEditAccNumber(e.target.value)}
                                    placeholder="Nomor rekening"
                                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                                  />
                                )}
                                <input
                                  type="text"
                                  value={editAccHolder}
                                  onChange={(e) => setEditAccHolder(e.target.value)}
                                  placeholder="Atas nama / penanggung jawab"
                                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={editAccOpening}
                                  onChange={(e) =>
                                    setEditAccOpening(Number(e.target.value))
                                  }
                                  placeholder="Saldo awal"
                                  className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingAccId(null)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  disabled={savingAcc}
                                  onClick={() => handleSaveEditAccount(account.id)}
                                  className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer"
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900">
                                  {account.name}{' '}
                                  <span className="text-slate-500 font-normal">
                                    ·{' '}
                                    {account.kind === 'cash'
                                      ? 'Cash'
                                      : `${account.bankName} ${account.accountNumber}`}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                  Saldo: {formatSignedRupiah(balance)} · {usageCount} aktivitas
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isConfirming ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={deletingAccId === account.id}
                                      onClick={() => handleDeleteAccount(account.id)}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-700 rounded-md cursor-pointer"
                                    >
                                      Konfirmasi Hapus
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteAccId(null)}
                                      className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEditAccount(account)}
                                      title="Edit akun"
                                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={usageCount > 0}
                                      onClick={() => setConfirmDeleteAccId(account.id)}
                                      title={
                                        usageCount > 0
                                          ? 'Akun masih dipakai transaksi atau perpindahan dana'
                                          : 'Hapus akun'
                                      }
                                      className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-35 rounded-md cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB KATEGORI PENGELUARAN / PENDAPATAN */}
              {manageTab !== 'rekening' && (
                <div className="space-y-4">
                  <form
                    onSubmit={handleCreateCategory}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                  >
                    <div className="text-xs font-semibold text-slate-800">
                      Tambah Kategori{' '}
                      {activeCategoryType === 'pengeluaran' ? 'Pengeluaran' : 'Pendapatan'}{' '}
                      Baru
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder={
                          activeCategoryType === 'pengeluaran'
                            ? 'Contoh: Biaya Pemasaran & Iklan'
                            : 'Contoh: Pendapatan Jasa Konsultasi'
                        }
                        className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        value={newCatDesc}
                        onChange={(e) => setNewCatDesc(e.target.value)}
                        placeholder="Keterangan singkat (opsional)"
                        className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingCat}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{savingCat ? 'Menambah...' : 'Tambah Kategori'}</span>
                      </button>
                    </div>
                  </form>

                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {manageTabCategories.map((cat) => {
                      const usedCount = categoryUsageCountMap.get(cat.id) ?? 0;
                      const isEditing = editingCatId === cat.id;
                      const isConfirmingDelete = confirmDeleteCatId === cat.id;

                      return (
                        <div key={cat.id} className="p-3.5 bg-white">
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editCatName}
                                  onChange={(e) => setEditCatName(e.target.value)}
                                  className="px-2.5 py-1.5 text-xs font-medium border border-blue-400 rounded-lg"
                                />
                                <input
                                  type="text"
                                  value={editCatDesc}
                                  onChange={(e) => setEditCatDesc(e.target.value)}
                                  placeholder="Keterangan singkat"
                                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingCatId(null)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  disabled={savingCat}
                                  onClick={() => handleSaveEditCategory(cat.id)}
                                  className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded-md cursor-pointer"
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900">
                                  {cat.name}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {cat.description || 'Tanpa keterangan'}
                                  <span aria-hidden="true"> · </span>
                                  <span className="font-mono tabular-nums">
                                    {usedCount} transaksi
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isConfirmingDelete ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={deletingCatId === cat.id}
                                      onClick={() => handleDeleteCategory(cat.id)}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-700 rounded-md cursor-pointer"
                                    >
                                      {deletingCatId === cat.id ? '...' : 'Konfirmasi Hapus'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteCatId(null)}
                                      className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCatId(cat.id);
                                        setEditCatName(cat.name);
                                        setEditCatDesc(cat.description);
                                        setConfirmDeleteCatId(null);
                                        setManageError(null);
                                      }}
                                      title="Ubah kategori"
                                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        usedCount > 0 || manageTabCategories.length <= 1
                                      }
                                      onClick={() => setConfirmDeleteCatId(cat.id)}
                                      title={
                                        usedCount > 0
                                          ? `Masih dipakai oleh ${usedCount} transaksi`
                                          : 'Hapus kategori'
                                      }
                                      className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-35 rounded-md cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL BACKUP & RESTORE DATA KEUANGAN */}
      {/* =================================================================== */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="bg-slate-950 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  Backup &amp; Restore Keuangan
                </h3>
                <p className="text-[11px] text-slate-400">
                  Cadangkan atau pulihkan rekening, kategori, transaksi &amp; perpindahan dana
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto pb-safe">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="text-xs font-semibold text-slate-900">
                  Unduh File Backup (.json)
                </div>
                <p className="text-[11px] text-slate-600">
                  Menyimpan seluruh rekening kas/bank, kategori, transaksi, dan riwayat perpindahan dana ke file JSON lokal.
                </p>
                <button
                  type="button"
                  onClick={() => downloadFinanceBackupJson(adminToken)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup Keuangan</span>
                </button>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-semibold text-slate-900">
                  Pulihkan dari File Backup (.json)
                </div>
                <p className="text-[11px] text-slate-600">
                  Mengganti data keuangan saat ini dengan isi file backup JSON sebelumnya.
                </p>
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleRestoreFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => restoreInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{restoring ? 'Memulihkan...' : 'Pilih File Backup (.json)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
