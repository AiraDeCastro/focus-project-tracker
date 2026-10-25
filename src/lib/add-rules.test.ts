import { describe, expect, it } from "vitest";
import {
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_TITLE_MAX,
  TASK_NOTE_MAX,
  TASK_TITLE_MAX,
  checkMilestoneInput,
  checkTaskInput,
  isRealDay,
  oneLine,
} from "./add-rules";

describe("oneLine", () => {
  it("collapses spaces and newlines and trims", () => {
    expect(oneLine("  a \n\n b\t c ")).toBe("a b c");
    expect(oneLine(42)).toBe("");
    expect(oneLine(undefined)).toBe("");
  });
});

describe("isRealDay", () => {
  it("accepts a real calendar day and refuses the rest", () => {
    expect(isRealDay("2026-11-30")).toBe(true);
    expect(isRealDay("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-5", "30-11-2026", "", "tomorrow"]) {
      expect(isRealDay(bad)).toBe(false);
    }
  });
});

describe("checkTaskInput", () => {
  it("cleans a good task", () => {
    expect(
      checkTaskInput({ title: "  Fix   the\n cache ", milestone: " Milestone 1 ", note: " why " }),
    ).toEqual({
      ok: true,
      value: { title: "Fix the cache", milestone: "Milestone 1", note: "why" },
    });
  });

  it("allows no milestone and no note", () => {
    expect(checkTaskInput({ title: "x" })).toEqual({
      ok: true,
      value: { title: "x", milestone: null, note: "" },
    });
  });

  it("refuses an empty or overlong title, an overlong note and a blank milestone", () => {
    expect(checkTaskInput({ title: "   " })).toEqual({ ok: false, error: "invalid_title" });
    expect(checkTaskInput({ title: "x".repeat(TASK_TITLE_MAX + 1) })).toEqual({
      ok: false,
      error: "invalid_title",
    });
    expect(checkTaskInput({ title: "x", note: "n".repeat(TASK_NOTE_MAX + 1) })).toEqual({
      ok: false,
      error: "invalid_note",
    });
    expect(checkTaskInput({ title: "x", milestone: "   " })).toEqual({
      ok: false,
      error: "unknown_milestone",
    });
  });

  it("treats anything that is not an object as empty", () => {
    for (const bad of [null, undefined, "title", 5, []]) {
      expect(checkTaskInput(bad)).toEqual({ ok: false, error: "invalid_title" });
    }
  });
});

describe("checkMilestoneInput", () => {
  it("cleans a good milestone, with or without a due date", () => {
    expect(
      checkMilestoneInput({ title: " Launch ", dueDate: "2026-11-30", description: " Live. " }),
    ).toEqual({
      ok: true,
      value: { title: "Launch", dueDate: "2026-11-30", description: "Live." },
    });
    expect(checkMilestoneInput({ title: "Launch" })).toEqual({
      ok: true,
      value: { title: "Launch", dueDate: "", description: "" },
    });
  });

  it("refuses a bad title, description or due date", () => {
    expect(checkMilestoneInput({ title: "" })).toEqual({ ok: false, error: "invalid_title" });
    expect(checkMilestoneInput({ title: "x".repeat(MILESTONE_TITLE_MAX + 1) })).toEqual({
      ok: false,
      error: "invalid_title",
    });
    expect(
      checkMilestoneInput({ title: "x", description: "d".repeat(MILESTONE_DESCRIPTION_MAX + 1) }),
    ).toEqual({ ok: false, error: "invalid_description" });
    expect(checkMilestoneInput({ title: "x", dueDate: "2026-02-30" })).toEqual({
      ok: false,
      error: "invalid_due_date",
    });
  });
});
