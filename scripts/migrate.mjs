import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL ||= "file:./studio.db";
if (!process.env.DATABASE_URL.startsWith("file:"))
  throw new Error("This MVP requires a SQLite file: DATABASE_URL.");
// Prisma 6's deploy command needs an existing SQLite file on this runtime.
const database = resolve("prisma", process.env.DATABASE_URL.slice(5));
mkdirSync(dirname(database), { recursive: true });
closeSync(openSync(database, "a"));
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
