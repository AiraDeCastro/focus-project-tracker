import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { doneChecklistItems, milestoneSnapshots, projects, settings } from "@/db/schema";
import type { GithubApi, GithubMilestone, GithubRepo, OpenIssue } from "../github/api";
import type { VercelProject } from "../deploy-status";
import type { VercelList } from "../vercel";
import { setFocus } from "../focus";
import { createGithubSource } from "./github";

let db: Db;

const NOW = new Date("2026-10-08T15:00:00Z"); // a Thursday

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

function milestone(
  number: number,
  title: string,
  dueOn: string | null,
  open: number,
  closed: number,
): GithubMilestone {
  return { number, title, dueOn, openIssues: open, closedIssues: closed };
}

interface FakeData {
  repos: GithubRepo[];
  milestones?: Record<string, GithubMilestone[]>;
  issueCounts?: Record<string, { open: number; closed: number }>;
  open?: Record<string, OpenIssue[]>;
  closedAt?: Record<string, string[]>;
  lastClosed?: Record<string, string | null>;
}

function fakeApi(d: FakeData) {
  const api = {
    listRepos: vi.fn(async () => d.repos),
    listMilestones: vi.fn(async (name: string) => d.milestones?.[name] ?? []),
    countIssues: vi.fn(async (name: string) => d.issueCounts?.[name] ?? { open: 0, closed: 0 }),
    lastClosedAt: vi.fn(async (name: string) => d.lastClosed?.[name] ?? null),
    openIssues: vi.fn(async (name: string, _m: number | undefined, limit: number) =>
      (d.open?.[name] ?? []).slice(0, limit),
    ),
    closedSince: vi.fn(async (name: string) => d.closedAt?.[name] ?? []),
  };
  return api satisfies GithubApi;
}

