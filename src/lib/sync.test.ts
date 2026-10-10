import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects, settings } from "@/db/schema";
import type { GithubApi, GithubRepo } from "./github/api";
import { ensureSettings, getFocusProject, listVisibleProjects, syncProjects } from "./sync";

let db: Db;

function ghRepo(id: number, extra: Partial<GithubRepo> = {}): GithubRepo {
  return {
    repoId: id,
    fullName: `me/repo-${id}`,
    name: `repo-${id}`,
    htmlUrl: `https://github.com/me/repo-${id}`,
    isFork: false,
    isArchived: false,
    pushedAt: null,
    ...extra,
  };
}

function apiWith(repos: GithubRepo[]): GithubApi {
  return {
    listRepos: async () => repos,
    listMilestones: async () => [],
    countIssues: async () => ({ open: 0, closed: 0 }),
    lastClosedAt: async () => null,
    openIssues: async () => [],
    closedSince: async () => [],
    listIssues: async () => [],
  };
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("syncProjects", () => {
  it("adds new repos as backlog", async () => {
    const result = await syncProjects(db, apiWith([ghRepo(1), ghRepo(2)]));
    expect(result).toEqual({ added: 2, updated: 0 });
    const rows = await db.select().from(projects);
    expect(rows.map((r) => r.status)).toEqual(["backlog", "backlog"]);
    expect(rows[0].lastSyncedAt).toBeTruthy();
  });

  it("keeps status and deploy details on later syncs but updates GitHub fields", async () => {
    await syncProjects(db, apiWith([ghRepo(1)]));
    await db
      .update(projects)
      .set({ status: "focus", deployedUrl: "https://example.com", needsDeploy: false })
      .where(eq(projects.repoId, 1));

    const result = await syncProjects(
      db,
      apiWith([ghRepo(1, { name: "renamed", isArchived: true })]),
    );
    expect(result).toEqual({ added: 0, updated: 1 });

    const [row] = await db.select().from(projects);
    expect(row).toMatchObject({
      name: "renamed",
      isArchived: true,
      status: "focus",
      deployedUrl: "https://example.com",
      needsDeploy: false,
    });
  });

  it("does nothing when GitHub returns no repos", async () => {
    expect(await syncProjects(db, apiWith([]))).toEqual({ added: 0, updated: 0 });
    expect(await db.select().from(projects)).toHaveLength(0);
  });
});

describe("listVisibleProjects", () => {
  beforeEach(async () => {
    await syncProjects(
      db,
      apiWith([ghRepo(1), ghRepo(2, { isFork: true }), ghRepo(3, { isArchived: true })]),
    );
  });

  it("hides forks and archived repos by default", async () => {
    expect((await listVisibleProjects(db)).map((p) => p.repoId)).toEqual([1]);
  });

  it("shows them again when the settings are turned off", async () => {
    await ensureSettings(db);
    await db.update(settings).set({ hideForks: false, hideArchived: false });
    expect((await listVisibleProjects(db)).map((p) => p.repoId)).toEqual([1, 2, 3]);
  });
});

describe("ensureSettings", () => {
  it("creates defaults once and returns the same row afterwards", async () => {
    const first = await ensureSettings(db);
    const second = await ensureSettings(db);
    expect(first).toEqual(second);
    expect(first.stallDays).toBe(7);
  });
});

describe("getFocusProject", () => {
  it("returns undefined before a focus project is picked", async () => {
    await syncProjects(db, apiWith([ghRepo(1)]));
    expect(await getFocusProject(db)).toBeUndefined();
  });

  it("returns the focus project", async () => {
    await syncProjects(db, apiWith([ghRepo(1), ghRepo(2)]));
    await db.update(projects).set({ status: "focus" }).where(eq(projects.repoId, 2));
    expect((await getFocusProject(db))?.repoId).toBe(2);
  });
});
