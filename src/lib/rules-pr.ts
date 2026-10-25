import type { RepoPrApi } from "./github/repo-pr";
import { RULES_HEADING, withRules } from "./onboarding-rules";

/**
 * Offers an onboarded repo the rules for its `CLAUDE.md` through a pull request (Phase 5). Nothing
 * is written until the owner confirms the exact change; the preview returns the very text that
 * would be committed. It only adds a branch, one commit and a pull request, never touches the
 * default branch, and does nothing when the rules are already there or a pull request is already
 * open. The workflow file is not included: GitHub does not let this app's token write one, so
 * the dialog gives it as text to add by hand.
 */

export const RULES_BRANCH = "chore/focus-trail-rules";
const FILE = "CLAUDE.md";
const TITLE = "docs: add the Focus Trail rules for the task list";

export type RulesPrPreview =
  | { state: "already_there" }
  | { state: "pull_request_open"; url: string }
  | {
      state: "ready";
      /** Whether CLAUDE.md is created or added to. */
      action: "create" | "append";
      /** The text that would be added at the end of CLAUDE.md. */
      added: string;
      base: string;
    };

export type RulesPrResult =
  | { ok: true; url: string }
  | { ok: false; reason: "already_there" | "pull_request_open" | "branch_exists"; message: string };

export async function previewRulesPr(api: RepoPrApi, fullName: string): Promise<RulesPrPreview> {
  const base = await api.defaultBranch(fullName);
  const file = await api.readFile(fullName, FILE, base.name);
  if (file?.text.includes(RULES_HEADING)) return { state: "already_there" };
  const open = await api.openPullRequest(fullName, RULES_BRANCH);
  if (open) return { state: "pull_request_open", url: open };
  const next = withRules(file?.text ?? null);
  return {
    state: "ready",
    action: file ? "append" : "create",
    added: file ? next.slice(file.text.replace(/\s+$/, "").length).trimStart() : next,
    base: base.name,
  };
}

export async function openRulesPr(api: RepoPrApi, fullName: string): Promise<RulesPrResult> {
  const preview = await previewRulesPr(api, fullName);
  if (preview.state === "already_there") {
    return {
      ok: false,
      reason: "already_there",
      message: "This repo's CLAUDE.md already has the rules.",
    };
  }
  if (preview.state === "pull_request_open") {
    return {
      ok: false,
      reason: "pull_request_open",
      message: `A pull request is already open: ${preview.url}`,
    };
  }
  const base = await api.defaultBranch(fullName);
  if (await api.branchExists(fullName, RULES_BRANCH)) {
    return {
      ok: false,
      reason: "branch_exists",
      message: `The branch ${RULES_BRANCH} already exists. Delete it on GitHub, then try again.`,
    };
  }
  const file = await api.readFile(fullName, FILE, base.name);
  await api.createBranch(fullName, RULES_BRANCH, base.sha);
  await api.writeFile(fullName, {
    path: FILE,
    branch: RULES_BRANCH,
    text: withRules(file?.text ?? null),
    message: TITLE,
    ...(file ? { sha: file.sha } : {}),
  });
  const url = await api.createPullRequest(fullName, {
    branch: RULES_BRANCH,
    base: base.name,
    title: TITLE,
    body: [
      "Adds the Focus Trail rules for the task list to `CLAUDE.md`: the repo's GitHub Project is the source of truth, and `TASKS.md` is a generated copy.",
      "",
      "Only `CLAUDE.md` changes. Review it, then merge.",
      "",
      "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    ].join("\n"),
  });
  return { ok: true, url };
}
