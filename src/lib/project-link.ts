import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";

/** A repo's GitHub Project, as remembered by the app (Phase 5). */
export interface ProjectLink {
  /** The number in the Project's address, for example 3 in /users/me/projects/3. */
  number: number;
  /** The Project's GraphQL node id, needed to read and change it. */
  nodeId: string;
}

export type LinkError = "not_found" | "invalid";

export type LinkResult = { ok: true } | { ok: false; error: LinkError };

const MAX_NODE_ID = 100;

/** True for a link that can safely be stored: a positive whole number and a short, non-blank id. */
export function isProjectLink(value: unknown): value is ProjectLink {
  if (typeof value !== "object" || value === null) return false;
  const { number, nodeId } = value as Record<string, unknown>;
  return (
    typeof number === "number" &&
    Number.isInteger(number) &&
    number > 0 &&
    typeof nodeId === "string" &&
    nodeId.trim().length > 0 &&
    nodeId.length <= MAX_NODE_ID
  );
}

/** The Project remembered for a repo, or null when it has not been onboarded (or is half-set). */
export async function getProjectLink(db: Db, repoId: number): Promise<ProjectLink | null> {
  const [row] = await db
    .select({ number: projects.githubProjectNumber, nodeId: projects.githubProjectId })
    .from(projects)
    .where(eq(projects.repoId, repoId));
  if (!row) return null;
  const link = { number: row.number, nodeId: row.nodeId };
  return isProjectLink(link) ? link : null;
}

/** Remembers a repo's Project. Both parts are stored together, so a link is never half-set. */
export async function setProjectLink(
  db: Db,
  repoId: number,
  link: ProjectLink,
): Promise<LinkResult> {
  if (!isProjectLink(link)) return { ok: false, error: "invalid" };
  const [row] = await db
    .update(projects)
    .set({ githubProjectNumber: link.number, githubProjectId: link.nodeId })
    .where(eq(projects.repoId, repoId))
    .returning({ repoId: projects.repoId });
  return row ? { ok: true } : { ok: false, error: "not_found" };
}

/** Forgets a repo's Project (for example after the owner deletes it on GitHub). */
export async function clearProjectLink(db: Db, repoId: number): Promise<LinkResult> {
  const [row] = await db
    .update(projects)
    .set({ githubProjectNumber: null, githubProjectId: null })
    .where(eq(projects.repoId, repoId))
    .returning({ repoId: projects.repoId });
  return row ? { ok: true } : { ok: false, error: "not_found" };
}
