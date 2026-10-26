import { DISCOVERED_HEADING, taskKey, type ParsedTask, type ParsedTasks } from "./tasks-md";

/**
 * Who wins when a repo's `TASKS.md` and its GitHub Project disagree (Phase 5). Pure code: it
 * reads two descriptions and says what to do, and touches neither GitHub nor the file.
 *
 * 1. The Project wins on title, Status, milestone and order.
 * 2. A task line added to `TASKS.md` that the Project does not have is imported (additions only).
 * 3. A tick, rename, move or removal made by editing `TASKS.md` is ignored, put back by the next
 *    generation, and reported as drift.
 * 4. Nothing is deleted from GitHub and nothing is reopened.
 */

/** One task as the Project holds it. `key` is the hidden key in the issue, or `taskKey(...)`. */
export interface ProjectTask {
  key: string;
  title: string;
  /** The full task text, as it is written in the file. */
  text: string;
  /** The issue is closed, or its Status is Done. */
  done: boolean;
}

export interface ProjectMilestone {
  title: string;
  description: string;
  tasks: ProjectTask[];
}

/** The Project's tasks in the Project's own order. `loose` tasks belong to no milestone. */
export interface ProjectState {
  milestones: ProjectMilestone[];
  loose: ProjectTask[];
}

export interface ImportTask {
  /** The milestone to put it in; null for a task that belongs to none. */
  milestone: string | null;
  title: string;
  text: string;
  key: string;
  /** Only ever true when onboarding, so a closed task in the file stays closed. */
  done: boolean;
}

export type DriftKind =
  "ticked_in_file" | "unticked_in_file" | "removed_from_file" | "renamed_in_file" | "moved_in_file";

export interface Drift {
  kind: DriftKind;
  /** The task as the Project has it. */
  key: string;
  title: string;
  /** What the file said instead, when it said something (a rename). */
  fileText?: string;
}

/** What `TASKS.md` should say after the sync: the Project's truth plus the imports as open tasks. */
export interface GeneratedPlan {
  milestones: { title: string; description: string; tasks: GeneratedTask[] }[];
  discovered: GeneratedTask[];
}

export interface GeneratedTask {
  key: string;
  text: string;
  done: boolean;
}

export interface Reconciliation {
  /** New tasks to create on GitHub and add to the Project. */
  imports: ImportTask[];
  /** Milestones named in the file that do not exist yet; the imports under them need them. */
  newMilestones: { title: string; description: string }[];
  /** Differences that were ignored. The daily job turns these into a nudge. */
  drift: Drift[];
  generated: GeneratedPlan;
}

export interface ReconcileOptions {
  /**
   * `onboard`: the file is the starting point, so a new line keeps its tick (a ticked line becomes
   * a closed task). `sync` (default): the Project is the truth, so a new line always arrives open.
   */
  mode?: "onboard" | "sync";
}

