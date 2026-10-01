// Talks to the backend API:
// adds the login token, renews an expired login once and retries, and turns
// { error: { code, message } } into an ApiError you can show.
//
// The refresh token is kept in the phone's secure storage (iOS Keychain /
// Android Keystore via expo-secure-store), which other apps can't read.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// On an Android emulator use http://10.0.2.2:4000/api/v1; on a real phone, your computer's
// local network address. Set EXPO_PUBLIC_API_URL in mobile/.env.local.
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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

// The message to show a person. For "some fields are invalid" the API lists each
// problem (e.g. "Password must be at least 8 characters.") — show the first one.
export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) {
    const first = err.details.find((d): d is { message: string } => typeof d?.message === "string");
    if (first) return first.message;
  }
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export type Tokens = { accessToken: string; refreshToken: string; accessTokenExpiresIn: number };

const REFRESH_KEY = "stj.refreshToken";
let accessToken: string | null = null;

// expo-secure-store has no web version; the web preview falls back to localStorage.
const storage = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(REFRESH_KEY) ?? null;
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async set(value: string) {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(REFRESH_KEY, value);
    else await SecureStore.setItemAsync(REFRESH_KEY, value);
  },
  async remove() {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(REFRESH_KEY);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export const tokenStore = {
  getRefreshToken: () => storage.get(),
  async save(tokens: Tokens) {
    accessToken = tokens.accessToken;
    await storage.set(tokens.refreshToken);
  },
  async clear() {
    accessToken = null;
    await storage.remove();
  },
};

// If several requests find the login expired at once, only one renewal is sent.
let renewing: Promise<boolean> | null = null;
function renewLogin(): Promise<boolean> {
  renewing ??= (async () => {
    const refreshToken = await storage.get();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await tokenStore.clear();
        return false;
      }
      await tokenStore.save((await res.json()).data.tokens);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

// Endpoints that never need the login token.
const PUBLIC_AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH"; body?: unknown; form?: FormData };

function toUrl(path: string) {
  return path.startsWith("/api/v1/") ? `${API_URL}${path.slice("/api/v1".length)}` : `${API_URL}${path}`;
}

// Headers for loading a private file directly (e.g. the audio player streaming a voice note).
export async function authHeaders(): Promise<Record<string, string>> {
  if (!accessToken && (await storage.get())) await renewLogin();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function fileUrl(path: string) {
  return toUrl(path);
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  // After the app restarts the access token (memory only) is gone: renew first
  // rather than sending a request we know will be refused.
  if (!accessToken && !PUBLIC_AUTH_PATHS.includes(path) && (await storage.get())) await renewLogin();

  const doFetch = () =>
    fetch(toUrl(path), {
      method: options.method ?? (options.body !== undefined || options.form ? "POST" : "GET"),
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });

  let res = await doFetch().catch(() => {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your internet connection.");
  });
  if (res.status === 401 && (await storage.get()) && (await renewLogin())) res = await doFetch();

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? `HTTP_${res.status}`,
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()).data as T;
}
