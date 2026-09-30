import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, tokenStore } from "./api.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, accessTokenExpiresIn: 900 });

beforeEach(() => {
  tokenStore.clear();
  vi.restoreAllMocks();
});

describe("api()", () => {
  it("returns the response's data and sends the login token", async () => {
    tokenStore.save(tokens(1));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { data: { hello: "world" } }));

    await expect(api("/auth/me")).resolves.toEqual({ hello: "world" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });

  it("turns API errors into ApiError with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(409, { error: { code: "ENROLLMENT_EXISTS", message: "Already enrolled." } }));

    const err = await api("/enrollments", { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "ENROLLMENT_EXISTS", message: "Already enrolled." });
  });

  it("renews an expired login once and retries the request", async () => {
    tokenStore.save(tokens(1));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } }))
      .mockResolvedValueOnce(json(200, { data: { tokens: tokens(2) } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }));

    await expect(api("/enrollments/mine")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
    expect((fetchMock.mock.calls[2][1]!.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
    expect(tokenStore.refreshToken).toBe("refresh-2");
  });

  it("after a page reload, renews the login before the first request instead of after a refusal", async () => {
    localStorage.setItem("stj.refreshToken", "refresh-1"); // saved from last visit; no access token in memory
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { data: { tokens: tokens(2) } }))
      .mockResolvedValueOnce(json(200, { data: { ok: true } }));

    await expect(api("/enrollments/mine")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/refresh");
    expect((fetchMock.mock.calls[1][1]!.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
  });

  it("sends only one renewal when several requests expire together", async () => {
    tokenStore.save(tokens(1));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) return json(200, { data: { tokens: tokens(2) } });
      const auth = (init!.headers as Record<string, string>).Authorization;
      return auth === "Bearer access-2" ? json(200, { data: "ok" }) : json(401, { error: { code: "TOKEN_EXPIRED", message: "" } });
    });

    await Promise.all([api("/a"), api("/b"), api("/c")]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("logs out cleanly when the renewal is refused", async () => {
    tokenStore.save(tokens(1));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_EXPIRED", message: "" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "INVALID_REFRESH_TOKEN", message: "Your session has expired." } }));

    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.refreshToken).toBeNull();
  });

  it("explains network failures in plain words", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api("/courses")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
