// Runs once before the whole test suite: brings the test database up to date
// with every migration (creating the database first if it doesn't exist).
import { execSync } from "node:child_process";
import { assertTestDatabase } from "./helpers/assertTestDatabase.ts";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
