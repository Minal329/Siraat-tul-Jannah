// The single place every error ends up. It turns errors into the standard
// response shape { error: { code, message, details? } } and makes sure
// internal details (stack traces, SQL) are logged but never sent to users.
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.ts";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields are missing or invalid.",
        details: err.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }

  // Body wasn't valid JSON (thrown by express.json()).
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
    return;
  }

  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
};
