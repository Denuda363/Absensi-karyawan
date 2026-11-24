import {
  AppNotification,
  NavSection,
  NotificationModule,
  NotificationPreferences,
  NotificationSeverity,
} from '../types';

const STORAGE_NOTIFICATIONS_KEY = 'karyapresensi_notifications_v1';
const STORAGE_PREFS_KEY = 'karyapresensi_notification_prefs_v1';
const MAX_STORED_NOTIFICATIONS = 150;
const MAX_ACTIVE_TOASTS = 3;
const TOAST_TTL_MS = 4800;

export const NOTIFICATION_MODULE_LABELS: Record<NotificationModule, string> = {
  absensi: 'Absensi',
  keuangan: 'Keuangan',
  gaji: 'Penggajian',
  jadwal: 'Jadwal Shift & Libur',
  sdm: 'Data Karyawan',
  sistem: 'Sistem & Akses',
};

const DEFAULT_PREFS: NotificationPreferences = {
  systemNotificationsEnabled: true,
  soundEnabled: true,
  showToasts: true,
  mutedModules: [],
};

export type DevicePermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

export interface EmitNotificationInput {
  title: string;
  message: string;
  module: NotificationModule;
  severity?: NotificationSeverity;
  actionType: string;
  amountValue?: number;
  amountLabel?: string;
  targetLabel?: string;
  targetNav?: NavSection;
  forceToast?: boolean;
  forceSystem?: boolean;
}

type NotificationsListener = () => void;
type ToastListener = () => void;
type SystemClickListener = (notif: AppNotification) => void;

const notificationListeners = new Set<NotificationsListener>();
const toastListeners = new Set<ToastListener>();
const systemClickListeners = new Set<SystemClickListener>();

let cachedNotifications: AppNotification[] | null = null;
let cachedPrefs: NotificationPreferences | null = null;
let activeToasts: AppNotification[] = [];
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

let audioCtx: AudioContext | null = null;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredNotifications(): AppNotification[] {
  if (cachedNotifications !== null) return cachedNotifications;
  if (!canUseStorage()) {
    cachedNotifications = [];
    return cachedNotifications;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
    if (!raw) {
      cachedNotifications = [];
      return cachedNotifications;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      cachedNotifications = parsed
        .filter((item): item is AppNotification => Boolean(item && item.id && item.title))
        .slice(0, MAX_STORED_NOTIFICATIONS);
    } else {
      cachedNotifications = [];
    }
  } catch {
    cachedNotifications = [];
  }
  return cachedNotifications;
}

function persistNotifications(items: AppNotification[]): void {
  cachedNotifications = items.slice(0, MAX_STORED_NOTIFICATIONS);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(
        STORAGE_NOTIFICATIONS_KEY,
        JSON.stringify(cachedNotifications)
      );
    } catch {
      // ignore storage quota errors
    }
  }
  notificationListeners.forEach((fn) => fn());
}

function readStoredPrefs(): NotificationPreferences {
  if (cachedPrefs !== null) return cachedPrefs;
  if (!canUseStorage()) {
    cachedPrefs = { ...DEFAULT_PREFS };
    return cachedPrefs;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFS_KEY);
    if (!raw) {
      cachedPrefs = { ...DEFAULT_PREFS };
      return cachedPrefs;
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    cachedPrefs = {
      systemNotificationsEnabled:
        typeof parsed.systemNotificationsEnabled === 'boolean'
          ? parsed.systemNotificationsEnabled
          : DEFAULT_PREFS.systemNotificationsEnabled,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_PREFS.soundEnabled,
      showToasts:
        typeof parsed.showToasts === 'boolean'
          ? parsed.showToasts
          : DEFAULT_PREFS.showToasts,
      mutedModules: Array.isArray(parsed.mutedModules)
        ? parsed.mutedModules
        : [],
    };
  } catch {
    cachedPrefs = { ...DEFAULT_PREFS };
  }
  return cachedPrefs;
}

function persistPrefs(next: NotificationPreferences): void {
  cachedPrefs = next;
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  notificationListeners.forEach((fn) => fn());
}

function notifyToastSubscribers(): void {
  toastListeners.forEach((fn) => fn());
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ntf_${crypto.randomUUID()}`;
  }
  return `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatRupiahNotif(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function getNotifications(): AppNotification[] {
  return readStoredNotifications();
}

export function getNotificationPrefs(): NotificationPreferences {
  return readStoredPrefs();
}

export function updateNotificationPrefs(
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  const current = readStoredPrefs();
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    mutedModules: patch.mutedModules ?? current.mutedModules,
  };
  persistPrefs(next);
  return next;
}

export function toggleMutedNotificationModule(
  module: NotificationModule
): NotificationPreferences {
  const current = readStoredPrefs();
  const exists = current.mutedModules.includes(module);
  const mutedModules = exists
    ? current.mutedModules.filter((m) => m !== module)
    : [...current.mutedModules, module];
  return updateNotificationPrefs({ mutedModules });
}

export function getActiveToasts(): AppNotification[] {
  return activeToasts;
}

export function subscribeNotifications(listener: NotificationsListener): () => void {
  notificationListeners.add(listener);
  return () => {
    notificationListeners.delete(listener);
  };
}

export function subscribeToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export function subscribeSystemNotificationClick(
  listener: SystemClickListener
): () => void {
  systemClickListeners.add(listener);
  return () => {
    systemClickListeners.delete(listener);
  };
}

export function dismissToast(id: string): void {
  const timer = toastTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    toastTimers.delete(id);
  }
  const next = activeToasts.filter((t) => t.id !== id);
  if (next.length !== activeToasts.length) {
    activeToasts = next;
    notifyToastSubscribers();
  }
}

