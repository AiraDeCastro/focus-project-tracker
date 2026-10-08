import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { milestoneSnapshots, projects } from "@/db/schema";
import type { GithubApi, GithubMilestone, GithubRepo, OpenIssue } from "../github/api";
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
      { number: 41, title: "Empty state" },
      { number: 44, title: "Fix upload" },
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
