// Builds the Express app: security headers → CORS → body parsing → logging →
// routes → 404 → error handler. Order matters: each request flows top to bottom.
// Kept separate from server.ts so tests can use the app without opening a port.
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { notFound } from "./middleware/notFound.ts";
import { createApiRouter } from "./routes/index.ts";

export function createApp() {
  const app = express();
  // Behind Caddy / a load balancer, trust its X-Forwarded-For so req.ip (used by rate limits) is the visitor's.
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  // Versioned prefix: installed mobile apps can't be force-updated, so breaking
  // changes will go under /api/v2 while old apps keep using /api/v1.
  app.use("/api/v1", createApiRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
