import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { bearer } from "./helpers/auth.ts";
import { createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const login = (email: string, password: string) => request(app).post("/api/v1/auth/login").send({ email, password });

describe("admin: teachers", () => {
  it("creates a teacher and shows the temporary password once, which works for logging in", async () => {
    const auth = await bearer(app, await createUser({ role: "ADMIN" }));

    const res = await request(app)
      .post("/api/v1/admin/teachers")
      .set("Authorization", auth)
      .send({ email: "Maryam@Example.com", fullName: "Ustadha Maryam", whatsappNumber: "+923001112233" });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data.teacher).toMatchObject({ email: "maryam@example.com", fullName: "Ustadha Maryam", isActive: true });
    const { temporaryPassword } = res.body.data;
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect((await login("maryam@example.com", temporaryPassword)).body.data.user.role).toBe("TEACHER");

    const list = await request(app).get("/api/v1/admin/teachers").set("Authorization", auth);
    expect(list.body.data.teachers).toEqual([expect.objectContaining({ fullName: "Ustadha Maryam", activeClassGroups: 0 })]);
    expect(JSON.stringify(list.body)).not.toContain(temporaryPassword);
  });

  it("rejects duplicate emails and is admin-only", async () => {
    const auth = await bearer(app, await createUser({ role: "ADMIN" }));
    const teacherAuth = await bearer(app, await createUser({ role: "TEACHER", email: "t@example.com" }));

    const duplicate = await request(app).post("/api/v1/admin/teachers").set("Authorization", auth).send({ email: "t@example.com", fullName: "Copy" });
    const byTeacher = await request(app).post("/api/v1/admin/teachers").set("Authorization", teacherAuth).send({ email: "x@example.com", fullName: "X" });

    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
    expect(byTeacher.status).toBe(403);
  });
});

describe("admin: disabling accounts", () => {
  it("disables an account, logging it out everywhere, and can re-enable it", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const auth = await bearer(app, admin);
    const student = await createUser({ role: "STUDENT" });
    const { refreshToken } = (await login(student.email, student.password)).body.data.tokens;

    const off = await request(app).patch(`/api/v1/admin/users/${student.id}/status`).set("Authorization", auth).send({ isActive: false });

    expect(off.body.data.user.isActive).toBe(false);
    expect((await login(student.email, student.password)).status).toBe(403);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status).toBe(401);

    await request(app).patch(`/api/v1/admin/users/${student.id}/status`).set("Authorization", auth).send({ isActive: true });
    expect((await login(student.email, student.password)).status).toBe(200);
  });

  it("won't let an admin disable their own account", async () => {
    const admin = await createUser({ role: "ADMIN" });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set("Authorization", await bearer(app, admin))
      .send({ isActive: false });

    expect(res.body.error.code).toBe("CANNOT_DISABLE_SELF");
  });

  it("answers 404 for unknown users", async () => {
    const auth = await bearer(app, await createUser({ role: "ADMIN" }));

    const res = await request(app).patch(`/api/v1/admin/users/${crypto.randomUUID()}/status`).set("Authorization", auth).send({ isActive: false });

    expect(res.status).toBe(404);
  });
});

describe("POST /auth/change-password", () => {
  it("changes the password, logs out other devices, and keeps this one logged in", async () => {
    const user = await createUser({ password: "temporary-pass-1" });
    const otherDevice = (await login(user.email, "temporary-pass-1")).body.data.tokens.refreshToken;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", await bearer(app, user))
      .send({ currentPassword: "temporary-pass-1", newPassword: "my-own-password" });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.refreshToken).toEqual(expect.any(String));
    expect((await login(user.email, "temporary-pass-1")).status).toBe(401);
    expect((await login(user.email, "my-own-password")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: otherDevice })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: res.body.data.tokens.refreshToken })).status).toBe(200);
  });

  it("says the current password is wrong with 400, not 401 (which would log the app out)", async () => {
    const user = await createUser({});

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", await bearer(app, user))
      .send({ currentPassword: "not-it", newPassword: "another-password" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WRONG_PASSWORD");
  });

  it("requires a new, valid password", async () => {
    const user = await createUser({ password: "same-password-1" });
    const auth = await bearer(app, user);

    const same = await request(app).post("/api/v1/auth/change-password").set("Authorization", auth).send({ currentPassword: "same-password-1", newPassword: "same-password-1" });
    const short = await request(app).post("/api/v1/auth/change-password").set("Authorization", auth).send({ currentPassword: "same-password-1", newPassword: "short" });

    expect(same.body.error.code).toBe("SAME_PASSWORD");
    expect(short.body.error.code).toBe("VALIDATION_ERROR");
  });
});
