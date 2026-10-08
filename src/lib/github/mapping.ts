import type { MilestoneProgress } from "../types";
import type { GithubMilestone, IssueCounts } from "./api";

export const IMPLICIT_MILESTONE_TITLE = "All issues";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-22T00:00:00Z" becomes "Oct 22". Uses UTC so the day does not shift by timezone. */
export function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Turns GitHub data into the milestone list the dashboard shows. Milestones keep their order
 * (due date, earliest first, undated last). A repo with no milestones but some issues gets one
 * implicit milestone covering all issues, so every repo with work in it has a graph.
 */
export function toMilestoneProgress(
  milestones: GithubMilestone[],
  issues: IssueCounts,
): MilestoneProgress[] {
  if (milestones.length > 0) {
    const ordered = [...milestones].sort((a, b) => {
      if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return a.number - b.number;
    });
    return ordered.map((m) => ({
      name: m.title,
      closed: m.closedIssues,
      total: m.openIssues + m.closedIssues,
      due: formatDue(m.dueOn),
    }));
  }
  const total = issues.open + issues.closed;
  if (total === 0) return [];
  return [{ name: IMPLICIT_MILESTONE_TITLE, closed: issues.closed, total, due: "No due date" }];
}
