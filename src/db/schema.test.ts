import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client";
import { milestoneSnapshots, projects, settings } from "./schema";

let db: Db;

function eqRepo(id: number) {
  return eq(projects.repoId, id);
}

function repo(repoId: number, status: "focus" | "backlog" | "paused" = "backlog") {
  return {
    repoId,
    fullName: `me/repo-${repoId}`,
    name: `repo-${repoId}`,
    htmlUrl: `https://github.com/me/repo-${repoId}`,
    status,
  };
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("projects table", () => {
  it("defaults new projects to backlog and needing a deploy", async () => {
    await db.insert(projects).values(repo(1));
    const [row] = await db.select().from(projects);
    expect(row.status).toBe("backlog");
    expect(row.needsDeploy).toBe(true);
    expect(row.isFork).toBe(false);
  });

  it("allows many non-focus projects", async () => {
    await db.insert(projects).values([repo(1), repo(2, "paused"), repo(3, "paused")]);
    expect(await db.select().from(projects)).toHaveLength(3);
  });

  it("rejects a second focus project", async () => {
    await db.insert(projects).values(repo(1, "focus"));
    await expect(db.insert(projects).values(repo(2, "focus"))).rejects.toThrow();
  });

  it("rejects switching a second project to focus without freeing the first", async () => {
    await db.insert(projects).values([repo(1, "focus"), repo(2)]);
    await expect(db.update(projects).set({ status: "focus" }).where(eqRepo(2))).rejects.toThrow();
  });

  it("allows focus again once the previous focus project leaves focus", async () => {
    await db.insert(projects).values([repo(1, "focus"), repo(2)]);
    await db.update(projects).set({ status: "paused" }).where(eqRepo(1));
    await db.update(projects).set({ status: "focus" }).where(eqRepo(2));
    const focus = (await db.select().from(projects)).filter((p) => p.status === "focus");
    expect(focus.map((p) => p.repoId)).toEqual([2]);
  });
});

describe("milestone snapshots", () => {
  it("keeps one row per repo, milestone and day", async () => {
    await db.insert(projects).values(repo(1));
    const snap = {
      repoId: 1,
      milestoneNumber: 1,
      milestoneTitle: "MVP",
      snapshotDate: "2026-10-08",
      openCount: 3,
      closedCount: 7,
      percentComplete: 70,
    };
    await db.insert(milestoneSnapshots).values(snap);
    await expect(db.insert(milestoneSnapshots).values(snap)).rejects.toThrow();
    await db.insert(milestoneSnapshots).values({ ...snap, snapshotDate: "2026-10-09" });
  });
});

describe("settings", () => {
  it("defaults to a 7 day stall threshold and hiding forks and archived repos", async () => {
    await db.insert(settings).values({});
    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({
      id: 1,
      stallDays: 7,
      awayUntil: null,
      notificationChannel: "email",
      hideForks: true,
      hideArchived: true,
    });
  });
});
