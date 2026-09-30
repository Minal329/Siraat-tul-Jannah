// Entry point: starts the HTTP server and shuts it down cleanly.
import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { prisma } from "./lib/prisma.ts";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Siraat tul Jannah API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

// On Ctrl+C or when the host stops the app: finish in-flight requests,
// close database connections, then exit.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
