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

describe("logins: refresh token in the response body", () => {
  it("returns the token in the body and never sets a cookie", async () => {
    const user = await createUser({});
    const res = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });

    expect(res.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect(res.headers["set-cookie"]).toBeUndefined();
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

  it("refuses to start with an http:// browser origin or weak password hashing in production", async () => {
    const result = await startWith({ CORS_ORIGINS: "http://localhost:8081", BCRYPT_ROUNDS: "4" });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("CORS_ORIGINS");
    expect(result.output).toContain("BCRYPT_ROUNDS");
  }, 20_000);

  it("starts with no browser origins (the phone app doesn't need any)", async () => {
    const result = await startWith({ CORS_ORIGINS: "" });
    expect(result).toEqual({ ok: true, output: "" });
  }, 20_000);
});
