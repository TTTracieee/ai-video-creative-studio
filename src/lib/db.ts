import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL ||= "file:./studio.db";
const globalDb = globalThis as unknown as { studioDb?: PrismaClient };
export const db = globalDb.studioDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.studioDb = db;