function source(api: GithubApi, now: Date = NOW) {
  return createGithubSource({ db, api, ownerName: "Aira", now: () => now });
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

async function setStatus(repoId: number, status: "focus" | "paused" | "deployed") {
  await db.update(projects).set({ status }).where(eq(projects.repoId, repoId));
}

const FOCUS_DATA: FakeData = {
  repos: [repo(1), repo(2, { pushedAt: "2026-09-01T00:00:00Z" }), repo(3, { isFork: true })],
  milestones: {
    "me/repo-1": [
      milestone(7, "Polish", "2026-10-22T07:00:00Z", 4, 5),
      milestone(5, "MVP", "2026-09-10T07:00:00Z", 0, 14),
    ],
  },
  issueCounts: { "me/repo-2": { open: 3, closed: 1 } },
  open: {
    "me/repo-1": [
      { number: 41, title: "Empty state", htmlUrl: "u41" },
      { number: 44, title: "Fix upload", htmlUrl: "u44" },
    ],
  },
  closedAt: {
    "me/repo-1": ["2026-10-05T09:00:00Z", "2026-10-07T12:00:00Z", "2026-10-02T12:00:00Z"],
  },
  lastClosed: { "me/repo-1": "2026-10-07T12:00:00Z" },
};

describe("createGithubSource", () => {
  it("builds the dashboard from GitHub data with the focus project first", async () => {
    const api = fakeApi(FOCUS_DATA);
    // First load creates the project rows, then the owner picks a focus project.
    await source(api).getDashboard();
    await setStatus(2, "paused");
    await setStatus(1, "focus");

    const dash = await source(api).getDashboard();

    expect(dash.isExample).toBe(false);
    expect(dash.ownerName).toBe("Aira");
    expect(dash.today).toBe("2026-10-08");
    expect(dash.weekDates).toHaveLength(13);
    expect(dash.weekDates[10]).toBe("2026-10-08");

    // The fork is hidden by default; focus comes first.
    expect(dash.projects.map((p) => p.id)).toEqual(["repo-1", "repo-2"]);
    const [focus, other] = dash.projects;

    expect(focus.status).toBe("focus");
    expect(focus.milestones).toEqual([
      { name: "MVP", closed: 14, total: 14, due: "Sep 10", dueDate: "2026-09-10" },
      { name: "Polish", closed: 5, total: 9, due: "Oct 22", dueDate: "2026-10-22" },
    ]);
    expect(focus.lastActivity).toBe("yesterday");
    expect(focus.todayTasks).toEqual([
      { number: 41, title: "Empty state", url: "u41" },
      { number: 44, title: "Fix upload", url: "u44" },
    ]);
    expect(focus.series).toHaveLength(11);
    expect(focus.series[10]).toBe(83); // 19 of 23 closed

    expect(other.status).toBe("paused");
    expect(other.lastActivity).toBe("5 weeks ago");
    expect(other.todayTasks).toEqual([]);

    expect(dash.closedPerDay).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(dash.closedDays).toEqual([2, 5, 7]);
    expect(dash.dueDays).toEqual([22]);
    expect(dash.idealEndIndex).toBe(12);
  });

  it("asks for the current milestone's issues by its GitHub number", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api).getDashboard();
    await setStatus(1, "focus");
    await source(api).getDashboard();
    expect(api.openIssues).toHaveBeenCalledWith("me/repo-1", 7, 3);
  });

  it("uses one implicit milestone for a repo without milestones", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api).getDashboard();
    await setStatus(2, "focus");
    const dash = await source(api).getDashboard();
    const focus = dash.projects[0];
    expect(focus.id).toBe("repo-2");
    expect(focus.milestones).toEqual([
      { name: "All issues", closed: 1, total: 4, due: "No due date" },
    ]);
    expect(api.openIssues).toHaveBeenCalledWith("me/repo-2", undefined, 3);
    expect(dash.dueDays).toEqual([]);
  });

  it("works with no focus project: no tasks, no activity", async () => {
    const dash = await source(fakeApi(FOCUS_DATA)).getDashboard();
    expect(dash.projects.every((p) => p.status === "backlog")).toBe(true);
    expect(dash.projects.every((p) => p.todayTasks.length === 0)).toBe(true);
    expect(dash.closedPerDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(dash.closedDays).toEqual([]);
  });

  it("treats a repo with issues turned off as empty instead of failing", async () => {
    const api = fakeApi({ repos: [repo(1)] });
    api.listMilestones.mockRejectedValueOnce(
      Object.assign(new Error("Issues are disabled"), { status: 410 }),
    );
    api.countIssues.mockRejectedValueOnce(Object.assign(new Error("Gone"), { status: 410 }));
    const dash = await source(api).getDashboard();
    expect(dash.projects[0].milestones).toEqual([]);
    expect(dash.projects[0].series[10]).toBe(0);
  });

  it("does not hide real errors", async () => {
    const api = fakeApi({ repos: [repo(1)] });
    api.listMilestones.mockRejectedValue(Object.assign(new Error("Server error"), { status: 500 }));
    await expect(source(api).getDashboard()).rejects.toThrow("Server error");
  });

  it("builds graph history from earlier days and never duplicates a day", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api, new Date("2026-10-01T10:00:00Z")).getDashboard();
    await source(api, NOW).getDashboard();
    await source(api, NOW).getDashboard(); // same day again

    const rows = await db.select().from(milestoneSnapshots).where(eq(milestoneSnapshots.repoId, 1));
    expect(rows.filter((r) => r.snapshotDate === "2026-10-08")).toHaveLength(2); // one per milestone

    const dash = await source(api, NOW).getDashboard();
    const series = dash.projects.find((p) => p.id === "repo-1")!.series;
    expect(series[9]).toBe(83); // Oct 1 snapshot
    expect(series[8]).toBeNull(); // before the first snapshot
    expect(series[10]).toBe(83);
  });

  it("shows hidden repos again when the settings allow it", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api).getDashboard();
    const { settings } = await import("@/db/schema");
    await db.update(settings).set({ hideForks: false });
    const dash = await source(api).getDashboard();
    expect(dash.projects.map((p) => p.id)).toContain("repo-3");
  });

  it("keeps a deployed project visible and labelled", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api).getDashboard();
    await setStatus(2, "deployed");
    const dash = await source(api).getDashboard();
    expect(dash.projects.find((p) => p.id === "repo-2")!.status).toBe("deployed");
  });
});

