import { z } from "zod";
import { AppError } from "./AppError.ts";

// IDs in URLs must be UUIDs. Anything else can't match a row, so answer 404
// straight away instead of sending a malformed ID to the database.
export function parseId(value: unknown, thing: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new AppError(404, "NOT_FOUND", `${thing} not found.`);
  return result.data;
}
