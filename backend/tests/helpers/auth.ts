// Logs a user in through the real API and returns the Authorization header value.
import type { Express } from "express";
import request from "supertest";

export async function bearer(app: Express, user: { email: string; password: string }) {
  const res = await request(app).post("/api/v1/auth/login").send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${JSON.stringify(res.body)}`);
  return `Bearer ${res.body.data.tokens.accessToken}`;
}
