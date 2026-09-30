// Teaches TypeScript that requests can carry `req.auth`, which requireAuth sets
// after checking the access token.
import type { Role } from "../../generated/prisma/enums.ts";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export {};
