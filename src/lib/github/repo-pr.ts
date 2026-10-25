/**
 * The few calls needed to open a pull request that changes one file in another of the owner's
 * repos: the default branch, a new branch, a file's text and sha, writing the file on the branch,
 * and the pull request itself. Plain `fetch`; the token is only sent in the Authorization header
 * and never put in a message. Needs the `repo` scope (already granted). It never touches the
 * default branch directly and never force-pushes: it only adds a branch, a commit and a pull
 * request. A workflow file cannot be written with this token, so it is not offered here.
 */
import { GithubGraphqlError } from "./projects";

const API = "https://api.github.com";

export interface BranchInfo {
  name: string;
  sha: string;
}

export interface RepoPrApi {
  defaultBranch(fullName: string): Promise<BranchInfo>;
  branchExists(fullName: string, branch: string): Promise<boolean>;
  createBranch(fullName: string, branch: string, fromSha: string): Promise<void>;
  /** A file's text and blob sha on a branch, or null when it is not there. */
  readFile(
    fullName: string,
    path: string,
    branch: string,
  ): Promise<{ text: string; sha: string } | null>;
  writeFile(
    fullName: string,
    input: { path: string; branch: string; text: string; message: string; sha?: string },
  ): Promise<void>;
  /** The URL of an open pull request from this branch, or null. */
  openPullRequest(fullName: string, branch: string): Promise<string | null>;
  createPullRequest(
    fullName: string,
    input: { branch: string; base: string; title: string; body: string },
  ): Promise<string>;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;

function checkName(fullName: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName))
    throw new Error(`Expected "owner/name", got "${fullName}"`);
  return fullName;
}
function checkPath(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.length > 200 || clean.split("/").includes("..")) {
    throw new Error("That is not a path inside the repo.");
  }
  return clean.split("/").map(encodeURIComponent).join("/");
}
function checkBranch(branch: string): string {
  if (!/^[\w./-]{1,100}$/.test(branch) || branch.includes("..")) {
    throw new Error("That is not a valid branch name.");
  }
  return branch;
}

export function createRepoPrApi(token: string, options: { fetch?: typeof fetch } = {}): RepoPrApi {
  const doFetch = options.fetch ?? fetch;

  async function call(method: "GET" | "POST" | "PUT", path: string, body?: object) {
    const response = await doFetch(`${API}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) {
      const headers: Record<string, string> = {};
      for (const name of ["x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
        const value = response.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      throw new GithubGraphqlError(`GitHub answered ${response.status}.`, response.status, headers);
    }
    return (await response.json()) as unknown;
  }

  return {
    async defaultBranch(fullName) {
      const repo = await call("GET", `repos/${checkName(fullName)}`);
      const name =
        isObject(repo) && typeof repo.default_branch === "string" ? repo.default_branch : null;
      if (!name) throw new GithubGraphqlError("Could not read the repo's default branch.", 502);
      const ref = await call("GET", `repos/${fullName}/git/ref/heads/${checkBranch(name)}`);
      const sha =
        isObject(ref) && isObject(ref.object) && typeof ref.object.sha === "string"
          ? ref.object.sha
          : null;
      if (!sha) throw new GithubGraphqlError("Could not read the default branch's commit.", 502);
      return { name, sha };
    },

    async branchExists(fullName, branch) {
      const ref = await call(
        "GET",
        `repos/${checkName(fullName)}/git/ref/heads/${checkBranch(branch)}`,
      );
      return ref !== null;
    },

    async createBranch(fullName, branch, fromSha) {
      if (!/^[0-9a-f]{40}$/.test(fromSha)) throw new Error("That is not a commit sha.");
      await call("POST", `repos/${checkName(fullName)}/git/refs`, {
        ref: `refs/heads/${checkBranch(branch)}`,
        sha: fromSha,
      });
    },

    async readFile(fullName, path, branch) {
      const file = await call(
        "GET",
        `repos/${checkName(fullName)}/contents/${checkPath(path)}?ref=${encodeURIComponent(checkBranch(branch))}`,
      );
      if (!isObject(file) || typeof file.sha !== "string" || typeof file.content !== "string") {
        return null;
      }
      return { text: Buffer.from(file.content, "base64").toString("utf8"), sha: file.sha };
    },

    async writeFile(fullName, input) {
      await call("PUT", `repos/${checkName(fullName)}/contents/${checkPath(input.path)}`, {
        message: input.message,
        content: Buffer.from(input.text, "utf8").toString("base64"),
        branch: checkBranch(input.branch),
        ...(input.sha ? { sha: input.sha } : {}),
      });
    },

    async openPullRequest(fullName, branch) {
      const owner = checkName(fullName).split("/")[0];
      const list = await call(
        "GET",
        `repos/${fullName}/pulls?state=open&head=${encodeURIComponent(`${owner}:${checkBranch(branch)}`)}`,
      );
      const first = Array.isArray(list) ? list[0] : null;
      return isObject(first) && typeof first.html_url === "string" ? first.html_url : null;
    },

    async createPullRequest(fullName, input) {
      const made = await call("POST", `repos/${checkName(fullName)}/pulls`, {
        title: input.title.slice(0, 250),
        head: checkBranch(input.branch),
        base: checkBranch(input.base),
        body: input.body.slice(0, 60_000),
      });
      const url = isObject(made) && typeof made.html_url === "string" ? made.html_url : null;
      if (!url) throw new GithubGraphqlError("GitHub did not return the pull request.", 502);
      return url;
    },
  };
}
