import type { Dashboard } from "../types";
import { fixtureDashboard } from "./fixtures";

/**
 * The one place the UI gets its data. Everything the app shows comes through this interface,
 * so the page does not care whether data is example data or real GitHub data.
 */
export interface DataSource {
  getDashboard(): Promise<Dashboard>;
}

const fixtureSource: DataSource = {
  async getDashboard() {
    return fixtureDashboard;
  },
};

/**
 * `DATA_SOURCE=fixture` (default) shows example data and needs no accounts.
 * `DATA_SOURCE=github` reads the signed-in owner's real repos; it needs the OAuth App, a
 * database and `npm run db:migrate`. The GitHub code is loaded only in that mode, so the
 * example-data mode never touches the database or the auth libraries.
 */
export function getDataSource(): DataSource {
  const mode = process.env.DATA_SOURCE ?? "fixture";
  if (mode === "fixture") return fixtureSource;
  if (mode === "github") {
    return {
      async getDashboard() {
        const { githubSourceForSession } = await import("./github-session");
        return githubSourceForSession().getDashboard();
      },
    };
  }
  throw new Error(`Unknown DATA_SOURCE "${mode}". Use "fixture" or "github".`);
}
