// Creating accounts of any role. Public signup (auth.service) is limited to
// students; this is for trusted callers: the create-admin script, the seed
// script, and later the admin dashboard's "add teacher" screen.
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Prisma } from "../../../generated/prisma/client.ts";
import type { Role } from "../../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";

export type NewUser = {
  role: Role;
  email: string;
  password: string;
  fullName: string;
  whatsappNumber?: string;
};

// `db` lets callers run this inside a transaction (e.g. the seed script).
export async function createUserWithProfile(input: NewUser, db: Prisma.TransactionClient = prisma) {
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const profile = { create: { fullName: input.fullName, whatsappNumber: input.whatsappNumber } };

  try {
    // Nested create: the users row and its role row are saved together or not at all.
    return await db.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash,
        role: input.role,
        ...(input.role === "STUDENT" && { student: profile }),
        ...(input.role === "TEACHER" && { teacher: profile }),
        ...(input.role === "ADMIN" && { admin: profile }),
      },
      include: { student: true, teacher: true, admin: true },
    });
  } catch (err) {
    // P2002 = unique constraint failed, i.e. the email is already registered.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }
    throw err;
  }
}

// Admins are identified by their login (users.id); records like "reviewed by" point at admins.id.
export async function getAdminId(userId: string) {
  const admin = await prisma.admin.findUnique({ where: { userId }, select: { id: true } });
  if (!admin) throw new AppError(403, "FORBIDDEN", "Only admins can do this.");
  return admin.id;
}

// Students are identified by their login (users.id); enrollments point at students.id.
export async function getStudentId(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw new AppError(403, "FORBIDDEN", "Only students can do this.");
  return student.id;
}

// A strong one-time password for accounts an admin creates. Shown once; the
// person should change it after first login (POST /auth/change-password).
export function generateTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

export async function listTeachers() {
  const teachers = await prisma.teacher.findMany({
    orderBy: { fullName: "asc" },
    include: {
      user: { select: { id: true, email: true, isActive: true } },
      _count: { select: { classGroups: { where: { isActive: true } } } },
    },
  });
  return {
    teachers: teachers.map((t) => ({
      id: t.id,
      userId: t.user.id,
      fullName: t.fullName,
      email: t.user.email,
      whatsappNumber: t.whatsappNumber,
      isActive: t.user.isActive,
      activeClassGroups: t._count.classGroups,
    })),
  };
}

export async function createTeacher(input: { email: string; fullName: string; whatsappNumber?: string }) {
  const temporaryPassword = generateTemporaryPassword();
  const user = await createUserWithProfile({ ...input, role: "TEACHER", password: temporaryPassword });
  return {
    teacher: {
      id: user.teacher!.id,
      userId: user.id,
      fullName: user.teacher!.fullName,
      email: user.email,
      whatsappNumber: user.teacher!.whatsappNumber,
      isActive: user.isActive,
    },
    temporaryPassword,
  };
}

// Disable or re-enable any account. Disabling also logs the person out everywhere.
export async function setUserActive(adminUserId: string, targetUserId: string, isActive: boolean) {
  if (adminUserId === targetUserId && !isActive) {
    throw new AppError(409, "CANNOT_DISABLE_SELF", "You can't disable your own account.");
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: targetUserId }, data: { isActive } }).catch((err) => {
      // P2025 = no user with that id.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw new AppError(404, "NOT_FOUND", "User not found.");
      }
      throw err;
    });
    if (!isActive) {
      await tx.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  });

  return { user: { id: user.id, email: user.email, role: user.role, isActive: user.isActive } };
}
