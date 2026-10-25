import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REF_PLACEHOLDER,
  RULES_HEADING,
  rulesSection,
  withRules,
  workflowYaml,
} from "./onboarding-rules";

const docs = readFileSync("docs/onboarding-repos.md", "utf8");
const SHA = "a".repeat(40);

describe("onboarding rules and workflow", () => {
  it("match the documentation, so the two cannot drift apart", () => {
    const rules = /## Rules to paste[\s\S]*?```markdown\n([\s\S]*?)```/.exec(docs)?.[1];
    const workflow = /```yaml\n([\s\S]*?)```/.exec(docs)?.[1];
    expect(rulesSection()).toBe(rules);
    expect(workflowYaml({ ref: SHA, tasksFile: "TASKS.md" })).toBe(
      workflow
        ?.replace(REF_PLACEHOLDER, SHA)
        .replace("TASKS.md # use docs/TASKS.md if that is where the file lives", "TASKS.md"),
    );
  });

  it("appends the rules once, and creates CLAUDE.md when there is none", () => {
    const added = withRules("# My repo\n\nSome rules.\n\n");
    expect(added.startsWith("# My repo\n\nSome rules.\n\n" + RULES_HEADING)).toBe(true);
    expect(withRules(added)).toBe(added);
    expect(withRules(null)).toContain(RULES_HEADING);
  });

  it("fills in the task file and the commit, and refuses odd values", () => {
    const yaml = workflowYaml({ ref: SHA, tasksFile: "docs/TASKS.md" });
    expect(yaml).toContain("  TASKS_FILE: docs/TASKS.md\n");
    expect(yaml).toContain(`FOCUS_TRAIL_REF: "${SHA}"`);
    expect(yaml).not.toContain("<commit SHA");
    expect(() => workflowYaml({ ref: "main", tasksFile: "TASKS.md" })).toThrow();
    expect(() => workflowYaml({ ref: SHA, tasksFile: "../x.md" })).toThrow();
  });
});
