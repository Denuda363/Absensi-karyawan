import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  CalendarRange,
  Check,
  CheckCheck,
  CircleDollarSign,
  Clock,
  MonitorSmartphone,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import {
  AppNotification,
  NavSection,
  NotificationModule,
  NotificationPreferences,
  NotificationSeverity,
} from '../types';
import {
  clearAllNotifications,
  deleteNotification,
  DevicePermissionState,
  dismissToast,
  getActiveToasts,
  getDeviceNotificationPermission,
  getNotificationPrefs,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_MODULE_LABELS,
  requestDeviceNotificationPermission,
  sendTestDeviceNotification,
  subscribeNotifications,
  subscribeSystemNotificationClick,
  subscribeToasts,
  toggleMutedNotificationModule,
  updateNotificationPrefs,
} from '../services/notificationCenterService';

const MODULE_META: Record<
  NotificationModule,
  {
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  absensi: { label: 'Absensi', shortLabel: 'Absensi', icon: Clock },
  keuangan: { label: 'Keuangan', shortLabel: 'Keuangan', icon: CircleDollarSign },
  gaji: { label: 'Penggajian', shortLabel: 'Gaji', icon: Wallet },
  jadwal: { label: 'Jadwal Shift & Libur', shortLabel: 'Jadwal', icon: CalendarRange },
  sdm: { label: 'Data Karyawan', shortLabel: 'SDM', icon: Users },
  sistem: { label: 'Sistem & Akses', shortLabel: 'Sistem', icon: ShieldCheck },
};

const MODULE_ORDER: NotificationModule[] = [
  'absensi',
  'keuangan',
  'gaji',
  'jadwal',
  'sdm',
  'sistem',
];

function getSeverityIconClasses(severity: NotificationSeverity): string {
  switch (severity) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'danger':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'info':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200';
  }
}

function getAmountTextClass(notif: AppNotification): string {
  if (notif.amountLabel?.startsWith('+')) return 'text-emerald-700';
  if (notif.amountLabel?.startsWith('-')) return 'text-red-700';
  return 'text-slate-900';
}

function formatTimeHMS(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatRelativeLabel(iso: string, nowMs: number): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - dt.getTime()) / 1000));
  if (diffSec < 10) return 'Baru saja';
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  return dt.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

function getLocalDayKey(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

type TimeBucketKey = 'recent' | 'today' | 'yesterday' | 'older';

const BUCKET_TITLES: Record<TimeBucketKey, string> = {
  recent: 'Baru Saja (15 Menit Terakhir)',
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  older: 'Riwayat Sebelumnya',
};

export function useNotificationCenterState() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    getNotifications()
  );
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    getNotificationPrefs()
  );
  const [toasts, setToasts] = useState<AppNotification[]>(() => getActiveToasts());
  const [permission, setPermission] = useState<DevicePermissionState>(() =>
    getDeviceNotificationPermission()
  );

  useEffect(() => {
    const syncMain = () => {
      setNotifications(getNotifications());
      setPrefs(getNotificationPrefs());
      setPermission(getDeviceNotificationPermission());
    };
    const syncToasts = () => {
      setToasts(getActiveToasts());
    };
    const unsubNotifs = subscribeNotifications(syncMain);
    const unsubToasts = subscribeToasts(syncToasts);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setPermission(getDeviceNotificationPermission());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubNotifs();
      unsubToasts();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    prefs,
    toasts,
    permission,
  };
}

interface NotificationBellButtonProps {
  unreadCount: number;
  deviceReady: boolean;
  onClick: () => void;
}

