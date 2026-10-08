import type { Dashboard } from "../types";
import { fixtureDashboard } from "./fixtures";

/**
 * The one place the UI gets its data. Everything the app shows comes through this interface,
 * so the page does not care whether data is example data or real GitHub data.
 */
export interface DataSource {
  getDashboard(): Promise<Dashboard>;
}

/** Example data as it looks on a first visit: nothing has focus yet. */
const firstRunSource: DataSource = {
  async getDashboard() {
    return {
      ...fixtureDashboard,
      closedPerDay: [0, 0, 0, 0, 0, 0, 0],
      closedDays: [],
      dueDays: [],
      projects: fixtureDashboard.projects.map((p) =>
        p.status === "focus" ? { ...p, status: "backlog" as const } : p,
      ),
    };
  },
};

const fixtureSource: DataSource = {
  async getDashboard() {
    return fixtureDashboard;
  },
};

/**
 * `DATA_SOURCE=fixture` (default) shows example data and needs no accounts.
 * `DATA_SOURCE=fixture-first-run` is the same data with no focus project yet, for trying the picker.
 * `DATA_SOURCE=github` reads the signed-in owner's real repos; it needs the OAuth App, a
 * database and `npm run db:migrate`. The GitHub code is loaded only in that mode, so the
 * example-data mode never touches the database or the auth libraries.
 */
export function getDataSource(): DataSource {
  const mode = process.env.DATA_SOURCE ?? "fixture";
  if (mode === "fixture") return fixtureSource;
  if (mode === "fixture-first-run") return firstRunSource;
  if (mode === "github") {
    return {
      async getDashboard() {
        const { githubSourceForSession } = await import("./github-session");
        return githubSourceForSession().getDashboard();
      },
    };
  }
  throw new Error(`Unknown DATA_SOURCE "${mode}". Use "fixture", "fixture-first-run" or "github".`);
}
