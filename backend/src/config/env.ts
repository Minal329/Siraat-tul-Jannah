// Reads settings from environment variables (backend/.env locally) and checks
// them once at startup. A missing or malformed value stops the server
// immediately with a clear message, instead of failing later in a confusing way.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see backend/.env.example)"),
  // Signs access tokens. Anyone who knows it can forge logins, so it must be
  // long, random, secret, and different in every environment.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters (see backend/.env.example)"),
  // bcrypt work factor: each +1 doubles hashing time. 12 ≈ 250 ms, which slows
  // down password guessing without making login feel slow. Tests use 4.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Folder for uploaded files (payment screenshots etc.), relative to backend/.
  // Must be kept private and backed up — it holds students' financial details.
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  // The website's address, printed on certificates as the "verify this certificate" link.
  PUBLIC_WEB_URL: z.url().default("http://localhost:5173"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
