import type { ProjectRef, ProjectsApi } from "./github/projects";

/**
 * Makes sure a repo has a GitHub Project (Phase 5): finds the existing one first, by title and
 * repo, and creates one only when there is none, so running it twice never makes two. A new
 * Project is named after the repo and linked to it. An existing Project that was found only by
 * its title is linked to the repo, which only adds a link.
 *
 * It never edits a Project's fields. GitHub gives a new Project a Status field with Todo,
 * In Progress and Done; this only checks that the options the importer needs (Todo and Done) are
 * there and says which are missing, so a human edit to the board is never overwritten.
 */

/** The Status options the importer sets. "In progress" is nice to have and is not required. */
export const REQUIRED_STATUS_OPTIONS = ["Todo", "Done"] as const;

export type StatusCheck = { ok: true } | { ok: false; missing: string[] };

export type EnsureResult =
  | { action: "found"; project: ProjectRef; linked: boolean; status: StatusCheck }
  | { action: "created"; project: ProjectRef; status: StatusCheck }
  /** A dry run found no Project. Nothing was written. */
  | { action: "would_create"; title: string };

export interface EnsureDeps {
  projects: ProjectsApi;
  fullName: string;
  /** False (the default) reports what would happen and writes nothing. */
  apply?: boolean;
}

/** Checks a Project's Status field for the options the importer needs. */
export async function checkStatus(projects: ProjectsApi, projectId: string): Promise<StatusCheck> {
  const field = await projects.statusField(projectId);
  if (!field) return { ok: false, missing: ["a Status field"] };
  const have = new Set(field.options.map((o) => o.name.toLowerCase()));
  const missing = REQUIRED_STATUS_OPTIONS.filter((name) => !have.has(name.toLowerCase()));
  return missing.length === 0 ? { ok: true } : { ok: false, missing: [...missing] };
}

export async function ensureProject(deps: EnsureDeps): Promise<EnsureResult> {
  const { projects, fullName } = deps;
  const apply = deps.apply === true;
  const title = fullName.split("/")[1];
  if (!title) throw new Error(`Expected "owner/name", got "${fullName}"`);

  const existing = await projects.findProject(fullName);
  if (existing) {
    let linked = existing.linked;
    if (!linked && apply) {
      await projects.linkProject(existing.id, await projects.repositoryId(fullName));
      linked = true;
    }
    return {
      action: "found",
      project: { ...existing, linked },
      linked,
      status: await checkStatus(projects, existing.id),
    };
  }

  if (!apply) return { action: "would_create", title };

  const [viewer, repositoryId] = await Promise.all([
    projects.viewer(),
    projects.repositoryId(fullName),
  ]);
  const project = await projects.createProject({ ownerId: viewer.id, repositoryId, title });
  return { action: "created", project, status: await checkStatus(projects, project.id) };
}
