import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { milestoneSnapshots, projects } from "@/db/schema";
import { isoDate } from "./dashboard-utils";
import type { GithubApi, IssueRecord } from "./github/api";
import { percent } from "./snapshots";

/** How far back the rebuilt history reaches. The graph shows ten weeks, so this covers it. */
export const BACKFILL_DAYS = 84;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK = 100;

export interface BackfillMilestone {
  number: number;
  title: string;
}

export interface BackfillRow {
  date: string;
  milestoneNumber: number;
  milestoneTitle: string;
  closed: number;
  total: number;
}

function daysBefore(iso: string, days: number): string {
  return isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) - days * DAY_MS));
}

/**
 * Rebuilds what each milestone looked like on past days from issue dates. An issue counts as
 * existing from the day it was opened and as closed from the day it was closed, in the milestone
 * it belongs to now (GitHub does not keep milestone history). Reopened issues have no close date,
 * so they count as open.
 *
 * Rows are written only for days when something happened, and each such day lists every
 * milestone, so adding a day's rows together always gives the repo's whole picture. The graph
 * holds a value until the next row, so quiet days need none. Today is left to the live snapshot.
 * A repo without milestones passes the single implicit milestone (number 0), which takes every
 * issue.
 */
export function buildBackfillRows(
  issues: IssueRecord[],
  milestones: BackfillMilestone[],
  today: string,
  windowDays: number = BACKFILL_DAYS,
): BackfillRow[] {
  const implicit = milestones.length === 1 && milestones[0].number === 0;
  const known = new Set(milestones.map((m) => m.number));
  const relevant = issues.filter(
    (i) => implicit || (i.milestone !== null && known.has(i.milestone)),
  );
  if (relevant.length === 0) return [];

  const cutoff = daysBefore(today, windowDays);
  const eventDays = new Set<string>();
  let hasEarlier = false;
  for (const issue of relevant) {
    for (const stamp of [issue.createdAt, issue.closedAt]) {
      if (!stamp) continue;
      const day = stamp.slice(0, 10);
      if (day >= today) continue;
      if (day < cutoff) hasEarlier = true;
      else eventDays.add(day);
    }
  }
  // A starting point, so the first day in the window carries everything that happened before it.
  if (hasEarlier) eventDays.add(cutoff);

  const rows: BackfillRow[] = [];
  for (const date of [...eventDays].sort()) {
    const day = relevant.filter((i) => i.createdAt.slice(0, 10) <= date);
    if (day.length === 0) continue;
    for (const m of milestones) {
      const own = implicit ? day : day.filter((i) => i.milestone === m.number);
      rows.push({
        date,
        milestoneNumber: m.number,
        milestoneTitle: m.title,
        total: own.length,
        closed: own.filter((i) => i.closedAt !== null && i.closedAt.slice(0, 10) <= date).length,
      });
    }
  }
  return rows;
}

/**
 * Rebuilds a repo's past history once. Real snapshots are never overwritten, and a repo that
 * fails (GitHub error) stays unmarked so the next run tries again. Returns true when it ran.
 */
export async function ensureBackfilled(
  db: Db,
  api: GithubApi,
  repo: { repoId: number; fullName: string; historyBackfilledOn: string | null },
  milestones: BackfillMilestone[],
  today: string,
): Promise<boolean> {
  if (repo.historyBackfilledOn) return false;
  try {
    const issues = await api.listIssues(repo.fullName);
    const rows = buildBackfillRows(issues, milestones, today);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(milestoneSnapshots)
        .values(
          rows.slice(i, i + CHUNK).map((r) => ({
            repoId: repo.repoId,
            milestoneNumber: r.milestoneNumber,
            milestoneTitle: r.milestoneTitle,
            snapshotDate: r.date,
            openCount: r.total - r.closed,
            closedCount: r.closed,
            percentComplete: percent(r.closed, r.total),
          })),
        )
        .onConflictDoNothing();
    }
    await db
      .update(projects)
      .set({ historyBackfilledOn: today })
      .where(eq(projects.repoId, repo.repoId));
    return true;
  } catch {
    return false;
  }
}
