import type { Project } from "./types";

export interface Totals {
  closed: number;
  total: number;
  open: number;
}

/**
 * Issue totals for a project. `extraClosed` counts issues closed since the data was loaded;
 * they are applied to the first milestone that still has open issues, then the next.
 */
export function totals(project: Project, extraClosed = 0): Totals {
  let closed = 0;
  let total = 0;
  for (const m of project.milestones) {
    closed += m.closed;
    total += m.total;
  }
  const open = total - closed;
  const applied = Math.min(Math.max(extraClosed, 0), open);
  return { closed: closed + applied, total, open: open - applied };
}

/** Whole-number percent of issues closed. A project with no issues is 0. */
export function percentComplete(project: Project, extraClosed = 0): number {
  const t = totals(project, extraClosed);
  return t.total === 0 ? 0 : Math.round((t.closed / t.total) * 100);
}

/** Index of the current milestone: the first with open issues, else the last one. */
export function currentMilestoneIndex(project: Project, extraClosed = 0): number {
  let spare = Math.max(extraClosed, 0);
  for (let i = 0; i < project.milestones.length; i++) {
    const m = project.milestones[i];
    const open = m.total - m.closed;
    if (open > spare) return i;
    spare -= open;
  }
  return Math.max(project.milestones.length - 1, 0);
}

/** Closed count for one milestone after applying `extraClosed` in order. */
export function milestoneClosed(project: Project, index: number, extraClosed = 0): number {
  let spare = Math.max(extraClosed, 0);
  for (let i = 0; i < project.milestones.length; i++) {
    const m = project.milestones[i];
    const take = Math.min(m.total - m.closed, spare);
    if (i === index) return m.closed + take;
    spare -= take;
  }
  return 0;
}
