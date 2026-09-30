import { defineConfig } from "vitest/config";

// Tests that touch the database use a separate database that gets wiped
// between tests — never the dev database. CI overrides this via TEST_DATABASE_URL.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://siraat:siraat_dev@localhost:5432/siraat_test?schema=public";
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    // Tests never read the real .env secrets — these safe values are used instead.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: "test-only-secret-that-is-at-least-32-characters",
      BCRYPT_ROUNDS: "4",
    },
    // Applies migrations to the test database once before any test runs.
    globalSetup: ["tests/globalSetup.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
