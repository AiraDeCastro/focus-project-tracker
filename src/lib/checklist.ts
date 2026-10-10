import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { doneChecklistItems, projects } from "@/db/schema";
import {
  CHECKLIST_MAX_ITEMS,
  SUGGESTED_CHECKLIST,
  cleanLabel,
  type ChecklistError,
} from "./checklist-rules";
import type { ChecklistItem } from "./types";

type Fail = { ok: false; error: ChecklistError };

function toItem(row: typeof doneChecklistItems.$inferSelect): ChecklistItem {
  return { id: row.id, label: row.label, checked: row.checked };
}

/** Every project's checklist, in the order the owner arranged it, keyed by repo id. */
export async function loadChecklists(db: Db): Promise<Map<number, ChecklistItem[]>> {
  const rows = await db
    .select()
    .from(doneChecklistItems)
    .orderBy(asc(doneChecklistItems.sortOrder), asc(doneChecklistItems.id));
  const byRepo = new Map<number, ChecklistItem[]>();
  for (const row of rows) {
    const list = byRepo.get(row.repoId) ?? [];
    list.push(toItem(row));
    byRepo.set(row.repoId, list);
  }
  return byRepo;
}

async function findProject(db: Db, name: string) {
  const [project] = await db.select().from(projects).where(eq(projects.name, name));
  return project;
}

/** Adds an item to the end of a project's checklist. */
export async function addChecklistItem(
  db: Db,
  projectName: string,
  label: unknown,
): Promise<{ ok: true; item: ChecklistItem } | Fail> {
  const clean = cleanLabel(label);
  if (!clean) return { ok: false, error: "invalid_label" };
  const project = await findProject(db, projectName);
  if (!project) return { ok: false, error: "not_found" };

  const existing = await db
    .select()
    .from(doneChecklistItems)
    .where(eq(doneChecklistItems.repoId, project.repoId));
  if (existing.length >= CHECKLIST_MAX_ITEMS) return { ok: false, error: "too_many" };

  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
  const [row] = await db
    .insert(doneChecklistItems)
    .values({ repoId: project.repoId, label: clean, sortOrder: next })
    .returning();
  return { ok: true, item: toItem(row) };
}

/** Adds the suggested items, but only to an empty list, so it never duplicates the owner's own. */
export async function addSuggestedChecklist(
  db: Db,
  projectName: string,
): Promise<{ ok: true; items: ChecklistItem[] } | Fail> {
  const project = await findProject(db, projectName);
  if (!project) return { ok: false, error: "not_found" };
  const existing = await db
    .select()
    .from(doneChecklistItems)
    .where(eq(doneChecklistItems.repoId, project.repoId));
  if (existing.length > 0) return { ok: false, error: "not_empty" };

  const rows = await db
    .insert(doneChecklistItems)
    .values(
      SUGGESTED_CHECKLIST.map((label, i) => ({ repoId: project.repoId, label, sortOrder: i })),
    )
    .returning();
  return { ok: true, items: rows.map(toItem) };
}

export async function setChecklistChecked(
  db: Db,
  id: number,
  checked: boolean,
): Promise<{ ok: true } | Fail> {
  const rows = await db
    .update(doneChecklistItems)
    .set({ checked })
    .where(eq(doneChecklistItems.id, id))
    .returning();
  return rows.length ? { ok: true } : { ok: false, error: "not_found" };
}

export async function removeChecklistItem(db: Db, id: number): Promise<{ ok: true } | Fail> {
  const rows = await db.delete(doneChecklistItems).where(eq(doneChecklistItems.id, id)).returning();
  return rows.length ? { ok: true } : { ok: false, error: "not_found" };
}
