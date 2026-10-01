// HTTP layer for /api/v1/auth: validate the body, call the service, send the result.
// The 30-day refresh token travels in the response body; the app keeps it in the
// phone's secure storage (iOS Keychain / Android Keystore).
import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { requireAuth } from "../../middleware/requireAuth.ts";
import { AppError } from "../../utils/AppError.ts";
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

export function createAuthRouter() {
  const router = Router();

  router.post(
    "/register",
    limiter({ windowMs: 60 * 60 * 1000, limit: 20 }),
    async (req, res) => {
      const input = registerSchema.parse(req.body);
      res.status(201).json({ data: await authService.register(input) });
    },
  );

  router.post(
    "/login",
    limiter({ windowMs: 15 * 60 * 1000, limit: 10, keyByEmail: true, onlyCountFailures: true }),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      res.json({ data: await authService.login(input) });
    },
  );

  router.post("/refresh", async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    res.json({ data: await authService.refresh(refreshToken) });
  });

  router.post("/logout", async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authService.logout(refreshToken);
    res.status(204).send();
  });

  router.post(
    "/change-password",
    requireAuth,
    limiter({ windowMs: 15 * 60 * 1000, limit: 10, onlyCountFailures: true }),
    async (req, res) => {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      res.json({ data: await authService.changePassword(req.auth!.userId, currentPassword, newPassword) });
    },
  );

  router.get("/me", requireAuth, async (req, res) => {
    res.json({ data: await authService.getCurrentUser(req.auth!.userId) });
  });

  return router;
}
