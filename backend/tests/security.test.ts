import { execFile } from "node:child_process";
import { promisify } from "node:util";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { env } from "../src/config/env.ts";
import { prisma } from "../src/lib/prisma.ts";
import { bearer } from "./helpers/auth.ts";
import { createCourse, createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const COOKIE_MODE = { "X-Auth-Transport": "cookie" };
const refreshCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("stj_refresh="));
const cookieValue = (setCookie: string) => setCookie.split(";")[0]; // "stj_refresh=…"

describe("website login: refresh token in an httpOnly cookie", () => {
  it("puts the refresh token in a locked-down cookie instead of the response", async () => {
    const user = await createUser({});
    const res = await request(app).post("/api/v1/auth/login").set(COOKIE_MODE).send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.data.tokens).not.toHaveProperty("refreshToken");
    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/Max-Age=2592000/); // 30 days
  });

  it("renews with the cookie, rotating it", async () => {
    const user = await createUser({});
    const login = await request(app).post("/api/v1/auth/login").set(COOKIE_MODE).send({ email: user.email, password: user.password });

    const renewed = await request(app).post("/api/v1/auth/refresh").set(COOKIE_MODE).set("Cookie", cookieValue(refreshCookie(login)!));

    expect(renewed.status).toBe(200);
    expect(renewed.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(renewed.body.data.tokens).not.toHaveProperty("refreshToken");
    expect(cookieValue(refreshCookie(renewed)!)).not.toBe(cookieValue(refreshCookie(login)!));
  });

  it("ignores the cookie unless the request carries the custom header (other websites can't add it)", async () => {
    const user = await createUser({});
    const login = await request(app).post("/api/v1/auth/login").set(COOKIE_MODE).send({ email: user.email, password: user.password });

    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookieValue(refreshCookie(login)!));

    expect(res.status).toBe(401);
  });

  it("logout revokes the token and clears the cookie", async () => {
    const user = await createUser({});
    const login = await request(app).post("/api/v1/auth/login").set(COOKIE_MODE).send({ email: user.email, password: user.password });
    const cookie = cookieValue(refreshCookie(login)!);

    const logout = await request(app).post("/api/v1/auth/logout").set(COOKIE_MODE).set("Cookie", cookie);
    const reuse = await request(app).post("/api/v1/auth/refresh").set(COOKIE_MODE).set("Cookie", cookie);

    expect(logout.status).toBe(204);
    expect(refreshCookie(logout)).toMatch(/stj_refresh=;/);
    expect(reuse.status).toBe(401);
    expect(refreshCookie(reuse)).toMatch(/stj_refresh=;/); // a refused renewal also clears it
  });

  it("the mobile app's way is unchanged: token in the body, no cookie", async () => {
    const user = await createUser({});
    const res = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });

    expect(res.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toBeUndefined();
  });
});

describe("admin: resetting a forgotten password", () => {
  it("gives a temporary password once, replaces the old one and logs the user out everywhere", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const student = await createUser({ role: "STUDENT", email: "ayesha@test.pk" });
    const phone = await request(app).post("/api/v1/auth/login").send({ email: student.email, password: student.password });

    const res = await request(app).post(`/api/v1/admin/users/${student.id}/reset-password`).set("Authorization", await bearer(app, admin));

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data).toEqual({ email: "ayesha@test.pk", temporaryPassword: expect.stringMatching(/^[\w-]{16}$/) });

    const oldPassword = await request(app).post("/api/v1/auth/login").send({ email: student.email, password: student.password });
    const newPassword = await request(app).post("/api/v1/auth/login").send({ email: student.email, password: res.body.data.temporaryPassword });
    const oldPhone = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: phone.body.data.tokens.refreshToken });
    expect([oldPassword.status, newPassword.status, oldPhone.status]).toEqual([401, 200, 401]);
  });

  it("works for teachers but not for admins or yourself, and only admins may do it", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const otherAdmin = await createUser({ role: "ADMIN" });
    const teacher = await createUser({ role: "TEACHER" });
    const auth = await bearer(app, admin);

    const forTeacher = await request(app).post(`/api/v1/admin/users/${teacher.id}/reset-password`).set("Authorization", auth);
    const forAdmin = await request(app).post(`/api/v1/admin/users/${otherAdmin.id}/reset-password`).set("Authorization", auth);
    const forSelf = await request(app).post(`/api/v1/admin/users/${admin.id}/reset-password`).set("Authorization", auth);
    const byTeacher = await request(app)
      .post(`/api/v1/admin/users/${admin.id}/reset-password`)
      .set("Authorization", await bearer(app, { email: teacher.email, password: forTeacher.body.data.temporaryPassword }));

    expect(forTeacher.status).toBe(200);
    expect([forAdmin.status, forAdmin.body.error.code]).toEqual([403, "CANNOT_RESET_ADMIN"]);
    expect([forSelf.status, forSelf.body.error.code]).toEqual([409, "USE_CHANGE_PASSWORD"]);
    expect(byTeacher.status).toBe(403);
  });

  it("the admin enrollment list includes the student's login id (for the reset button)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const student = await createUser({ role: "STUDENT" });
    const course = await createCourse({ title: "Qaida" });
    const profile = await prisma.student.findUniqueOrThrow({ where: { userId: student.id } });
    await prisma.enrollment.create({ data: { studentId: profile.id, courseId: course.id } });

    const res = await request(app).get("/api/v1/admin/enrollments").set("Authorization", await bearer(app, admin));

    expect(res.body.data.enrollments[0].student.userId).toBe(student.id);
  });
});

describe("running behind a proxy (TRUST_PROXY)", () => {
  afterEach(() => {
    env.TRUST_PROXY = 0;
  });

  it("rate-limits each visitor by their real address, not the proxy's", async () => {
    env.TRUST_PROXY = 1;
    app = createApp();
    const user = await createUser({});
    const attempt = (ip: string) =>
      request(app).post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email: user.email, password: "wrong-password" });

    for (let i = 0; i < 10; i++) await attempt("203.0.113.7");
    const sameVisitor = await attempt("203.0.113.7");
    const otherVisitor = await attempt("198.51.100.20");

    expect(sameVisitor.status).toBe(429);
    expect(otherVisitor.status).toBe(401);
  });
});

describe("security headers", () => {
  it("sends helmet's headers and hides the framework", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("production settings", () => {
  const run = promisify(execFile);
  const startWith = (overrides: Record<string, string>) =>
    run(process.execPath, ["--import", "tsx", "-e", 'await import("./src/config/env.ts"); console.log("ok")'], {
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: "postgresql://x@localhost/x",
        JWT_SECRET: "a-production-secret-that-is-at-least-32-chars",
        NODE_ENV: "production",
        ...overrides,
      },
    }).then(
      () => ({ ok: true, output: "" }),
      (err: { stderr: string }) => ({ ok: false, output: err.stderr }),
    );

  it("refuses to start with local (http) addresses in production", async () => {
    const result = await startWith({ PUBLIC_WEB_URL: "http://localhost:5173", CORS_ORIGINS: "http://localhost:5173" });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("PUBLIC_WEB_URL");
    expect(result.output).toContain("CORS_ORIGINS");
  }, 20_000);

  it("starts with https addresses", async () => {
    const result = await startWith({ PUBLIC_WEB_URL: "https://siraattuljannah.com", CORS_ORIGINS: "https://siraattuljannah.com" });
    expect(result).toEqual({ ok: true, output: "" });
  }, 20_000);
});
