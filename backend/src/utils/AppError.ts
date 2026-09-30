// An error we throw on purpose, with an HTTP status and a stable machine-readable
// code the web and mobile apps can check, e.g.
//   throw new AppError(409, "ENROLLMENT_EXISTS", "You already have an active enrollment in this course.");
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
