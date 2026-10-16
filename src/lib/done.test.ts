import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import { markDone, reopenProject, setFinishedDate } from "./done";
import { checkFinishedDate, finishedDay, normalizeLiveUrl } from "./done-rules";
import { setFocus } from "./focus";

let db: Db;
const T1 = new Date("2026-10-01T10:00:00Z");
const T2 = new Date("2026-10-08T10:00:00Z");

async function row(name: string) {
  const [r] = await db.select().from(projects).where(eq(projects.name, name));
  return r;
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const mk = (n: number, name: string, status: "backlog" | "paused" = "backlog") => ({
    repoId: n,
    fullName: `me/${name}`,
    name,
    htmlUrl: `https://github.com/me/${name}`,
    status,
  });
  await db
    .insert(projects)
    .values([mk(1, "tic-tac-toe"), mk(2, "portfolio"), mk(3, "notes", "paused")]);
});

describe("normalizeLiveUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeLiveUrl("my-site.vercel.app")).toBe("https://my-site.vercel.app/");
    expect(normalizeLiveUrl("  https://me.dev/portfolio  ")).toBe("https://me.dev/portfolio");
  });

  it("keeps http if that is what was typed", () => {
    expect(normalizeLiveUrl("http://example.com")).toBe("http://example.com/");
  });

  it("refuses anything that could run script or is not a real host", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "ftp://example.com",
      "localhost",
      "not a url",
      "https://user:pass@example.com",
      "",
      "   ",
      "https://" + "a".repeat(300) + ".com",
    ]) {
      expect(normalizeLiveUrl(bad), bad.slice(0, 30)).toBeNull();
    }
    expect(normalizeLiveUrl(null)).toBeNull();
    expect(normalizeLiveUrl(undefined)).toBeNull();
  });
});

describe("markDone", () => {
  it("marks a backlog project finished with a date and no address", async () => {
    expect(await markDone(db, "tic-tac-toe", "finished", undefined, T1)).toEqual({
      ok: true,
      wasFocus: false,
    });
    expect(await row("tic-tac-toe")).toMatchObject({
      status: "finished",
      finishedAt: T1.toISOString(),
      deployedUrl: null,
      needsDeploy: false,
    });
  });

  it("marks a paused project finished too", async () => {
    expect((await markDone(db, "notes", "finished", null, T1)).ok).toBe(true);
    expect((await row("notes")).status).toBe("finished");
  });

  it("marks a project deployed and stores a cleaned-up address", async () => {
    await markDone(db, "portfolio", "deployed", "personal-portfolio.vercel.app", T1);
    expect(await row("portfolio")).toMatchObject({
      status: "deployed",
      deployedUrl: "https://personal-portfolio.vercel.app/",
      finishedAt: T1.toISOString(),
      needsDeploy: true,
    });
  });

  it("needs a valid address for deployed, and changes nothing without one", async () => {
    expect(await markDone(db, "portfolio", "deployed", "", T1)).toEqual({
      ok: false,
      error: "url_required",
    });
    expect(await markDone(db, "portfolio", "deployed", "javascript:alert(1)", T1)).toEqual({
      ok: false,
      error: "invalid_url",
    });
    expect((await row("portfolio")).status).toBe("backlog");
    expect((await row("portfolio")).deployedUrl).toBeNull();
  });

  it("ignores an address when the project is only finished", async () => {
    await markDone(db, "tic-tac-toe", "finished", "https://example.com", T1);
    expect((await row("tic-tac-toe")).deployedUrl).toBeNull();
  });

  it("rejects unknown and already done projects", async () => {
    expect(await markDone(db, "nope", "finished", null, T1)).toEqual({
      ok: false,
      error: "not_found",
    });
    await markDone(db, "tic-tac-toe", "finished", null, T1);
    expect(await markDone(db, "tic-tac-toe", "finished", null, T2)).toEqual({
      ok: false,
      error: "already_done",
    });
    expect((await row("tic-tac-toe")).finishedAt).toBe(T1.toISOString());
  });

  it("frees focus and closes the log entry when the focus project is finished", async () => {
    await setFocus(db, "portfolio", undefined, T1);
    expect(await markDone(db, "portfolio", "deployed", "me.dev", T2)).toEqual({
      ok: true,
      wasFocus: true,
    });

    const all = await db.select().from(projects);
    expect(all.filter((p) => p.status === "focus")).toHaveLength(0);

    const [log] = await db.select().from(focusLog);
    expect(log).toMatchObject({
      repoId: 2,
      startedAt: T1.toISOString(),
      endedAt: T2.toISOString(),
      switchReason: null,
    });

    // The next project can now take focus without needing a reason.
    expect(await setFocus(db, "notes", undefined, T2)).toEqual({ ok: true, previous: null });
  });
});

describe("reopenProject", () => {
  it("sends a done project back to the backlog and clears its finished date", async () => {
    await markDone(db, "portfolio", "deployed", "me.dev", T1);
    expect(await reopenProject(db, "portfolio")).toEqual({ ok: true, wasFocus: false });
    expect(await row("portfolio")).toMatchObject({
      status: "backlog",
      finishedAt: null,
      deployedUrl: "https://me.dev/",
    });
  });

  it("only reopens projects that are done", async () => {
    expect(await reopenProject(db, "tic-tac-toe")).toEqual({ ok: false, error: "not_done" });
    expect(await reopenProject(db, "nope")).toEqual({ ok: false, error: "not_found" });
  });

  it("can be marked done again after reopening and gets a fresh finished date", async () => {
    await markDone(db, "tic-tac-toe", "finished", null, T1);
    await reopenProject(db, "tic-tac-toe");
    await markDone(db, "tic-tac-toe", "finished", null, T2);
    expect((await row("tic-tac-toe")).finishedAt).toBe(T2.toISOString());
  });
});

