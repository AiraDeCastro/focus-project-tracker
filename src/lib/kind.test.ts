import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import { setFocus } from "./focus";
import { setKind } from "./kind";
import { isProjectKind } from "./project-kind";

let db: Db;

async function kindOf(name: string) {
  const [r] = await db.select().from(projects).where(eq(projects.name, name));
  return r.kind;
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const mk = (n: number, name: string) => ({
    repoId: n,
    fullName: `me/${name}`,
    name,
    htmlUrl: `https://github.com/me/${name}`,
  });
  await db.insert(projects).values([mk(1, "portfolio"), mk(2, "leetcode"), mk(3, "android-labs")]);
});

describe("isProjectKind", () => {
  it("accepts only the three kinds", () => {
    expect(isProjectKind("project")).toBe(true);
    expect(isProjectKind("practice")).toBe(true);
    expect(isProjectKind("school")).toBe(true);
    for (const bad of ["", "Project", "hobby", null, undefined, 3, {}]) {
      expect(isProjectKind(bad)).toBe(false);
    }
  });
});

describe("setKind", () => {
  it("defaults every repo to project", async () => {
    expect(await kindOf("portfolio")).toBe("project");
  });

  it("changes a repo to practice or school and back", async () => {
    expect(await setKind(db, "leetcode", "practice")).toEqual({ ok: true });
    expect(await setKind(db, "android-labs", "school")).toEqual({ ok: true });
    expect(await kindOf("leetcode")).toBe("practice");
    expect(await kindOf("android-labs")).toBe("school");
    expect(await kindOf("portfolio")).toBe("project");

    expect(await setKind(db, "leetcode", "project")).toEqual({ ok: true });
    expect(await kindOf("leetcode")).toBe("project");
  });

  it("is harmless to set the same kind again", async () => {
    expect(await setKind(db, "portfolio", "project")).toEqual({ ok: true });
  });

  it("rejects an unknown repo", async () => {
    expect(await setKind(db, "nope", "practice")).toEqual({ ok: false, error: "not_found" });
  });

  it("will not turn the current focus project into practice or school work", async () => {
    await setFocus(db, "portfolio", undefined);
    expect(await setKind(db, "portfolio", "practice")).toEqual({ ok: false, error: "is_focus" });
    expect(await setKind(db, "portfolio", "school")).toEqual({ ok: false, error: "is_focus" });
    expect(await kindOf("portfolio")).toBe("project");
  });
});

describe("practice and school work cannot take focus", () => {
  it("setFocus refuses them and changes nothing", async () => {
    await setKind(db, "leetcode", "practice");
    await setKind(db, "android-labs", "school");
    expect(await setFocus(db, "leetcode", undefined)).toEqual({
      ok: false,
      error: "not_focusable",
    });
    expect(await setFocus(db, "android-labs", undefined)).toEqual({
      ok: false,
      error: "not_focusable",
    });
    const all = await db.select().from(projects);
    expect(all.filter((p) => p.status === "focus")).toHaveLength(0);
  });

  it("refuses them even when another project already has focus, and keeps that focus", async () => {
    await setFocus(db, "portfolio", undefined);
    await setKind(db, "leetcode", "practice");
    expect(await setFocus(db, "leetcode", "a perfectly good reason")).toEqual({
      ok: false,
      error: "not_focusable",
    });
    const [focus] = await db.select().from(projects).where(eq(projects.status, "focus"));
    expect(focus.name).toBe("portfolio");
  });

  it("allows focus again once the type is changed back to project", async () => {
    await setKind(db, "leetcode", "practice");
    await setKind(db, "leetcode", "project");
    expect((await setFocus(db, "leetcode", undefined)).ok).toBe(true);
  });
});
