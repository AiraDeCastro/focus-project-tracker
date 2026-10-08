import { describe, expect, it } from "vitest";
import { milestoneTitle, parseTasksMd, shortTitle, taskKey } from "./tasks-md";

describe("milestoneTitle", () => {
  it("drops status notes and emphasis but keeps useful parentheses", () => {
    expect(milestoneTitle("Milestone 2 — Authentication (v1: sign up / sign in) *(done)*")).toBe(
      "Milestone 2 — Authentication (v1: sign up / sign in)",
    );
    expect(
      milestoneTitle("Milestone 10 — v1.1 *(done, deployed, and verified in production)*"),
    ).toBe("Milestone 10 — v1.1");
    expect(milestoneTitle("Milestone 3: Core records (P0, weeks 5 to 9)")).toBe(
      "Milestone 3: Core records (P0, weeks 5 to 9)",
    );
    expect(milestoneTitle("**M4** — Overlap engine (MVP)")).toBe("M4 — Overlap engine (MVP)");
  });
});

describe("shortTitle", () => {
  it("keeps short text as is", () => {
    expect(shortTitle("Add the tests")).toBe("Add the tests");
  });

  it("cuts long text at a word and ends with an ellipsis, within the limit", () => {
    const long = "Landing page: 4 feature-pillar cards ".repeat(8).trim();
    const title = shortTitle(long);
    expect(title.length).toBeLessThanOrEqual(110);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/\s…$/);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });
});

const SAMPLE = `# Project Tasks

Intro text that is not a task.

## Milestone 0 — Setup *(done)*

Exit: the repo runs locally with one command.

- [x] Create the repo
- [x] Add **strict** TypeScript and linting
- [ ] Check the trademark: still waiting on the office
      to answer, wrapped onto a second line
- [x] Write the README

## Milestone 1: Core (P0, weeks 2 to 4)

**Done when:** a user can sign in.

- [ ] Build sign-in
- [ ] Build the dashboard

## M2 — Polish

- [ ] Dark mode

## Ongoing (every milestone)

- [ ] Keep the docs current
- [ ] Review dependencies

## Before each commit

- [ ] Tests pass
`;

describe("parseTasksMd", () => {
  const parsed = parseTasksMd(SAMPLE);

  it("finds only milestone sections", () => {
    expect(parsed.milestones.map((m) => m.title)).toEqual([
      "Milestone 0 — Setup",
      "Milestone 1: Core (P0, weeks 2 to 4)",
      "M2 — Polish",
    ]);
  });

  it("reports other sections as skipped with their task counts", () => {
    expect(parsed.skipped).toEqual([
      { heading: "Ongoing (every milestone)", tasks: 2 },
      { heading: "Before each commit", tasks: 1 },
    ]);
  });

  it("reads checked and unchecked tasks in order", () => {
    const m0 = parsed.milestones[0];
    expect(m0.tasks.map((t) => [t.title, t.done])).toEqual([
      ["Create the repo", true],
      ["Add strict TypeScript and linting", true],
      [
        "Check the trademark: still waiting on the office to answer, wrapped onto a second line",
        false,
      ],
      ["Write the README", true],
    ]);
    expect(m0.allDone).toBe(false);
  });

  it("joins wrapped lines into one task, not several", () => {
    expect(parsed.milestones[0].tasks).toHaveLength(4);
    expect(parsed.milestones[0].tasks[2].text).toContain("wrapped onto a second line");
  });

  it("takes the Exit or Done when line as the milestone description", () => {
    expect(parsed.milestones[0].description).toBe("the repo runs locally with one command.");
    expect(parsed.milestones[1].description).toBe("a user can sign in.");
    expect(parsed.milestones[2].description).toBe("");
  });

  it("marks a milestone done only when it has tasks and all are checked", () => {
    expect(parsed.milestones[1].allDone).toBe(false);
    const done = parseTasksMd("## Milestone 0 — A\n\n- [x] one\n- [X] two\n");
    expect(done.milestones[0].allDone).toBe(true);
    const empty = parseTasksMd("## Milestone 0 — A\n\nJust words.\n");
    expect(empty.milestones[0].allDone).toBe(false);
    expect(empty.milestones[0].tasks).toEqual([]);
  });

  it("gives every task a stable key that depends on its milestone and text", () => {
    const again = parseTasksMd(SAMPLE);
    expect(again.milestones[0].tasks.map((t) => t.key)).toEqual(
      parsed.milestones[0].tasks.map((t) => t.key),
    );
    expect(new Set(parsed.milestones.flatMap((m) => m.tasks.map((t) => t.key))).size).toBe(7);
    expect(taskKey("A", "same")).not.toBe(taskKey("B", "same"));
    expect(taskKey("A", "same")).toHaveLength(12);
  });

  it("keeps the same key when a task is only ticked", () => {
    const before = parseTasksMd("## Milestone 0 — A\n\n- [ ] Do the thing\n");
    const after = parseTasksMd("## Milestone 0 — A\n\n- [x] Do the thing\n");
    expect(after.milestones[0].tasks[0].key).toBe(before.milestones[0].tasks[0].key);
  });

  it("numbers repeated milestone titles so they stay distinct", () => {
    const r = parseTasksMd("## Milestone 1 — A\n\n- [ ] x\n\n## Milestone 1 — A\n\n- [ ] y\n");
    expect(r.milestones.map((m) => m.title)).toEqual(["Milestone 1 — A", "Milestone 1 — A (2)"]);
  });

  it("handles Windows line endings and a file with no milestones", () => {
    const crlf = parseTasksMd("## Milestone 0 — A\r\n\r\n- [x] one\r\n- [ ] two\r\n");
    expect(crlf.milestones[0].tasks.map((t) => t.title)).toEqual(["one", "two"]);
    expect(parseTasksMd("# Notes\n\nNothing here.\n")).toEqual({ milestones: [], skipped: [] });
  });
});
