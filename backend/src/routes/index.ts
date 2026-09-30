// Table of contents for the API. Each feature lives in src/modules/<feature>/
// and is mounted here. Built by a function so every app instance (including
// each test's) gets its own fresh state, e.g. rate-limit counters.
// Staff-only endpoints live under /admin/... so they're easy to spot.
import { Router } from "express";
import { createAuthRouter } from "../modules/auth/auth.routes.ts";
import { adminCoursesRouter, coursesRouter } from "../modules/courses/courses.routes.ts";
import { enrollmentsRouter } from "../modules/enrollments/enrollments.routes.ts";
import { healthRouter } from "../modules/health/health.routes.ts";

export function createApiRouter() {
  const apiRouter = Router();

  apiRouter.use("/health", healthRouter);
  apiRouter.use("/auth", createAuthRouter());
  apiRouter.use("/courses", coursesRouter);
  apiRouter.use("/enrollments", enrollmentsRouter);
  apiRouter.use("/admin/courses", adminCoursesRouter);

  return apiRouter;
}
