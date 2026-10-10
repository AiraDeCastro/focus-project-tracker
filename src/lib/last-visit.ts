import type { HistoryPoint } from "./dashboard-utils";
import type { SinceVisit } from "./types";

/** Name of the browser cookie that remembers visits. It holds no personal data, only times. */
export const VISIT_COOKIE = "ft_visit";
/** A new visit starts after this long without opening the dashboard. */
export const VISIT_GAP_MS = 6 * 60 * 60 * 1000;
/** Older stamps are ignored, so a stale cookie never produces a "2 years away" card. */
const MAX_AGE_MS = 730 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface VisitState {
  /** When the visit before the current one last had the dashboard open. */
  prev: string | null;
  /** The most recent time the dashboard was opened. */
  curr: string | null;
}

function validStamp(value: string | undefined, now: Date): string | null {
  if (!value || !ISO.test(value)) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  // Date.parse rolls "2026-02-31" over into March; reject dates that do not round-trip.
  if (new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  if (ms > now.getTime() + 60_000) return null; // from the future: clock trouble, ignore
  if (now.getTime() - ms > MAX_AGE_MS) return null;
  return value;
}

/** Reads the cookie value ("prev_curr", either part may be empty). Anything odd reads as empty. */
export function parseVisit(value: string | null | undefined, now: Date): VisitState {
  const [prev, curr] = (value ?? "").split("_");
  return { prev: validStamp(prev, now), curr: validStamp(curr, now) };
}

/**
 * The state after opening the dashboard at `now`. Opening it again within the gap is the same
 * visit, so `prev` stays put; after the gap, the last open becomes `prev`. The server and the
 * browser both call this, so the card the server draws matches the cookie the browser writes.
 */
export function advanceVisit(state: VisitState, now: Date): { prev: string | null; curr: string } {
  const curr = now.toISOString();
  if (!state.curr) return { prev: state.prev, curr };
  const away = now.getTime() - Date.parse(state.curr);
  return away >= VISIT_GAP_MS ? { prev: state.curr, curr } : { prev: state.prev, curr };
}

export function serializeVisit(state: { prev: string | null; curr: string }): string {
  return `${state.prev ?? ""}_${state.curr}`;
}

/** Whole days between the date of `lastVisit` and `today` ("YYYY-MM-DD"). */
export function daysAway(lastVisit: string, today: string): number {
  const from = Date.parse(`${lastVisit.slice(0, 10)}T00:00:00Z`);
  return Math.round((Date.parse(`${today}T00:00:00Z`) - from) / DAY_MS);
}

export interface SinceVisitInput {
  lastVisit: string | null;
  today: string;
  project: string;
  /** Issues closed in the focus project since `lastVisit`. */
  closedCount: number;
  /** The focus project's percent complete now. */
  percentNow: number;
  /** Snapshot history of the focus project. */
  history: HistoryPoint[];
}

/** Percent complete at the end of the day of `lastVisit`, from the latest snapshot on or before it. */
export function percentAt(history: HistoryPoint[], lastVisit: string): number | null {
  const day = lastVisit.slice(0, 10);
  let found: number | null = null;
  for (const h of [...history].sort((a, b) => a.date.localeCompare(b.date))) {
    if (h.date <= day) found = h.percent;
    else break;
  }
  return found;
}

/**
 * What changed in the focus project since the owner last looked. Only shown when the last visit
 * was at least a day ago, and worded as news rather than as a missed obligation.
 */
export function buildSinceVisit(input: SinceVisitInput): SinceVisit | null {
  const { lastVisit, today } = input;
  if (!lastVisit) return null;
  const days = daysAway(lastVisit, today);
  if (days < 1) return null;
  const then = percentAt(input.history, lastVisit);
  return {
    project: input.project,
    lastVisit: lastVisit.slice(0, 10),
    daysAway: days,
    closed: input.closedCount,
    percentChange: then === null ? null : input.percentNow - then,
  };
}

/** The card's words: a heading and a few short lines of news, never a scolding. */
export function describeSinceVisit(s: SinceVisit): { heading: string; lines: string[] } {
  const when = s.daysAway === 1 ? "yesterday" : `${s.daysAway} days ago`;
  const lines = [
    s.closed === 0
      ? `No issues closed in ${s.project}.`
      : `${s.closed} ${s.closed === 1 ? "issue" : "issues"} closed in ${s.project}.`,
  ];
  if (s.percentChange !== null) {
    const n = Math.abs(s.percentChange);
    const points = `${n} ${n === 1 ? "point" : "points"}`;
    lines.push(
      s.percentChange > 0
        ? `Progress is up ${points}.`
        : s.percentChange < 0
          ? `Progress is down ${points}, because issues were added.`
          : "Progress is unchanged.",
    );
  }
  return { heading: `Welcome back. You were last here ${when}.`, lines };
}
