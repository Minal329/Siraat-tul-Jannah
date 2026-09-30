// One shared database client for the whole app. Creating a new client per
// request would open a new pool of connections each time and exhaust Postgres.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { env } from "../config/env.ts";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
