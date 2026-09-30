// Table of contents for the API. Each feature lives in src/modules/<feature>/
// and is mounted here. Built by a function so every app instance (including
// each test's) gets its own fresh state, e.g. rate-limit counters.
// Staff-only endpoints live under /admin/... and the teacher's area under /teacher/...
import { Router } from "express";
import { createAuthRouter } from "../modules/auth/auth.routes.ts";
import { adminCoursesRouter, coursesRouter } from "../modules/courses/courses.routes.ts";
import { adminClassGroupsRouter } from "../modules/class-groups/classGroups.routes.ts";
import { adminEnrollmentsRouter, enrollmentsRouter } from "../modules/enrollments/enrollments.routes.ts";
import { healthRouter } from "../modules/health/health.routes.ts";
import { adminPaymentAccountsRouter, paymentAccountsRouter } from "../modules/payment-accounts/paymentAccounts.routes.ts";
import { adminPaymentsRouter, paymentsRouter } from "../modules/payments/payments.routes.ts";
import { teacherSessionsRouter } from "../modules/sessions/sessions.routes.ts";
import { adminTeachersRouter, adminUsersRouter } from "../modules/users/users.routes.ts";

export function createApiRouter() {
  const apiRouter = Router();

  apiRouter.use("/health", healthRouter);
  apiRouter.use("/auth", createAuthRouter());
  apiRouter.use("/courses", coursesRouter);
  apiRouter.use("/enrollments", enrollmentsRouter);
  apiRouter.use("/payment-accounts", paymentAccountsRouter);
  apiRouter.use("/payments", paymentsRouter);
  apiRouter.use("/teacher", teacherSessionsRouter);
  apiRouter.use("/admin/courses", adminCoursesRouter);
  apiRouter.use("/admin/class-groups", adminClassGroupsRouter);
  apiRouter.use("/admin/enrollments", adminEnrollmentsRouter);
  apiRouter.use("/admin/payment-accounts", adminPaymentAccountsRouter);
  apiRouter.use("/admin/payments", adminPaymentsRouter);
  apiRouter.use("/admin/teachers", adminTeachersRouter);
  apiRouter.use("/admin/users", adminUsersRouter);

  return apiRouter;
}
