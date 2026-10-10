import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { milestoneSnapshots } from "@/db/schema";
import type { GithubApi, GithubMilestone, GithubRepo } from "./github/api";
import { runDailySnapshot } from "./snapshot-job";

let db: Db;

const NOW = new Date("2026-10-10T06:00:00Z");

function repo(id: number, extra: Partial<GithubRepo> = {}): GithubRepo {
  return {
    repoId: id,
    fullName: `me/repo-${id}`,
    name: `repo-${id}`,
    htmlUrl: `https://github.com/me/repo-${id}`,
    isFork: false,
    isArchived: false,
    pushedAt: "2026-10-06T10:00:00Z",
    ...extra,
  };
}

function milestone(number: number, open: number, closed: number): GithubMilestone {
  return { number, title: `M${number}`, dueOn: null, openIssues: open, closedIssues: closed };
}

function fakeApi(opts: {
  repos: GithubRepo[];
  milestones?: Record<string, GithubMilestone[]>;
  issueCounts?: Record<string, { open: number; closed: number }>;
  failing?: string[];
  gone?: string[];
}): GithubApi {
  return {
    listRepos: vi.fn(async () => opts.repos),
    listMilestones: vi.fn(async (name: string) => {
      if (opts.failing?.includes(name)) throw new Error("boom");
      if (opts.gone?.includes(name)) throw Object.assign(new Error("gone"), { status: 410 });
      return opts.milestones?.[name] ?? [];
    }),
    countIssues: vi.fn(async (name: string) => opts.issueCounts?.[name] ?? { open: 0, closed: 0 }),
    lastClosedAt: vi.fn(async () => null),
    openIssues: vi.fn(async () => []),
    closedSince: vi.fn(async () => []),
    listIssues: vi.fn(async () => []),
  };
}

const run = (api: GithubApi) => runDailySnapshot({ db, api, now: () => NOW });

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("runDailySnapshot", () => {
  it("stores today's counts per milestone, with an implicit milestone for repos without any", async () => {
    const api = fakeApi({
      repos: [repo(1), repo(2)],
      milestones: { "me/repo-1": [milestone(3, 2, 6)] },
      issueCounts: { "me/repo-2": { open: 3, closed: 1 } },
    });
    const result = await run(api);
    expect(result).toEqual({ date: "2026-10-10", repos: 2, failed: [] });

    const rows = await db.select().from(milestoneSnapshots);
    expect(rows).toHaveLength(2);
    const one = rows.find((r) => r.repoId === 1)!;
    expect(one).toMatchObject({
      milestoneNumber: 3,
      snapshotDate: "2026-10-10",
      openCount: 2,
      closedCount: 6,
      percentComplete: 75,
    });
    const two = rows.find((r) => r.repoId === 2)!;
    expect(two).toMatchObject({ milestoneNumber: 0, openCount: 3, closedCount: 1 });
  });

  it("running twice on the same day replaces the rows instead of duplicating them", async () => {
    const first = fakeApi({ repos: [repo(1)], milestones: { "me/repo-1": [milestone(3, 4, 1)] } });
    await run(first);
    const second = fakeApi({ repos: [repo(1)], milestones: { "me/repo-1": [milestone(3, 1, 4)] } });
    await run(second);

    const rows = await db.select().from(milestoneSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ closedCount: 4, openCount: 1, percentComplete: 80 });
  });

  it("reports a repo it cannot read and still snapshots the others", async () => {
    const api = fakeApi({
      repos: [repo(1), repo(2), repo(3)],
      milestones: { "me/repo-1": [milestone(1, 0, 2)], "me/repo-3": [milestone(1, 1, 1)] },
      failing: ["me/repo-2"],
    });
    const result = await run(api);
    expect(result.failed).toEqual(["me/repo-2"]);
    expect(result.repos).toBe(2);
    const rows = await db.select().from(milestoneSnapshots);
    expect(rows.map((r) => r.repoId).sort()).toEqual([1, 3]);
  });

  it("rebuilds past history on a repo's first run only", async () => {
    const api = fakeApi({ repos: [repo(1)], milestones: { "me/repo-1": [milestone(3, 1, 1)] } });
    vi.mocked(api.listIssues).mockResolvedValue([
      {
        number: 1,
        milestone: 3,
        createdAt: "2026-09-01T10:00:00Z",
        closedAt: "2026-09-04T10:00:00Z",
      },
      { number: 2, milestone: 3, createdAt: "2026-09-02T10:00:00Z", closedAt: null },
    ]);
    await run(api);
    await run(api);

    expect(api.listIssues).toHaveBeenCalledTimes(1);
    const dates = (await db.select().from(milestoneSnapshots)).map((r) => r.snapshotDate).sort();
    expect(dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-04", "2026-10-10"]);
  });

  it("treats a repo with issues turned off as empty rather than a failure", async () => {
    const api = fakeApi({ repos: [repo(1)], gone: ["me/repo-1"] });
    const result = await run(api);
    expect(result.failed).toEqual([]);
    expect(await db.select().from(milestoneSnapshots)).toHaveLength(0);
  });

  it("skips forks and archived repos, which the dashboard hides by default", async () => {
    const api = fakeApi({
      repos: [repo(1), repo(2, { isFork: true }), repo(3, { isArchived: true })],
      milestones: {
        "me/repo-1": [milestone(1, 1, 1)],
        "me/repo-2": [milestone(1, 1, 1)],
        "me/repo-3": [milestone(1, 1, 1)],
      },
    });
    const result = await run(api);
    expect(result.repos).toBe(1);
    const rows = await db.select().from(milestoneSnapshots);
    expect(rows.map((r) => r.repoId)).toEqual([1]);
  });
});
