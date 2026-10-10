import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { milestoneSnapshots, projects } from "@/db/schema";
import { buildBackfillRows, ensureBackfilled } from "./backfill";
import type { GithubApi, IssueRecord } from "./github/api";
import { loadHistory, recordSnapshots } from "./snapshots";

const TODAY = "2026-10-10";

function issue(
  number: number,
  milestone: number | null,
  created: string,
  closed: string | null = null,
): IssueRecord {
  return {
    number,
    milestone,
    createdAt: `${created}T12:00:00Z`,
    closedAt: closed ? `${closed}T12:00:00Z` : null,
  };
}

const M1 = { number: 1, title: "MVP" };
const M2 = { number: 2, title: "Polish" };
const IMPLICIT = { number: 0, title: "All issues" };

describe("buildBackfillRows", () => {
  it("counts an issue from the day it opened and as closed from the day it closed", () => {
    const rows = buildBackfillRows(
      [issue(1, 1, "2026-09-01", "2026-09-05"), issue(2, 1, "2026-09-03")],
      [M1],
      TODAY,
    );
    expect(rows.map((r) => [r.date, r.closed, r.total])).toEqual([
      ["2026-09-01", 0, 1],
      ["2026-09-03", 0, 2],
      ["2026-09-05", 1, 2],
    ]);
  });

  it("lists every milestone on every event day so a day's rows add up to the whole repo", () => {
    const rows = buildBackfillRows(
      [issue(1, 1, "2026-09-01", "2026-09-02"), issue(2, 2, "2026-09-04")],
      [M1, M2],
      TODAY,
    );
    const sept4 = rows.filter((r) => r.date === "2026-09-04");
    expect(sept4.map((r) => [r.milestoneNumber, r.closed, r.total])).toEqual([
      [1, 1, 1],
      [2, 0, 1],
    ]);
  });

  it("starts a milestone's count at zero before its first issue exists", () => {
    const rows = buildBackfillRows(
      [issue(1, 1, "2026-09-01"), issue(2, 2, "2026-09-10")],
      [M1, M2],
      TODAY,
    );
    const first = rows.filter((r) => r.date === "2026-09-01");
    expect(first.find((r) => r.milestoneNumber === 2)).toMatchObject({ closed: 0, total: 0 });
  });

  it("gives a repo without milestones one implicit milestone holding every issue", () => {
    const rows = buildBackfillRows(
      [issue(1, null, "2026-09-01", "2026-09-02"), issue(2, 9, "2026-09-01")],
      [IMPLICIT],
      TODAY,
    );
    expect(rows).toEqual([
      { date: "2026-09-01", milestoneNumber: 0, milestoneTitle: "All issues", closed: 0, total: 2 },
      { date: "2026-09-02", milestoneNumber: 0, milestoneTitle: "All issues", closed: 1, total: 2 },
    ]);
  });

  it("ignores issues outside the repo's milestones when it has some", () => {
    const rows = buildBackfillRows(
      [issue(1, null, "2026-09-01"), issue(2, 99, "2026-09-01"), issue(3, 1, "2026-09-02")],
      [M1],
      TODAY,
    );
    expect(rows.map((r) => [r.date, r.total])).toEqual([["2026-09-02", 1]]);
  });

  it("leaves today to the live snapshot", () => {
    const rows = buildBackfillRows(
      [issue(1, 1, "2026-10-10"), issue(2, 1, "2026-10-09")],
      [M1],
      TODAY,
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-10-09"]);
  });

  it("carries older history into a starting point at the edge of the window", () => {
    const rows = buildBackfillRows(
      [
        issue(1, 1, "2026-01-01", "2026-02-01"),
        issue(2, 1, "2026-01-02"),
        issue(3, 1, "2026-10-01"),
      ],
      [M1],
      TODAY,
      30,
    );
    expect(rows.map((r) => [r.date, r.closed, r.total])).toEqual([
      ["2026-09-10", 1, 2],
      ["2026-10-01", 1, 3],
    ]);
  });

  it("counts a reopened issue as open and returns nothing for no issues", () => {
    expect(buildBackfillRows([], [M1], TODAY)).toEqual([]);
    const rows = buildBackfillRows([issue(1, 1, "2026-09-01", null)], [M1], TODAY);
    expect(rows[0]).toMatchObject({ closed: 0, total: 1 });
  });
});

describe("ensureBackfilled", () => {
  let db: Db;

  function api(issues: IssueRecord[]) {
    return { listIssues: vi.fn(async () => issues) } as unknown as GithubApi & {
      listIssues: ReturnType<typeof vi.fn>;
    };
  }

  async function addRepo(historyBackfilledOn: string | null = null) {
    await db.insert(projects).values({
      repoId: 1,
      fullName: "me/repo",
      name: "repo",
      htmlUrl: "u",
      historyBackfilledOn,
    });
    return { repoId: 1, fullName: "me/repo", historyBackfilledOn };
  }

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("stores the rebuilt history, marks the repo, and the graph reads it as one series", async () => {
    const repo = await addRepo();
    const fake = api([issue(1, 1, "2026-09-01", "2026-09-05"), issue(2, 1, "2026-09-03")]);
    expect(await ensureBackfilled(db, fake, repo, [M1], TODAY)).toBe(true);

    expect(await loadHistory(db, 1)).toEqual([
      { date: "2026-09-01", percent: 0 },
      { date: "2026-09-03", percent: 0 },
      { date: "2026-09-05", percent: 50 },
    ]);
    const [row] = await db.select().from(projects).where(eq(projects.repoId, 1));
    expect(row.historyBackfilledOn).toBe(TODAY);
  });

  it("does nothing, and asks GitHub for nothing, once a repo is marked", async () => {
    const repo = await addRepo("2026-10-09");
    const fake = api([issue(1, 1, "2026-09-01")]);
    expect(await ensureBackfilled(db, fake, repo, [M1], TODAY)).toBe(false);
    expect(fake.listIssues).not.toHaveBeenCalled();
    expect(await db.select().from(milestoneSnapshots)).toHaveLength(0);
  });

  it("never overwrites a real snapshot taken on the same day", async () => {
    const repo = await addRepo();
    await recordSnapshots(db, 1, "2026-09-03", [{ number: 1, title: "MVP", closed: 9, total: 10 }]);
    await ensureBackfilled(
      db,
      api([issue(1, 1, "2026-09-01"), issue(2, 1, "2026-09-03")]),
      repo,
      [M1],
      TODAY,
    );

    const history = await loadHistory(db, 1);
    expect(history.find((h) => h.date === "2026-09-03")?.percent).toBe(90);
  });

  it("leaves the repo unmarked when GitHub fails, so the next run tries again", async () => {
    const repo = await addRepo();
    const failing = {
      listIssues: vi.fn(async () => {
        throw new Error("rate limited");
      }),
    } as unknown as GithubApi;
    expect(await ensureBackfilled(db, failing, repo, [M1], TODAY)).toBe(false);
    const [row] = await db.select().from(projects).where(eq(projects.repoId, 1));
    expect(row.historyBackfilledOn).toBeNull();
  });

  it("marks a repo with no issues so it is not asked about again", async () => {
    const repo = await addRepo();
    expect(await ensureBackfilled(db, api([]), repo, [IMPLICIT], TODAY)).toBe(true);
    const [row] = await db.select().from(projects).where(eq(projects.repoId, 1));
    expect(row.historyBackfilledOn).toBe(TODAY);
  });
});
