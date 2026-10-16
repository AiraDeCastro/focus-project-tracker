import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import type { FocusLogEntry } from "./types";

/** How many stretches of focus the dashboard lists. */
export const FOCUS_LOG_LIMIT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FocusLogRow {
  project: string;
  startedAt: string;
  endedAt: string | null;
  switchReason: string | null;
}

/** The newest stretches of focus first. */
export async function loadFocusLog(db: Db, limit = FOCUS_LOG_LIMIT): Promise<FocusLogRow[]> {
  const rows = await db
    .select({
      project: projects.name,
      startedAt: focusLog.startedAt,
      endedAt: focusLog.endedAt,
      switchReason: focusLog.switchReason,
    })
    .from(focusLog)
    .innerJoin(projects, eq(projects.repoId, focusLog.repoId))
    .orderBy(desc(focusLog.startedAt), desc(focusLog.id))
    .limit(limit);
  return rows;
}

/**
 * Turns log rows into what the card shows. `toDay` turns a stored instant into the owner's date
 * ("YYYY-MM-DD"), so a switch late in the evening lands on the day the owner remembers.
 * `today` is the owner's date, used for a stretch that has not ended.
 */
export function buildFocusLog(
  rows: FocusLogRow[],
  today: string,
  toDay: (stamp: string) => string,
): FocusLogEntry[] {
  return rows.map((row) => {
    const from = toDay(row.startedAt);
    const to = row.endedAt ? toDay(row.endedAt) : null;
    const end = to ?? today;
    const days = Math.max(
      0,
      Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS),
    );
    const reason = row.switchReason?.trim() || null;
    return { project: row.project, from, to, days, reason };
  });
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => SHORT.format(new Date(`${iso}T00:00:00Z`));

/** Display text for one entry of the card. */
export function describeFocusEntry(entry: FocusLogEntry): {
  title: string;
  when: string;
  note: string | null;
} {
  const length = entry.days === 0 ? "same day" : entry.days === 1 ? "1 day" : `${entry.days} days`;
  const when = entry.to
    ? `${shortDate(entry.from)} to ${shortDate(entry.to)} (${length})`
    : `Since ${shortDate(entry.from)} (${length} so far)`;
  const note = entry.to
    ? entry.reason
      ? `Why you left: ${entry.reason}`
      : "Ended when the project was marked finished or deployed."
    : null;
  return { title: entry.project, when, note };
}
