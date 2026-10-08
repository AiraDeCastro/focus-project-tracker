import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects, settings, type ProjectRow, type SettingsRow } from "@/db/schema";
import type { GithubApi } from "./github/api";

/** Returns the single settings row, creating it with defaults on first use. */
export async function ensureSettings(db: Db): Promise<SettingsRow> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

export interface SyncResult {
  added: number;
  updated: number;
}

/**
 * Copies the owner's GitHub repos into the projects table. New repos start as `backlog`.
 * Existing rows keep their status, deploy details and dates; only GitHub-owned fields change.
 * Every repo is stored, forks and archived ones included; the Settings flags only hide them
 * from the dashboard, so turning a flag off later needs no re-sync.
 */
export async function syncProjects(
  db: Db,
  api: GithubApi,
  now: Date = new Date(),
): Promise<SyncResult> {
  const repos = await api.listRepos();
  if (repos.length === 0) return { added: 0, updated: 0 };

  const known = await db
    .select({ repoId: projects.repoId })
    .from(projects)
    .where(
      inArray(
        projects.repoId,
        repos.map((r) => r.repoId),
      ),
    );
  const knownIds = new Set(known.map((k) => k.repoId));
  const syncedAt = now.toISOString();

  for (const r of repos) {
    await db
      .insert(projects)
      .values({
        repoId: r.repoId,
        fullName: r.fullName,
        name: r.name,
        htmlUrl: r.htmlUrl,
        isFork: r.isFork,
        isArchived: r.isArchived,
        lastSyncedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: projects.repoId,
        set: {
          fullName: r.fullName,
          name: r.name,
          htmlUrl: r.htmlUrl,
          isFork: r.isFork,
          isArchived: r.isArchived,
          lastSyncedAt: syncedAt,
        },
      });
  }

  const added = repos.filter((r) => !knownIds.has(r.repoId)).length;
  return { added, updated: repos.length - added };
}

/** Projects the dashboard should show, honouring the hide-forks and hide-archived settings. */
export async function listVisibleProjects(db: Db): Promise<ProjectRow[]> {
  const s = await ensureSettings(db);
  const all = await db.select().from(projects);
  return all.filter((p) => !(s.hideForks && p.isFork) && !(s.hideArchived && p.isArchived));
}

/** The project that currently has focus, if any. */
export async function getFocusProject(db: Db): Promise<ProjectRow | undefined> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.status, "focus")));
  return row;
}
