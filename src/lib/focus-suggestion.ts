import { percentComplete } from "./progress";
import type { Project } from "./types";

/** Statuses that can take focus. Deployed and finished projects are done. */
export function canTakeFocus(project: Pick<Project, "status">): boolean {
  return project.status === "backlog" || project.status === "paused";
}

/**
 * The project to suggest when nothing has focus. High priority projects come first, and among
 * those the one closest to done, because finishing something is the goal. Projects with no
 * issues yet are never suggested ahead of one that has work in it. Ties keep the incoming order.
 */
export function suggestFocus(projects: Project[]): Project | undefined {
  const candidates = projects.filter(canTakeFocus);
  const hasWork = (p: Project) => p.milestones.some((m) => m.total > 0);
  const rank = (p: Project) => (p.highPriority ? 0 : 1) * 2 + (hasWork(p) ? 0 : 1);
  return candidates
    .map((p, index) => ({ p, index }))
    .sort(
      (a, b) =>
        rank(a.p) - rank(b.p) || percentComplete(b.p) - percentComplete(a.p) || a.index - b.index,
    )
    .map((x) => x.p)[0];
}
