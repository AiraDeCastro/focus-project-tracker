import { describe, expect, it } from "vitest";
import { GENERATED_NOTICE, renderTasksMd } from "./export-tasks-md";
import { parseTasksMd } from "./tasks-md";
import { keyForNewTask, reconcile, type GeneratedPlan, type ProjectState } from "./truth";

const M1 = "Milestone 1: Core";
const M2 = "Milestone 2: Polish";

function plan(over: Partial<GeneratedPlan> = {}): GeneratedPlan {
  return {
    milestones: [
      {
        title: M1,
        description: "It works.",
        tasks: [
          { key: "a", text: "Build the graph", done: true },
          { key: "b", text: "Add the picker", done: false },
        ],
      },
      { title: M2, description: "", tasks: [{ key: "c", text: "Dark mode", done: false }] },
    ],
    discovered: [],
    ...over,
  };
}

const EXISTING = `# Focus Trail: Tasks

Intro paragraph that must survive.

## Milestone 2: Polish

**Done when:** old text.

- [ ] Dark mode
- [ ] A task that is gone from the Project

## Milestone 1: Core

- [x] Old task

## Ongoing (every milestone)

- [ ] Keep the docs current
  with a wrapped line

## Before each commit

- [ ] Tests pass
`;

describe("renderTasksMd", () => {
  it("writes a new file when the repo has none", () => {
    const text = renderTasksMd(plan(), null);
    expect(text.startsWith("# Tasks\n\n<!-- focus-trail:generated:start -->")).toBe(true);
    expect(text).toContain(
      "## Milestone 1: Core\n\n**Done when:** It works.\n\n- [x] Build the graph\n- [ ] Add the picker",
    );
    expect(text.endsWith("\n")).toBe(true);
  });

  it("gives the same tasks back when the file is parsed again", () => {
    const parsed = parseTasksMd(renderTasksMd(plan(), EXISTING));
    expect(parsed.milestones.map((m) => [m.title, m.description])).toEqual([
      [M1, "It works."],
      [M2, ""],
    ]);
    expect(parsed.milestones.map((m) => m.tasks.map((t) => [t.text, t.done]))).toEqual([
      [
        ["Build the graph", true],
        ["Add the picker", false],
      ],
      [["Dark mode", false]],
    ]);
  });

  it("uses the Project's order and drops tasks the Project does not have", () => {
    const text = renderTasksMd(plan(), EXISTING);
    expect(text.indexOf(M1)).toBeLessThan(text.indexOf(M2));
    expect(text).not.toContain("A task that is gone from the Project");
    expect(text).not.toContain("Old task");
  });

  it("keeps every other section exactly as it was", () => {
    const text = renderTasksMd(plan(), EXISTING);
    expect(text).toContain("Intro paragraph that must survive.");
    expect(text).toContain(
      "## Ongoing (every milestone)\n\n- [ ] Keep the docs current\n  with a wrapped line",
    );
    expect(text).toContain("## Before each commit\n\n- [ ] Tests pass\n");
    expect(text.indexOf("## Ongoing")).toBeGreaterThan(text.indexOf(M2));
  });

  it("puts milestones where the first milestone section was, not before earlier sections", () => {
    const existing = "# T\n\n## Overview\n\nHello.\n\n## Milestone 1: Core\n\n- [ ] x\n";
    const text = renderTasksMd(plan(), existing);
    expect(text.indexOf("## Overview")).toBeLessThan(text.indexOf("## Milestone 1"));
  });

  it("puts milestones before the first other section when the file had none", () => {
    const text = renderTasksMd(plan(), "# T\n\n## Ongoing\n\n- [ ] keep\n");
    expect(text.indexOf("## Milestone 1")).toBeLessThan(text.indexOf("## Ongoing"));
  });

  it("rebuilds Discovered during work from the Project's loose tasks, keeping the heading's spelling", () => {
    const existing = `${EXISTING}\n## Discovered During Work\n\n- [ ] Old line\n`;
    const text = renderTasksMd(
      plan({ discovered: [{ key: "d", text: "Fix the cache", done: false }] }),
      existing,
    );
    expect(text).toContain("## Discovered During Work\n\n- [ ] Fix the cache");
    expect(text).not.toContain("Old line");
    expect(parseTasksMd(text).discovered.map((t) => t.text)).toEqual(["Fix the cache"]);
  });

  it("adds a Discovered during work section at the end when there is none yet", () => {
    const text = renderTasksMd(
      plan({ discovered: [{ key: "d", text: "Fix the cache", done: true }] }),
      EXISTING,
    );
    expect(text.trimEnd().endsWith("## Discovered during work\n\n- [x] Fix the cache")).toBe(true);
  });

  it("leaves the section out when the Project has no loose tasks", () => {
    const text = renderTasksMd(plan(), `${EXISTING}\n## Discovered during work\n\n- [ ] Old\n`);
    expect(text).not.toContain("## Discovered during work");
  });

  it("is stable: rendering its own output again changes nothing", () => {
    const once = renderTasksMd(
      plan({ discovered: [{ key: "d", text: "Fix", done: false }] }),
      EXISTING,
    );
    const twice = renderTasksMd(
      plan({ discovered: [{ key: "d", text: "Fix", done: false }] }),
      once,
    );
    expect(twice).toBe(once);
  });

  it("replaces the notice instead of adding a second one", () => {
    const once = renderTasksMd(plan(), EXISTING);
    const twice = renderTasksMd(plan(), once);
    expect(twice.split("focus-trail:generated:start").length - 1).toBe(1);
    expect(once).toContain(GENERATED_NOTICE);
  });

  it("writes one-line tasks and understands Windows line endings", () => {
    const messy = plan({
      milestones: [
        {
          title: M1,
          description: "Line one\nline two",
          tasks: [{ key: "a", text: "Wrapped\n  task   text", done: false }],
        },
      ],
    });
    const text = renderTasksMd(messy, EXISTING.replace(/\n/g, "\r\n"));
    expect(text).not.toContain("\r");
    expect(text).toContain("**Done when:** Line one line two");
    expect(text).toContain("- [ ] Wrapped task text");
  });
});

describe("export with the conflict rules", () => {
  const held = (m: string | null, text: string, done = false) => ({
    key: keyForNewTask(m, text),
    title: text,
    text,
    done,
  });
  const project: ProjectState = {
    milestones: [
      { title: M1, description: "It works.", tasks: [held(M1, "Build the graph", true)] },
    ],
    loose: [],
  };

  it("brings an added line into the next generated file, and puts a tick back", () => {
    const file = `# Tasks\n\n## ${M1}\n\n- [ ] Build the graph\n- [ ] Print stylesheet\n`;
    const { generated } = reconcile(parseTasksMd(file), project);
    const text = renderTasksMd(generated, file);
    const parsed = parseTasksMd(text);
    expect(parsed.milestones[0].tasks.map((t) => [t.text, t.done])).toEqual([
      ["Build the graph", true],
      ["Print stylesheet", false],
    ]);
  });
});
