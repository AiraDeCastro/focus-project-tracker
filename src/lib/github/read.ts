import type { GithubApi } from "./api";
import { orderMilestones, type OrderedMilestone } from "./mapping";

/** Issues can be turned off on a repo; GitHub then answers 410 (or 404). Treat that as empty. */
export async function orEmpty<T>(load: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 410) return empty;
    throw error;
  }
}

/** A repo's milestones with issue counts, or its implicit "All issues" milestone if it has none. */
export async function readMilestones(
  api: GithubApi,
  fullName: string,
): Promise<OrderedMilestone[]> {
  const milestones = await orEmpty(() => api.listMilestones(fullName), []);
  const issues =
    milestones.length > 0
      ? { open: 0, closed: 0 }
      : await orEmpty(() => api.countIssues(fullName), { open: 0, closed: 0 });
  return orderMilestones(milestones, issues);
}
