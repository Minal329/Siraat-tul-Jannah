// Prisma CLI configuration (Prisma 7+).
// Loads DATABASE_URL from backend/.env so the Prisma CLI can reach Postgres.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Sample data for development — see src/scripts/seed.ts.
    seed: "tsx src/scripts/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
