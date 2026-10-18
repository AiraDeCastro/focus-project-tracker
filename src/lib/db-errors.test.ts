import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { projects } from "@/db/schema";
import {
  DatabaseNotMigratedError,
  DatabaseUnavailableError,
  describeDatabaseProblem,
  translateDatabaseError,
} from "./db-errors";

/** What Drizzle throws: its own wrapper (with the SQL in the message) around the database's error. */
function drizzleError(inner: Error): Error {
  return new Error('Failed query: select "secret_token" from "projects" params: abc123', {
    cause: inner,
  });
}
function libsql(message: string, code: string): Error {
  return Object.assign(new Error(message), { name: "LibsqlError", code });
}

describe("translateDatabaseError", () => {
  it("recognises a missing table or column, through the wrapper, and keeps only its name", () => {
    const column = translateDatabaseError(
      drizzleError(libsql("SQLITE_ERROR: no such column: projects.kind", "SQLITE_ERROR")),
    );
    expect(column).toBeInstanceOf(DatabaseNotMigratedError);
    expect((column as DatabaseNotMigratedError).missing).toBe("projects.kind");

    const table = translateDatabaseError(
      drizzleError(libsql("SQLITE_ERROR: no such table: focus_log", "SQLITE_ERROR")),
    );
    expect((table as DatabaseNotMigratedError).missing).toBe("focus_log");

    const insert = translateDatabaseError(
      libsql("SQLITE_ERROR: table projects has no column named kind", "SQLITE_ERROR"),
    );
    expect((insert as DatabaseNotMigratedError).missing).toBe("projects.kind");
  });

  it("drops a name that is not plain, and never carries the query", () => {
    const err = translateDatabaseError(
      libsql("SQLITE_ERROR: no such table: x'; drop table projects;--", "SQLITE_ERROR"),
    ) as DatabaseNotMigratedError;
    expect(err).toBeInstanceOf(DatabaseNotMigratedError);
    expect(err.missing).toBeNull();
    expect(JSON.stringify(err.message)).not.toMatch(/secret_token|abc123/);
  });

  it("recognises a database that cannot be reached or refuses the token", () => {
    expect(translateDatabaseError(libsql("URL_INVALID: bad url", "URL_INVALID"))).toBeInstanceOf(
      DatabaseUnavailableError,
    );
    expect(
      translateDatabaseError(
        drizzleError(libsql("SERVER_ERROR: Server returned HTTP status 401", "SERVER_ERROR")),
      ),
    ).toBeInstanceOf(DatabaseUnavailableError);
    expect(translateDatabaseError(libsql("Unauthorized: bad token", "SOMETHING"))).toBeInstanceOf(
      DatabaseUnavailableError,
    );
  });

  it("leaves everything else alone, including a bad query and a GitHub network failure", () => {
    const constraint = libsql("SQLITE_CONSTRAINT: UNIQUE constraint failed", "SQLITE_CONSTRAINT");
    expect(translateDatabaseError(constraint)).toBe(constraint);
    const github = Object.assign(new Error("fetch failed"), { status: 500 });
    expect(translateDatabaseError(github)).toBe(github);
    expect(translateDatabaseError(null)).toBeNull();
    expect(translateDatabaseError("boom")).toBe("boom");
  });

  it("copes with a cause that loops back on itself", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(translateDatabaseError(a)).toBe(a);
  });
});

describe("describeDatabaseProblem", () => {
  it("tells the owner to run the migration, naming what is missing", () => {
    const text = describeDatabaseProblem(new DatabaseNotMigratedError("projects.kind"));
    expect(text.title).toBe("The database needs updating");
    expect(text.text).toContain("projects.kind");
    expect(text.command).toBe("npm run db:migrate");
    expect(describeDatabaseProblem(new DatabaseNotMigratedError(null)).text).not.toContain(
      "missing",
    );
  });

  it("points at the settings for a database that cannot be reached", () => {
    const text = describeDatabaseProblem(new DatabaseUnavailableError());
    expect(text.text).toContain("DATABASE_AUTH_TOKEN");
    expect(text.command).toBeNull();
  });
});

describe("with the real database library", () => {
  // These use the errors libsql and Drizzle really throw, not hand-made ones.
  async function failure(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
    } catch (error) {
      return error;
    }
    throw new Error("expected the query to fail");
  }

  it("recognises a database that was never migrated", async () => {
    const db = createDb(":memory:");
    const error = translateDatabaseError(await failure(() => db.select().from(projects)));
    expect(error).toBeInstanceOf(DatabaseNotMigratedError);
    expect((error as DatabaseNotMigratedError).missing).toBe("projects");
  });

  it("recognises a database that is one migration behind", async () => {
    const db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.run(sql`alter table projects drop column kind`);
    const error = translateDatabaseError(await failure(() => db.select().from(projects)));
    expect(error).toBeInstanceOf(DatabaseNotMigratedError);
    expect((error as DatabaseNotMigratedError).missing).toBe("kind");
  });

  it("recognises an address the client cannot use", async () => {
    const error = translateDatabaseError(await failure(async () => createDb("nonsense://x")));
    expect(error).toBeInstanceOf(DatabaseUnavailableError);
  });

  it("does not mistake an ordinary failed query for either problem", async () => {
    const db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
    const row = { repoId: 1, fullName: "me/a", name: "a", htmlUrl: "https://github.com/me/a" };
    await db.insert(projects).values(row);
    const duplicate = await failure(() => db.insert(projects).values(row));
    expect(translateDatabaseError(duplicate)).toBe(duplicate);
  });
});
