/**
 * API client.
 *
 * The dev server proxies /api to the backend, so cookies stay
 * first-party and no token is ever held in JavaScript.
 *
 * A 401 triggers one refresh attempt. Concurrent 401s share a single
 * in-flight refresh rather than each firing their own, which would
 * rotate the token several times over and trip the reuse detection.
 */

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: ApiErrorDetail[]
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-keyed messages, for rendering next to inputs. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details ?? []) {
      if (!out[d.field]) out[d.field] = d.message;
    }
    return out;
  }
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}

const BASE = "/api";

let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;
let onReauthRequired: (() => Promise<boolean>) | null = null;
let reauthing: Promise<boolean> | null = null;

/** Lets the auth provider react when the session cannot be recovered. */
export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

/**
 * Lets the re-authentication prompt take over when the API asks for a
 * fresh password before a sensitive action. The handler resolves true
 * once the user has confirmed, and the original request is retried.
 */
export function setReauthHandler(fn: (() => Promise<boolean>) | null): void {
  onReauthRequired = fn;
}

async function attemptReauth(): Promise<boolean> {
  if (!onReauthRequired) return false;
  // One prompt at a time, shared by every request that hit the gate.
  reauthing ??= onReauthRequired().finally(() => {
    setTimeout(() => {
      reauthing = null;
    }, 0);
  });
  return reauthing;
}

async function attemptRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so callers awaiting this promise all
      // observe the same result before a new attempt can begin.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    }
  })();
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  let code = "UNKNOWN";
  let message = res.statusText || "Request failed";
  let details: ApiErrorDetail[] | undefined;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON response; keep the status text */
  }
  return new ApiError(message, res.status, code, details);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Set for FormData uploads so the browser sets the boundary. */
  raw?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const { method = "GET", body, signal, raw } = opts;

  const init: RequestInit = { method, credentials: "include", signal };

  if (body !== undefined) {
    if (raw) {
      init.body = body as BodyInit;
    } else {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
  }

  const res = await fetch(`${BASE}${path}`, init);

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const recovered = await attemptRefresh();
    if (recovered) return request<T>(path, opts, false);
    onSessionLost?.();
    throw await toError(res);
  }

  if (res.status === 403 && retry) {
    const err = await toError(res);
    if (err.code === "REAUTH_REQUIRED" && (await attemptReauth())) {
      return request<T>(path, opts, false);
    }
    throw err;
  }

  if (!res.ok) throw await toError(res);

  if (res.status === 204) return undefined as T;

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return (await res.text()) as T;

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form, raw: true }),
};

/** Streams a file download through the session, then saves it. */
export async function download(path: string, filename: string, retry = true): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (res.status === 403 && retry) {
    const err = await toError(res);
    if (err.code === "REAUTH_REQUIRED" && (await attemptReauth())) return download(path, filename, false);
    throw err;
  }
  if (!res.ok) throw await toError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
