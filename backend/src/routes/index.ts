// Table of contents for the API. Each feature lives in src/modules/<feature>/
// and is mounted here. Built by a function so every app instance (including
// each test's) gets its own fresh state, e.g. rate-limit counters.
import { Router } from "express";
import { createAuthRouter } from "../modules/auth/auth.routes.ts";
import { healthRouter } from "../modules/health/health.routes.ts";

export function createApiRouter() {
  const apiRouter = Router();

  apiRouter.use("/health", healthRouter);
  apiRouter.use("/auth", createAuthRouter());

  return apiRouter;
}
