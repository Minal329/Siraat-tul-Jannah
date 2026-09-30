// Table of contents for the API. Each feature gets its own router file and is
// mounted here, e.g. apiRouter.use("/auth", authRouter) in step 4.
import { Router } from "express";
import { healthRouter } from "./health.routes.ts";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
