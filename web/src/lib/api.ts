// Talks to the backend API. Every request goes through `api()`, which:
// - adds the login token,
// - quietly renews an expired login once (using the refresh token) and retries,
// - turns the API's { error: { code, message } } into an ApiError you can show.
//
// Where tokens live: the short-lived access token stays in memory only; the
// refresh token is kept in localStorage so people stay logged in after closing
// the tab. (Trade-off noted in docs/decisions.md — revisit in the security step.)

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type Tokens = { accessToken: string; refreshToken: string; accessTokenExpiresIn: number };

const REFRESH_KEY = "stj.refreshToken";
let accessToken: string | null = null;

// localStorage can be unavailable (private mode, blocked storage) — never crash on it.
export const tokenStore = {
  get refreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  save(tokens: Tokens) {
    accessToken = tokens.accessToken;
    try {
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      /* stays logged in for this tab only */
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

// If several requests find the login expired at once, only one renewal is sent.
let refreshing: Promise<boolean> | null = null;
function renewLogin(): Promise<boolean> {
  const refreshToken = tokenStore.refreshToken;
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      tokenStore.save((await res.json()).data.tokens);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Endpoints that never need the login token (renewing before them would be pointless).
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown; // sent as JSON
  form?: FormData; // sent as a file upload
};

// Paths may be API-relative ("/courses") or as the API returns them ("/api/v1/payments/…/proof").
function toUrl(path: string) {
  return path.startsWith("/api/v1/") ? `${API_URL}${path.slice("/api/v1".length)}` : `${API_URL}${path}`;
}

async function send(path: string, options: Options): Promise<Response> {
  // After a page reload the access token (memory only) is gone. Renew it first
  // instead of sending a request we know will be refused — one round trip saved
  // on every page load, which matters on slow mobile connections.
  if (!accessToken && tokenStore.refreshToken && !PUBLIC_AUTH_PATHS.includes(path)) {
    await renewLogin();
  }

  const doFetch = () =>
    fetch(toUrl(path), {
      method: options.method ?? (options.body || options.form ? "POST" : "GET"),
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });

  let res = await doFetch().catch(() => {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your internet connection.");
  });
  if (res.status === 401 && tokenStore.refreshToken && (await renewLogin())) {
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? `HTTP_${res.status}`,
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.details,
    );
  }
  return res;
}

// JSON endpoints: returns the response's `data`.
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()).data as T;
}

// Private files (screenshots, voice notes, certificate PDFs) need the login token,
// so they're fetched here rather than linked directly.
export async function apiFile(path: string): Promise<Blob> {
  return (await send(path, {})).blob();
}
