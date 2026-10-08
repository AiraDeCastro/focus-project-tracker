import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";

/**
 * Marks or unmarks a project as high priority. Returns false when no project has that name,
 * so the caller can tell the owner instead of silently doing nothing. Repo names are unique
 * because the app only reads repos the owner owns.
 */
export async function setHighPriority(db: Db, name: string, value: boolean): Promise<boolean> {
  const updated = await db
    .update(projects)
    .set({ highPriority: value })
    .where(eq(projects.name, name))
    .returning({ repoId: projects.repoId });
  return updated.length > 0;
}

/**
 * Dashboard order: the focus project first, then high priority projects, then the rest.
 * Each group keeps its incoming order.
 */
export function sortByPriority<T extends { status: string; highPriority: boolean }>(
  items: T[],
): T[] {
  const rank = (p: T) => (p.status === "focus" ? 0 : p.highPriority ? 1 : 2);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map((x) => x.item);
}
