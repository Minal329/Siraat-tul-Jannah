// Guards for routes that need a logged-in user:
//   router.get("/me", requireAuth, handler)
//   router.post("/courses", requireAuth, requireRole("ADMIN"), handler)
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "../../generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { verifyAccessToken } from "../modules/auth/auth.tokens.ts";
import { AppError } from "../utils/AppError.ts";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "AUTH_REQUIRED", "Please log in to continue.");
  }

  let userId: string;
  try {
    ({ userId } = verifyAccessToken(header.slice("Bearer ".length)));
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // A distinct code tells the apps to call /auth/refresh and retry.
      throw new AppError(401, "TOKEN_EXPIRED", "Your session has expired.");
    }
    throw new AppError(401, "INVALID_TOKEN", "Please log in to continue.");
  }

  // Look the user up on every request so a disabled account or a changed role
  // takes effect immediately, not when the token expires.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!user) throw new AppError(401, "INVALID_TOKEN", "Please log in to continue.");
  if (!user.isActive) {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled. Please contact the academy.");
  }

  req.auth = { userId, role: user.role };
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new AppError(401, "AUTH_REQUIRED", "Please log in to continue.");
    if (!roles.includes(req.auth.role)) {
      throw new AppError(403, "FORBIDDEN", "You don't have permission to do this.");
    }
    next();
  };
}
