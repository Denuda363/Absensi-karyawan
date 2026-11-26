export class BackendUnavailableError extends Error {
  constructor(message = 'Server backend API tidak tersedia.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

export class HttpApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpApiError';
    this.status = status;
  }
}

let clientDirectModeActive = false;

let activeAttendanceAdminToken: string | null = null;
let activeFinanceAdminToken: string | null = null;

export function setAttendanceAdminToken(token: string | null): void {
  activeAttendanceAdminToken = token && token.trim() ? token.trim() : null;
}

export function getAttendanceAdminToken(): string | null {
  return activeAttendanceAdminToken;
}

export function setFinanceAdminToken(token: string | null): void {
  activeFinanceAdminToken = token && token.trim() ? token.trim() : null;
}

export function getFinanceAdminToken(): string | null {
  return activeFinanceAdminToken;
}

export function clearAllAdminTokens(): void {
  activeAttendanceAdminToken = null;
  activeFinanceAdminToken = null;
}

export function isClientDirectModeActive(): boolean {
  return clientDirectModeActive;
}

export function enableClientDirectMode(): void {
  clientDirectModeActive = true;
}

export function resetClientDirectMode(): void {
  clientDirectModeActive = false;
}

function looksLikeHtmlOrNonJson(text: string, contentType: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<')
  ) {
    return true;
  }
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return true;
  }
  return false;
}

export async function parseApiJsonResponse<T>(res: Response): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();

  if (looksLikeHtmlOrNonJson(rawText, contentType)) {
    throw new BackendUnavailableError(
      'Endpoint API mengembalikan halaman HTML alih-alih JSON.'
    );
  }

  if (!rawText.trim()) {
    if (res.ok) {
      throw new BackendUnavailableError('Respons API kosong tanpa payload JSON.');
    }
    if (res.status === 404 || res.status === 405 || res.status >= 502) {
      throw new BackendUnavailableError(`HTTP ${res.status}`);
    }
    throw new HttpApiError(res.status, `HTTP ${res.status}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    if (res.ok || res.status === 404 || res.status === 405 || res.status >= 502) {
      throw new BackendUnavailableError('Respons API bukan JSON yang valid.');
    }
    throw new HttpApiError(res.status, `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const errObj =
      parsed && typeof parsed === 'object' ? (parsed as { error?: unknown }) : {};
    const errMsg =
      typeof errObj.error === 'string' && errObj.error.trim()
        ? errObj.error
        : `HTTP ${res.status}`;
    throw new HttpApiError(res.status, errMsg);
  }

  return parsed as T;
}

export async function executeApiWithFallback<T>(
  requestFn: () => Promise<Response>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  if (clientDirectModeActive) {
    return fallbackFn();
  }

  try {
    const res = await requestFn();
    return await parseApiJsonResponse<T>(res);
  } catch (err) {
    if (err instanceof BackendUnavailableError || err instanceof TypeError) {
      clientDirectModeActive = true;
      return fallbackFn();
    }
    throw err;
  }
}
