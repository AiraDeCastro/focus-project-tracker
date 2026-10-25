import { describe, expect, it } from "vitest";
import { parseTasksMd, taskKey } from "./tasks-md";
import { keyForNewTask, reconcile, similarity, type ProjectState, type ProjectTask } from "./truth";

const M1 = "Milestone 1: Core";
const M2 = "Milestone 2: Polish";

/** A Project task, keyed the way the file parser keys the same line. */
function held(milestone: string | null, text: string, done = false): ProjectTask {
  return { key: keyForNewTask(milestone, text), title: text, text, done };
}

function project(over: Partial<ProjectState> = {}): ProjectState {
  return {
    milestones: [
      {
        title: M1,
        description: "It works.",
        tasks: [held(M1, "Build the graph", true), held(M1, "Add the picker")],
      },
      { title: M2, description: "", tasks: [held(M2, "Dark mode")] },
    ],
    loose: [],
    ...over,
  };
}

const FILE = `# Tasks

## ${M1}

**Exit:** It works.

- [x] Build the graph
- [ ] Add the picker

## ${M2}

- [ ] Dark mode
`;

describe("similarity", () => {
  it("is 1 for the same words and 0 for none in common", () => {
    expect(similarity("Add the picker", "add THE picker!")).toBe(1);
    expect(similarity("Add the picker", "Fix upload bug")).toBe(0);
    expect(similarity("", "x")).toBe(0);
  });
});

describe("reconcile: when the two agree", () => {
  it("changes nothing", () => {
    const result = reconcile(parseTasksMd(FILE), project());
    expect(result.imports).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(result.newMilestones).toEqual([]);
  });

  it("generates the Project's own milestones, descriptions, tasks and order", () => {
    const { generated } = reconcile(parseTasksMd(FILE), project());
    expect(generated.milestones.map((m) => m.title)).toEqual([M1, M2]);
    expect(generated.milestones[0].description).toBe("It works.");
    expect(generated.milestones[0].tasks.map((t) => [t.text, t.done])).toEqual([
      ["Build the graph", true],
      ["Add the picker", false],
    ]);
    expect(generated.discovered).toEqual([]);
  });
});

describe("reconcile: the Project wins", () => {
  it("ignores a task ticked in the file and reports it", () => {
    const file = FILE.replace("- [ ] Add the picker", "- [x] Add the picker");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.drift.map((d) => d.kind)).toEqual(["ticked_in_file"]);
    expect(result.imports).toEqual([]);
    expect(result.generated.milestones[0].tasks[1].done).toBe(false);
  });

  it("puts back a task unticked in the file", () => {
    const file = FILE.replace("- [x] Build the graph", "- [ ] Build the graph");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.drift.map((d) => d.kind)).toEqual(["unticked_in_file"]);
    expect(result.generated.milestones[0].tasks[0].done).toBe(true);
  });

  it("restores a task removed from the file, and never imports anything for it", () => {
    const file = FILE.replace("- [ ] Dark mode\n", "");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.drift).toEqual([
      { kind: "removed_from_file", key: keyForNewTask(M2, "Dark mode"), title: "Dark mode" },
    ]);
    expect(result.imports).toEqual([]);
    expect(result.generated.milestones[1].tasks.map((t) => t.text)).toEqual(["Dark mode"]);
  });

  it("treats a reworded line as a rename, not as new work", () => {
    const file = FILE.replace("Add the picker", "Add the focus picker");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.imports).toEqual([]);
    expect(result.drift).toEqual([
      {
        kind: "renamed_in_file",
        key: keyForNewTask(M1, "Add the picker"),
        title: "Add the picker",
        fileText: "Add the focus picker",
      },
    ]);
    expect(result.generated.milestones[0].tasks[1].text).toBe("Add the picker");
  });

  it("treats the same line under another milestone as a move", () => {
    const file = FILE.replace("- [ ] Add the picker\n", "").replace(
      "- [ ] Dark mode",
      "- [ ] Dark mode\n- [ ] Add the picker",
    );
    const result = reconcile(parseTasksMd(file), project());
    expect(result.imports).toEqual([]);
    expect(result.drift.map((d) => d.kind)).toEqual(["moved_in_file"]);
    expect(result.generated.milestones[0].tasks.map((t) => t.text)).toContain("Add the picker");
  });

  it("does not take a clearly different line for a rename", () => {
    const file = FILE.replace("Add the picker", "Write the deployment guide");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.imports.map((i) => i.text)).toEqual(["Write the deployment guide"]);
    expect(result.drift.map((d) => d.kind)).toEqual(["removed_from_file"]);
  });
});