export const NotificationBellButton: React.FC<NotificationBellButtonProps> = ({
  unreadCount,
  deviceReady,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Buka Pusat Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ''}`}
      title="Pusat Notifikasi & Jejak Aktivitas"
      className="relative min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
    >
      <div className="relative flex items-center justify-center">
        <Bell className="w-4 h-4 text-slate-700" />
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
            deviceReady ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
      </div>
      <span className="hidden md:inline">Notifikasi</span>
      {unreadCount > 0 && (
        <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-blue-700 text-white leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

interface NotificationToastStackProps {
  toasts: AppNotification[];
  onOpenCenter: (notif: AppNotification) => void;
}

export const NotificationToastStack: React.FC<NotificationToastStackProps> = ({
  toasts,
  onOpenCenter,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-16 inset-x-3 sm:top-auto sm:bottom-5 sm:left-auto sm:right-5 sm:w-[380px] z-50 flex flex-col gap-2 pointer-events-none no-print"
    >
      {toasts.map((toast) => {
        const meta = MODULE_META[toast.module];
        const Icon = meta.icon;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg p-3 flex items-start gap-3 transition-all"
          >
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${getSeverityIconClasses(
                toast.severity
              )}`}
            >
              <Icon className="w-4 h-4" />
            </div>

            <button
              type="button"
              onClick={() => {
                markNotificationRead(toast.id);
                dismissToast(toast.id);
                onOpenCenter(toast);
              }}
              className="flex-1 min-w-0 text-left cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                  {toast.title}
                </p>
                {toast.amountLabel && (
                  <span
                    className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${getAmountTextClass(
                      toast
                    )}`}
                  >
                    {toast.amountLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                {toast.message}
              </p>
              <p className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                {meta.shortLabel} · {formatTimeHMS(toast.timestamp)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup notifikasi"
              className="min-h-[32px] min-w-[32px] -mr-1 -mt-1 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface NotificationCenterDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  prefs: NotificationPreferences;
  permission: DevicePermissionState;
  isAdminMode: boolean;
  onNavigate: (nav: NavSection) => void;
  onOpenAdminModeModal: () => void;
}

export const NotificationCenterDrawer: React.FC<
  NotificationCenterDrawerProps
> = ({
  open,
  onClose,
  notifications,
  unreadCount,
  prefs,
  permission,
  isAdminMode,
  onNavigate,
  onOpenAdminModeModal,
}) => {
  const [selectedModule, setSelectedModule] = useState<
    NotificationModule | 'semua'
  >('semua');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showModulePrefs, setShowModulePrefs] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);
  const [testingDevice, setTestingDevice] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!open) {
      setConfirmClearAll(false);
      return;
    }
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    return subscribeSystemNotificationClick((notif) => {
      if (notif.targetNav) {
        const needsAdmin =
          notif.targetNav === 'keuangan' ||
          notif.targetNav === 'rekap-gaji' ||
          notif.targetNav === 'pengaturan';
        if (!needsAdmin || isAdminMode) {
          onNavigate(notif.targetNav);
        }
      }
    });
  }, [isAdminMode, onNavigate]);

  const todayKey = useMemo(() => getLocalDayKey(new Date(nowMs)), [nowMs]);
  const yesterdayKey = useMemo(() => {
    const dt = new Date(nowMs);
    dt.setDate(dt.getDate() - 1);
    return getLocalDayKey(dt);
  }, [nowMs]);

  const stats = useMemo(() => {
    let todayCount = 0;
    let financeTodayCount = 0;
    const moduleCounts: Record<NotificationModule, number> = {
      absensi: 0,
      keuangan: 0,
      gaji: 0,
      jadwal: 0,
      sdm: 0,
      sistem: 0,
    };

    for (const item of notifications) {
      moduleCounts[item.module] = (moduleCounts[item.module] || 0) + 1;
      const dt = new Date(item.timestamp);
      if (!Number.isNaN(dt.getTime()) && getLocalDayKey(dt) === todayKey) {
        todayCount += 1;
        if (item.module === 'keuangan') {
          financeTodayCount += 1;
        }
      }
    }

    return { todayCount, financeTodayCount, moduleCounts };
  }, [notifications, todayKey]);

  const filteredNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notifications.filter((item) => {
      if (selectedModule !== 'semua' && item.module !== selectedModule) {
        return false;
      }
      if (unreadOnly && item.read) {
        return false;
      }
      if (!q) return true;
      const hay = `${item.title} ${item.message} ${item.amountLabel ?? ''} ${
        item.targetLabel ?? ''
      } ${NOTIFICATION_MODULE_LABELS[item.module]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notifications, selectedModule, unreadOnly, searchQuery]);

  const groupedBuckets = useMemo(() => {
    const buckets: Record<TimeBucketKey, AppNotification[]> = {
      recent: [],
      today: [],
      yesterday: [],
      older: [],
    };
    const fifteenMinAgo = nowMs - 15 * 60 * 1000;

    for (const item of filteredNotifications) {
      const dt = new Date(item.timestamp);
      const ts = dt.getTime();
      if (Number.isNaN(ts)) {
        buckets.older.push(item);
        continue;
      }
      if (ts >= fifteenMinAgo) {
        buckets.recent.push(item);
      } else {
        const key = getLocalDayKey(dt);
        if (key === todayKey) {
          buckets.today.push(item);
        } else if (key === yesterdayKey) {
          buckets.yesterday.push(item);
        } else {
          buckets.older.push(item);
        }
      }
    }

    return (['recent', 'today', 'yesterday', 'older'] as TimeBucketKey[])
      .map((key) => ({
        key,
        title: BUCKET_TITLES[key],
        items: buckets[key],
      }))
      .filter((group) => group.items.length > 0);
  }, [filteredNotifications, nowMs, todayKey, yesterdayKey]);

  if (!open) return null;

  const handleRequestPermission = async () => {
    await requestDeviceNotificationPermission();
  };

  const handleTestDevice = async () => {
    setTestingDevice(true);
    try {
      await sendTestDeviceNotification();
    } finally {
      setTestingDevice(false);
    }
  };

  const handleNavigateToNotif = (notif: AppNotification) => {
    markNotificationRead(notif.id);
    if (!notif.targetNav) return;
    const requiresAdmin =
      notif.targetNav === 'keuangan' ||
      notif.targetNav === 'rekap-gaji' ||
      notif.targetNav === 'pengaturan';
    if (requiresAdmin && !isAdminMode) {
      onClose();
      onOpenAdminModeModal();
      return;
    }
    onNavigate(notif.targetNav);
    onClose();
  };

  const deviceStatusLabel =
    permission === 'unsupported'
      ? 'Tidak Didukung'
      : permission === 'denied'
        ? 'Diblokir'
        : permission === 'granted' && prefs.systemNotificationsEnabled
          ? 'Aktif'
          : permission === 'granted'
            ? 'Dijeda'
            : 'Perlu Izin';

  const deviceStatusColor =
    permission === 'granted' && prefs.systemNotificationsEnabled
      ? 'text-emerald-700'
      : permission === 'denied'
        ? 'text-red-700'
        : 'text-amber-700';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Pusat Notifikasi"
    >
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full sm:max-w-2xl bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
        {/* 1. Command Header */}
        <div className="bg-slate-950 text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-3 shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                Pusat Notifikasi &amp; Buku Aktivitas
              </h2>
              <p className="text-xs text-slate-400 font-mono tabular-nums truncate">
                {unreadCount} belum dibaca · {notifications.length} riwayat tercatat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllNotificationsRead}
                title="Tandai semua sudah dibaca"
                className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Tandai Dibaca</span>
              </button>
            )}

            {notifications.length > 0 &&
              (confirmClearAll ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearAllNotifications();
                      setConfirmClearAll(false);
                    }}
                    className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                  >
                    Hapus Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="min-h-[38px] px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  title="Bersihkan seluruh riwayat notifikasi"
                  className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Bersihkan</span>
                </button>
              ))}

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Pusat Notifikasi"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. 4-Cell Tabular Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="px-4 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">
              Aktivitas Hari Ini
            </div>
            <div className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
              {stats.todayCount}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">
              Belum Dibaca
            </div>
            <div className="font-mono text-base font-bold text-blue-700 tabular-nums mt-0.5">
              {unreadCount}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">
              Transaksi Keuangan
            </div>
            <div className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
              {stats.financeTodayCount}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">
              Notifikasi Perangkat
            </div>
            <div
              className={`font-display text-sm font-bold mt-1 ${deviceStatusColor}`}
            >
              {deviceStatusLabel}
            </div>
          </div>
        </div>

        {/* 3. Device System Notification & Audio Control Bar */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <MonitorSmartphone className="w-4 h-4 text-slate-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">
                  Notifikasi Sistem Perangkat (Desktop &amp; Mobile PWA)
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {permission === 'granted'
                    ? 'Setiap transaksi langsung dikirim ke pusat notifikasi perangkat Anda.'
                    : permission === 'denied'
                      ? 'Izin diblokir browser — buka ikon gembok situs untuk mengaktifkan.'
                      : permission === 'unsupported'
                        ? 'Browser tidak mendukung Web Notification; histori & popup aplikasi tetap aktif.'
                        : 'Aktifkan izin agar setiap absensi, gaji, dan keuangan muncul di notifikasi HP/PC.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {permission === 'default' && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Izinkan Perangkat</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleTestDevice}
                disabled={testingDevice}
                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-blue-700" />
                <span>{testingDevice ? 'Mengirim...' : 'Tes Perangkat'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                if (permission === 'default') {
                  void handleRequestPermission();
                } else {
                  updateNotificationPrefs({
                    systemNotificationsEnabled: !prefs.systemNotificationsEnabled,
                  });
                }
              }}
              className={`min-h-[34px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                permission === 'granted' && prefs.systemNotificationsEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {permission === 'granted' && prefs.systemNotificationsEnabled ? (
                <Bell className="w-3.5 h-3.5" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span>
                OS Push:{' '}
                {permission === 'granted' && prefs.systemNotificationsEnabled
                  ? 'Aktif'
                  : 'Nonaktif'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateNotificationPrefs({ soundEnabled: !prefs.soundEnabled })
              }
              className={`min-h-[34px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                prefs.soundEnabled
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {prefs.soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>Nada Chime: {prefs.soundEnabled ? 'Aktif' : 'Senyap'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateNotificationPrefs({ showToasts: !prefs.showToasts })
              }
              className={`min-h-[34px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                prefs.showToasts
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>Popup Layar: {prefs.showToasts ? 'Aktif' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowModulePrefs((prev) => !prev)}
              className={`min-h-[34px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                showModulePrefs || prefs.mutedModules.length > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                Filter Modul
                {prefs.mutedModules.length > 0
                  ? ` (${prefs.mutedModules.length} disenyapkan)`
                  : ''}
              </span>
            </button>
          </div>

          {permission === 'denied' && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>
                Notifikasi perangkat diblokir di pengaturan browser. Klik ikon
                gembok/info di samping URL, ubah izin <strong>Notifications</strong>{' '}
                menjadi <strong>Allow</strong>, lalu muat ulang halaman.
              </span>
            </div>
          )}

          {showModulePrefs && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700">
                Pilih modul yang diizinkan membunyikan nada &amp; mengirim notifikasi perangkat:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_ORDER.map((mod) => {
                  const muted = prefs.mutedModules.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => toggleMutedNotificationModule(mod)}
                      className={`min-h-[32px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        muted
                          ? 'bg-white text-slate-400 border-slate-200 line-through'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Check
                        className={`w-3 h-3 ${
                          muted ? 'text-slate-300' : 'text-emerald-600'
                        }`}
                      />
                      <span>{MODULE_META[mod].shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 4. Search & Module Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-2.5 bg-slate-50/60 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari transaksi, nama karyawan, nominal, atau modul..."
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setUnreadOnly((prev) => !prev)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap cursor-pointer transition-colors ${
                unreadOnly
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Belum Dibaca
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedModule('semua')}
              className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                selectedModule === 'semua'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>Semua</span>
              <span className="font-mono text-[10px] tabular-nums opacity-80">
                {notifications.length}
              </span>
            </button>

            {MODULE_ORDER.map((mod) => {
              const meta = MODULE_META[mod];
              const count = stats.moduleCounts[mod] || 0;
              const active = selectedModule === mod;
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setSelectedModule(mod)}
                  className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{meta.shortLabel}</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-80">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Time-Bucketed Activity Timeline Feed */}
        <div className="flex-1 overflow-y-auto bg-white">
          {groupedBuckets.length === 0 ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                {notifications.length === 0
                  ? 'Belum Ada Transaksi Tercatat'
                  : 'Tidak Ada Notifikasi yang Cocok'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                {notifications.length === 0
                  ? 'Setiap absensi masuk/pulang, pengaturan jadwal shift & libur, transaksi keuangan, rekap gaji, hingga backup sistem akan tercatat otomatis di sini.'
                  : 'Ubah kata kunci pencarian atau pilih filter modul lainnya untuk melihat aktivitas.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {notifications.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleTestDevice}
                    className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim Tes Notifikasi Perangkat</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModule('semua');
                      setUnreadOnly(false);
                      setSearchQuery('');
                    }}
                    className="min-h-[38px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {groupedBuckets.map((bucket) => (
                <section key={bucket.key}>
                  <div className="sticky top-0 z-10 px-4 sm:px-6 py-2 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {bucket.title}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                      {bucket.items.length} item
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {bucket.items.map((item) => {
                      const meta = MODULE_META[item.module];
                      const Icon = meta.icon;
                      return (
                        <div
                          key={item.id}
                          className={`px-4 sm:px-6 py-3.5 flex items-start gap-3.5 transition-colors ${
                            item.read
                              ? 'bg-white hover:bg-slate-50/70'
                              : 'bg-blue-50/40 hover:bg-blue-50/60'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${getSeverityIconClasses(
                              item.severity
                            )}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {!item.read && (
                                  <span
                                    aria-label="Belum dibaca"
                                    className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                                  />
                                )}
                                <h4 className="font-display text-[13px] font-bold text-slate-900 leading-snug truncate">
                                  {item.title}
                                </h4>
                              </div>

                              {item.amountLabel && (
                                <span
                                  className={`font-mono text-xs font-bold tabular-nums shrink-0 ${getAmountTextClass(
                                    item
                                  )}`}
                                >
                                  {item.amountLabel}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                              {item.message}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-mono text-slate-500 tabular-nums flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span className="font-sans font-semibold text-slate-700">
                                  {meta.label}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatRelativeLabel(item.timestamp, nowMs)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatTimeHMS(item.timestamp)}</span>
                                {item.systemDelivered && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-sans text-emerald-700 font-medium">
                                      Terkirim ke perangkat
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {item.targetNav && (
                                  <button
                                    type="button"
                                    onClick={() => handleNavigateToNotif(item)}
                                    className="min-h-[30px] px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>Buka</span>
                                    <ArrowUpRight className="w-3 h-3" />
                                  </button>
                                )}

                                {!item.read && (
                                  <button
                                    type="button"
                                    onClick={() => markNotificationRead(item.id)}
                                    title="Tandai sudah dibaca"
                                    className="min-h-[30px] px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                                  >
                                    Dibaca
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => deleteNotification(item.id)}
                                  aria-label="Hapus notifikasi ini"
                                  title="Hapus notifikasi"
                                  className="min-h-[30px] min-w-[30px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
