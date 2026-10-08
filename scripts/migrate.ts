import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "../src/db/client";

/** Names the target (never the token) so you can tell a Turso run from a local one. */
function describeTarget(): string {
  const url = process.env.DATABASE_URL || "file:local.db";
  if (url.startsWith("file:")) return `local file ${url.slice("file:".length)}`;
  return `remote database ${new URL(url.replace(/^libsql:/, "https:")).host}`;
}

async function main() {
  console.log(`Applying migrations to ${describeTarget()}...`);
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Done. The database is up to date.");
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
