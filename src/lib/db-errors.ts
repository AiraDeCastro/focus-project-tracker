/** The database has not been updated to the version of the app that is running. */
export class DatabaseNotMigratedError extends Error {
  /** The missing table or column when the database said which, otherwise null. */
  readonly missing: string | null;
  constructor(missing: string | null) {
    super("The database needs to be migrated.");
    this.name = "DatabaseNotMigratedError";
    this.missing = missing;
  }
}

/** The app could not talk to its database: a wrong address, a token that is refused, or an outage. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super("The database could not be reached.");
    this.name = "DatabaseUnavailableError";
  }
}

/**
 * Codes the database client uses for "could not connect or log in" rather than a bad query. Every
 * code that starts with "URL_" (an address it cannot use) counts too.
 */
const CONNECTION_CODES = new Set([
  "SERVER_ERROR",
  "HRANA_WEBSOCKET_ERROR",
  "HRANA_HTTP_ERROR",
  "STREAM_EXPIRED",
  "CLIENT_CLOSED",
  "PROTOCOL_VERSION_ERROR",
]);

/** The error and the errors that caused it, outermost first. Drizzle wraps the database's own error. */
function chain(error: unknown): { name: string; message: string; code: string }[] {
  const out: { name: string; message: string; code: string }[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const e = current as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    out.push({
      name: typeof e.name === "string" ? e.name : "",
      message: typeof e.message === "string" ? e.message : "",
      code: typeof e.code === "string" ? e.code : "",
    });
    current = e.cause;
  }
  return out;
}

/** A table or column name is only shown if it is plain, so nothing odd ends up on the page. */
const PLAIN_NAME = /^[A-Za-z_][\w.]{0,60}$/;

/**
 * Turns a failed database call into the error the page knows how to explain:
 * - "no such table" or "no such column" means the app is newer than the database, so the owner
 *   needs to run the migrations: `DatabaseNotMigratedError`;
 * - a refused login, a bad address or an unreachable server: `DatabaseUnavailableError`;
 * - anything else, including GitHub's errors, is returned unchanged.
 * Only the name of the missing table or column is kept; the query and its values never are.
 */
export function translateDatabaseError(error: unknown): unknown {
  const nodes = chain(error);
  for (const node of nodes) {
    const missing =
      /no such (?:table|column):?\s*([^\s,;)]+)/i.exec(node.message) ??
      /table (\w+) has no column named (\w+)/i.exec(node.message);
    if (missing) {
      const name = missing[2] ? `${missing[1]}.${missing[2]}` : missing[1];
      return new DatabaseNotMigratedError(PLAIN_NAME.test(name) ? name : null);
    }
  }
  for (const node of nodes) {
    if (node.name !== "LibsqlError") continue;
    if (
      CONNECTION_CODES.has(node.code) ||
      node.code.startsWith("URL_") ||
      /HTTP status 40[13]|unauthori[sz]ed|authentication/i.test(node.message)
    ) {
      return new DatabaseUnavailableError();
    }
  }
  return error;
}

/** What to tell the owner, as a title and a sentence. Never includes anything secret. */
export function describeDatabaseProblem(
  error: DatabaseNotMigratedError | DatabaseUnavailableError,
): { title: string; text: string; command: string | null } {
  if (error instanceof DatabaseNotMigratedError) {
    return {
      title: "The database needs updating",
      text:
        "This version of Focus Trail is newer than your database" +
        (error.missing ? ` (it is missing ${error.missing})` : "") +
        ". On your computer, open the project folder and run the command below, then reload this page.",
      command: "npm run db:migrate",
    };
  }
  return {
    title: "Focus Trail cannot reach its database",
    text: "Check that DATABASE_URL and DATABASE_AUTH_TOKEN are set in Vercel and that the token has not expired, then try again.",
    command: null,
  };
}
