import type { MilestoneProgress } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function day(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function daysBetween(from: string, to: string): number {
  return Math.round((day(to) - day(from)) / DAY_MS);
}

export interface StallInput {
  /** ISO time the focus project last had an issue closed, or null if it never has. */
  lastClosedAt: string | null;
  /** When the project first took focus. Used while nothing has been closed yet. */
  focusStartedAt: string | null;
  /** Today as "YYYY-MM-DD". */
  today: string;
  /** Days without a closed issue before the project counts as stalled. */
  thresholdDays: number;
  /** Return date from Away mode, "YYYY-MM-DD", or null. */
  awayUntil: string | null;
}

export type StallState =
  /** Closed an issue recently enough. */
  | { status: "ok"; daysQuiet: number }
  /** No issue closed for at least the threshold. */
  | { status: "stalled"; daysQuiet: number }
  /** Away mode is on, so no alert is raised until the return date. */
  | { status: "away"; until: string }
  /** Nothing to measure from yet: no closed issue and no start date. */
  | { status: "unknown" };

/**
 * Whether the focus project has stalled: no issue closed for `thresholdDays` or more.
 *
 * Away mode pauses the alert until the return date (the owner is back on that day). The quiet
 * time is counted from the later of the last closed issue and the return date, so coming back
 * from a break never greets the owner with an alert for days they chose to be away. A project
 * that has never closed an issue is measured from when it took focus.
 */
export function stallState(input: StallInput): StallState {
  const { lastClosedAt, focusStartedAt, today, awayUntil } = input;
  const threshold = Math.max(1, Math.floor(input.thresholdDays));

  if (awayUntil && today < awayUntil) return { status: "away", until: awayUntil };

  const starts = [lastClosedAt ?? focusStartedAt, awayUntil]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10))
    .filter((d) => d <= today)
    .sort();
  const since = starts.at(-1);
  if (!since) return { status: "unknown" };

  const daysQuiet = daysBetween(since, today);
  return { status: daysQuiet >= threshold ? "stalled" : "ok", daysQuiet };
}

export interface OverdueMilestone {
  name: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
  daysOverdue: number;
  /** Issues still open in the milestone. */
  remaining: number;
}

/**
 * Milestones past their due date that still have open issues, most overdue first. A milestone
 * due today is not overdue yet, and a finished milestone never is. Away mode does not apply:
 * overdue alerts stay tied to the dates on GitHub.
 */
export function overdueMilestones(
  milestones: MilestoneProgress[],
  today: string,
): OverdueMilestone[] {
  return milestones
    .filter((m) => m.dueDate && m.dueDate.slice(0, 10) < today && m.closed < m.total)
    .map((m) => ({
      name: m.name,
      dueDate: m.dueDate!.slice(0, 10),
      daysOverdue: daysBetween(m.dueDate!, today),
      remaining: m.total - m.closed,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name));
}