export function markNotificationRead(id: string): void {
  const list = readStoredNotifications();
  let changed = false;
  const next = list.map((item) => {
    if (item.id === id && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });
  if (changed) {
    persistNotifications(next);
  }
}

export function markAllNotificationsRead(): void {
  const list = readStoredNotifications();
  if (!list.some((n) => !n.read)) return;
  persistNotifications(list.map((item) => ({ ...item, read: true })));
}

export function deleteNotification(id: string): void {
  dismissToast(id);
  const list = readStoredNotifications();
  persistNotifications(list.filter((item) => item.id !== id));
}

export function clearAllNotifications(): void {
  for (const timer of toastTimers.values()) {
    clearTimeout(timer);
  }
  toastTimers.clear();
  activeToasts = [];
  notifyToastSubscribers();
  persistNotifications([]);
}

export function getDeviceNotificationPermission(): DevicePermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission as DevicePermissionState;
}

export function isDeviceNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestDeviceNotificationPermission(): Promise<DevicePermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    if (result === 'granted') {
      updateNotificationPrefs({ systemNotificationsEnabled: true });
    }
    notificationListeners.forEach((fn) => fn());
    return result as DevicePermissionState;
  } catch {
    return getDeviceNotificationPermission();
  }
}

function playNotificationChime(severity: NotificationSeverity): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioCtx) {
      audioCtx = new AudioContextCtor();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const freqs =
      severity === 'danger'
        ? [440, 349.23]
        : severity === 'warning'
        ? [523.25, 440]
        : [587.33, 880];

    freqs.forEach((freq, idx) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.045, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
  } catch {
    // Audio playback may be blocked until user interaction
  }
}

async function dispatchDeviceSystemNotification(
  notif: AppNotification
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }

  const moduleTitle = NOTIFICATION_MODULE_LABELS[notif.module] || 'Aktivitas';
  const title = `${moduleTitle} · ${notif.title}`;
  const body = notif.amountLabel
    ? `${notif.message}\nNominal: ${notif.amountLabel}`
    : notif.message;

  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: notif.id,
    data: {
      notificationId: notif.id,
      targetNav: notif.targetNav,
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fallback to window.Notification
  }

  try {
    const sysNotif = new window.Notification(title, options);
    sysNotif.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      markNotificationRead(notif.id);
      systemClickListeners.forEach((fn) => fn(notif));
      sysNotif.close();
    };
    return true;
  } catch {
    return false;
  }
}

function enqueueToast(notif: AppNotification): void {
  activeToasts = [notif, ...activeToasts.filter((t) => t.id !== notif.id)].slice(
    0,
    MAX_ACTIVE_TOASTS
  );
  notifyToastSubscribers();

  const timer = setTimeout(() => {
    dismissToast(notif.id);
  }, TOAST_TTL_MS);
  toastTimers.set(notif.id, timer);
}

export function emitAppNotification(
  input: EmitNotificationInput
): AppNotification {
  const prefs = readStoredPrefs();
  const isModuleMuted = prefs.mutedModules.includes(input.module);

  const notif: AppNotification = {
    id: generateId(),
    title: input.title.trim(),
    message: input.message.trim(),
    module: input.module,
    severity: input.severity ?? 'info',
    actionType: input.actionType,
    ...(typeof input.amountValue === 'number'
      ? { amountValue: input.amountValue }
      : {}),
    ...(input.amountLabel ? { amountLabel: input.amountLabel } : {}),
    ...(input.targetLabel ? { targetLabel: input.targetLabel } : {}),
    ...(input.targetNav ? { targetNav: input.targetNav } : {}),
    timestamp: new Date().toISOString(),
    read: false,
    systemDelivered: false,
  };

  const currentList = readStoredNotifications();
  persistNotifications([notif, ...currentList]);

  if ((prefs.showToasts && !isModuleMuted) || input.forceToast) {
    enqueueToast(notif);
  }

  if (prefs.soundEnabled && !isModuleMuted) {
    playNotificationChime(notif.severity);
  }

  if (
    (prefs.systemNotificationsEnabled && !isModuleMuted) ||
    input.forceSystem
  ) {
    void dispatchDeviceSystemNotification(notif).then((delivered) => {
      if (!delivered) return;
      const latest = readStoredNotifications();
      const idx = latest.findIndex((item) => item.id === notif.id);
      if (idx >= 0) {
        const updated = [...latest];
        updated[idx] = { ...updated[idx], systemDelivered: true };
        persistNotifications(updated);
      }
    });
  }

  return notif;
}

export async function sendTestDeviceNotification(): Promise<{
  ok: boolean;
  permission: DevicePermissionState;
}> {
  let perm = getDeviceNotificationPermission();
  if (perm === 'default') {
    perm = await requestDeviceNotificationPermission();
  }

  const notif = emitAppNotification({
    title: 'Uji Notifikasi Sistem Perangkat',
    message:
      perm === 'granted'
        ? 'Notifikasi aplikasi dan sistem perangkat aktif dan siap menerima pembaruan setiap transaksi.'
        : 'Tercatat di Pusat Notifikasi aplikasi (izin notifikasi perangkat belum diaktifkan di browser).',
    module: 'sistem',
    severity: perm === 'granted' ? 'success' : 'warning',
    actionType: 'test_device_notification',
    forceToast: true,
    forceSystem: perm === 'granted',
  });

  return {
    ok: perm === 'granted' || Boolean(notif.id),
    permission: perm,
  };
}
