import { weekStart } from "./dashboard-utils";
import type { WeeklyReview } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface RepoClosures {
  name: string;
  /** ISO timestamps of the issues closed in the repo. */
  closedAt: string[];
}

/**
 * The review of the last full week (Monday to Sunday): issues closed, per project, against the
 * week before it. Looks at the same projects as the streak. A quiet week is a valid result, not a
 * failure; the dashboard words it gently.
 */
export function buildWeeklyReview(repos: RepoClosures[], today: string): WeeklyReview {
  const thisMonday = weekStart(today);
  const start = shiftDays(thisMonday, -7);
  const end = shiftDays(thisMonday, -1);
  const previousStart = shiftDays(start, -7);

  let closed = 0;
  let previousClosed = 0;
  const perProject: WeeklyReview["projects"] = [];
  for (const repo of repos) {
    let count = 0;
    for (const stamp of repo.closedAt) {
      const day = stamp.slice(0, 10);
      if (day >= start && day <= end) count++;
      else if (day >= previousStart && day < start) previousClosed++;
    }
    closed += count;
    if (count > 0) perProject.push({ name: repo.name, closed: count });
  }
  perProject.sort((a, b) => b.closed - a.closed || a.name.localeCompare(b.name));
  return { start, end, closed, previousClosed, projects: perProject };
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => SHORT.format(new Date(`${iso}T00:00:00Z`));

/** Display text for the review card. */
export function describeWeeklyReview(review: WeeklyReview): {
  range: string;
  heading: string;
  lines: string[];
} {
  const range = `${shortDate(review.start)} to ${shortDate(review.end)}`;
  const noun = (n: number) => `${n} issue${n === 1 ? "" : "s"}`;
  if (review.closed === 0) {
    return {
      range,
      heading: "A quiet week",
      lines: ["No issues were closed. Closing one this week starts a new streak."],
    };
  }
  const lines = review.projects.map((p) => `${p.name}: ${noun(p.closed)} closed`);
  const diff = review.closed - review.previousClosed;
  if (review.previousClosed > 0 && diff !== 0) {
    lines.push(
      diff > 0
        ? `${noun(diff)} more than the week before.`
        : `${noun(-diff)} fewer than the week before.`,
    );
  } else if (review.previousClosed === 0) {
    lines.push("Nothing was closed the week before.");
  } else {
    lines.push("The same as the week before.");
  }
  return { range, heading: `${noun(review.closed)} closed`, lines };
}
