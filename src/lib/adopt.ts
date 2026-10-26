import type { RepoIssue } from "./github/repo-writes";
import { SAME_TASK, similarity, type ImportTask } from "./truth";

/**
 * Finds the issue an import line already has, when the line was reworded after an earlier sync made
 * the issue (Phase 5). Issues are found by a hidden key made from the task's text, so a reworded
 * line has a new key and would otherwise get a second issue, leaving the old one open beside it.
 *
 * A line adopts an existing issue only when all of this holds, so a wrong match is unlikely:
 * - the issue was made by the sync (it has a key) and is not in the Project yet;
 * - its key belongs to no line being imported (it is an orphan: its own line is gone);
 * - it sits in the same milestone as the line (or neither has one);
 * - its text is similar enough (the same test the conflict rules use for a rename);
 * - no other line fits it better, and each issue is adopted at most once.
 *
 * Pure: it only reads, so a preview and the real import give the same answer.
 */
export function matchOrphanIssues(input: {
  imports: ImportTask[];
  issues: RepoIssue[];
  /** Milestone title to its number on GitHub, for the milestones that exist. */
  milestoneNumbers: Map<string, number>;
  /** Node ids of the issues already in the Project. */
  inProject: Set<string>;
}): Map<string, RepoIssue> {
  const importKeys = new Set(input.imports.map((i) => i.key));
  const issueKeys = new Set(input.issues.flatMap((i) => (i.key ? [i.key] : [])));
  const orphans = input.issues.filter(
    (i) => i.key !== null && !importKeys.has(i.key) && !input.inProject.has(i.nodeId),
  );
  if (orphans.length === 0) return new Map();

  const pairs: { task: ImportTask; issue: RepoIssue; score: number }[] = [];
  for (const task of input.imports) {
    if (issueKeys.has(task.key)) continue; // it already has its own issue
    const milestone =
      task.milestone === null ? null : (input.milestoneNumbers.get(task.milestone) ?? null);
    if (task.milestone !== null && milestone === null) continue; // its milestone does not exist yet
    for (const issue of orphans) {
      if (issue.milestone !== milestone) continue;
      const score = similarity(task.text, issue.text);
      if (score >= SAME_TASK) pairs.push({ task, issue, score });
    }
  }
  // Best matches first, so a good match is never taken by a worse one.
  pairs.sort((a, b) => b.score - a.score);

  const adopted = new Map<string, RepoIssue>();
  const taken = new Set<number>();
  for (const { task, issue } of pairs) {
    if (adopted.has(task.key) || taken.has(issue.number)) continue;
    adopted.set(task.key, issue);
    taken.add(issue.number);
  }
  return adopted;
}
