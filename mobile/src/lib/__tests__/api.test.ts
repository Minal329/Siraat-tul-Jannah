import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { api, ApiError, friendlyMessage, tokenStore } from "../api.ts";

// Pretend secure storage (the real one needs a phone).
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, accessTokenExpiresIn: 900 });
const authOf = (init: RequestInit | undefined) => (init?.headers as Record<string, string>).Authorization;

let fetchMock: jest.Mock<(url: string, init?: RequestInit) => Promise<Response>>;
beforeEach(async () => {
  await tokenStore.clear();
  mockStore.clear();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("api()", () => {
  it("returns the response's data and sends the login token", async () => {
    await tokenStore.save(tokens(1));
    fetchMock.mockResolvedValue(json(200, { data: { hello: "world" } }));

    await expect(api("/auth/me")).resolves.toEqual({ hello: "world" });
    expect(authOf(fetchMock.mock.calls[0][1])).toBe("Bearer access-1");
  });

  it("keeps the refresh token in secure storage", async () => {
    await tokenStore.save(tokens(1));
    expect(mockStore.get("stj.refreshToken")).toBe("refresh-1");
    await tokenStore.clear();
    expect(mockStore.has("stj.refreshToken")).toBe(false);
  });

  it("turns API errors into ApiError with the server's message", async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: "ENROLLMENT_EXISTS", message: "Already enrolled." } }));

    const err = await api("/enrollments", { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "ENROLLMENT_EXISTS", message: "Already enrolled." });
  });

  it("renews an expired login once and retries the request", async () => {
    await tokenStore.save(tokens(1));
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } }))
      .mockResolvedValueOnce(json(200, { data: { tokens: tokens(2) } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }));

    await expect(api("/enrollments/mine")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
    expect(authOf(fetchMock.mock.calls[2][1])).toBe("Bearer access-2");
    expect(await tokenStore.getRefreshToken()).toBe("refresh-2");
  });

  it("after the app restarts, renews the login before the first request", async () => {
    mockStore.set("stj.refreshToken", "refresh-1"); // saved last time; no access token in memory
    fetchMock.mockResolvedValueOnce(json(200, { data: { tokens: tokens(2) } })).mockResolvedValueOnce(json(200, { data: { ok: true } }));

    await expect(api("/enrollments/mine")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/refresh");
    expect(authOf(fetchMock.mock.calls[1][1])).toBe("Bearer access-2");
  });

  it("sends only one renewal when several requests expire together", async () => {
    await tokenStore.save(tokens(1));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) return json(200, { data: { tokens: tokens(2) } });
      return authOf(init) === "Bearer access-2" ? json(200, { data: "ok" }) : json(401, { error: { code: "TOKEN_EXPIRED", message: "" } });
    });

    await Promise.all([api("/a"), api("/b"), api("/c")]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("logs out cleanly when the renewal is refused", async () => {
    await tokenStore.save(tokens(1));
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "INVALID_REFRESH_TOKEN", message: "Your session has expired." } }));

    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(await tokenStore.getRefreshToken()).toBeNull();
  });

  it("explains network failures in plain words", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(api("/courses")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});

describe("friendlyMessage()", () => {
  it("shows the first field problem for validation errors", () => {
    const err = new ApiError(400, "VALIDATION_ERROR", "Some fields are missing or invalid.", [
      { field: "password", message: "Password must be at least 8 characters." },
    ]);
    expect(friendlyMessage(err)).toBe("Password must be at least 8 characters.");
  });

  it("otherwise shows the error's own message", () => {
    expect(friendlyMessage(new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists."))).toBe(
      "An account with this email already exists.",
    );
  });
});
