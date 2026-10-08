import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/** Opens a database. Use `:memory:` in tests and `file:local.db` for local development. */
export function createDb(url: string, authToken?: string) {
  return drizzle(createClient({ url, authToken }), { schema });
}

let shared: Db | undefined;

/** The app's database, from `DATABASE_URL` (a Turso URL in production). */
export function getDb(): Db {
  shared ??= createDb(
    process.env.DATABASE_URL || "file:local.db",
    process.env.DATABASE_AUTH_TOKEN || undefined,
  );
  return shared;
}
