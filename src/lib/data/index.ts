import type { Dashboard } from "../types";
import { fixtureDashboard } from "./fixtures";

/**
 * The one place the UI gets its data. Everything the app shows comes through this interface,
 * so a GitHub-backed source can replace the fixtures without touching components.
 */
export interface DataSource {
  getDashboard(): Promise<Dashboard>;
}

const fixtureSource: DataSource = {
  async getDashboard() {
    return fixtureDashboard;
  },
};

/** `DATA_SOURCE=fixture` is the default. A `github` source is added in Milestone 1. */
export function getDataSource(): DataSource {
  const mode = process.env.DATA_SOURCE ?? "fixture";
  if (mode === "fixture") return fixtureSource;
  throw new Error(`Unknown DATA_SOURCE "${mode}". Only "fixture" exists so far.`);
}
