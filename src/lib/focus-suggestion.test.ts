import { describe, expect, it } from "vitest";
import { canTakeFocus, suggestFocus } from "./focus-suggestion";
import type { Project, ProjectStatus } from "./types";

function project(
  id: string,
  opts: { status?: ProjectStatus; high?: boolean; closed?: number; total?: number } = {},
): Project {
  const { status = "backlog", high = false, closed = 0, total = 10 } = opts;
  return {
    id,
    status,
    highPriority: high,
    lastActivity: "today",
    series: [],
    todayTasks: [],
    milestones: [{ name: "M1", closed, total, due: "Oct 22" }],
  };
}

describe("canTakeFocus", () => {
  it("allows backlog and paused only", () => {
    expect(canTakeFocus({ status: "backlog" })).toBe(true);
    expect(canTakeFocus({ status: "paused" })).toBe(true);
    expect(canTakeFocus({ status: "focus" })).toBe(false);
    expect(canTakeFocus({ status: "deployed" })).toBe(false);
    expect(canTakeFocus({ status: "finished" })).toBe(false);
  });
});

describe("suggestFocus", () => {
  it("prefers high priority over progress", () => {
    const pick = suggestFocus([
      project("far-along", { closed: 9 }),
      project("important", { high: true, closed: 1 }),
    ]);
    expect(pick?.id).toBe("important");
  });

  it("among equals, suggests the one closest to done", () => {
    const pick = suggestFocus([
      project("a", { high: true, closed: 2 }),
      project("b", { high: true, closed: 8 }),
      project("c", { high: true, closed: 5 }),
    ]);
    expect(pick?.id).toBe("b");
  });

  it("keeps the incoming order on a tie", () => {
    expect(
      suggestFocus([project("first", { closed: 3 }), project("second", { closed: 3 })])?.id,
    ).toBe("first");
  });

  it("does not suggest an empty project over one with work in it", () => {
    const pick = suggestFocus([
      project("empty", { high: true, closed: 0, total: 0 }),
      project("has-work", { high: true, closed: 0, total: 5 }),
    ]);
    expect(pick?.id).toBe("has-work");
  });

  it("still suggests a high priority empty project over normal ones with work", () => {
    const pick = suggestFocus([
      project("normal", { closed: 9 }),
      project("empty-but-important", { high: true, total: 0 }),
    ]);
    expect(pick?.id).toBe("empty-but-important");
  });

  it("skips deployed, finished and the current focus project", () => {
    const pick = suggestFocus([
      project("shipped", { status: "deployed", high: true, closed: 10 }),
      project("done", { status: "finished", high: true }),
      project("now", { status: "focus", high: true }),
      project("next", { status: "paused" }),
    ]);
    expect(pick?.id).toBe("next");
  });

  it("returns nothing when no project can take focus", () => {
    expect(suggestFocus([project("shipped", { status: "deployed" })])).toBeUndefined();
    expect(suggestFocus([])).toBeUndefined();
  });
});
