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

function getSeverityCubeClasses(severity: NotificationSeverity): string {
  switch (severity) {
    case 'success':
      return 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-emerald-400/40';
    case 'warning':
      return 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-300/40';
    case 'danger':
      return 'bg-gradient-to-br from-rose-500 to-red-700 text-white border-rose-400/40';
    case 'info':
    default:
      return 'bg-gradient-to-br from-blue-500 to-indigo-700 text-white border-blue-400/40';
  }
}

function getAmountBadgeClasses(notif: AppNotification): string {
  if (notif.amountLabel?.startsWith('+')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (notif.amountLabel?.startsWith('-')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-slate-100 text-slate-900 border-slate-200';
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
type PopupTabKey = 'feed' | 'preferences';

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
      className="btn-3d-secondary relative min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
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
        <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 text-white leading-none shadow-xs">
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
      className="fixed top-16 inset-x-3 sm:top-auto sm:bottom-5 sm:left-auto sm:right-5 sm:w-[390px] z-50 flex flex-col gap-2.5 pointer-events-none no-print"
    >
      {toasts.map((toast) => {
        const meta = MODULE_META[toast.module];
        const Icon = meta.icon;
        return (
          <div
            key={toast.id}
            className="animate-popup-3d pointer-events-auto surface-3d rounded-2xl p-3.5 flex items-start gap-3 shadow-[0_18px_40px_-14px_rgba(15,23,42,0.28)]"
          >
            <div
              className={`icon-cube-3d w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${getSeverityCubeClasses(
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
                    className={`font-mono text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border shrink-0 ${getAmountBadgeClasses(
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
              <p className="text-[10px] font-mono text-slate-400 mt-1.5 tabular-nums">
                {meta.shortLabel} · {formatTimeHMS(toast.timestamp)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup notifikasi"
              className="min-h-[32px] min-w-[32px] -mr-1 -mt-1 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0 transition-colors"
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
  isAttendanceAdmin: boolean;
  isFinanceAdmin: boolean;
  onNavigate: (nav: NavSection) => void;
  onOpenAdminModeModal: (scope?: 'auto' | 'attendance' | 'finance') => void;
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
  isAttendanceAdmin,
  isFinanceAdmin,
  onNavigate,
  onOpenAdminModeModal,
}) => {
  const [activeTab, setActiveTab] = useState<PopupTabKey>('feed');
  const [selectedModule, setSelectedModule] = useState<
    NotificationModule | 'semua'
  >('semua');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    return subscribeSystemNotificationClick((notif) => {
      if (!notif.targetNav) return;
      if (notif.targetNav === 'pengaturan' && !isAttendanceAdmin) return;
      if (
        (notif.targetNav === 'keuangan' || notif.targetNav === 'rekap-gaji') &&
        !isFinanceAdmin
      ) {
        return;
      }
      onNavigate(notif.targetNav);
    });
  }, [isAttendanceAdmin, isFinanceAdmin, onNavigate]);

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
    if (notif.targetNav === 'pengaturan' && !isAttendanceAdmin) {
      onClose();
      onOpenAdminModeModal('attendance');
      return;
    }
    if (
      (notif.targetNav === 'keuangan' || notif.targetNav === 'rekap-gaji') &&
      !isFinanceAdmin
    ) {
      onClose();
      onOpenAdminModeModal('finance');
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
      ? 'text-emerald-400'
      : permission === 'denied'
        ? 'text-rose-400'
        : 'text-amber-300';

  return (
    <div
      className="fixed top-[62px] sm:top-[74px] inset-x-2 sm:inset-x-auto sm:right-6 z-40 flex justify-end pointer-events-none no-print"
      role="dialog"
      aria-modal="false"
      aria-label="Pusat Notifikasi"
    >
      {/* Non-Blocking Floating 3D Pop-Up Command Window */}
      <div className="animate-popup-3d pointer-events-auto w-full sm:w-[460px] md:w-[500px] max-h-[calc(100dvh-138px)] sm:max-h-[calc(100vh-92px)] flex flex-col rounded-3xl overflow-hidden bg-[#f4f7fb] border border-slate-300/90 shadow-[0_24px_60px_-14px_rgba(15,23,42,0.34),0_8px_20px_-8px_rgba(37,99,235,0.18),0_0_0_1px_rgba(255,255,255,0.6)_inset]">
        {/* 1. Executive Dark 3D Pop-Up Header + Telemetry + Switcher */}
        <div className="surface-3d-dark text-white px-4 sm:px-5 pt-3.5 pb-3.5 shrink-0 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-blue-500/15 blur-3xl"
          />

          <div className="relative flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="icon-cube-3d w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 border border-blue-300/35 text-white flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold text-white truncate tracking-tight">
                  Pusat Notifikasi
                </h2>
                <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                  {unreadCount} belum dibaca · {notifications.length} riwayat
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  title="Tandai semua sudah dibaca"
                  className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Dibaca</span>
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
                      className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
                    >
                      Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(false)}
                      className="min-h-[34px] px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(true)}
                    title="Bersihkan seluruh riwayat notifikasi"
                    className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Bersihkan</span>
                  </button>
                ))}

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup Pusat Notifikasi"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 4-Card Mini Telemetry Strip inside Dark Pop-Up */}
          <div className="relative mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl bg-slate-900/80 border border-slate-800/90 px-2.5 py-1.5">
              <div className="text-[10px] font-medium text-slate-400 truncate">
                Hari Ini
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-white tabular-nums mt-0.5">
                {stats.todayCount}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800/90 px-2.5 py-1.5">
              <div className="text-[10px] font-medium text-slate-400 truncate">
                Belum Dibaca
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-sky-400 tabular-nums mt-0.5">
                {unreadCount}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/80 border border-slate-800/90 px-2.5 py-1.5">
              <div className="text-[10px] font-medium text-slate-400 truncate">
                Keuangan
              </div>
              <div className="font-mono text-sm sm:text-base font-bold text-white tabular-nums mt-0.5">
                {stats.financeTodayCount}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className="rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/90 px-2.5 py-1.5 text-left transition-colors cursor-pointer"
            >
              <div className="text-[10px] font-medium text-slate-400 flex items-center justify-between gap-1">
                <span className="truncate">Perangkat</span>
                <SlidersHorizontal className="w-3 h-3 text-slate-500 shrink-0" />
              </div>
              <div
                className={`font-display text-xs sm:text-sm font-bold mt-0.5 truncate ${deviceStatusColor}`}
              >
                {deviceStatusLabel}
              </div>
            </button>
          </div>

          {/* Pop-Up Segmented View Switcher */}
          <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-900/90 border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('feed')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Feed Aktivitas</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'preferences'
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MonitorSmartphone className="w-3.5 h-3.5" />
                <span>Perangkat &amp; Preferensi</span>
                {prefs.mutedModules.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 tabular-nums">
                    {prefs.mutedModules.length}
                  </span>
                )}
              </button>
            </div>

            {permission === 'default' && activeTab === 'feed' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="min-h-[34px] px-3 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Aktifkan Push Perangkat</span>
              </button>
            )}
          </div>
        </div>

        {/* 2A. FEED TAB */}
        {activeTab === 'feed' ? (
          <>
            {/* Search & Module Filter Bar */}
            <div className="px-4 sm:px-6 py-3 bg-white/95 border-b border-slate-200/90 space-y-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari transaksi, nama karyawan, nominal, atau modul..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setUnreadOnly((prev) => !prev)}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-xl border whitespace-nowrap cursor-pointer transition-colors ${
                    unreadOnly
                      ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
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
                  className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-xl whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    selectedModule === 'semua'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                      className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-xl whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        active
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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

            {/* Card-Based 3D Activity Timeline Feed */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5">
              {groupedBuckets.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="icon-cube-3d w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300/80 flex items-center justify-center text-slate-500 mb-3">
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
                        className="btn-3d-primary min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
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
                        className="btn-3d-secondary min-h-[38px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                groupedBuckets.map((bucket) => (
                  <section key={bucket.key} className="space-y-2.5">
                    <div className="sticky top-0 z-10 py-1 px-1 bg-[#f4f7fb]/90 backdrop-blur-xs flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {bucket.title}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                        {bucket.items.length} item
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {bucket.items.map((item) => {
                        const meta = MODULE_META[item.module];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={item.id}
                            className={`surface-3d rounded-2xl p-3.5 flex items-start gap-3.5 transition-all duration-150 ${
                              item.read
                                ? 'opacity-95 hover:opacity-100'
                                : 'ring-2 ring-blue-500/30 bg-gradient-to-b from-blue-50/40 to-white'
                            }`}
                          >
                            <div
                              className={`icon-cube-3d w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${getSeverityCubeClasses(
                                item.severity
                              )}`}
                            >
                              <Icon className="w-4 h-4" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2.5">
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
                                    className={`font-mono text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-lg border shrink-0 ${getAmountBadgeClasses(
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

                              <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
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
                                      className="min-h-[30px] px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1 cursor-pointer transition-colors"
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
                                      className="min-h-[30px] px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                                    >
                                      Dibaca
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => deleteNotification(item.id)}
                                    aria-label="Hapus notifikasi ini"
                                    title="Hapus notifikasi"
                                    className="min-h-[30px] min-w-[30px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
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
                ))
              )}
            </div>
          </>
        ) : (
          /* 2B. PREFERENCES & DEVICE TAB */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="surface-3d rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="icon-cube-3d w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shrink-0">
                    <MonitorSmartphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Notifikasi Sistem Perangkat (Desktop &amp; Mobile PWA)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
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

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {permission === 'default' && (
                    <button
                      type="button"
                      onClick={handleRequestPermission}
                      className="btn-3d-primary min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      <span>Izinkan Perangkat</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleTestDevice}
                    disabled={testingDevice}
                    className="btn-3d-secondary min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-blue-700" />
                    <span>{testingDevice ? 'Mengirim...' : 'Tes Perangkat'}</span>
                  </button>
                </div>
              </div>

              {permission === 'denied' && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>
                    Notifikasi perangkat diblokir di pengaturan browser. Klik ikon
                    gembok/info di samping URL, ubah izin <strong>Notifications</strong>{' '}
                    menjadi <strong>Allow</strong>, lalu muat ulang halaman.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
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
                  className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl border inline-flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    permission === 'granted' && prefs.systemNotificationsEnabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {permission === 'granted' && prefs.systemNotificationsEnabled ? (
                      <Bell className="w-4 h-4" />
                    ) : (
                      <BellOff className="w-4 h-4" />
                    )}
                    <span>OS Push</span>
                  </span>
                  <span className="font-mono text-[11px]">
                    {permission === 'granted' && prefs.systemNotificationsEnabled
                      ? 'Aktif'
                      : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateNotificationPrefs({ soundEnabled: !prefs.soundEnabled })
                  }
                  className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl border inline-flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    prefs.soundEnabled
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {prefs.soundEnabled ? (
                      <Volume2 className="w-4 h-4" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                    <span>Nada Chime</span>
                  </span>
                  <span className="font-mono text-[11px]">
                    {prefs.soundEnabled ? 'Aktif' : 'Senyap'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateNotificationPrefs({ showToasts: !prefs.showToasts })
                  }
                  className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl border inline-flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    prefs.showToasts
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>Popup Layar</span>
                  <span className="font-mono text-[11px]">
                    {prefs.showToasts ? 'Aktif' : 'Off'}
                  </span>
                </button>
              </div>
            </div>

            <div className="surface-3d rounded-2xl p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Filter Notifikasi Per Modul
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih modul yang diizinkan membunyikan nada chime &amp; mengirim notifikasi perangkat.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MODULE_ORDER.map((mod) => {
                  const meta = MODULE_META[mod];
                  const Icon = meta.icon;
                  const muted = prefs.mutedModules.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => toggleMutedNotificationModule(mod)}
                      className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        muted
                          ? 'bg-slate-50 text-slate-400 border-slate-200'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className={`truncate ${muted ? 'line-through' : ''}`}>
                          {meta.shortLabel}
                        </span>
                      </span>
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 ${
                          muted ? 'text-slate-300' : 'text-emerald-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
