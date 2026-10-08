import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import { setFocus } from "./focus";
import { MAX_REASON_LENGTH } from "./focus-rules";

let db: Db;

const T1 = new Date("2026-10-01T10:00:00Z");
const T2 = new Date("2026-10-08T10:00:00Z");

async function statuses() {
  const rows = await db.select().from(projects);
  return Object.fromEntries(rows.map((r) => [r.name, r.status]));
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const base = (
    n: number,
    name: string,
    status: "backlog" | "paused" | "deployed" | "finished",
  ) => ({
    repoId: n,
    fullName: `me/${name}`,
    name,
    htmlUrl: `https://github.com/me/${name}`,
    status,
  });
  await db
    .insert(projects)
    .values([
      base(1, "portfolio", "backlog"),
      base(2, "notes", "backlog"),
      base(3, "cli", "paused"),
      base(4, "shipped", "deployed"),
      base(5, "done", "finished"),
    ]);
});

describe("picking the first focus project", () => {
  it("needs no reason, starts a log entry and stamps the start date", async () => {
    expect(await setFocus(db, "portfolio", undefined, T1)).toEqual({ ok: true, previous: null });
    expect((await statuses()).portfolio).toBe("focus");

    const [row] = await db.select().from(projects).where(eq(projects.name, "portfolio"));
    expect(row.startedAt).toBe(T1.toISOString());

    const log = await db.select().from(focusLog);
    expect(log).toEqual([
      {
        id: expect.any(Number),
        repoId: 1,
        startedAt: T1.toISOString(),
        endedAt: null,
        switchReason: null,
      },
    ]);
  });

  it("can pick a paused project", async () => {
    expect((await setFocus(db, "cli", "", T1)).ok).toBe(true);
    expect((await statuses()).cli).toBe("focus");
  });
});

describe("switching focus", () => {
  beforeEach(async () => {
    await setFocus(db, "portfolio", undefined, T1);
  });

  it("pauses the old project, closes its log entry with the reason, and opens a new one", async () => {
    const result = await setFocus(db, "notes", "  The portfolio needs a design first  ", T2);
    expect(result).toEqual({ ok: true, previous: "portfolio" });

    expect(await statuses()).toMatchObject({ portfolio: "paused", notes: "focus" });

    const log = await db.select().from(focusLog).orderBy(focusLog.id);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({
      repoId: 1,
      endedAt: T2.toISOString(),
      switchReason: "The portfolio needs a design first",
    });
    expect(log[1]).toMatchObject({ repoId: 2, startedAt: T2.toISOString(), endedAt: null });
  });

  it("always leaves exactly one focus project", async () => {
    await setFocus(db, "notes", "switching for a good reason", T2);
    await setFocus(db, "cli", "and again for another reason", T2);
    const focus = Object.values(await statuses()).filter((s) => s === "focus");
    expect(focus).toHaveLength(1);
  });

  it("keeps the original start date when a project returns to focus", async () => {
    await setFocus(db, "notes", "switching for a good reason", T2);
    await setFocus(db, "portfolio", "back to the portfolio now", new Date("2026-10-09T10:00:00Z"));
    const [row] = await db.select().from(projects).where(eq(projects.name, "portfolio"));
    expect(row.startedAt).toBe(T1.toISOString());
  });

  it("requires a reason, and changes nothing without one", async () => {
    for (const reason of [undefined, null, "", "   ", "hey"]) {
      expect(await setFocus(db, "notes", reason, T2)).toEqual({
        ok: false,
        error: "reason_required",
      });
    }
    expect(await statuses()).toMatchObject({ portfolio: "focus", notes: "backlog" });
    const log = await db.select().from(focusLog);
    expect(log).toHaveLength(1);
    expect(log[0].endedAt).toBeNull();
  });

  it("rejects a reason that is too long", async () => {
    const result = await setFocus(db, "notes", "x".repeat(MAX_REASON_LENGTH + 1), T2);
    expect(result).toEqual({ ok: false, error: "reason_too_long" });
    expect((await statuses()).portfolio).toBe("focus");
  });

  it("rejects switching to the project that already has focus", async () => {
    expect(await setFocus(db, "portfolio", "a perfectly good reason", T2)).toEqual({
      ok: false,
      error: "already_focus",
    });
  });
});

describe("projects that cannot take focus", () => {
  it("rejects unknown, deployed and finished projects without changing anything", async () => {
    expect(await setFocus(db, "nope", undefined, T1)).toEqual({ ok: false, error: "not_found" });
    expect(await setFocus(db, "shipped", undefined, T1)).toEqual({
      ok: false,
      error: "not_eligible",
    });
    expect(await setFocus(db, "done", undefined, T1)).toEqual({ ok: false, error: "not_eligible" });
    expect(Object.values(await statuses())).not.toContain("focus");
    expect(await db.select().from(focusLog)).toHaveLength(0);
  });
});
