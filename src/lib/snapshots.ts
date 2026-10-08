import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { milestoneSnapshots } from "@/db/schema";
import type { HistoryPoint } from "./dashboard-utils";

export interface SnapshotInput {
  /** GitHub milestone number; 0 for the implicit "All issues" milestone. */
  number: number;
  title: string;
  closed: number;
  total: number;
}

function percent(closed: number, total: number): number {
  return total === 0 ? 0 : Math.round((closed / total) * 100);
}

/**
 * Stores today's counts for each milestone of a repo. Running it again the same day replaces
 * that day's rows, so reloading the dashboard never creates duplicates.
 */
export async function recordSnapshots(
  db: Db,
  repoId: number,
  date: string,
  milestones: SnapshotInput[],
): Promise<void> {
  for (const m of milestones) {
    const values = {
      repoId,
      milestoneNumber: m.number,
      milestoneTitle: m.title,
      snapshotDate: date,
      openCount: m.total - m.closed,
      closedCount: m.closed,
      percentComplete: percent(m.closed, m.total),
    };
    await db
      .insert(milestoneSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: [
          milestoneSnapshots.repoId,
          milestoneSnapshots.milestoneNumber,
          milestoneSnapshots.snapshotDate,
        ],
        set: {
          milestoneTitle: values.milestoneTitle,
          openCount: values.openCount,
          closedCount: values.closedCount,
          percentComplete: values.percentComplete,
        },
      });
  }
}

/** One percent-complete value per snapshot day for a repo, combining all its milestones. */
export async function loadHistory(db: Db, repoId: number): Promise<HistoryPoint[]> {
  const rows = await db
    .select()
    .from(milestoneSnapshots)
    .where(eq(milestoneSnapshots.repoId, repoId));
  const byDate = new Map<string, { closed: number; total: number }>();
  for (const r of rows) {
    const day = byDate.get(r.snapshotDate) ?? { closed: 0, total: 0 };
    day.closed += r.closedCount;
    day.total += r.closedCount + r.openCount;
    byDate.set(r.snapshotDate, day);
  }
  return [...byDate.entries()]
    .map(([date, d]) => ({ date, percent: percent(d.closed, d.total) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
