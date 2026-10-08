import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { focusLog, projects } from "@/db/schema";
import { markDone, reopenProject } from "./done";
import { normalizeLiveUrl } from "./done-rules";
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
