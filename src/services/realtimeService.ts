export type RealtimeScope =
  | 'attendance'
  | 'payroll'
  | 'finance'
  | 'database'
  | 'security';

export type RealtimeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export interface RealtimeStateSnapshot {
  status: RealtimeConnectionStatus;
  engine: string;
  revision: number;
  lastEventAt: string | null;
}

export interface RealtimeChangeEvent {
  scope: RealtimeScope;
  action: string;
  revision: number;
  engine: string;
  updatedAt: string;
  source: 'sse' | 'broadcast' | 'firestore' | 'reconnect';
}

type ScopeListener = (evt: RealtimeChangeEvent) => void;
type StatusListener = (snapshot: RealtimeStateSnapshot) => void;

const CHANNEL_NAME = 'karyapresensi_realtime_v1';
const TAB_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const scopeListeners = new Map<RealtimeScope, Set<ScopeListener>>();
const statusListeners = new Set<StatusListener>();
const localMutationTimestamps = new Map<RealtimeScope, number>();

let stateSnapshot: RealtimeStateSnapshot = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  engine: 'supabase',
  revision: 0,
  lastEventAt: null,
};

let eventSource: EventSource | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let started = false;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;

function notifyStatusListeners(): void {
  const copy = { ...stateSnapshot };
  for (const fn of Array.from(statusListeners)) {
    try {
      fn(copy);
    } catch {
      // ignore subscriber errors
    }
  }
}

function updateStateSnapshot(patch: Partial<RealtimeStateSnapshot>): void {
  stateSnapshot = { ...stateSnapshot, ...patch };
  notifyStatusListeners();
}

function dispatchScopeEvent(evt: RealtimeChangeEvent): void {
  const listeners = scopeListeners.get(evt.scope);
  if (!listeners || listeners.size === 0) return;
  for (const fn of Array.from(listeners)) {
    try {
      fn(evt);
    } catch {
      // ignore subscriber errors
    }
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (typeof window === 'undefined') return;
  if (!navigator.onLine) {
    updateStateSnapshot({ status: 'offline' });
    return;
  }
  clearReconnectTimer();
  reconnectAttempt = Math.min(reconnectAttempt + 1, 6);
  const delayMs = Math.min(15000, 1000 * Math.pow(1.6, reconnectAttempt - 1));
  updateStateSnapshot({ status: 'reconnecting' });
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectEventSource();
  }, delayMs);
}

function connectEventSource(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (eventSource) {
    try {
      eventSource.close();
    } catch {
      // ignore
    }
    eventSource = null;
  }

  try {
    const es = new EventSource('/api/realtime/stream');
    eventSource = es;

    es.addEventListener('connected', (rawEvt) => {
      reconnectAttempt = 0;
      clearReconnectTimer();
      try {
        const data = JSON.parse((rawEvt as MessageEvent).data || '{}') as {
          revision?: number;
          engine?: string;
          connectedAt?: string;
        };
        const prevRev = stateSnapshot.revision;
        const nextRev = Number(data.revision || 0);
        updateStateSnapshot({
          status: 'connected',
          engine: data.engine || stateSnapshot.engine,
          revision: nextRev,
          lastEventAt: data.connectedAt || new Date().toISOString(),
        });
        if (prevRev > 0 && nextRev > prevRev) {
          for (const scope of ['attendance', 'payroll', 'finance', 'database'] as RealtimeScope[]) {
            dispatchScopeEvent({
              scope,
              action: 'reconnect_catchup',
              revision: nextRev,
              engine: stateSnapshot.engine,
              updatedAt: new Date().toISOString(),
              source: 'reconnect',
            });
          }
        }
      } catch {
        updateStateSnapshot({ status: 'connected' });
      }
    });

    es.addEventListener('db_change', (rawEvt) => {
      try {
        const data = JSON.parse((rawEvt as MessageEvent).data || '{}') as {
          scope?: RealtimeScope;
          action?: string;
          revision?: number;
          engine?: string;
          updatedAt?: string;
        };
        const scope = data.scope;
        if (!scope) return;
        const updatedAt = data.updatedAt || new Date().toISOString();
        updateStateSnapshot({
          status: 'connected',
          engine: data.engine || stateSnapshot.engine,
          revision: Number(data.revision || stateSnapshot.revision + 1),
          lastEventAt: updatedAt,
        });
        dispatchScopeEvent({
          scope,
          action: data.action || 'write',
          revision: Number(data.revision || 0),
          engine: data.engine || stateSnapshot.engine,
          updatedAt,
          source: 'sse',
        });
      } catch {
        // ignore malformed event
      }
    });

    es.onopen = () => {
      reconnectAttempt = 0;
      clearReconnectTimer();
      updateStateSnapshot({ status: 'connected' });
    };

    es.onerror = () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      if (eventSource === es) {
        eventSource = null;
      }
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  }
}

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = (msgEvt) => {
        const data = msgEvt.data as {
          senderId?: string;
          scope?: RealtimeScope;
          action?: string;
          updatedAt?: string;
        };
        if (!data || data.senderId === TAB_INSTANCE_ID || !data.scope) return;
        const updatedAt = data.updatedAt || new Date().toISOString();
        updateStateSnapshot({ lastEventAt: updatedAt });
        dispatchScopeEvent({
          scope: data.scope,
          action: data.action || 'broadcast',
          revision: stateSnapshot.revision,
          engine: stateSnapshot.engine,
          updatedAt,
          source: 'broadcast',
        });
      };
    } catch {
      broadcastChannel = null;
    }
  }

  window.addEventListener('online', () => {
    reconnectAttempt = 0;
    connectEventSource();
    for (const scope of ['attendance', 'payroll', 'finance', 'database'] as RealtimeScope[]) {
      dispatchScopeEvent({
        scope,
        action: 'network_online',
        revision: stateSnapshot.revision,
        engine: stateSnapshot.engine,
        updatedAt: new Date().toISOString(),
        source: 'reconnect',
      });
    }
  });

  window.addEventListener('offline', () => {
    clearReconnectTimer();
    updateStateSnapshot({ status: 'offline' });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
        connectEventSource();
      }
      for (const scope of ['attendance', 'payroll', 'finance'] as RealtimeScope[]) {
        dispatchScopeEvent({
          scope,
          action: 'tab_focus',
          revision: stateSnapshot.revision,
          engine: stateSnapshot.engine,
          updatedAt: new Date().toISOString(),
          source: 'reconnect',
        });
      }
    }
  });

  connectEventSource();
}

