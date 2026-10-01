// HTTP layer for /api/v1/auth: validate the body, call the service, send the result.
//
// Two ways to hold the 30-day refresh token:
// - Mobile app: in the response body; the app keeps it in the phone's secure storage.
// - Website: sends "X-Auth-Transport: cookie" and gets it as an httpOnly cookie instead,
//   which page scripts can't read — so an injected script can't steal a long-lived login.
//   The cookie is SameSite=Strict and only sent to /api/v1/auth, and reading it also
//   requires that custom header (which other websites can't add), so no cross-site tricks.
import { Router, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../../config/env.ts";
import { requireAuth } from "../../middleware/requireAuth.ts";
import { AppError } from "../../utils/AppError.ts";
import { readCookie } from "../../utils/cookies.ts";
import { REFRESH_TOKEN_TTL_MS } from "./auth.tokens.ts";
import { changePasswordSchema, loginSchema, refreshTokenSchema, registerSchema } from "./auth.schemas.ts";
import * as authService from "./auth.service.ts";

// Slows down password guessing. Note: many Pakistani mobile users share one
// public IP (carrier NAT), so login is limited per IP *and* email — one person
// mistyping can't lock out everyone on the same network.
function limiter(options: { windowMs: number; limit: number; keyByEmail?: boolean; onlyCountFailures?: boolean }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: options.onlyCountFailures ?? false,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? "unknown");
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      return options.keyByEmail ? `${ip}:${email}` : ip;
    },
    handler: (_req, _res, next) => {
      next(new AppError(429, "TOO_MANY_REQUESTS", "Too many attempts. Please wait a few minutes and try again."));
    },
  });
}

const REFRESH_COOKIE = "stj_refresh";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production", // https only on the live site
  sameSite: "strict" as const,
  path: "/api/v1/auth",
};

const wantsCookie = (req: Request) => req.get("X-Auth-Transport") === "cookie";

// Website: move the refresh token out of the response body into the cookie.
function deliver<T extends { tokens: { refreshToken: string } }>(req: Request, res: Response, data: T) {
  if (!wantsCookie(req)) return data;
  const { refreshToken, ...tokens } = data.tokens;
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
  return { ...data, tokens };
}

function refreshTokenFrom(req: Request) {
  const { refreshToken } = refreshTokenSchema.parse(req.body ?? {});
  const token = refreshToken ?? (wantsCookie(req) ? readCookie(req, REFRESH_COOKIE) : undefined);
  if (!token) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Please log in again.");
  return token;
}

export function createAuthRouter() {
  const router = Router();

  router.post(
    "/register",
    limiter({ windowMs: 60 * 60 * 1000, limit: 20 }),
    async (req, res) => {
      const input = registerSchema.parse(req.body);
      res.status(201).json({ data: deliver(req, res, await authService.register(input)) });
    },
  );

  router.post(
    "/login",
    limiter({ windowMs: 15 * 60 * 1000, limit: 10, keyByEmail: true, onlyCountFailures: true }),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      res.json({ data: deliver(req, res, await authService.login(input)) });
    },
  );

  router.post("/refresh", async (req, res) => {
    const refreshToken = refreshTokenFrom(req);
    try {
      res.json({ data: deliver(req, res, await authService.refresh(refreshToken)) });
    } catch (err) {
      if (wantsCookie(req)) res.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw err;
    }
  });

  router.post("/logout", async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body ?? {});
    const token = refreshToken ?? (wantsCookie(req) ? readCookie(req, REFRESH_COOKIE) : undefined);
    if (token) await authService.logout(token);
    if (wantsCookie(req)) res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  });

  router.post(
    "/change-password",
    requireAuth,
    limiter({ windowMs: 15 * 60 * 1000, limit: 10, onlyCountFailures: true }),
    async (req, res) => {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      res.json({ data: deliver(req, res, await authService.changePassword(req.auth!.userId, currentPassword, newPassword)) });
    },
  );

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ data: await authService.getCurrentUser(req.auth!.userId) });
  });

  return router;
}
