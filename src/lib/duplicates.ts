import type { ProjectsApi } from "./github/projects";
import type { RepoIssue, RepoWriter } from "./github/repo-writes";
import { SAME_TASK, similarity } from "./truth";

/**
 * The close-only duplicate helper (Phase 5). When a task line was reworded after an earlier sync,
 * the old issue can be left open beside the new one that is in the Project. This finds those old
 * issues and, after the owner confirms, closes them as "not planned". It only closes: it never
 * deletes, never reopens, never edits, and never touches an issue in the Project.
 *
 * An issue is a likely duplicate only when all of this holds:
 * - it is open, was made by the sync (has a key) and is not in the Project;
 * - an issue that IS in the Project sits in the same milestone (or neither has one) with
 *   similar text (the same 0.6 test the rename rules use). An identical copy made by a repeated
 *   run counts too.
 *
 * The same pure function decides what to show and what may be closed, so a confirmation can never
 * close more than was shown.
 */

export interface DuplicatePair {
  duplicate: RepoIssue;
  /** The issue in the Project it repeats. */
  of: RepoIssue;
  score: number;
}

export function findDuplicates(input: {
  issues: RepoIssue[];
  /** Node ids of the issues in the Project. */
  inProject: Set<string>;
}): DuplicatePair[] {
  const kept = input.issues.filter((i) => input.inProject.has(i.nodeId));
  const candidates = input.issues.filter(
    (i) => i.state === "open" && i.key !== null && !input.inProject.has(i.nodeId),
  );
  const pairs: DuplicatePair[] = [];
  for (const duplicate of candidates) {
    let best: DuplicatePair | null = null;
    for (const of of kept) {
      if (of.milestone !== duplicate.milestone) continue;
      const score = similarity(duplicate.text, of.text);
      if (score >= SAME_TASK && (!best || score > best.score)) best = { duplicate, of, score };
    }
    if (best) pairs.push(best);
  }
  return pairs.sort((a, b) => a.duplicate.number - b.duplicate.number);
}

/** The most closes in one call, so one confirmation cannot become a long run of writes. */
export const MAX_CLOSES = 25;

export interface DuplicateDeps {
  writer: RepoWriter;
  projects: ProjectsApi;
  fullName: string;
  /** The Project's node id (the repo must be connected to one). */
  projectId: string;
}

async function load(deps: DuplicateDeps): Promise<DuplicatePair[]> {
  const [issues, listed] = await Promise.all([
    deps.writer.listIssues(deps.fullName),
    deps.projects.listItems(deps.projectId),
  ]);
  return findDuplicates({ issues, inProject: new Set(listed.items.map((i) => i.issueId)) });
}

/** What would be closed. Writes nothing. */
export async function previewDuplicates(deps: DuplicateDeps): Promise<DuplicatePair[]> {
  return load(deps);
}

export interface CloseDuplicatesResult {
  closed: number[];
  /** Asked for, but no longer a duplicate (or not one at all), so left alone. */
  skipped: number[];
  /** Duplicates still open because of the cap; run it again. */
  remaining: number;
}

/**
 * Closes the confirmed issues, but only those that are still duplicates right now: the list is
 * worked out again here, and a number that is not on it is skipped, so no issue can be closed that
 * the preview would not have shown.
 */
export async function closeDuplicates(
  deps: DuplicateDeps,
  confirmed: number[],
): Promise<CloseDuplicatesResult> {
  const fresh = await load(deps);
  const allowed = new Map(fresh.map((p) => [p.duplicate.number, p]));
  const wanted = [...new Set(confirmed)].filter((n) => Number.isInteger(n) && n > 0);
  const skipped = wanted.filter((n) => !allowed.has(n));
  const toClose = wanted.filter((n) => allowed.has(n));
  const batch = toClose.slice(0, MAX_CLOSES);
  const closed: number[] = [];
  for (const number of batch) {
    await deps.writer.closeIssue(deps.fullName, number, "not_planned");
    closed.push(number);
  }
  return { closed, skipped, remaining: toClose.length - batch.length };
}
