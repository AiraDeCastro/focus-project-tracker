import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";
import { relativeDay } from "./dashboard-utils";

/**
 * A small note on each connected repo about the last check of its `TASKS.md` against its Project
 * (Phase 5), so the repo card can say "in sync, checked yesterday" without asking GitHub. The check
 * itself is always redone from GitHub; this only remembers its answer. A difference is a nudge,
 * never a failure.
 */

export const RECORDED_KINDS = ["in_sync", "lines_to_import", "file_out_of_date", "both"] as const;
export type RecordedKind = (typeof RECORDED_KINDS)[number];

export interface StoredSync {
  kind: RecordedKind;
  /** ISO time of the check. */
  checkedAt: string;
}

export function isRecordedKind(value: unknown): value is RecordedKind {
  return typeof value === "string" && (RECORDED_KINDS as readonly string[]).includes(value);
}

/** Remembers the answer of a check. Anything that is not a recordable answer is ignored. */
export async function recordSyncCheck(
  db: Db,
  repoId: number,
  kind: string,
  now: Date = new Date(),
): Promise<void> {
  if (!isRecordedKind(kind)) return;
  await db
    .update(projects)
    .set({ projectSyncKind: kind, projectCheckedAt: now.toISOString() })
    .where(eq(projects.repoId, repoId));
}

/** The stored note from a project row, or undefined when there is none or it is unreadable. */
export function storedSync(row: {
  projectSyncKind: string | null;
  projectCheckedAt: string | null;
}): StoredSync | undefined {
  if (!isRecordedKind(row.projectSyncKind) || !row.projectCheckedAt) return undefined;
  if (Number.isNaN(Date.parse(row.projectCheckedAt))) return undefined;
  return { kind: row.projectSyncKind, checkedAt: row.projectCheckedAt };
}

const WORDS: Record<RecordedKind, string> = {
  in_sync: "TASKS.md in sync",
  lines_to_import: "TASKS.md has lines the Project lacks",
  file_out_of_date: "TASKS.md out of date",
  both: "TASKS.md differs from the Project",
};

/** The words for a repo card: what the check found and how long ago, in the owner's day. */
export function describeStoredSync(
  sync: StoredSync,
  today: string,
): { label: string; tone: "good" | "note" } {
  return {
    label: `${WORDS[sync.kind]} (checked ${relativeDay(sync.checkedAt, today)})`,
    tone: sync.kind === "in_sync" ? "good" : "note",
  };
}
