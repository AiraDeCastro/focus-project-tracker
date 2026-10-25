import { describe, expect, it } from "vitest";
import type { RepoPrApi } from "./github/repo-pr";
import { RULES_HEADING } from "./onboarding-rules";
import { openRulesPr, previewRulesPr, RULES_BRANCH } from "./rules-pr";

const BASE = { name: "main", sha: "b".repeat(40) };

function fake(over: { claude?: string | null; branch?: boolean; open?: string | null } = {}) {
  const log: string[] = [];
  const files = new Map<string, string>();
  if (over.claude !== null && over.claude !== undefined) files.set("CLAUDE.md", over.claude);
  const api: RepoPrApi = {
    defaultBranch: async () => BASE,
    branchExists: async () => over.branch === true,
    createBranch: async (_r, branch, sha) => {
      log.push(`branch ${branch} from ${sha === BASE.sha ? "base" : sha}`);
    },
    readFile: async (_r, path) =>
      files.has(path) ? { text: files.get(path) as string, sha: "blob1" } : null,
    writeFile: async (_r, input) => {
      log.push(`write ${input.path} on ${input.branch}${input.sha ? ` over ${input.sha}` : ""}`);
      files.set(`branch:${input.path}`, input.text);
    },
    openPullRequest: async () => over.open ?? null,
    createPullRequest: async (_r, input) => {
      log.push(`pr ${input.branch} into ${input.base}`);
      return "https://github.com/me/repo/pull/1";
    },
  };
  return { api, log, files };
}

describe("previewRulesPr", () => {
  it("says what would be added and writes nothing", async () => {
    const w = fake({ claude: "# Repo\n" });
    const preview = await previewRulesPr(w.api, "me/repo");
    expect(preview).toMatchObject({ state: "ready", action: "append", base: "main" });
    expect(preview.state === "ready" && preview.added.startsWith(RULES_HEADING)).toBe(true);
    expect(w.log).toEqual([]);
  });

  it("says create when there is no CLAUDE.md", async () => {
    const preview = await previewRulesPr(fake({ claude: null }).api, "me/repo");
    expect(preview).toMatchObject({ state: "ready", action: "create" });
  });

  it("recognises rules already there and a pull request already open", async () => {
    expect(
      await previewRulesPr(fake({ claude: `# R\n\n${RULES_HEADING}\n` }).api, "me/repo"),
    ).toEqual({
      state: "already_there",
    });
    expect(
      await previewRulesPr(fake({ claude: "# R\n", open: "https://x/pull/9" }).api, "me/repo"),
    ).toEqual({
      state: "pull_request_open",
      url: "https://x/pull/9",
    });
  });
});

describe("openRulesPr", () => {
  it("adds a branch, one commit and a pull request, never touching the default branch", async () => {
    const w = fake({ claude: "# Repo\n" });
    expect(await openRulesPr(w.api, "me/repo")).toEqual({
      ok: true,
      url: "https://github.com/me/repo/pull/1",
    });
    expect(w.log).toEqual([
      `branch ${RULES_BRANCH} from base`,
      `write CLAUDE.md on ${RULES_BRANCH} over blob1`,
      `pr ${RULES_BRANCH} into main`,
    ]);
    expect(w.files.get("branch:CLAUDE.md")).toContain(RULES_HEADING);
    expect(w.files.get("CLAUDE.md")).toBe("# Repo\n");
  });

  it("creates CLAUDE.md without a sha when there is none", async () => {
    const w = fake({ claude: null });
    await openRulesPr(w.api, "me/repo");
    expect(w.log[1]).toBe(`write CLAUDE.md on ${RULES_BRANCH}`);
  });

  it("does nothing when the rules exist, a pull request is open, or the branch is taken", async () => {
    for (const [over, reason] of [
      [{ claude: `${RULES_HEADING}` }, "already_there"],
      [{ claude: "# R", open: "https://x/pull/2" }, "pull_request_open"],
      [{ claude: "# R", branch: true }, "branch_exists"],
    ] as const) {
      const w = fake(over);
      const out = await openRulesPr(w.api, "me/repo");
      expect(out).toMatchObject({ ok: false, reason });
      expect(w.log).toEqual([]);
    }
  });
});
