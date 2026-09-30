import type { RequestHandler } from "express";
import { AppError } from "../utils/AppError.ts";

// Runs only when no route matched the request.
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`));
};
