import { describe, expect, it } from "vitest";
import { matchOrphanIssues } from "./adopt";
import type { RepoIssue } from "./github/repo-writes";
import { keyForNewTask, type ImportTask } from "./truth";

const M1 = "Milestone 1";
const milestoneNumbers = new Map([[M1, 1]]);

function line(text: string, milestone: string | null = M1): ImportTask {
  return { milestone, title: text, text, key: keyForNewTask(milestone, text), done: false };
}
function issue(n: number, text: string, milestone: number | null = 1, keyOf = text): RepoIssue {
  return {
    number: n,
    nodeId: `I_${n}`,
    title: text,
    text,
    state: "open",
    milestone,
    key: keyForNewTask(M1, keyOf),
  };
}
const match = (imports: ImportTask[], issues: RepoIssue[], inProject: string[] = []) =>
  matchOrphanIssues({ imports, issues, milestoneNumbers, inProject: new Set(inProject) });

describe("matchOrphanIssues", () => {
  it("matches a reworded line to the issue of its old wording", () => {
    const a = line("Add the star button to every project card on the dashboard");
    const old = issue(5, "Add the star button to every project card");
    expect(match([a], [old]).get(a.key)?.number).toBe(5);
  });

  it("lets the better match win, and uses each issue once", () => {
    const close = line("Add the star button to every project card now");
    const farther = line("Add the star button to project cards");
    const old = issue(5, "Add the star button to every project card");
    const result = match([farther, close], [old]);
    expect(result.get(close.key)?.number).toBe(5);
    expect(result.has(farther.key)).toBe(false);
  });

  it("leaves lines that already have their own issue alone", () => {
    const a = line("Build the graph");
    expect(
      match([a], [issue(5, "Build the graph"), issue(6, "Build the graph quickly")]).size,
    ).toBe(0);
  });

  it("ignores issues with no key, issues in the Project, other milestones and unlike text", () => {
    const a = line("Add the star button to every project card on the dashboard");
    const text = "Add the star button to every project card";
    expect(match([a], [{ ...issue(5, text), key: null }]).size).toBe(0);
    expect(match([a], [issue(6, text)], ["I_6"]).size).toBe(0);
    expect(match([a], [issue(7, text, 2)]).size).toBe(0);
    expect(match([a], [issue(8, "Write the weekly review email")]).size).toBe(0);
  });

  it("matches loose tasks only to issues with no milestone, and skips unknown milestones", () => {
    const loose = line("Fix the broken footer link on mobile", null);
    expect(
      match([loose], [issue(5, "Fix the broken footer link", null)]).get(loose.key)?.number,
    ).toBe(5);
    expect(match([loose], [issue(6, "Fix the broken footer link", 1)]).size).toBe(0);
    const newer = line("Fix the broken footer link on mobile", "Milestone 9");
    expect(match([newer], [issue(7, "Fix the broken footer link", 1)]).size).toBe(0);
  });
});