/** The least word overlap, from 0 to 1, for a missing task and a new line to count as one task. */
export const SAME_TASK = 0.6;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/** Share of words two texts have in common (Jaccard), used only to tell a rename from an add. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared);
}

interface FileTask extends ParsedTask {
  milestone: string | null;
}

function fileTasks(file: ParsedTasks): FileTask[] {
  return [
    ...file.milestones.flatMap((m) => m.tasks.map((t) => ({ ...t, milestone: m.title }))),
    ...file.discovered.map((t) => ({ ...t, milestone: null })),
  ];
}

interface HeldTask extends ProjectTask {
  milestone: string | null;
}

function heldTasks(project: ProjectState): HeldTask[] {
  return [
    ...project.milestones.flatMap((m) => m.tasks.map((t) => ({ ...t, milestone: m.title }))),
    ...project.loose.map((t) => ({ ...t, milestone: null })),
  ];
}

export function reconcile(
  file: ParsedTasks,
  project: ProjectState,
  options: ReconcileOptions = {},
): Reconciliation {
  const onboarding = options.mode === "onboard";
  const inFile = fileTasks(file);
  const held = heldTasks(project);
  const heldByKey = new Map(held.map((t) => [t.key, t]));
  const fileKeys = new Set(inFile.map((t) => t.key));

  const drift: Drift[] = [];

  // Tasks both sides know: the Project's version stands; a different tick is drift.
  for (const t of inFile) {
    const mine = heldByKey.get(t.key);
    if (!mine) continue;
    if (t.done && !mine.done) {
      drift.push({ kind: "ticked_in_file", key: mine.key, title: mine.title });
    } else if (!t.done && mine.done) {
      drift.push({ kind: "unticked_in_file", key: mine.key, title: mine.title });
    }
  }

  // Lines the Project lacks, and tasks the file lacks: an add and a removal that look alike are
  // really one task that was renamed or moved, so neither is imported.
  const newLines = inFile.filter((t) => !heldByKey.has(t.key));
  const missing = held.filter((t) => !fileKeys.has(t.key));
  const claimed = new Set<string>();
  const renamedLines = new Set<string>();

  for (const line of newLines) {
    let best: { task: HeldTask; score: number } | null = null;
    for (const task of missing) {
      if (claimed.has(task.key)) continue;
      const score = similarity(line.text, task.text);
      const sameMilestone = line.milestone === task.milestone;
      const better =
        !best ||
        score > best.score ||
        (score === best.score && sameMilestone && best.task.milestone !== line.milestone);
      if (score >= SAME_TASK && better) best = { task, score };
    }
    if (!best) continue;
    claimed.add(best.task.key);
    renamedLines.add(line.key);
    const sameText = line.text.trim() === best.task.text.trim();
    drift.push({
      kind: sameText ? "moved_in_file" : "renamed_in_file",
      key: best.task.key,
      title: best.task.title,
      ...(sameText ? {} : { fileText: line.text }),
    });
  }

  for (const task of missing) {
    if (!claimed.has(task.key)) {
      drift.push({ kind: "removed_from_file", key: task.key, title: task.title });
    }
  }

  const known = new Set(project.milestones.map((m) => m.title));
  const fileMilestones = new Map(file.milestones.map((m) => [m.title, m]));
  const imports: ImportTask[] = [];
  const newMilestones: Reconciliation["newMilestones"] = [];
  for (const line of newLines) {
    if (renamedLines.has(line.key)) continue;
    if (line.milestone !== null && !known.has(line.milestone)) {
      if (!newMilestones.some((m) => m.title === line.milestone)) {
        newMilestones.push({
          title: line.milestone,
          description: fileMilestones.get(line.milestone)?.description ?? "",
        });
      }
    }
    if (line.done && !onboarding) {
      drift.push({ kind: "ticked_in_file", key: line.key, title: line.title });
    }
    imports.push({
      milestone: line.milestone,
      title: line.title,
      text: line.text,
      key: line.key,
      done: onboarding && line.done,
    });
  }

  const generated: GeneratedPlan = {
    milestones: project.milestones.map((m) => ({
      title: m.title,
      description: m.description,
      tasks: [
        ...m.tasks.map((t) => ({ key: t.key, text: t.text, done: t.done })),
        ...imports
          .filter((i) => i.milestone === m.title)
          .map((i) => ({ key: i.key, text: i.text, done: i.done })),
      ],
    })),
    discovered: [
      ...project.loose.map((t) => ({ key: t.key, text: t.text, done: t.done })),
      ...imports
        .filter((i) => i.milestone === null)
        .map((i) => ({ key: i.key, text: i.text, done: i.done })),
    ],
  };
  for (const m of newMilestones) {
    generated.milestones.push({
      title: m.title,
      description: m.description,
      tasks: imports
        .filter((i) => i.milestone === m.title)
        .map((i) => ({ key: i.key, text: i.text, done: i.done })),
    });
  }

  return { imports, newMilestones, drift, generated };
}

/**
 * The key the Project uses for a task it created from the app (or any issue with no hidden key):
 * the same one the file parser gives the same line, so the two sides agree about it.
 */
export function keyForNewTask(milestone: string | null, text: string): string {
  return taskKey(milestone ?? DISCOVERED_HEADING, text);
}