describe("high priority projects", () => {
  it("carries the flag through and lists focus first, then high priority, then the rest", async () => {
    const api = fakeApi({
      repos: [repo(1), repo(2), repo(3)],
    });
    await source(api).getDashboard();
    await db.update(projects).set({ highPriority: 1 }).where(eq(projects.repoId, 3));
    await setStatus(2, "focus");

    const dash = await source(api).getDashboard();

    expect(dash.projects.map((p) => [p.id, p.status, p.highPriority])).toEqual([
      ["repo-2", "focus", false],
      ["repo-3", "backlog", true],
      ["repo-1", "backlog", false],
    ]);
  });

  it("ranks starred projects by their stored place, ties by repo id", async () => {
    const api = fakeApi({ repos: [repo(1), repo(2), repo(3), repo(4)] });
    await source(api).getDashboard();
    await db.update(projects).set({ highPriority: 2 }).where(eq(projects.repoId, 1));
    await db.update(projects).set({ highPriority: 1 }).where(eq(projects.repoId, 3));
    await db.update(projects).set({ highPriority: 1 }).where(eq(projects.repoId, 4));

    const dash = await source(api).getDashboard();

    expect(dash.projects.map((p) => [p.id, p.priorityRank])).toEqual([
      ["repo-3", 1],
      ["repo-4", 2],
      ["repo-1", 3],
      ["repo-2", undefined],
    ]);
  });

  it("keeps the flag when repos are synced again", async () => {
    const api = fakeApi({ repos: [repo(1)] });
    await source(api).getDashboard();
    await db.update(projects).set({ highPriority: 1 }).where(eq(projects.repoId, 1));
    await source(api).getDashboard();
    const dash = await source(api).getDashboard();
    expect(dash.projects[0].highPriority).toBe(true);
  });
});

describe("dashboard alerts", () => {
  async function focusDashboard(data: FakeData) {
    const api = fakeApi(data);
    await source(api).getDashboard(); // creates the project rows
    await setStatus(1, "focus");
    return source(api).getDashboard();
  }

  const BASE: FakeData = { ...FOCUS_DATA, repos: [repo(1)] };

  it("says the focus project is on track when an issue closed recently", async () => {
    const dash = await focusDashboard(BASE);
    expect(dash.alerts).toEqual([
      {
        kind: "info",
        title: "On track.",
        text: "1 quiet day so far. It counts as stalled after 7.",
      },
    ]);
  });

  it("raises a stalled alert once no issue has closed for the threshold", async () => {
    const dash = await focusDashboard({
      ...BASE,
      lastClosed: { "me/repo-1": "2026-09-20T12:00:00Z" },
    });
    expect(dash.alerts).toEqual([
      {
        kind: "stalled",
        title: "Stalled.",
        text: "No issue closed in 18 days. Close one to get repo-1 moving again.",
      },
    ]);
  });

  it("uses the stall threshold from settings", async () => {
    await db.insert(settings).values({ id: 1, stallDays: 30 });
    const dash = await focusDashboard({
      ...BASE,
      lastClosed: { "me/repo-1": "2026-09-20T12:00:00Z" },
    });
    expect(dash.alerts.map((a) => a.kind)).toEqual(["info"]);
  });

  it("pauses the stalled alert in Away mode and says so", async () => {
    await db.insert(settings).values({ id: 1, awayUntil: "2026-10-20" });
    const dash = await focusDashboard({
      ...BASE,
      lastClosed: { "me/repo-1": "2026-09-01T12:00:00Z" },
    });
    expect(dash.alerts).toEqual([
      {
        kind: "info",
        title: "Away.",
        text: "Stalled alerts are paused until Oct 20.",
      },
    ]);
  });

  it("raises an overdue alert for an unfinished milestone past its due date, even when away", async () => {
    await db.insert(settings).values({ id: 1, awayUntil: "2026-10-20" });
    const dash = await focusDashboard({
      ...BASE,
      milestones: { "me/repo-1": [milestone(7, "Polish", "2026-10-05T07:00:00Z", 4, 5)] },
    });
    expect(dash.alerts.map((a) => [a.kind, a.text])).toEqual([
      ["overdue", "Polish was due Oct 5 (3 days ago) and still has 4 open issues."],
      ["info", "Stalled alerts are paused until Oct 20."],
    ]);
  });

  it("reports Away mode on the dashboard only while the return date is ahead", async () => {
    await db.insert(settings).values({ id: 1, awayUntil: "2026-10-20" });
    expect((await focusDashboard(BASE)).awayUntil).toBe("2026-10-20");

    await db.update(settings).set({ awayUntil: "2026-10-08" }).where(eq(settings.id, 1));
    expect((await source(fakeApi(BASE)).getDashboard()).awayUntil).toBeNull();
  });

  it("has no alerts when nothing has focus", async () => {
    const dash = await source(fakeApi(BASE)).getDashboard();
    expect(dash.alerts).toEqual([]);
  });
});

