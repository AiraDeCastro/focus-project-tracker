import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { clearProjectLink, getProjectLink, isProjectLink, setProjectLink } from "./project-link";

let db: Db;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(projects).values([
    { repoId: 1, fullName: "me/one", name: "one", htmlUrl: "https://github.com/me/one" },
    { repoId: 2, fullName: "me/two", name: "two", htmlUrl: "https://github.com/me/two" },
  ]);
});

describe("isProjectLink", () => {
  it("accepts a positive whole number with a short, non-blank id", () => {
    expect(isProjectLink({ number: 3, nodeId: "PVT_kwHOABC" })).toBe(true);
  });

  it("refuses anything else", () => {
    const bad: unknown[] = [
      null,
      "PVT_1",
      {},
      { number: 0, nodeId: "PVT_1" },
      { number: -2, nodeId: "PVT_1" },
      { number: 1.5, nodeId: "PVT_1" },
      { number: "3", nodeId: "PVT_1" },
      { number: 3, nodeId: "" },
      { number: 3, nodeId: "   " },
      { number: 3, nodeId: "x".repeat(101) },
      { number: 3, nodeId: null },
    ];
    for (const value of bad) expect(isProjectLink(value)).toBe(false);
  });
});

describe("project link", () => {
  it("is empty until a repo is onboarded", async () => {
    expect(await getProjectLink(db, 1)).toBeNull();
    expect(await getProjectLink(db, 999)).toBeNull();
  });

  it("remembers a Project for one repo and leaves the others alone", async () => {
    expect(await setProjectLink(db, 1, { number: 3, nodeId: "PVT_1" })).toEqual({ ok: true });
    expect(await getProjectLink(db, 1)).toEqual({ number: 3, nodeId: "PVT_1" });
    expect(await getProjectLink(db, 2)).toBeNull();
  });

  it("replaces an earlier link", async () => {
    await setProjectLink(db, 1, { number: 3, nodeId: "PVT_1" });
    await setProjectLink(db, 1, { number: 7, nodeId: "PVT_7" });
    expect(await getProjectLink(db, 1)).toEqual({ number: 7, nodeId: "PVT_7" });
  });

  it("refuses an invalid link without changing what is stored", async () => {
    await setProjectLink(db, 1, { number: 3, nodeId: "PVT_1" });
    expect(await setProjectLink(db, 1, { number: 0, nodeId: "PVT_9" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await getProjectLink(db, 1)).toEqual({ number: 3, nodeId: "PVT_1" });
  });

  it("says when the repo is not tracked", async () => {
    expect(await setProjectLink(db, 999, { number: 3, nodeId: "PVT_1" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await clearProjectLink(db, 999)).toEqual({ ok: false, error: "not_found" });
  });

  it("forgets a link, and a half-set row reads as no link", async () => {
    await setProjectLink(db, 1, { number: 3, nodeId: "PVT_1" });
    expect(await clearProjectLink(db, 1)).toEqual({ ok: true });
    expect(await getProjectLink(db, 1)).toBeNull();

    await db.update(projects).set({ githubProjectNumber: 5 });
    expect(await getProjectLink(db, 1)).toBeNull();
  });
});
