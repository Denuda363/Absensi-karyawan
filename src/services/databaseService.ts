import {
  DatabaseAutoInitResult,
  DatabaseConnectionConfig,
  DatabaseSchemaStatusResponse,
  SupabaseSyncResult,
  SupabaseTestResult,
} from '../types';
import { executeApiWithFallback, HttpApiError } from './apiClient';
import {
  clientAutoCreateMissingTables,
  clientChangeDatabasePin,
  clientFetchDatabaseSchemaStatus,
  clientLockDatabaseSession,
  clientSaveDatabaseConfig,
  clientSyncSupabaseDatabase,
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
  return runDatabaseApi(
    () =>
      fetch('/api/database/auto-init', {
        method: 'POST',
        headers: { 'X-Database-Token': token },
      }),
    () => clientAutoCreateMissingTables(token)
  );
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
      | 'autoCreateMissingTables'
      | 'supabaseProjectName'
      | 'supabaseProjectId'
      | 'supabaseUrl'
      | 'supabasePublishableKey'
    >
  > {
  supabaseSecretKey?: string;
  supabaseDbUrl?: string;
  clearSupabaseSecrets?: boolean;
}

export async function saveDatabaseConfig(
  token: string,
  payload: SaveDatabaseConfigPayload
): Promise<DatabaseConnectionConfig> {
  return runDatabaseApi(
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
  return runDatabaseApi(
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
}
