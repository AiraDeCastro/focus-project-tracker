import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { moveHighPriority, setHighPriority, sortByPriority } from "./priority";
import { moveInRanking, normalizeRanks, rankedNames } from "./priority-rules";

let db: Db;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(projects).values([
    {
      repoId: 1,
      fullName: "me/portfolio",
      name: "portfolio",
      htmlUrl: "https://github.com/me/portfolio",
    },
    { repoId: 2, fullName: "me/notes", name: "notes", htmlUrl: "https://github.com/me/notes" },
    { repoId: 3, fullName: "me/cli", name: "cli", htmlUrl: "https://github.com/me/cli" },
  ]);
});

async function places() {
  const rows = await db.select().from(projects);
  return Object.fromEntries(
    rows.filter((r) => r.highPriority > 0).map((r) => [r.name, r.highPriority]),
  );
}

describe("setHighPriority", () => {
  it("defaults to not high priority", async () => {
    const rows = await db.select().from(projects);
    expect(rows.every((r) => r.highPriority === 0)).toBe(true);
  });

  it("marks and unmarks one project without touching others", async () => {
    expect(await setHighPriority(db, "portfolio", true)).toBe(true);
    let rows = await db.select().from(projects);
    expect(rows.find((r) => r.name === "portfolio")?.highPriority).toBe(1);
    expect(rows.find((r) => r.name === "notes")?.highPriority).toBe(0);

    expect(await setHighPriority(db, "portfolio", false)).toBe(true);
    rows = await db.select().from(projects);
    expect(rows.find((r) => r.name === "portfolio")?.highPriority).toBe(0);
  });

  it("puts a newly starred project at the bottom of the ranking", async () => {
    await setHighPriority(db, "notes", true);
    await setHighPriority(db, "cli", true);
    await setHighPriority(db, "portfolio", true);
    expect(await places()).toEqual({ notes: 1, cli: 2, portfolio: 3 });
  });

  it("keeps the place of a project that is starred again", async () => {
    await setHighPriority(db, "notes", true);
    await setHighPriority(db, "cli", true);
    await setHighPriority(db, "notes", true);
    expect(await places()).toEqual({ notes: 1, cli: 2 });
  });

  it("reports an unknown project instead of pretending it worked", async () => {
    expect(await setHighPriority(db, "does-not-exist", true)).toBe(false);
  });
});

