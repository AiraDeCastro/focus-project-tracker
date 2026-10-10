import type { Db } from "@/db/client";
import { ensureBackfilled } from "./backfill";
import { isoDate, mapLimit } from "./dashboard-utils";
import type { GithubApi } from "./github/api";
import { readMilestones } from "./github/read";
import { recordSnapshots } from "./snapshots";
import { listVisibleProjects, syncProjects } from "./sync";

/** Repos read at the same time; matches the dashboard so GitHub's burst limits are respected. */
const CONCURRENCY = 4;

export interface SnapshotJobResult {
  date: string;
  /** Repos whose milestones were stored. */
  repos: number;
  /** Full names of repos that could not be read; the rest still got a snapshot. */
  failed: string[];
}

/**
 * The daily job: syncs the repo list, then stores today's open and closed counts for every
 * visible repo so the graph has history even on days the owner never opens the dashboard.
 * One failing repo is reported and skipped; it never stops the others. Running it twice on the
 * same day replaces that day's rows.
 */
export async function runDailySnapshot(deps: {
  db: Db;
  api: GithubApi;
  now?: () => Date;
}): Promise<SnapshotJobResult> {
  const { db, api, now = () => new Date() } = deps;
  const moment = now();
  const date = isoDate(moment);

  await syncProjects(db, api, moment);
  const rows = await listVisibleProjects(db);

  const failed: string[] = [];
  await mapLimit(rows, CONCURRENCY, async (row) => {
    try {
      const milestones = await readMilestones(api, row.fullName);
      await ensureBackfilled(
        db,
        api,
        row,
        milestones.map((m) => ({ number: m.number, title: m.name })),
        date,
      );
      await recordSnapshots(
        db,
        row.repoId,
        date,
        milestones.map((m) => ({
          number: m.number,
          title: m.name,
          closed: m.closed,
          total: m.total,
        })),
      );
    } catch {
      failed.push(row.fullName);
    }
  });

  return { date, repos: rows.length - failed.length, failed: failed.sort() };
}
