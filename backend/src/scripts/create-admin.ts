// Creates an admin account. Safe to run on the live server.
//
//   npm run create-admin -- --email aqsa@example.com --name "Hafiza Aqsa Jamil"
//
// Password: set ADMIN_PASSWORD to choose one, otherwise a strong one is generated
// and printed once. It's never taken as a --flag, because typed commands are
// saved in shell history where others could read them.
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma.ts";
import { registerSchema } from "../modules/auth/auth.schemas.ts";
import { createUserWithProfile, generateTemporaryPassword } from "../modules/users/users.service.ts";
import { AppError } from "../utils/AppError.ts";

export async function createAdmin(options: {
  email: string;
  fullName: string;
  whatsappNumber?: string;
  password?: string;
}) {
  const generatedPassword = options.password ? undefined : generateTemporaryPassword();
  // Same rules as signup: valid email, 8–72 byte password, real name, optional WhatsApp number.
  const input = registerSchema.parse({ ...options, password: options.password ?? generatedPassword });
  const user = await createUserWithProfile({ ...input, role: "ADMIN" });
  return { user, generatedPassword };
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      whatsapp: { type: "string" },
    },
  });

  if (!values.email || !values.name) {
    console.error('Usage: npm run create-admin -- --email you@example.com --name "Full Name" [--whatsapp +923001234567]');
    process.exitCode = 1;
    return;
  }

  try {
    const { user, generatedPassword } = await createAdmin({
      email: values.email,
      fullName: values.name,
      whatsappNumber: values.whatsapp,
      password: process.env.ADMIN_PASSWORD || undefined,
    });
    console.log(`Admin created: ${user.email} (${user.admin?.fullName})`);
    if (generatedPassword) {
      console.log(`Temporary password: ${generatedPassword}`);
      console.log("Store it somewhere safe now. It will not be shown again.");
    }
  } catch (err) {
    if (err instanceof ZodError) {
      for (const issue of err.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    } else if (err instanceof AppError) {
      console.error(err.message);
    } else {
      throw err;
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when called from the command line, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
