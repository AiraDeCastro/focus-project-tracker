import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";
import type { ProjectKind } from "./project-kind";

export type KindError = "not_found" | "is_focus";

export type KindResult = { ok: true } | { ok: false; error: KindError };

export const KIND_ERROR_MESSAGES: Record<KindError, string> = {
  not_found: "That project was not found.",
  is_focus:
    "This is your focus project. Switch your focus to another project first, then change its type.",
};

/**
 * Sets what kind of work a repo is. Practice and school work never take focus, so the project
 * that currently has focus cannot be changed to one of them; that would leave the dashboard
 * focused on something that is not allowed to be focused.
 */
export async function setKind(db: Db, name: string, kind: ProjectKind): Promise<KindResult> {
  const [target] = await db.select().from(projects).where(eq(projects.name, name));
  if (!target) return { ok: false, error: "not_found" };
  if (target.kind === kind) return { ok: true };
  if (kind !== "project" && target.status === "focus") return { ok: false, error: "is_focus" };

  await db.update(projects).set({ kind }).where(eq(projects.repoId, target.repoId));
  return { ok: true };
}
