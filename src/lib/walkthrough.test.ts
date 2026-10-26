import { describe, expect, it } from "vitest";
import { STEP_COUNT, WALKTHROUGH, cleanAnswers, summarizeWalkthrough } from "./walkthrough";

const steps = WALKTHROUGH.flatMap((s) => s.steps);

describe("the walkthrough", () => {
  it("has unique, url-safe ids and text for every step", () => {
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STEP_COUNT).toBe(ids.length);
    for (const step of steps) {
      expect(step.id).toMatch(/^[a-z0-9-]+$/);
      expect(step.do.length).toBeGreaterThan(10);
      expect(step.expect.length).toBeGreaterThan(10);
    }
  });

  it("warns about every step that leaves something real behind", () => {
    const careful = steps.filter((s) => s.careful).map((s) => s.id);
    for (const id of ["switch-focus", "finish", "add-task", "add-milestone", "rules-pr"]) {
      expect(careful).toContain(id);
    }
  });
});

describe("cleanAnswers", () => {
  it("keeps valid marks and short notes for real steps and drops the rest", () => {
    const out = cleanAnswers({
      star: { mark: "worked" },
      kind: { mark: "problem", note: `  ${"x".repeat(400)}  ` },
      nonsense: { mark: "worked" },
      away: { mark: "maybe", note: "   " },
      settings: "worked",
    });
    expect(Object.keys(out).sort()).toEqual(["kind", "star"]);
    expect(out.kind?.note).toHaveLength(300);
    expect(cleanAnswers(null)).toEqual({});
    expect(cleanAnswers("x")).toEqual({});
  });
});

describe("summarizeWalkthrough", () => {
  it("counts what worked, lists problems with notes, and names what was not tried", () => {
    const text = summarizeWalkthrough({
      "sign-out": { mark: "worked" },
      star: { mark: "problem", note: "star did not stay after reload" },
    });
    expect(text).toContain(`1 worked, 1 problems, ${STEP_COUNT - 2} not tried (of ${STEP_COUNT})`);
    expect(text).toContain("- star: star did not stay after reload");
    expect(text).toContain("Not tried: ");
    expect(text).not.toContain("sign-out,");
  });

  it("is short when everything worked", () => {
    const all = Object.fromEntries(steps.map((s) => [s.id, { mark: "worked" as const }]));
    expect(summarizeWalkthrough(all)).toBe(
      `Signed-in check: ${STEP_COUNT} worked, 0 problems, 0 not tried (of ${STEP_COUNT}).`,
    );
  });
});
