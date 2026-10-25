import type { GithubMilestone, OpenIssue } from "./github/api";
import {
  IMPLICIT_MILESTONE_NUMBER,
  orderMilestones,
  type OrderedMilestone,
} from "./github/mapping";
import { GithubGraphqlError, ProjectScopeError, type ProjectItem } from "./github/projects";

/**
 * Progress read from a repo's GitHub Project instead of from the repo's issues (Phase 5). Pure
 * code. A task counts as done when its issue is closed or its Status is Done. Only tasks that are
 * in the Project are counted, so an issue nobody mirrored into it does not hold the percentage
 * down; that is the point of making the Project the source of truth.
 *
 * Milestones come from the repo (title, due date, order) with counts from the Project, and only
 * milestones that hold at least one Project task are shown. If no milestone holds a task, the
 * Project's tasks form one implicit "All issues" milestone, as a repo without milestones does.
 */

const isDone = (item: ProjectItem): boolean =>
  item.state === "closed" || item.status?.toLowerCase() === "done";

export function progressFromProject(
  milestones: GithubMilestone[],
  items: ProjectItem[],
): OrderedMilestone[] {
  const counts = new Map<number, { total: number; closed: number }>();
  for (const item of items) {
    if (!item.milestone) continue;
    const entry = counts.get(item.milestone.number) ?? { total: 0, closed: 0 };
    entry.total += 1;
    if (isDone(item)) entry.closed += 1;
    counts.set(item.milestone.number, entry);
  }

  const used = milestones
    .filter((m) => counts.has(m.number))
    .map((m) => {
      const c = counts.get(m.number)!;
      return { ...m, openIssues: c.total - c.closed, closedIssues: c.closed };
    });
  if (used.length > 0) return orderMilestones(used, { open: 0, closed: 0 });

  const closed = items.filter(isDone).length;
  return orderMilestones([], { open: items.length - closed, closed });
}

/**
 * The next open tasks in a milestone, in the Project's own order (the owner's plan), at most
 * `limit`. Pass `IMPLICIT_MILESTONE_NUMBER` for the implicit milestone, which takes every task.
 */
export function openTasksFromProject(
  items: ProjectItem[],
  milestoneNumber: number,
  limit: number,
): OpenIssue[] {
  return items
    .filter(
      (item) =>
        !isDone(item) &&
        (milestoneNumber === IMPLICIT_MILESTONE_NUMBER ||
          item.milestone?.number === milestoneNumber),
    )
    .slice(0, limit)
    .map((item) => ({ number: item.number, title: item.title, htmlUrl: item.url }));
}

/** One short reason a Project could not be read, for the dashboard footer. Never includes a token. */
export function describeProjectReadError(error: unknown): string {
  if (error instanceof ProjectScopeError) return error.message;
  if (error instanceof GithubGraphqlError) {
    if (error.status === 401) return "GitHub no longer accepts your sign-in. Sign in again.";
    if (error.status === 429) return "GitHub is limiting requests for now.";
    if (error.status === 404) return "The Project was not found.";
  }
  return "could not be read.";
}

/** The footer line about GitHub Projects, or null when no repo has one. */
export function describeProjectCheck(check: {
  fromProject: number;
  problems: string[];
}): string | null {
  if (check.fromProject === 0 && check.problems.length === 0) return null;
  const parts: string[] = [];
  if (check.fromProject > 0) {
    parts.push(
      `Progress for ${check.fromProject} ${check.fromProject === 1 ? "repo is" : "repos are"} read from GitHub Projects.`,
    );
  }
  if (check.problems.length > 0) {
    parts.push(`Read from issues instead: ${check.problems.join("; ")}`);
  }
  return parts.join(" ");
}