describe("since your last visit", () => {
  const BASE: FakeData = {
    ...FOCUS_DATA,
    repos: [repo(1)],
    closedAt: { "me/repo-1": ["2026-10-05T09:00:00Z", "2026-10-07T12:00:00Z"] },
  };

  async function withVisit(lastVisit: string | null, data: FakeData = BASE) {
    const api = fakeApi(data);
    await source(api).getDashboard(); // creates the project rows
    await setStatus(1, "focus");
    await db.insert(milestoneSnapshots).values({
      repoId: 1,
      milestoneNumber: 7,
      milestoneTitle: "Polish",
      snapshotDate: "2026-10-03",
      openCount: 6,
      closedCount: 4,
      percentComplete: 40,
    });
    return createGithubSource({
      db,
      api,
      ownerName: "Aira",
      lastVisit,
      now: () => NOW,
    }).getDashboard();
  }

  it("reports issues closed and the progress change since the last visit", async () => {
    const dash = await withVisit("2026-10-04T09:00:00Z");
    expect(dash.sinceLastVisit).toMatchObject({
      project: "repo-1",
      lastVisit: "2026-10-04",
      daysAway: 4,
      closed: 2,
    });
    // Polish 5 of 9 plus MVP 14 of 14 is 19 of 23 now (83%), against 40% at the last snapshot.
    expect(dash.sinceLastVisit?.percentChange).toBe(43);
  });

  it("asks GitHub only for issues closed after the last visit", async () => {
    const api = fakeApi(BASE);
    await source(api).getDashboard();
    await setStatus(1, "focus");
    await createGithubSource({
      db,
      api,
      ownerName: "Aira",
      lastVisit: "2026-10-04T09:00:00Z",
      now: () => NOW,
    }).getDashboard();
    expect(api.closedSince).toHaveBeenCalledWith("me/repo-1", "2026-10-04T09:00:00Z");
  });

  it("shows nothing on a first visit", async () => {
    expect((await withVisit(null)).sinceLastVisit).toBeNull();
  });

  it("shows nothing on a same-day return", async () => {
    expect((await withVisit("2026-10-08T01:00:00Z")).sinceLastVisit).toBeNull();
  });

  it("shows nothing when no project has focus", async () => {
    const dash = await createGithubSource({
      db,
      api: fakeApi(BASE),
      ownerName: "Aira",
      lastVisit: "2026-10-01T09:00:00Z",
      now: () => NOW,
    }).getDashboard();
    expect(dash.sinceLastVisit).toBeNull();
  });
});

describe("definition-of-done checklist", () => {
  it("gives each project its own checklist, in order", async () => {
    const api = fakeApi(FOCUS_DATA);
    await source(api).getDashboard(); // creates the project rows
    await db.insert(doneChecklistItems).values([
      { repoId: 1, label: "Second", sortOrder: 1 },
      { repoId: 1, label: "First", sortOrder: 0, checked: true },
      { repoId: 2, label: "Elsewhere", sortOrder: 0 },
    ]);
    const dash = await source(api).getDashboard();
    const byName = (name: string) => dash.projects.find((p) => p.id === name)!;
    expect(byName("repo-1").checklist.map((i) => [i.label, i.checked])).toEqual([
      ["First", true],
      ["Second", false],
    ]);
    expect(byName("repo-2").checklist.map((i) => i.label)).toEqual(["Elsewhere"]);
  });

  it("is empty for a project with no items", async () => {
    const dash = await source(fakeApi(FOCUS_DATA)).getDashboard();
    expect(dash.projects.every((p) => p.checklist.length === 0)).toBe(true);
  });
});

