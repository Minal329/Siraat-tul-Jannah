import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { requireAuth, requireRole } from "../src/middleware/requireAuth.ts";
import { errorHandler } from "../src/middleware/errorHandler.ts";
import { hashRefreshToken } from "../src/modules/auth/auth.tokens.ts";
import { createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();

beforeEach(async () => {
  await resetDatabase();
  app = createApp(); // fresh rate-limit counters for every test
});

afterAll(async () => {
  await prisma.$disconnect();
});

const signup = {
  email: "Aisha@Example.com",
  password: "bismillah-123",
  fullName: "Aisha Khan",
  whatsappNumber: "+923001234567",
};

const login = (email: string, password: string) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

describe("POST /auth/register", () => {
  it("creates a student account and logs them in", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(signup);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      email: "aisha@example.com", // stored lower-case
      role: "STUDENT",
      profile: { fullName: "Aisha Khan", whatsappNumber: "+923001234567" },
    });
    expect(res.body.data.tokens).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessTokenExpiresIn: 900,
    });
  });

  it("stores only a bcrypt hash of the password, and never returns it", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(signup);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "aisha@example.com" } });
    expect(user.passwordHash).not.toContain(signup.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("ignores attempts to sign up as an admin", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...signup, role: "ADMIN" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("STUDENT");
  });

  it("rejects an email that is already registered, whatever its capitalisation", async () => {
    await request(app).post("/api/v1/auth/register").send(signup);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...signup, email: "AISHA@example.COM" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("explains which fields are invalid", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "short", fullName: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["email", "password", "fullName"]));
  });

  it("rejects passwords longer than bcrypt can handle (72 bytes)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...signup, password: "a".repeat(73) });

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with the right email and password", async () => {
    const user = await createUser({ email: "teacher@test.pk", role: "TEACHER" });

    const res = await login("  Teacher@Test.pk ", user.password);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: "teacher@test.pk", role: "TEACHER" });
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const user = await createUser({ email: "student@test.pk" });

    const wrongPassword = await login(user.email, "wrong-password");
    const unknownEmail = await login("nobody@test.pk", "wrong-password");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("blocks disabled accounts", async () => {
    const user = await createUser({ isActive: false });

    const res = await login(user.email, user.password);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("locks an email out after 10 failed attempts from the same network", async () => {
    const user = await createUser({});
    for (let i = 0; i < 10; i++) {
      expect((await login(user.email, "guess-" + i)).status).toBe(401);
    }

    const locked = await login(user.email, user.password);
    const otherAccount = await login("someone-else@test.pk", "guess");

    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(otherAccount.status).toBe(401); // other users on the same IP are unaffected
  });

  it("does not count successful logins towards the limit", async () => {
    const user = await createUser({});
    for (let i = 0; i < 12; i++) {
      expect((await login(user.email, user.password)).status).toBe(200);
    }
  });
});

describe("GET /auth/me", () => {
  it("returns the logged-in user", async () => {
    const user = await createUser({ role: "ADMIN", fullName: "Hafiza Aqsa Jamil" });
    const { accessToken } = (await login(user.email, user.password)).body.data.tokens;

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: user.id,
      role: "ADMIN",
      profile: { fullName: "Hafiza Aqsa Jamil" },
    });
  });

  it("requires a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("rejects forged and tampered tokens", async () => {
    const user = await createUser({});
    const forged = jwt.sign({ role: "ADMIN" }, "attacker-guessed-secret-000000000000", {
      subject: user.id,
      issuer: "siraat-api",
    });
    const unsigned = jwt.sign({ role: "ADMIN" }, "", { subject: user.id, issuer: "siraat-api", algorithm: "none" });

    for (const token of [forged, unsigned, "garbage"]) {
      const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_TOKEN");
    }
  });

  it("tells the app when a token has expired so it can refresh", async () => {
    const user = await createUser({});
    const expired = jwt.sign({ role: "STUDENT" }, process.env.JWT_SECRET!, {
      subject: user.id,
      issuer: "siraat-api",
      expiresIn: -10,
    });

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("stops a disabled user immediately, even with an unexpired token", async () => {
    const user = await createUser({});
    const { accessToken } = (await login(user.email, user.password)).body.data.tokens;
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("POST /auth/refresh and /auth/logout", () => {
  async function loggedInTokens() {
    const user = await createUser({});
    return { user, ...(await login(user.email, user.password)).body.data.tokens };
  }
  const refresh = (refreshToken: string) => request(app).post("/api/v1/auth/refresh").send({ refreshToken });

  it("swaps a refresh token for a new pair, and the old one stops working", async () => {
    const { refreshToken } = await loggedInTokens();

    const first = await refresh(refreshToken);
    const again = await refresh(refreshToken);

    expect(first.status).toBe(200);
    expect(first.body.data.tokens.refreshToken).not.toBe(refreshToken);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("logs the user out everywhere if an old refresh token is reused (possible theft)", async () => {
    const { refreshToken: stolen } = await loggedInTokens();
    const newer = (await refresh(stolen)).body.data.tokens.refreshToken;

    await refresh(stolen); // attacker replays the old token

    expect((await refresh(newer)).status).toBe(401);
  });

  it("rejects expired refresh tokens", async () => {
    const { refreshToken } = await loggedInTokens();
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it("stores refresh tokens hashed, not as plain text", async () => {
    const { refreshToken } = await loggedInTokens();

    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(refreshToken);
  });

  it("logout revokes the refresh token", async () => {
    const { refreshToken } = await loggedInTokens();

    const res = await request(app).post("/api/v1/auth/logout").send({ refreshToken });

    expect(res.status).toBe(204);
    expect((await refresh(refreshToken)).status).toBe(401);
  });
});

describe("requireRole", () => {
  // A tiny stand-in app with one admin-only route, to test the guard on its own.
  const guarded = express();
  guarded.get("/admin-only", requireAuth, requireRole("ADMIN"), (_req, res) => {
    res.json({ data: "welcome" });
  });
  guarded.use(errorHandler);

  async function tokenFor(role: "STUDENT" | "TEACHER" | "ADMIN") {
    const user = await createUser({ role });
    return (await login(user.email, user.password)).body.data.tokens.accessToken as string;
  }

  it("lets admins through", async () => {
    const res = await request(guarded).get("/admin-only").set("Authorization", `Bearer ${await tokenFor("ADMIN")}`);
    expect(res.status).toBe(200);
  });

  it("blocks students and teachers with 403", async () => {
    for (const role of ["STUDENT", "TEACHER"] as const) {
      const res = await request(guarded).get("/admin-only").set("Authorization", `Bearer ${await tokenFor(role)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });
});
