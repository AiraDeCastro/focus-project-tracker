import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { loadCountHistory, loadHistory, recordSnapshots } from "./snapshots";

let db: Db;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db
    .insert(projects)
    .values({ repoId: 1, fullName: "me/a", name: "a", htmlUrl: "https://github.com/me/a" });
});

describe("snapshots", () => {
  it("combines milestones into one percent per day", async () => {
    await recordSnapshots(db, 1, "2026-10-08", [
      { number: 1, title: "MVP", closed: 5, total: 5 },
      { number: 2, title: "Polish", closed: 0, total: 5 },
    ]);
    expect(await loadHistory(db, 1)).toEqual([{ date: "2026-10-08", percent: 50 }]);
  });

  it("replaces the same day instead of duplicating it", async () => {
    await recordSnapshots(db, 1, "2026-10-08", [{ number: 1, title: "MVP", closed: 1, total: 4 }]);
    await recordSnapshots(db, 1, "2026-10-08", [{ number: 1, title: "MVP", closed: 3, total: 4 }]);
    expect(await loadHistory(db, 1)).toEqual([{ date: "2026-10-08", percent: 75 }]);
  });

  it("keeps one point per day in date order", async () => {
    await recordSnapshots(db, 1, "2026-10-09", [
      { number: 0, title: "All issues", closed: 2, total: 4 },
    ]);
    await recordSnapshots(db, 1, "2026-10-08", [
      { number: 0, title: "All issues", closed: 1, total: 4 },
    ]);
    expect(await loadHistory(db, 1)).toEqual([
      { date: "2026-10-08", percent: 25 },
      { date: "2026-10-09", percent: 50 },
    ]);
  });

  it("treats an empty milestone as 0 percent, not a crash", async () => {
    await recordSnapshots(db, 1, "2026-10-08", [
      { number: 1, title: "Empty", closed: 0, total: 0 },
    ]);
    expect(await loadHistory(db, 1)).toEqual([{ date: "2026-10-08", percent: 0 }]);
  });

  it("returns nothing for a repo with no snapshots", async () => {
    expect(await loadHistory(db, 1)).toEqual([]);
  });
});

describe("loadCountHistory", () => {
  it("adds the milestones up into total and open counts per day", async () => {
    await recordSnapshots(db, 1, "2026-10-01", [
      { number: 1, title: "MVP", closed: 2, total: 5 },
      { number: 2, title: "Polish", closed: 0, total: 3 },
    ]);
    await recordSnapshots(db, 1, "2026-10-08", [
      { number: 1, title: "MVP", closed: 5, total: 5 },
      { number: 2, title: "Polish", closed: 1, total: 4 },
    ]);
    expect(await loadCountHistory(db, 1)).toEqual([
      { date: "2026-10-01", total: 8, open: 6 },
      { date: "2026-10-08", total: 9, open: 3 },
    ]);
  });

  it("is empty for a repo with no snapshots", async () => {
    expect(await loadCountHistory(db, 1)).toEqual([]);
  });
});
