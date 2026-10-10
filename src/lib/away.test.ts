import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { settings } from "@/db/schema";
import { activeAwayUntil, setAwayUntil, validateAwayDate } from "./away";

const TODAY = "2026-10-10";

describe("validateAwayDate", () => {
  it("accepts a date after today, up to a year ahead", () => {
    expect(validateAwayDate("2026-10-11", TODAY)).toBeNull();
    expect(validateAwayDate("2026-12-25", TODAY)).toBeNull();
    expect(validateAwayDate("2027-10-10", TODAY)).toBeNull();
  });

  it("rejects today and past dates", () => {
    expect(validateAwayDate("2026-10-10", TODAY)).toBe("not_future");
    expect(validateAwayDate("2026-10-09", TODAY)).toBe("not_future");
  });

  it("rejects dates more than a year away", () => {
    expect(validateAwayDate("2027-10-11", TODAY)).toBe("too_far");
  });

  it("rejects text that is not a real calendar date", () => {
    for (const bad of ["", "tomorrow", "2026-13-01", "2026-02-31", "10/12/2026", "2026-1-5"]) {
      expect(validateAwayDate(bad, TODAY)).toBe("invalid_date");
    }
  });
});

describe("setAwayUntil", () => {
  let db: Db;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  const stored = async () => (await db.select().from(settings).where(eq(settings.id, 1)))[0];

  it("saves the return date, creating the settings row if needed", async () => {
    expect(await setAwayUntil(db, "2026-10-20", TODAY)).toEqual({
      ok: true,
      awayUntil: "2026-10-20",
    });
    expect((await stored()).awayUntil).toBe("2026-10-20");
  });

  it("keeps the other settings when it changes the date", async () => {
    await db.insert(settings).values({ id: 1, stallDays: 14 });
    await setAwayUntil(db, "2026-10-20", TODAY);
    expect((await stored()).stallDays).toBe(14);
  });

  it("turns Away mode off with null", async () => {
    await setAwayUntil(db, "2026-10-20", TODAY);
    expect(await setAwayUntil(db, null, TODAY)).toEqual({ ok: true, awayUntil: null });
    expect((await stored()).awayUntil).toBeNull();
  });

  it("refuses a bad date and leaves the saved one alone", async () => {
    await setAwayUntil(db, "2026-10-20", TODAY);
    expect(await setAwayUntil(db, "2026-10-01", TODAY)).toEqual({
      ok: false,
      error: "not_future",
    });
    expect((await stored()).awayUntil).toBe("2026-10-20");
  });
});

describe("activeAwayUntil", () => {
  it("is the return date while it is still ahead", () => {
    expect(activeAwayUntil("2026-10-20", TODAY)).toBe("2026-10-20");
  });

  it("is null on the return date, after it, or when never set", () => {
    expect(activeAwayUntil("2026-10-10", TODAY)).toBeNull();
    expect(activeAwayUntil("2026-10-01", TODAY)).toBeNull();
    expect(activeAwayUntil(null, TODAY)).toBeNull();
  });
});