describe("checkFinishedDate", () => {
  const today = "2026-10-16";

  it("accepts today and earlier real dates", () => {
    expect(checkFinishedDate("2026-10-16", today)).toBeNull();
    expect(checkFinishedDate("2026-02-28", today)).toBeNull();
    expect(checkFinishedDate("2000-01-01", today)).toBeNull();
  });

  it("refuses dates that are not real, not dates, or in the future", () => {
    expect(checkFinishedDate("2026-02-31", today)).toBe("invalid_date");
    expect(checkFinishedDate("2026-13-01", today)).toBe("invalid_date");
    expect(checkFinishedDate("16/10/2026", today)).toBe("invalid_date");
    expect(checkFinishedDate("", today)).toBe("invalid_date");
    expect(checkFinishedDate(undefined, today)).toBe("invalid_date");
    expect(checkFinishedDate(20261016, today)).toBe("invalid_date");
    expect(checkFinishedDate("2026-10-17", today)).toBe("future_date");
    expect(checkFinishedDate("1999-12-31", today)).toBe("too_old");
  });
});

describe("finishedDay", () => {
  it("uses a chosen date as it is and converts a stamped instant to the owner's day", () => {
    expect(finishedDay("2026-09-12", "Pacific/Auckland")).toBe("2026-09-12");
    expect(finishedDay("2026-10-08T03:00:00.000Z", "America/Toronto")).toBe("2026-10-07");
    expect(finishedDay("2026-10-08T03:00:00.000Z", "UTC")).toBe("2026-10-08");
    expect(finishedDay(null, "UTC")).toBeNull();
    expect(finishedDay("garbage", "UTC")).toBeNull();
  });
});

describe("markDone with the real finished date", () => {
  const options = (finishedOn: string) => ({ finishedOn, today: "2026-10-08" });

  it("stores the chosen day as the date alone", async () => {
    expect(await markDone(db, "tic-tac-toe", "finished", null, T2, options("2026-09-12"))).toEqual({
      ok: true,
      wasFocus: false,
    });
    expect((await row("tic-tac-toe")).finishedAt).toBe("2026-09-12");
  });

  it("keeps the exact moment when the chosen day is today", async () => {
    await markDone(db, "tic-tac-toe", "finished", null, T2, options("2026-10-08"));
    expect((await row("tic-tac-toe")).finishedAt).toBe(T2.toISOString());
  });

  it("changes nothing when the date is wrong", async () => {
    expect(await markDone(db, "tic-tac-toe", "finished", null, T2, options("2026-10-09"))).toEqual({
      ok: false,
      error: "future_date",
    });
    expect(await markDone(db, "tic-tac-toe", "finished", null, T2, options("2026-02-31"))).toEqual({
      ok: false,
      error: "invalid_date",
    });
    const r = await row("tic-tac-toe");
    expect(r.status).toBe("backlog");
    expect(r.finishedAt).toBeNull();
  });

  it("ends the focus stretch on the chosen day, but never before it began", async () => {
    await setFocus(db, "portfolio", undefined, T1); // began 1 Oct
    await markDone(db, "portfolio", "finished", null, T2, options("2026-10-05"));
    let [log] = await db.select().from(focusLog);
    expect(log.endedAt).toBe("2026-10-05T12:00:00.000Z");

    await reopenProject(db, "portfolio");
    await setFocus(db, "notes", undefined, T2); // notes began 8 Oct
    await markDone(db, "notes", "finished", null, T2, options("2026-10-02"));
    [log] = (await db.select().from(focusLog)).filter((l) => l.repoId === 3);
    expect(log.endedAt).toBe(T2.toISOString()); // clamped to when focus began
  });
});

describe("setFinishedDate", () => {
  it("changes the date of a finished project", async () => {
    await markDone(db, "tic-tac-toe", "finished", null, T2);
    expect(await setFinishedDate(db, "tic-tac-toe", "2026-09-01", "2026-10-08")).toEqual({
      ok: true,
      wasFocus: false,
    });
    expect((await row("tic-tac-toe")).finishedAt).toBe("2026-09-01");
  });

  it("refuses a project that is not done, an unknown one, and a bad date", async () => {
    expect(await setFinishedDate(db, "portfolio", "2026-09-01", "2026-10-08")).toEqual({
      ok: false,
      error: "not_done",
    });
    expect(await setFinishedDate(db, "nope", "2026-09-01", "2026-10-08")).toEqual({
      ok: false,
      error: "not_found",
    });
    await markDone(db, "tic-tac-toe", "finished", null, T2);
    expect(await setFinishedDate(db, "tic-tac-toe", "2026-12-01", "2026-10-08")).toEqual({
      ok: false,
      error: "future_date",
    });
    expect((await row("tic-tac-toe")).finishedAt).toBe(T2.toISOString());
  });
});
