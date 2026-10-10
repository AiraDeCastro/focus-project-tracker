import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects, settings } from "@/db/schema";
import { loadEditableSettings, saveSettings } from "./settings";
import { DEFAULT_SETTINGS, validateSettings } from "./settings-rules";
import { listVisibleProjects } from "./sync";

const ok = {
  stallDays: 10,
  hideForks: false,
  hideArchived: true,
  reminderChannel: "none" as const,
};

describe("validateSettings", () => {
  it("accepts a whole number of days from 1 to 90 and two booleans", () => {
    expect(validateSettings(ok)).toBeNull();
    expect(validateSettings({ ...ok, stallDays: 1 })).toBeNull();
    expect(validateSettings({ ...ok, stallDays: 90 })).toBeNull();
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
  });

  it("rejects days that are out of range, fractional, or not numbers", () => {
    for (const stallDays of [0, -3, 91, 2.5, Number.NaN, Infinity, "7", null, undefined]) {
      expect(validateSettings({ ...ok, stallDays })).toBe("invalid_days");
    }
  });

  it("rejects an unknown or missing reminder channel", () => {
    for (const reminderChannel of ["sms", "browser", "", null, undefined, 1]) {
      expect(validateSettings({ ...ok, reminderChannel })).toBe("invalid_choice");
    }
    expect(validateSettings({ ...ok, reminderChannel: "email" })).toBeNull();
  });

  it("rejects missing or non-boolean filters and non-objects", () => {
    expect(validateSettings({ ...ok, hideForks: "yes" })).toBe("invalid_choice");
    expect(validateSettings({ stallDays: 7, hideForks: true })).toBe("invalid_choice");
    expect(validateSettings(null)).toBe("invalid_choice");
    expect(validateSettings("settings")).toBe("invalid_choice");
  });
});

describe("saveSettings", () => {
  let db: Db;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  const stored = async () => (await db.select().from(settings).where(eq(settings.id, 1)))[0];

  it("saves the values, creating the settings row if needed", async () => {
    expect(await saveSettings(db, ok)).toEqual({ ok: true, settings: ok });
    expect(await loadEditableSettings(db)).toEqual(ok);
  });

  it("leaves Away mode and the reminder channel alone", async () => {
    await db.insert(settings).values({ id: 1, awayUntil: "2026-10-20" });
    await saveSettings(db, ok);
    const row = await stored();
    expect(row.awayUntil).toBe("2026-10-20");
    expect(row.stallDays).toBe(10);
  });

  it("saves the reminder channel", async () => {
    await saveSettings(db, ok);
    expect((await stored()).notificationChannel).toBe("none");
    await saveSettings(db, { ...ok, reminderChannel: "email" });
    expect(await loadEditableSettings(db)).toMatchObject({ reminderChannel: "email" });
  });

  it("ignores extra fields instead of writing them", async () => {
    await saveSettings(db, { ...ok, awayUntil: "2099-01-01", id: 5 });
    expect((await stored()).awayUntil).toBeNull();
  });

  it("refuses bad values and keeps what was saved", async () => {
    await saveSettings(db, ok);
    expect(await saveSettings(db, { ...ok, stallDays: 500 })).toEqual({
      ok: false,
      error: "invalid_days",
    });
    expect((await stored()).stallDays).toBe(10);
  });

  it("starts from the defaults", async () => {
    expect(await loadEditableSettings(db)).toEqual(DEFAULT_SETTINGS);
  });

  it("changes which repos the dashboard lists, without deleting any", async () => {
    const base = { htmlUrl: "u", status: "backlog" as const };
    await db.insert(projects).values([
      { ...base, repoId: 1, fullName: "me/plain", name: "plain" },
      { ...base, repoId: 2, fullName: "me/forked", name: "forked", isFork: true },
      { ...base, repoId: 3, fullName: "me/old", name: "old", isArchived: true },
    ]);
    const names = async () => (await listVisibleProjects(db)).map((p) => p.name).sort();

    expect(await names()).toEqual(["plain"]);
    await saveSettings(db, { ...DEFAULT_SETTINGS, hideForks: false, hideArchived: false });
    expect(await names()).toEqual(["forked", "old", "plain"]);
    await saveSettings(db, { ...DEFAULT_SETTINGS, hideForks: true, hideArchived: false });
    expect(await names()).toEqual(["old", "plain"]);
  });
});
