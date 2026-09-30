// Creating accounts of any role. Public signup (auth.service) is limited to
// students; this is for trusted callers: the create-admin script, the seed
// script, and later the admin dashboard's "add teacher" screen.
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
