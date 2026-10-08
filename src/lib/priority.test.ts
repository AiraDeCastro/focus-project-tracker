import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { setHighPriority, sortByPriority } from "./priority";

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
  ]);
});

describe("setHighPriority", () => {
  it("defaults to not high priority", async () => {
    const rows = await db.select().from(projects);
    expect(rows.every((r) => r.highPriority === false)).toBe(true);
  });

  it("marks and unmarks one project without touching others", async () => {
    expect(await setHighPriority(db, "portfolio", true)).toBe(true);
    let rows = await db.select().from(projects);
    expect(rows.find((r) => r.name === "portfolio")?.highPriority).toBe(true);
    expect(rows.find((r) => r.name === "notes")?.highPriority).toBe(false);

    expect(await setHighPriority(db, "portfolio", false)).toBe(true);
    rows = await db.select().from(projects);
    expect(rows.find((r) => r.name === "portfolio")?.highPriority).toBe(false);
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