describe("weekly streak", () => {
  // NOW is Thursday 8 Oct 2026, so this week started on Monday 5 Oct.
  const DATA: FakeData = {
    repos: [repo(1), repo(2), repo(3), repo(4)],
    closedAt: {
      "me/repo-1": ["2026-10-05T09:00:00Z"], // focus: this week
      "me/repo-2": ["2026-10-01T09:00:00Z"], // starred: last week
      "me/repo-3": ["2026-09-24T09:00:00Z"], // not starred, not focus: ignored
      "me/repo-4": ["2026-09-17T09:00:00Z"], // practice: ignored
    },
  };

  async function dashboardWith(data: FakeData = DATA) {
    const api = fakeApi(data);
    await source(api).getDashboard(); // creates the project rows
    await setStatus(1, "focus");
    await db.update(projects).set({ highPriority: 1 }).where(eq(projects.repoId, 2));
    await db.update(projects).set({ kind: "practice" }).where(eq(projects.repoId, 4));
    return { api, dash: await source(api).getDashboard() };
  }

  it("counts closes in the focus project and the starred projects, week by week", async () => {
    const { dash } = await dashboardWith();
    // This week (focus) and last week (starred); the week before had only an ignored repo.
    expect(dash.streak).toEqual({ weeks: 2, paused: false, thisWeek: 1 });
  });

  it("asks GitHub only about the projects that count, from the start of the window", async () => {
    const { api } = await dashboardWith();
    // The fake takes only the name, but the real call also carries the "since" time. It starts a
    // day before the window (Monday 6 Oct 2025) so a close just before local midnight is not missed.
    const calls = vi.mocked(api.closedSince).mock.calls as unknown as [string, string][];
    const asked = calls.filter(([, since]) => since.startsWith("2025-10-05"));
    expect(asked.map(([name]) => name).sort()).toEqual(["me/repo-1", "me/repo-2"]);
  });

  it("reviews last week (28 Sep to 4 Oct) for the same projects", async () => {
    const { dash } = await dashboardWith({
      ...DATA,
      closedAt: {
        ...DATA.closedAt,
        "me/repo-2": ["2026-10-01T09:00:00Z", "2026-09-30T09:00:00Z", "2026-09-22T09:00:00Z"],
      },
    });
    expect(dash.weeklyReview).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
      closed: 2,
      previousClosed: 1,
      projects: [{ name: "repo-2", closed: 2 }],
    });
  });

  it("is null when nothing has closed in the last two weeks", async () => {
    const { dash } = await dashboardWith({
      ...DATA,
      closedAt: { "me/repo-1": ["2026-08-01T09:00:00Z"] },
    });
    expect(dash.streak).toBeNull();
  });

  it("pauses the streak while Away mode is on", async () => {
    await db.insert(settings).values({ id: 1, awayUntil: "2026-10-20" });
    const { dash } = await dashboardWith({
      ...DATA,
      closedAt: { "me/repo-1": ["2026-08-27T09:00:00Z", "2026-08-20T09:00:00Z"] },
    });
    expect(dash.streak).toEqual({ weeks: 2, paused: true, thisWeek: 0 });
  });
});

