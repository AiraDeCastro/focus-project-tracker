import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { describeStoredSync, isRecordedKind, recordSyncCheck, storedSync } from "./sync-record";

let db: Db;
beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(projects).values({
    repoId: 1,
    fullName: "me/repo",
    name: "repo",
    htmlUrl: "https://github.com/me/repo",
  });
});

const row = async () => (await db.select().from(projects).where(eq(projects.repoId, 1)))[0];

describe("recordSyncCheck", () => {
  it("remembers the answer and when, and replaces it next time", async () => {
    await recordSyncCheck(db, 1, "both", new Date("2026-10-10T08:00:00Z"));
    expect(storedSync(await row())).toEqual({
      kind: "both",
      checkedAt: "2026-10-10T08:00:00.000Z",
    });
    await recordSyncCheck(db, 1, "in_sync", new Date("2026-10-11T08:00:00Z"));
    expect(storedSync(await row())?.kind).toBe("in_sync");
  });

  it("ignores answers that are not recordable", async () => {
    await recordSyncCheck(db, 1, "no_project");
    await recordSyncCheck(db, 1, "nonsense");
    expect(storedSync(await row())).toBeUndefined();
  });
});

describe("storedSync and describeStoredSync", () => {
  it("reads nothing from half-set or unreadable notes", () => {
    expect(storedSync({ projectSyncKind: null, projectCheckedAt: null })).toBeUndefined();
    expect(storedSync({ projectSyncKind: "in_sync", projectCheckedAt: null })).toBeUndefined();
    expect(
      storedSync({ projectSyncKind: "x", projectCheckedAt: "2026-10-10T00:00:00Z" }),
    ).toBeUndefined();
    expect(
      storedSync({ projectSyncKind: "in_sync", projectCheckedAt: "not a date" }),
    ).toBeUndefined();
    expect(isRecordedKind("both")).toBe(true);
    expect(isRecordedKind("no_project")).toBe(false);
  });

  it("words the note for a card, calmly", () => {
    expect(
      describeStoredSync({ kind: "in_sync", checkedAt: "2026-10-10T08:00:00Z" }, "2026-10-11"),
    ).toEqual({ label: "TASKS.md in sync (checked yesterday)", tone: "good" });
    expect(
      describeStoredSync(
        { kind: "lines_to_import", checkedAt: "2026-10-08T08:00:00Z" },
        "2026-10-11",
      ),
    ).toEqual({ label: "TASKS.md has lines the Project lacks (checked 3 days ago)", tone: "note" });
  });
});
