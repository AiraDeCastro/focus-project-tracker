import { weekStart } from "./dashboard-utils";
import type { Streak } from "./types";

/** How far back closed issues are fetched, and so the longest streak that can be shown. */
export const STREAK_LOOKBACK_WEEKS = 52;
const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The date to start fetching closed issues from, so the whole lookback window is covered. */
export function streakSince(today: string): string {
  return shiftDays(weekStart(today), -7 * STREAK_LOOKBACK_WEEKS);
}

/**
 * The weekly streak: consecutive weeks (Monday to Sunday) with at least one closed issue.
 *
 * It counts back from the current week, but the current week is not held against the owner until
 * it is over: with nothing closed yet this week, the streak counts from last week. While Away mode
 * is on the streak is paused, so it counts back from the latest week that had a close, however
 * long ago, instead of breaking. Returns null when there is no streak to show, so the dashboard
 * never displays a zero.
 */
export function buildStreak(closedAt: string[], today: string, awayActive: boolean): Streak | null {
  const weeks = new Set<string>();
  let thisWeek = 0;
  const current = weekStart(today);
  for (const stamp of closedAt) {
    const day = stamp.slice(0, 10);
    if (day > today) continue;
    const start = weekStart(day);
    weeks.add(start);
    if (start === current) thisWeek++;
  }

  let cursor: string | null = null;
  let paused = false;
  if (weeks.has(current)) cursor = current;
  else if (weeks.has(shiftDays(current, -7))) cursor = shiftDays(current, -7);
  else if (awayActive && weeks.size > 0) {
    cursor = [...weeks].sort().at(-1)!;
    paused = true;
  }
  if (!cursor) return null;

  let count = 0;
  const limit = shiftDays(current, -7 * (STREAK_LOOKBACK_WEEKS - 1));
  while (weeks.has(cursor) && cursor >= limit) {
    count++;
    cursor = shiftDays(cursor, -7);
  }
  return { weeks: count, paused, thisWeek };
}

/** The streak as a short phrase, for example "3-week streak". */
export function describeStreak(streak: Streak): string {
  const base = `${streak.weeks}-week streak`;
  return streak.paused ? `${base}, paused while you are away` : base;
}