describe("deploy status", () => {
  const DATA: FakeData = {
    repos: [
      repo(1, { homepage: "https://www.shipped.dev/" }),
      repo(2, { homepage: "https://elsewhere.dev" }),
      repo(3),
    ],
  };
  const withVercel = (api: GithubApi, vercel: { listProjects: () => Promise<VercelList> }) =>
    createGithubSource({ db, api, ownerName: "Aira", vercel, now: () => NOW });
  const vercelWith = (listProjects: () => Promise<VercelList>) => ({ listProjects });
  const listOf = (projects: VercelProject[], skipped = 0): VercelList => ({ projects, skipped });
  const site: VercelProject = {
    name: "shipped",
    domains: ["shipped.dev"],
    state: "failed",
    at: "2026-10-07T09:00:00.000Z",
  };

  it("attaches Vercel's status to the repo whose homepage matches", async () => {
    const dash = await withVercel(
      fakeApi(DATA),
      vercelWith(async () => listOf([site])),
    ).getDashboard();
    const byId = Object.fromEntries(dash.projects.map((p) => [p.id, p.deploy]));
    expect(byId["repo-1"]).toEqual({ state: "failed", at: "2026-10-07T09:00:00.000Z" });
    expect(byId["repo-2"]).toBeUndefined();
    expect(byId["repo-3"]).toBeUndefined();
  });

  it("shows no status, and still loads, when Vercel fails", async () => {
    const dash = await withVercel(
      fakeApi(DATA),
      vercelWith(async () => {
        throw new Error("Vercel answered 500.");
      }),
    ).getDashboard();
    expect(dash.projects).toHaveLength(3);
    expect(dash.projects.every((p) => p.deploy === undefined)).toBe(true);
  });

  it("shows no status when Vercel is not set up", async () => {
    const dash = await source(fakeApi(DATA)).getDashboard();
    expect(dash.projects.every((p) => p.deploy === undefined)).toBe(true);
  });

  it("reports what it read from Vercel, so a missing pill can be explained", async () => {
    const dash = await withVercel(
      fakeApi(DATA),
      vercelWith(async () => listOf([site, { ...site, name: "other", domains: ["other.dev"] }], 2)),
    ).getDashboard();
    expect(dash.deployCheck).toEqual({
      status: "ok",
      projects: 2,
      skipped: 2,
      matched: 1,
      sample: ["shipped: shipped.dev", "other: other.dev"],
    });
  });

  it("reports a Vercel failure without leaking anything but our own message", async () => {
    const failing = (message: string) =>
      withVercel(
        fakeApi(DATA),
        vercelWith(async () => {
          throw new Error(message);
        }),
      ).getDashboard();
    expect((await failing("Vercel answered 403.")).deployCheck).toMatchObject({
      status: "failed",
      message: "Vercel answered 403.",
    });
    expect((await failing("connect ECONNREFUSED Bearer abc")).deployCheck?.message).toBe(
      "Could not reach Vercel.",
    );
  });

  it("reports nothing when Vercel is not set up", async () => {
    const dash = await source(fakeApi(DATA)).getDashboard();
    expect(dash.deployCheck).toBeUndefined();
  });
});

