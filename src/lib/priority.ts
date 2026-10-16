import { eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";
import { moveInRanking, rankedNames } from "./priority-rules";

/**
 * Marks or unmarks a project as high priority. A newly starred project goes to the bottom of the
 * ranking. Returns false when no project has that name, so the caller can tell the owner instead
 * of silently doing nothing. Repo names are unique because the app only reads repos the owner owns.
 */
export async function setHighPriority(db: Db, name: string, value: boolean): Promise<boolean> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return false;
  if (!value) {
    await db.update(projects).set({ highPriority: 0 }).where(eq(projects.repoId, target.repoId));
    return true;
  }
  if (target.highPriority > 0) return true; // already starred: keep its place
  const [{ top }] = await db
    .select({ top: sql<number>`coalesce(max(${projects.highPriority}), 0)` })
    .from(projects)
    .where(gt(projects.highPriority, 0));
  await db
    .update(projects)
    .set({ highPriority: Math.max(top, 0) + 1 })
    .where(eq(projects.repoId, target.repoId));
  return true;
}

export type MoveResult = { ok: true } | { ok: false; error: "not_found" | "not_starred" };

/**
 * Moves a starred project one place up or down in the ranking and rewrites the places as 1, 2,
 * 3 and so on, which also settles any ties from before ranking existed.
 */
export async function moveHighPriority(
  db: Db,
  name: string,
  direction: "up" | "down",
): Promise<MoveResult> {
  const rows = await db.select().from(projects);
  if (!rows.some((r) => r.name === name)) return { ok: false, error: "not_found" };

  const order = rankedNames(
    rows.map((r) => ({ name: r.name, stored: r.highPriority, tie: r.repoId })),
  );
  // The focus project is shown apart and a finished one is out of the running, so a move steps
  // over them. Practice and school work cannot be starred in the first place.
  const movable = new Set(
    rows
      .filter((r) => r.kind === "project" && ["backlog", "paused"].includes(r.status))
      .map((r) => r.name),
  );
  const next = moveInRanking(order, name, direction, (n) => movable.has(n));
  if (!next) return { ok: false, error: "not_starred" };

  const byName = new Map(rows.map((r) => [r.name, r]));
  const writes = next.flatMap((n, i) => {
    const row = byName.get(n)!;
    return row.highPriority === i + 1
      ? []
      : [
          db
            .update(projects)
            .set({ highPriority: i + 1 })
            .where(eq(projects.repoId, row.repoId)),
        ];
  });
  if (writes.length > 0) await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  return { ok: true };
}

/**
 * Dashboard order: the focus project first, then the starred projects in ranking order, then the
 * rest. Each group keeps its incoming order where nothing else decides.
 */
export function sortByPriority<
  T extends { status: string; highPriority: boolean; priorityRank?: number },
>(items: T[]): T[] {
  const group = (p: T) => (p.status === "focus" ? 0 : p.highPriority ? 1 : 2);
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        group(a.item) - group(b.item) ||
        (a.item.priorityRank ?? 0) - (b.item.priorityRank ?? 0) ||
        a.index - b.index,
    )
    .map((x) => x.item);
}
