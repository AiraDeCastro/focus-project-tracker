import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { doneChecklistItems, projects } from "@/db/schema";
import {
  addChecklistItem,
  addSuggestedChecklist,
  loadChecklists,
  removeChecklistItem,
  setChecklistChecked,
} from "./checklist";
import {
  CHECKLIST_LABEL_MAX,
  CHECKLIST_MAX_ITEMS,
  SUGGESTED_CHECKLIST,
  cleanLabel,
} from "./checklist-rules";

describe("cleanLabel", () => {
  it("trims and collapses spaces", () => {
    expect(cleanLabel("  Tests   pass \n")).toBe("Tests pass");
  });

  it("accepts up to the length limit and no more", () => {
    expect(cleanLabel("x".repeat(CHECKLIST_LABEL_MAX))).toHaveLength(CHECKLIST_LABEL_MAX);
    expect(cleanLabel("x".repeat(CHECKLIST_LABEL_MAX + 1))).toBeNull();
  });

  it("rejects empty text and non-strings", () => {
    for (const bad of ["", "   ", null, undefined, 5, {}]) expect(cleanLabel(bad)).toBeNull();
  });
});

describe("checklist", () => {
  let db: Db;

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "./drizzle" });
    const base = { htmlUrl: "u", status: "backlog" as const };
    await db.insert(projects).values([
      { ...base, repoId: 1, fullName: "me/alpha", name: "alpha" },
      { ...base, repoId: 2, fullName: "me/beta", name: "beta" },
    ]);
  });

  it("adds items in order and loads them per project", async () => {
    await addChecklistItem(db, "alpha", "First");
    await addChecklistItem(db, "alpha", "  Second  ");
    await addChecklistItem(db, "beta", "Other");
    const lists = await loadChecklists(db);
    expect(lists.get(1)?.map((i) => i.label)).toEqual(["First", "Second"]);
    expect(lists.get(2)?.map((i) => i.label)).toEqual(["Other"]);
    expect(lists.get(1)?.every((i) => i.checked === false)).toBe(true);
  });

  it("refuses a bad label, an unknown project, and a full list", async () => {
    expect(await addChecklistItem(db, "alpha", "   ")).toEqual({
      ok: false,
      error: "invalid_label",
    });
    expect(await addChecklistItem(db, "nope", "Fine")).toEqual({ ok: false, error: "not_found" });
    for (let i = 0; i < CHECKLIST_MAX_ITEMS; i++) await addChecklistItem(db, "alpha", `Item ${i}`);
    expect(await addChecklistItem(db, "alpha", "One too many")).toEqual({
      ok: false,
      error: "too_many",
    });
    expect((await loadChecklists(db)).get(1)).toHaveLength(CHECKLIST_MAX_ITEMS);
  });

  it("keeps the order after an item in the middle is removed", async () => {
    const a = await addChecklistItem(db, "alpha", "A");
    await addChecklistItem(db, "alpha", "B");
    await removeChecklistItem(db, a.ok ? a.item.id : -1);
    await addChecklistItem(db, "alpha", "C");
    expect((await loadChecklists(db)).get(1)?.map((i) => i.label)).toEqual(["B", "C"]);
  });

  it("ticks and unticks an item, and reports an unknown one", async () => {
    const added = await addChecklistItem(db, "alpha", "Tests pass");
    const id = added.ok ? added.item.id : -1;
    expect(await setChecklistChecked(db, id, true)).toEqual({ ok: true });
    expect((await loadChecklists(db)).get(1)?.[0].checked).toBe(true);
    await setChecklistChecked(db, id, false);
    expect((await loadChecklists(db)).get(1)?.[0].checked).toBe(false);
    expect(await setChecklistChecked(db, 999, true)).toEqual({ ok: false, error: "not_found" });
  });

  it("removes an item and reports an unknown one", async () => {
    const added = await addChecklistItem(db, "alpha", "Gone soon");
    const id = added.ok ? added.item.id : -1;
    expect(await removeChecklistItem(db, id)).toEqual({ ok: true });
    expect((await loadChecklists(db)).get(1)).toBeUndefined();
    expect(await removeChecklistItem(db, id)).toEqual({ ok: false, error: "not_found" });
  });

  it("adds the suggested items only to an empty list", async () => {
    const first = await addSuggestedChecklist(db, "alpha");
    expect(first.ok && first.items.map((i) => i.label)).toEqual([...SUGGESTED_CHECKLIST]);
    expect(await addSuggestedChecklist(db, "alpha")).toEqual({ ok: false, error: "not_empty" });
    expect(await addSuggestedChecklist(db, "nope")).toEqual({ ok: false, error: "not_found" });
    expect((await db.select().from(doneChecklistItems)).length).toBe(SUGGESTED_CHECKLIST.length);
  });

  it("is deleted with its project", async () => {
    await addChecklistItem(db, "alpha", "Tests pass");
    await db.delete(projects);
    expect(await db.select().from(doneChecklistItems)).toHaveLength(0);
  });
});
