// Helpers for tests that use the real test database.
import bcrypt from "bcrypt";
import type { Role } from "../../generated/prisma/enums.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { assertTestDatabase } from "./assertTestDatabase.ts";

// Empties every table (except Prisma's migration history) so each test starts clean.
export async function resetDatabase() {
  assertTestDatabase(process.env.DATABASE_URL);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

// Creates a user of any role directly in the database (public signup can only
// create students), e.g. await createUser({ role: "ADMIN" }).
export async function createUser(options: {
  role?: Role;
  email?: string;
  password?: string;
  fullName?: string;
  isActive?: boolean;
}) {
  const role = options.role ?? "STUDENT";
  const email = options.email ?? `${role.toLowerCase()}-${crypto.randomUUID()}@test.pk`;
  const password = options.password ?? "correct-horse-battery";
  const profile = { create: { fullName: options.fullName ?? `Test ${role}` } };

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 4),
      role,
      isActive: options.isActive ?? true,
      ...(role === "STUDENT" && { student: profile }),
      ...(role === "TEACHER" && { teacher: profile }),
      ...(role === "ADMIN" && { admin: profile }),
    },
  });
  return { ...user, password };
}

// Creates a course directly in the database. Published unless told otherwise.
export async function createCourse(overrides: Partial<{ title: string; slug: string; feePkr: number; isPublished: boolean }> = {}) {
  const slug = overrides.slug ?? `course-${crypto.randomUUID().slice(0, 8)}`;
  return prisma.course.create({
    data: {
      title: overrides.title ?? "Test Course",
      slug,
      description: "A course used in automated tests.",
      feePkr: overrides.feePkr ?? 2000,
      isPublished: overrides.isPublished ?? true,
    },
  });
}
