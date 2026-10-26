import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects } from "@/db/schema";
import type { ProjectsApi } from "./github/projects";
import type { RepoWriter } from "./github/repo-writes";
import { driftNudge, runDriftCheck, type DriftReport } from "./drift-check";
import type { SyncCheck, SyncState } from "./sync-state";

const answers = new Map<string, SyncCheck | Error>();
vi.mock("./sync-state", () => ({
  checkSync: async ({ fullName }: { fullName: string }) => {
    const a = answers.get(fullName);
    if (a instanceof Error) throw a;
    return a ?? { ok: false, error: "no_tasks_file", message: "none" };
  },
}));

const writer = {} as RepoWriter;
const api = {} as ProjectsApi;

function state(over: Partial<SyncState> = {}): SyncState {
  return {
    kind: "in_sync",
    linesToImport: 0,
    fileOutOfDate: false,
    ignoredInFile: 0,
    ignored: [],
    message: "",
    ...over,
  };
}
const ok = (s: SyncState): SyncCheck => ({ ok: true, path: "TASKS.md", state: s });

let db: Db;
async function addRepo(id: number, name: string, over: Record<string, unknown> = {}) {
  await db.insert(projects).values({
    repoId: id,
    fullName: `me/${name}`,
    name,
    htmlUrl: `https://github.com/me/${name}`,
    githubProjectId: "PVT_1",
    githubProjectNumber: id,
    ...over,
  });
}

beforeEach(async () => {
  answers.clear();
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("runDriftCheck", () => {
  it("reports connected repos whose file and Project differ, and skips the rest", async () => {
    await addRepo(1, "agrees");
    await addRepo(2, "differs");
    await addRepo(3, "unreadable");
    await addRepo(4, "not-connected", { githubProjectId: null, githubProjectNumber: null });
    await addRepo(5, "practice", { kind: "practice" });
    answers.set("me/agrees", ok(state()));
    answers.set("me/differs", ok(state({ kind: "lines_to_import", linesToImport: 2 })));
    answers.set("me/unreadable", new Error("GitHub said no"));
    answers.set("me/not-connected", ok(state({ kind: "both" })));
    answers.set("me/practice", ok(state({ kind: "both" })));

    const report = await runDriftCheck({ db, writer, projects: api });
    expect(report.checked).toBe(2);
    expect(report.drifted.map((d) => d.fullName)).toEqual(["me/differs"]);
    expect(report.skipped).toEqual(["me/unreadable"]);
  });

  it("does not count a repo with no Project as drift", async () => {
    await addRepo(1, "gone");
    answers.set("me/gone", ok(state({ kind: "no_project" })));
    const report = await runDriftCheck({ db, writer, projects: api });
    expect(report).toEqual({ checked: 0, drifted: [], skipped: ["me/gone"] });
  });
});

describe("driftNudge", () => {
  const drifted = (items: [string, Partial<SyncState>][]): DriftReport => ({
    checked: items.length,
    skipped: [],
    drifted: items.map(([fullName, s]) => ({ fullName, state: state(s) })),
  });

  it("says nothing when nothing differs", () => {
    expect(driftNudge(drifted([]))).toBeNull();
  });

  it("names each repo and what differs, calmly", () => {
    const text = driftNudge(
      drifted([
        ["me/a", { linesToImport: 1 }],
        ["me/b", { linesToImport: 3, fileOutOfDate: true }],
        ["me/c", { fileOutOfDate: true }],
      ]),
    );
    expect(text).toBe(
      "TASKS.md differs from its GitHub Project in a (1 line not in the Project); b (3 lines not in the Project, file out of date); c (file out of date). Open Check sync on the dashboard when you have a minute.",
    );
  });
});