describe("reconcile: additions are imported", () => {
  it("imports a new line under an existing milestone, open", () => {
    const file = FILE.replace("- [ ] Dark mode", "- [ ] Dark mode\n- [ ] Print stylesheet");
    const result = reconcile(parseTasksMd(file), project());
    expect(result.imports).toEqual([
      {
        milestone: M2,
        title: "Print stylesheet",
        text: "Print stylesheet",
        key: taskKey(M2, "Print stylesheet"),
        done: false,
      },
    ]);
    expect(result.drift).toEqual([]);
    expect(result.generated.milestones[1].tasks.map((t) => t.text)).toEqual([
      "Dark mode",
      "Print stylesheet",
    ]);
  });

  it("imports a task under Discovered during work with no milestone", () => {
    const file = `${FILE}\n## Discovered during work\n\n- [ ] Fix the stale cache bug\n`;
    const result = reconcile(parseTasksMd(file), project());
    expect(result.imports).toEqual([
      {
        milestone: null,
        title: "Fix the stale cache bug",
        text: "Fix the stale cache bug",
        key: keyForNewTask(null, "Fix the stale cache bug"),
        done: false,
      },
    ]);
    expect(result.generated.discovered.map((t) => t.text)).toEqual(["Fix the stale cache bug"]);
  });

  it("is idempotent: once the Project holds the imported task, the next run changes nothing", () => {
    const file = `${FILE}\n## Discovered during work\n\n- [ ] Fix the stale cache bug\n`;
    const first = reconcile(parseTasksMd(file), project());
    const after = project({
      loose: first.imports.map((i) => ({
        key: i.key,
        title: i.title,
        text: i.text,
        done: i.done,
      })),
    });
    const second = reconcile(parseTasksMd(file), after);
    expect(second.imports).toEqual([]);
    expect(second.drift).toEqual([]);
  });

  it("asks for a milestone the file names and the Project lacks", () => {
    const file = `${FILE}\n## Milestone 3: Launch\n\n**Done when:** It is live.\n\n- [ ] Announce it\n`;
    const result = reconcile(parseTasksMd(file), project());
    expect(result.newMilestones).toEqual([
      { title: "Milestone 3: Launch", description: "It is live." },
    ]);
    expect(result.imports.map((i) => i.milestone)).toEqual(["Milestone 3: Launch"]);
    expect(result.generated.milestones.map((m) => m.title)).toEqual([
      M1,
      M2,
      "Milestone 3: Launch",
    ]);
  });
});

describe("reconcile: modes", () => {
  const ticked = `${FILE}\n## Discovered during work\n\n- [x] Already done elsewhere\n`;

  it("sync mode brings a ticked new line in open and reports the tick", () => {
    const result = reconcile(parseTasksMd(ticked), project());
    expect(result.imports[0].done).toBe(false);
    expect(result.drift.map((d) => d.kind)).toEqual(["ticked_in_file"]);
  });

  it("onboard mode keeps a ticked line closed, with no drift", () => {
    const result = reconcile(parseTasksMd(ticked), project(), { mode: "onboard" });
    expect(result.imports[0].done).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it("onboarding an empty Project imports every task of the file", () => {
    const empty: ProjectState = { milestones: [], loose: [] };
    const result = reconcile(parseTasksMd(FILE), empty, { mode: "onboard" });
    expect(result.imports.map((i) => [i.milestone, i.text, i.done])).toEqual([
      [M1, "Build the graph", true],
      [M1, "Add the picker", false],
      [M2, "Dark mode", false],
    ]);
    expect(result.newMilestones.map((m) => m.title)).toEqual([M1, M2]);
    expect(result.newMilestones[0].description).toBe("It works.");
  });
});

describe("never deletes", () => {
  it("has no operation that removes or reopens a task", () => {
    const file = "# Tasks\n";
    const result = reconcile(parseTasksMd(file), project());
    expect(Object.keys(result).sort()).toEqual(["drift", "generated", "imports", "newMilestones"]);
    expect(result.generated.milestones.flatMap((m) => m.tasks)).toHaveLength(3);
  });
});
