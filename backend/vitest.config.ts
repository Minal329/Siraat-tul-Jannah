import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests never need a real .env — these safe dummy values are used instead.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
