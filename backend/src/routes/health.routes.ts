// GET /api/v1/health — "is the server alive, and can it reach the database?"
// Hosting platforms and uptime monitors call this to decide if the app is healthy.
import { Router } from "express";
import { prisma } from "../lib/prisma.ts";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: "up" | "down" = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  res.status(database === "up" ? 200 : 503).json({
    data: {
      status: database === "up" ? "ok" : "degraded",
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});