describe("sortByPriority", () => {
  const p = (id: string, status: string, highPriority = false) => ({ id, status, highPriority });

  it("puts focus first, then high priority, then the rest, keeping order inside each group", () => {
    const sorted = sortByPriority([
      p("a", "backlog"),
      p("b", "backlog", true),
      p("c", "focus", true),
      p("d", "paused", true),
      p("e", "deployed"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "b", "d", "a", "e"]);
  });

  it("does not change the input array", () => {
    const input = [p("a", "backlog"), p("b", "backlog", true)];
    sortByPriority(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("moveHighPriority", () => {
  beforeEach(async () => {
    await setHighPriority(db, "portfolio", true);
    await setHighPriority(db, "notes", true);
    await setHighPriority(db, "cli", true);
  });

  it("moves a project up and down one place", async () => {
    expect(await moveHighPriority(db, "cli", "up")).toEqual({ ok: true });
    expect(await places()).toEqual({ portfolio: 1, cli: 2, notes: 3 });
    expect(await moveHighPriority(db, "portfolio", "down")).toEqual({ ok: true });
    expect(await places()).toEqual({ cli: 1, portfolio: 2, notes: 3 });
  });

  it("does nothing at the top or bottom", async () => {
    await moveHighPriority(db, "portfolio", "up");
    await moveHighPriority(db, "cli", "down");
    expect(await places()).toEqual({ portfolio: 1, notes: 2, cli: 3 });
  });

  it("settles ties from before ranking existed, ordering by repo id", async () => {
    // Everything starred before ranking holds 1.
    await db.update(projects).set({ highPriority: 1 });
    expect(await moveHighPriority(db, "cli", "up")).toEqual({ ok: true });
    expect(await places()).toEqual({ portfolio: 1, cli: 2, notes: 3 });
  });

  it("leaves projects that are not starred alone", async () => {
    await setHighPriority(db, "notes", false);
    await moveHighPriority(db, "cli", "up");
    const rows = await db.select().from(projects);
    expect(rows.find((r) => r.name === "notes")?.highPriority).toBe(0);
    expect(await places()).toEqual({ cli: 1, portfolio: 2 });
  });

  it("steps over the focus project and a finished one", async () => {
    await db.update(projects).set({ status: "focus" }).where(eq(projects.name, "portfolio"));
    // Ranking is portfolio (focus), notes, cli: cli moves above notes, past nothing, then up again.
    expect(await moveHighPriority(db, "cli", "up")).toEqual({ ok: true });
    expect(await places()).toEqual({ portfolio: 1, cli: 2, notes: 3 });
    expect(await moveHighPriority(db, "cli", "up")).toEqual({ ok: true });
    expect(await places()).toEqual({ portfolio: 1, cli: 2, notes: 3 }); // nothing movable above
    await db.update(projects).set({ status: "finished" }).where(eq(projects.name, "cli"));
    await moveHighPriority(db, "notes", "up");
    expect(await places()).toEqual({ portfolio: 1, cli: 2, notes: 3 });
  });

  it("refuses a project that is not starred or does not exist", async () => {
    await setHighPriority(db, "notes", false);
    expect(await moveHighPriority(db, "notes", "up")).toEqual({ ok: false, error: "not_starred" });
    expect(await moveHighPriority(db, "nope", "up")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("ranking rules", () => {
  it("lists starred names by stored place, then by tie-break, and skips the rest", () => {
    expect(
      rankedNames([
        { name: "a", stored: 2, tie: 1 },
        { name: "b", stored: 0, tie: 2 },
        { name: "c", stored: 1, tie: 9 },
        { name: "d", stored: 1, tie: 3 },
      ]),
    ).toEqual(["d", "c", "a"]);
  });

  it("moves one place and returns null for a name that is not ranked", () => {
    expect(moveInRanking(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInRanking(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveInRanking(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveInRanking(["a", "b"], "z", "up")).toBeNull();
  });

  it("steps over projects that cannot be moved", () => {
    const canMove = (n: string) => n !== "focus";
    // "b" moves above "a", past the focus project, which keeps its place at the top.
    expect(moveInRanking(["focus", "a", "b"], "b", "up", canMove)).toEqual(["focus", "b", "a"]);
    // Nothing to swap with above "a" except the focus project: it stays put.
    expect(moveInRanking(["focus", "a", "b"], "a", "up", canMove)).toEqual(["focus", "a", "b"]);
    expect(moveInRanking(["a", "focus", "b"], "a", "down", canMove)).toEqual(["focus", "b", "a"]);
  });

  it("numbers the starred projects without gaps and clears the others", () => {
    const out = normalizeRanks([
      { id: "a", highPriority: true, priorityRank: 5 },
      { id: "b", highPriority: false, priorityRank: 2 },
      { id: "c", highPriority: true },
      { id: "d", highPriority: true, priorityRank: 1 },
    ]);
    expect(out.map((p) => [p.id, p.priorityRank])).toEqual([
      ["a", 2],
      ["b", undefined],
      ["c", 3],
      ["d", 1],
    ]);
  });
});

describe("sortByPriority with a ranking", () => {
  it("orders starred projects by their place", () => {
    const sorted = sortByPriority([
      { id: "x", status: "backlog", highPriority: true, priorityRank: 3 },
      { id: "y", status: "backlog", highPriority: true, priorityRank: 1 },
      { id: "z", status: "backlog", highPriority: true, priorityRank: 2 },
      { id: "q", status: "backlog", highPriority: false },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["y", "z", "x", "q"]);
  });
});
