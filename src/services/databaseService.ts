import {
  DatabaseAutoInitResult,
  DatabaseConnectionConfig,
  DatabaseSchemaStatusResponse,
  SupabaseSyncResult,
  SupabaseTestResult,
} from '../types';

export class DatabaseUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnauthorizedError';
  }
}

async function handleDatabaseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // ignore json parse failure
    }
    if (res.status === 401) {
      throw new DatabaseUnauthorizedError(errMsg);
    }
    throw new Error(errMsg);
  }
  return (await res.json()) as T;
}

export async function unlockDatabaseWithPin(
  pin: string
): Promise<{ token: string; expiresAt: number }> {
  const res = await fetch('/api/database/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return handleDatabaseResponse<{ token: string; expiresAt: number }>(res);
}

export async function lockDatabaseSession(token: string): Promise<void> {
  if (!token) return;
  try {
    await fetch('/api/database/lock', {
      method: 'POST',
      headers: { 'X-Database-Token': token },
    });
  } catch {
    // ignore lock cleanup errors
  }
}

export async function changeDatabasePin(
  token: string,
  payload: { currentPin: string; newPin: string }
): Promise<void> {
  const res = await fetch('/api/database/pin', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Database-Token': token,
    },
    body: JSON.stringify(payload),
  });
  await handleDatabaseResponse<{ ok: boolean }>(res);
}

export async function fetchDatabaseSchemaStatus(
  token: string
): Promise<DatabaseSchemaStatusResponse> {
  const res = await fetch('/api/database/status', {
    headers: { 'X-Database-Token': token },
  });
  return handleDatabaseResponse<DatabaseSchemaStatusResponse>(res);
}

export async function autoCreateMissingTables(
  token: string
): Promise<DatabaseAutoInitResult> {
  const res = await fetch('/api/database/auto-init', {
    method: 'POST',
    headers: { 'X-Database-Token': token },
  });
  return handleDatabaseResponse<DatabaseAutoInitResult>(res);
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
  const res = await fetch('/api/database/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Database-Token': token,
    },
    body: JSON.stringify(payload),
  });
  return handleDatabaseResponse<DatabaseConnectionConfig>(res);
}

export async function testSupabaseConnection(
  token: string
): Promise<SupabaseTestResult> {
  const res = await fetch('/api/database/supabase/test', {
    method: 'POST',
    headers: { 'X-Database-Token': token },
  });
  return handleDatabaseResponse<SupabaseTestResult>(res);
}

export async function syncSupabaseDatabase(
  token: string,
  direction: 'push' | 'pull'
): Promise<SupabaseSyncResult> {
  const res = await fetch('/api/database/supabase/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Database-Token': token,
    },
    body: JSON.stringify({ direction }),
  });
  return handleDatabaseResponse<SupabaseSyncResult>(res);
}
