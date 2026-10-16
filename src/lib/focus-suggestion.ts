import { percentComplete } from "./progress";
import type { Project } from "./types";

/**
 * Whether a project can take focus: it must be a real project (not practice or school work) that
 * is not already done.
 */
export function canTakeFocus(project: Pick<Project, "status" | "kind">): boolean {
  return (
    project.kind === "project" && (project.status === "backlog" || project.status === "paused")
  );
}

/**
 * The project to suggest when nothing has focus. High priority projects come first, in the order
 * the owner ranked them, even when one has no issues yet. After them, projects that have work in
 * them come before those without, and among those the one closest to done is suggested, because
 * finishing something is the goal. Ties keep the incoming order.
 */
export function suggestFocus(projects: Project[]): Project | undefined {
  const candidates = projects.filter(canTakeFocus);
  const hasWork = (p: Project) => p.milestones.some((m) => m.total > 0);
  // Starred projects come first, in the owner's ranking, whether or not they have issues yet: the
  // owner placed them. Projects with the same place (or none) are split by having work in them,
  // then by being closest to done.
  const group = (p: Project) => (p.highPriority ? 0 : 1);
  const place = (p: Project) => (p.highPriority ? (p.priorityRank ?? Infinity) : 0);
  const best = candidates
    .map((p, index) => ({ p, index }))
    .sort(
      (a, b) =>
        group(a.p) - group(b.p) ||
        place(a.p) - place(b.p) ||
        Number(hasWork(b.p)) - Number(hasWork(a.p)) ||
        percentComplete(b.p) - percentComplete(a.p) ||
        a.index - b.index,
    )
    .map((x) => x.p)[0];
  // With no issues anywhere there is nothing to rank, so recommend nothing unless the owner
  // starred the project. The owner can still pick any project by hand.
  return best && (hasWork(best) || best.highPriority) ? best : undefined;
}
