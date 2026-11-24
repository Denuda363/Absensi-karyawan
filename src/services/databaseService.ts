import {
  DatabaseAutoInitResult,
  DatabaseConnectionConfig,
  DatabaseConnectionTestResult,
  DatabaseSchemaStatusResponse,
  SupabaseSyncResult,
  SupabaseTestResult,
} from '../types';
import { executeApiWithFallback, HttpApiError } from './apiClient';
import { emitAppNotification } from './notificationCenterService';
import { notifyLocalScopeMutation } from './realtimeService';
import {
  clientAutoCreateMissingTables,
  clientChangeDatabasePin,
  clientFetchDatabaseSchemaStatus,
  clientLockDatabaseSession,
  clientSaveDatabaseConfig,
  clientSyncSupabaseDatabase,
  clientTestDatabaseConnection,
  clientTestSupabaseConnection,
  clientUnlockDatabaseWithPin,
} from './clientFallbackStore';

export class DatabaseUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnauthorizedError';
  }
}

async function runDatabaseApi<T>(
  requestFn: () => Promise<Response>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await executeApiWithFallback(requestFn, fallbackFn);
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 401) {
      throw new DatabaseUnauthorizedError(err.message);
    }
    throw err;
  }
}

export async function unlockDatabaseWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  return runDatabaseApi(
    () =>
      fetch('/api/database/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    () => clientUnlockDatabaseWithPin(pin)
  );
}

export async function lockDatabaseSession(token: string): Promise<void> {
  if (!token) return;
  try {
    await executeApiWithFallback<{ ok: boolean }>(
      () =>
        fetch('/api/database/lock', {
          method: 'POST',
          headers: { 'X-Database-Token': token },
        }),
      async () => {
        await clientLockDatabaseSession(token);
        return { ok: true };
      }
    );
  } catch {
    await clientLockDatabaseSession(token);
  }
}

export async function changeDatabasePin(
  token: string,
  payload: { currentPin: string; newPin: string }
): Promise<void> {
  await runDatabaseApi<{ ok: boolean }>(
    () =>
      fetch('/api/database/pin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Database-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    async () => {
      await clientChangeDatabasePin(token, payload);
      return { ok: true };
    }
  );
  notifyLocalScopeMutation('security', 'change_database_pin');
  emitAppNotification({
    title: 'PIN Database Diperbarui',
    message: 'PIN otorisasi konfigurasi database telah diubah.',
    module: 'sistem',
    severity: 'warning',
    actionType: 'change_database_pin',
    targetNav: 'pengaturan',
  });
}

export async function fetchDatabaseSchemaStatus(
  token: string
): Promise<DatabaseSchemaStatusResponse> {
  return runDatabaseApi(
    () =>
      fetch('/api/database/status', {
        headers: { 'X-Database-Token': token },
      }),
    () => clientFetchDatabaseSchemaStatus(token)
  );
}

export async function autoCreateMissingTables(
  token: string
): Promise<DatabaseAutoInitResult> {
  const res = await runDatabaseApi(
    () =>
      fetch('/api/database/auto-init', {
        method: 'POST',
        headers: { 'X-Database-Token': token },
      }),
    () => clientAutoCreateMissingTables(token)
  );
  notifyLocalScopeMutation('database', 'auto_create_tables');
  emitAppNotification({
    title: 'Inisialisasi Tabel Database',
    message: res.message,
    module: 'sistem',
    severity: res.requiresManualSql ? 'warning' : 'success',
    actionType: 'auto_create_tables',
    targetNav: 'pengaturan',
  });
  return res;
}

export interface SaveDatabaseConfigPayload
  extends Partial<
    Pick<
      DatabaseConnectionConfig,
      | 'engine'
      | 'host'
      | 'port'
      | 'databaseName'
      | 'schemaName'
      | 'tablePrefix'
      | 'username'
      | 'sslMode'
      | 'sqliteFilePath'
      | 'autoCreateMissingTables'
      | 'firestoreProjectId'
      | 'firestoreDatabaseId'
      | 'firestoreApiKey'
      | 'firestoreAuthDomain'
      | 'firestoreAppId'
      | 'firestoreStorageBucket'
      | 'firestoreMessagingSenderId'
      | 'supabaseProjectName'
      | 'supabaseProjectId'
      | 'supabaseUrl'
      | 'supabasePublishableKey'
    >
  > {
  databasePassword?: string;
  connectionUri?: string;
  clearDatabaseSecrets?: boolean;
  resetFirestoreToDefault?: boolean;
  supabaseSecretKey?: string;
  supabaseDbUrl?: string;
  clearSupabaseSecrets?: boolean;
}

export type TestDatabaseConnectionPayload = SaveDatabaseConfigPayload;

export async function testDatabaseConnection(
  token: string,
  payload: TestDatabaseConnectionPayload = {}
): Promise<DatabaseConnectionTestResult> {
  const res = await runDatabaseApi(
    () =>
      fetch('/api/database/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Database-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientTestDatabaseConnection(token, payload as Record<string, unknown>)
  );
  emitAppNotification({
    title: `Uji Koneksi ${res.engine.toUpperCase()}`,
    message: res.message,
    module: 'sistem',
    severity: res.ok ? 'success' : 'warning',
    actionType: 'test_database_connection',
    targetNav: 'pengaturan',
  });
  return res;
}

export async function saveDatabaseConfig(
  token: string,
  payload: SaveDatabaseConfigPayload
): Promise<DatabaseConnectionConfig> {
  const cfg = await runDatabaseApi(
    () =>
      fetch('/api/database/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Database-Token': token,
        },
        body: JSON.stringify(payload),
      }),
    () => clientSaveDatabaseConfig(token, payload as Record<string, unknown>)
  );
  notifyLocalScopeMutation('database', 'save_database_config');
  emitAppNotification({
    title: 'Konfigurasi Database Disimpan',
    message: `Engine aktif: ${cfg.engine.toUpperCase()} (${cfg.databaseName || cfg.firestoreProjectId || 'lokal'})`,
    module: 'sistem',
    severity: 'info',
    actionType: 'save_database_config',
    targetNav: 'pengaturan',
  });
  return cfg;
}

export async function testSupabaseConnection(
  token: string
): Promise<SupabaseTestResult> {
  return runDatabaseApi(
    () =>
      fetch('/api/database/supabase/test', {
        method: 'POST',
        headers: { 'X-Database-Token': token },
      }),
    () => clientTestSupabaseConnection(token)
  );
}

export async function syncSupabaseDatabase(
  token: string,
  direction: 'push' | 'pull'
): Promise<SupabaseSyncResult> {
  const res = await runDatabaseApi(
    () =>
      fetch('/api/database/supabase/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Database-Token': token,
        },
        body: JSON.stringify({ direction }),
      }),
    () => clientSyncSupabaseDatabase(token, direction)
  );
  if (res.ok && direction === 'pull') {
    notifyLocalScopeMutation('attendance', 'supabase_pull');
    notifyLocalScopeMutation('payroll', 'supabase_pull');
    notifyLocalScopeMutation('finance', 'supabase_pull');
  }
  notifyLocalScopeMutation('database', `supabase_sync_${direction}`);
  emitAppNotification({
    title: `Sinkronisasi Supabase (${direction === 'push' ? 'Push' : 'Pull'})`,
    message: res.message,
    module: 'sistem',
    severity: res.ok ? 'success' : 'warning',
    actionType: `supabase_sync_${direction}`,
    targetNav: 'pengaturan',
  });
  return res;
}