export function notifyLocalScopeMutation(scope: RealtimeScope, action = 'local_write'): void {
  ensureStarted();
  localMutationTimestamps.set(scope, Date.now());
  const nowIso = new Date().toISOString();
  updateStateSnapshot({ lastEventAt: nowIso });
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        senderId: TAB_INSTANCE_ID,
        scope,
        action,
        updatedAt: nowIso,
      });
    } catch {
      // ignore
    }
  }
}

export function notifyScopeRefresh(scope: RealtimeScope, source: RealtimeChangeEvent['source'] = 'firestore'): void {
  ensureStarted();
  const nowIso = new Date().toISOString();
  updateStateSnapshot({ lastEventAt: nowIso });
  dispatchScopeEvent({
    scope,
    action: 'remote_sync',
    revision: stateSnapshot.revision,
    engine: stateSnapshot.engine,
    updatedAt: nowIso,
    source,
  });
}

export function wasRecentLocalMutation(scope: RealtimeScope, windowMs = 900): boolean {
  const ts = localMutationTimestamps.get(scope);
  return Boolean(ts && Date.now() - ts < windowMs);
}

export function subscribeRealtimeScopes(
  scopes: RealtimeScope[],
  callback: ScopeListener,
  options?: { debounceMs?: number; ignoreImmediateLocalEcho?: boolean }
): () => void {
  ensureStarted();
  const debounceMs = options?.debounceMs ?? 120;
  const ignoreSelf = options?.ignoreImmediateLocalEcho ?? false;
  let timer: number | null = null;
  let pendingEvt: RealtimeChangeEvent | null = null;

  const wrapped: ScopeListener = (evt) => {
    if (ignoreSelf && evt.source === 'sse' && wasRecentLocalMutation(evt.scope, 650)) {
      return;
    }
    pendingEvt = evt;
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    if (typeof window !== 'undefined') {
      timer = window.setTimeout(() => {
        timer = null;
        if (pendingEvt) {
          const toDeliver = pendingEvt;
          pendingEvt = null;
          callback(toDeliver);
        }
      }, debounceMs);
    } else {
      callback(evt);
    }
  };

  for (const s of scopes) {
    let set = scopeListeners.get(s);
    if (!set) {
      set = new Set<ScopeListener>();
      scopeListeners.set(s, set);
    }
    set.add(wrapped);
  }

  return () => {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
    for (const s of scopes) {
      scopeListeners.get(s)?.delete(wrapped);
    }
  };
}

export function subscribeRealtimeStatus(listener: StatusListener): () => void {
  ensureStarted();
  statusListeners.add(listener);
  listener({ ...stateSnapshot });
  return () => {
    statusListeners.delete(listener);
  };
}

export function getRealtimeStateSnapshot(): RealtimeStateSnapshot {
  return { ...stateSnapshot };
}

export function isFirestoreEngineActive(): boolean {
  return stateSnapshot.engine === 'firestore';
}