describe("owner's timezone", () => {
  // NOW is Thursday 8 Oct 2026, 15:00 UTC. The week started on Monday 5 Oct.
  const DATA: FakeData = {
    repos: [repo(1)],
    closedAt: { "me/repo-1": ["2026-10-08T12:00:00Z", "2026-10-06T09:00:00Z"] },
    lastClosed: { "me/repo-1": "2026-10-08T12:00:00Z" },
  };

  async function dashboardIn(timeZone: string | undefined, data: FakeData = DATA) {
    const api = fakeApi(data);
    await createGithubSource({ db, api, ownerName: "Aira", now: () => NOW }).getDashboard();
    await setStatus(1, "focus");
    const dash = await createGithubSource({
      db,
      api,
      ownerName: "Aira",
      ...(timeZone ? { timeZone } : {}),
      now: () => NOW,
    }).getDashboard();
    return { api, dash };
  }

  it("uses UTC by default", async () => {
    const { dash } = await dashboardIn(undefined);
    expect(dash.today).toBe("2026-10-08");
    expect(dash.closedPerDay).toEqual([0, 1, 0, 1, 0, 0, 0]); // Tuesday and Thursday
  });

  it("moves 'today' and the closing days forward east of UTC", async () => {
    // Auckland is UTC+13 in October: it is already Friday morning there.
    const { dash } = await dashboardIn("Pacific/Auckland");
    expect(dash.today).toBe("2026-10-09");
    // 12:00 UTC Thursday is 01:00 Friday in Auckland; 09:00 UTC Tuesday is 22:00 Tuesday.
    expect(dash.closedPerDay).toEqual([0, 1, 0, 0, 1, 0, 0]);
  });

  it("moves them back west of UTC", async () => {
    // Los Angeles is UTC-7: 12:00 UTC is 05:00 the same day, 02:00 UTC would be the evening before.
    const { dash } = await dashboardIn("America/Los_Angeles", {
      ...DATA,
      closedAt: { "me/repo-1": ["2026-10-08T02:00:00Z"] },
    });
    expect(dash.today).toBe("2026-10-08");
    expect(dash.closedPerDay).toEqual([0, 0, 1, 0, 0, 0, 0]); // Wednesday evening, not Thursday
  });

  it("buckets the streak and the last activity by the owner's day", async () => {
    // A close at 03:00 UTC Monday 5 Oct is still Sunday evening in Toronto, so last week.
    const { dash } = await dashboardIn("America/Toronto", {
      ...DATA,
      closedAt: { "me/repo-1": ["2026-10-05T03:00:00Z"] },
      lastClosed: { "me/repo-1": "2026-10-05T03:00:00Z" },
    });
    expect(dash.streak).toEqual({ weeks: 1, paused: false, thisWeek: 0 });
    expect(dash.projects[0].lastActivity).toBe("4 days ago"); // Sunday 4 Oct to Thursday 8 Oct
  });

  it("still asks GitHub for the whole local window, a day early", async () => {
    const { api } = await dashboardIn("America/Toronto");
    const calls = vi.mocked(api.closedSince).mock.calls as unknown as [string, string][];
    expect(calls.some(([, since]) => since === "2026-09-30T00:00:00Z")).toBe(true); // 1 Oct, the start of the month, minus a day
  });
});

describe("focus log", () => {
  it("lists the stretches of focus with the owner's dates", async () => {
    const api = fakeApi({ repos: [repo(1), repo(2)] });
    await source(api).getDashboard(); // creates the project rows
    await setFocus(db, "repo-1", null, new Date("2026-10-02T10:00:00Z"));
    await setFocus(
      db,
      "repo-2",
      "repo-1 is waiting on someone else.",
      new Date("2026-10-06T10:00:00Z"),
    );
    const dash = await source(api).getDashboard();
    expect(dash.focusLog).toEqual([
      { project: "repo-2", from: "2026-10-06", to: null, days: 2, reason: null },
      {
        project: "repo-1",
        from: "2026-10-02",
        to: "2026-10-06",
        days: 4,
        reason: "repo-1 is waiting on someone else.",
      },
    ]);
  });

  it("is empty before any project has had focus", async () => {
    const dash = await source(fakeApi({ repos: [repo(1)] })).getDashboard();
    expect(dash.focusLog).toEqual([]);
  });
});

describe("finished date", () => {
  it("shows the owner's day for a stamped instant and a chosen date as it is", async () => {
    const api = fakeApi({ repos: [repo(1), repo(2), repo(3)] });
    await source(api).getDashboard();
    await db
      .update(projects)
      .set({ status: "finished", finishedAt: "2026-10-08T03:00:00.000Z" })
      .where(eq(projects.repoId, 1));
    await db
      .update(projects)
      .set({ status: "deployed", finishedAt: "2026-09-12" })
      .where(eq(projects.repoId, 2));

    const dash = await createGithubSource({
      db,
      api,
      ownerName: "Aira",
      timeZone: "America/Toronto",
      now: () => NOW,
    }).getDashboard();
    const byId = Object.fromEntries(dash.projects.map((p) => [p.id, p.finishedOn]));
    // 03:00 UTC on 8 Oct is still the evening of 7 Oct in Toronto.
    expect(byId["repo-1"]).toBe("2026-10-07");
    expect(byId["repo-2"]).toBe("2026-09-12");
    expect(byId["repo-3"]).toBeUndefined();
  });
});
