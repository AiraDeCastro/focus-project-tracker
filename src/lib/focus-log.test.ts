import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { markDone } from "./done";
import { setFocus } from "./focus";
import { buildFocusLog, describeFocusEntry, loadFocusLog } from "./focus-log";

let db: Db;

const utcDay = (stamp: string) => stamp.slice(0, 10);

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const base = (n: number, name: string) => ({
    repoId: n,
    fullName: `me/${name}`,
    name,
    htmlUrl: `https://github.com/me/${name}`,
    status: "backlog" as const,
  });
  await db.insert(projects).values([base(1, "portfolio"), base(2, "notes"), base(3, "cli")]);
});

describe("loadFocusLog", () => {
  it("is empty before anything has had focus", async () => {
    expect(await loadFocusLog(db)).toEqual([]);
  });

  it("lists the newest stretch first, with the reason for leaving", async () => {
    await setFocus(db, "portfolio", null, new Date("2026-10-01T10:00:00Z"));
    await setFocus(
      db,
      "notes",
      "Portfolio is blocked on the designer.",
      new Date("2026-10-08T10:00:00Z"),
    );
    const rows = await loadFocusLog(db);
    expect(rows.map((r) => r.project)).toEqual(["notes", "portfolio"]);
    expect(rows[0]).toMatchObject({ endedAt: null, switchReason: null });
    expect(rows[1]).toMatchObject({
      endedAt: "2026-10-08T10:00:00.000Z",
      switchReason: "Portfolio is blocked on the designer.",
    });
  });

  it("only returns as many as asked for", async () => {
    await setFocus(db, "portfolio", null, new Date("2026-10-01T10:00:00Z"));
    await setFocus(db, "notes", "Switching for a while.", new Date("2026-10-02T10:00:00Z"));
    await setFocus(db, "cli", "Switching again now.", new Date("2026-10-03T10:00:00Z"));
    expect(await loadFocusLog(db, 2)).toHaveLength(2);
  });

  it("shows a finished project's stretch with no reason", async () => {
    await setFocus(db, "portfolio", null, new Date("2026-10-01T10:00:00Z"));
    await markDone(db, "portfolio", "finished", null, new Date("2026-10-05T10:00:00Z"));
    const [row] = await loadFocusLog(db);
    expect(row).toMatchObject({ project: "portfolio", switchReason: null });
    expect(row.endedAt).not.toBeNull();
  });
});

describe("buildFocusLog", () => {
  const rows = [
    { project: "notes", startedAt: "2026-10-08T10:00:00.000Z", endedAt: null, switchReason: null },
    {
      project: "portfolio",
      startedAt: "2026-10-01T10:00:00.000Z",
      endedAt: "2026-10-08T10:00:00.000Z",
      switchReason: "  Blocked on the designer.  ",
    },
  ];

  it("counts whole days, using today for a stretch that is still running", () => {
    const [current, past] = buildFocusLog(rows, "2026-10-12", utcDay);
    expect(current).toEqual({
      project: "notes",
      from: "2026-10-08",
      to: null,
      days: 4,
      reason: null,
    });
    expect(past).toMatchObject({ from: "2026-10-01", to: "2026-10-08", days: 7 });
    expect(past.reason).toBe("Blocked on the designer.");
  });

  it("uses the owner's day for the dates", () => {
    // 02:00 UTC is the evening before in a timezone behind UTC.
    const behind = (stamp: string) =>
      new Date(Date.parse(stamp) - 5 * 3600_000).toISOString().slice(0, 10);
    const [entry] = buildFocusLog(
      [{ project: "a", startedAt: "2026-10-08T02:00:00.000Z", endedAt: null, switchReason: null }],
      "2026-10-08",
      behind,
    );
    expect(entry.from).toBe("2026-10-07");
    expect(entry.days).toBe(1);
  });

  it("never gives a negative length and treats a blank reason as none", () => {
    const [entry] = buildFocusLog(
      [
        {
          project: "a",
          startedAt: "2026-10-09T10:00:00Z",
          endedAt: "2026-10-09T11:00:00Z",
          switchReason: "   ",
        },
      ],
      "2026-10-08",
      utcDay,
    );
    expect(entry.days).toBe(0);
    expect(entry.reason).toBeNull();
  });
});

describe("describeFocusEntry", () => {
  it("words a running stretch, a switch and a finish", () => {
    expect(
      describeFocusEntry({ project: "a", from: "2026-10-08", to: null, days: 4, reason: null }),
    ).toEqual({
      title: "a",
      when: "Since Oct 8 (4 days so far)",
      note: null,
    });
    expect(
      describeFocusEntry({
        project: "b",
        from: "2026-10-01",
        to: "2026-10-02",
        days: 1,
        reason: "Too slow.",
      }),
    ).toEqual({ title: "b", when: "Oct 1 to Oct 2 (1 day)", note: "Why you left: Too slow." });
    const finished = describeFocusEntry({
      project: "c",
      from: "2026-10-01",
      to: "2026-10-01",
      days: 0,
      reason: null,
    });
    expect(finished.when).toBe("Oct 1 to Oct 1 (same day)");
    expect(finished.note).toContain("finished or deployed");
  });
});
