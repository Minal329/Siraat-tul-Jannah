// Two kinds of token:
// - Access token: a signed JWT, valid 15 minutes, sent with every request as
//   "Authorization: Bearer <token>". The server checks the signature, no lookup needed.
// - Refresh token: a random string, valid 30 days, stored (hashed) in the
//   refresh_tokens table. Used only to get a new access token; can be revoked.
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Role } from "../../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ISSUER = "siraat-api";

const accessTokenPayload = z.object({
  sub: z.string(),
  role: z.enum(Role),
});

export function signAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    issuer: ISSUER,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

// Throws jwt.TokenExpiredError / jwt.JsonWebTokenError / ZodError on a bad token.
export function verifyAccessToken(token: string) {
  // Pinning the algorithm blocks tricks like a token claiming "alg: none".
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: ISSUER });
  const { sub, role } = accessTokenPayload.parse(payload);
  return { userId: sub, role };
}

export function generateRefreshToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token) };
}

// A fast hash is fine here (unlike passwords): the token is 256 random bits,
// so there is nothing to guess.
export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
