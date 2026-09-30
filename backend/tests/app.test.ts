import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Swap the real database client for a fake one, so these tests run without
// Postgres and we can simulate the database being up or down.
const queryRaw = vi.fn();
vi.mock("../src/lib/prisma.ts", () => ({ prisma: { $queryRaw: queryRaw } }));

const { createApp } = await import("../src/app.ts");
const app = createApp();

beforeEach(() => {
  queryRaw.mockReset();
});

describe("GET /api/v1/health", () => {
  it("returns 200 when the database is reachable", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "ok", database: "up" });
  });

  it("returns 503 when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: "degraded", database: "down" });
  });
});

describe("error handling", () => {
  it("returns a 404 in the standard error shape for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route GET /api/v1/does-not-exist not found" },
    });
  });

  it("returns 400 INVALID_JSON for a malformed request body", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("security", () => {
  it("sets protective headers and hides the Express fingerprint", async () => {
    queryRaw.mockResolvedValue([]);

    const res = await request(app).get("/api/v1/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows the configured web app origin and ignores others", async () => {
    queryRaw.mockResolvedValue([]);

    const allowed = await request(app).get("/api/v1/health").set("Origin", "http://localhost:5173");
    const other = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
