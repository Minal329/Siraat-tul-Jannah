// The business logic of logging in. Routes call these functions; they don't
// know about HTTP, which keeps them easy to read and test.
import bcrypt from "bcrypt";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { Role } from "../../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { createUserWithProfile } from "../users/users.service.ts";
import type { LoginInput, RegisterInput } from "./auth.schemas.ts";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "./auth.tokens.ts";

const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
const invalidRefreshToken = () =>
  new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Please log in again.");
const accountDisabled = () =>
  new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled. Please contact the academy.");

const userWithProfile = { student: true, teacher: true, admin: true } as const;
type UserWithProfile = Prisma.UserGetPayload<{ include: typeof userWithProfile }>;

// The only shape of a user that ever leaves the server. Built field by field so
// secrets like passwordHash can never slip into a response by accident.
function toPublicUser(user: UserWithProfile) {
  const profile = user.student ?? user.teacher ?? user.admin;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profile: profile
      ? { id: profile.id, fullName: profile.fullName, whatsappNumber: profile.whatsappNumber }
      : null,
  };
}

async function issueTokens(user: { id: string; role: Role }) {
  const { token, tokenHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
  });
  return {
    accessToken: signAccessToken(user),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: token,
  };
}

// Public signup always creates a STUDENT. Teachers and admins are created by an admin.
export async function register(input: RegisterInput) {
  const user = await createUserWithProfile({ ...input, role: "STUDENT" });
  return { user: toPublicUser(user), tokens: await issueTokens(user) };
}

// Compared against when the email doesn't exist, so "no such user" takes as long
// as "wrong password" and attackers can't use timing to discover registered emails.
let dummyHash: Promise<string> | undefined;

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: userWithProfile });

  if (!user) {
    dummyHash ??= bcrypt.hash("dummy-password", env.BCRYPT_ROUNDS);
    await bcrypt.compare(input.password, await dummyHash);
    throw invalidCredentials();
  }

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    throw invalidCredentials();
  }

  // Checked only after the password is right, so this doesn't reveal which emails exist.
  if (!user.isActive) {
    throw accountDisabled();
  }

  return { user: toPublicUser(user), tokens: await issueTokens(user) };
}

// Swap a refresh token for a new access + refresh token pair ("rotation").
export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: true },
  });

  if (!stored) throw invalidRefreshToken();

  if (stored.revokedAt) {
    // A token that was already swapped for a new one came back: it may have been
    // stolen. Log this user out everywhere so whoever holds the newer token loses
    // access too. Tokens revoked by logout or a password change are just refused
    // (e.g. a second phone that hasn't heard about the password change yet).
    if (stored.rotatedAt) await revokeAllForUser(stored.userId);
    throw invalidRefreshToken();
  }

  if (stored.expiresAt <= new Date()) throw invalidRefreshToken();

  if (!stored.user.isActive) {
    await revokeAllForUser(stored.userId);
    throw accountDisabled();
  }

  // Only revoke if still unrevoked, so two simultaneous refreshes can't both succeed.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date(), rotatedAt: new Date() },
  });
  if (count === 0) throw invalidRefreshToken();

  return { tokens: await issueTokens(stored.user) };
}

// Always succeeds, even for unknown tokens: logging out twice is not an error.
export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Change your own password. Every other device is logged out (in case the old
// password leaked); this device gets a fresh pair of tokens.
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");

  // 400, not 401: a 401 would make the apps think the session expired and log out.
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, "WRONG_PASSWORD", "Your current password is incorrect.");
  }
  if (currentPassword === newPassword) {
    throw new AppError(400, "SAME_PASSWORD", "Choose a new password that's different from the current one.");
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { tokens: await issueTokens(user) };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userWithProfile });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");
  return { user: toPublicUser(user) };
}

async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
