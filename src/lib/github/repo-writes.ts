/**
 * The few writes the Project mirror needs on a repo: milestones and issues, over plain `fetch`.
 * The token is only ever sent in the Authorization header; it is never put in an error message or
 * a log. Needs the `repo` scope (already granted). It never deletes an issue or reopens one.
 *
 * Phase 5 (Milestone 5). Shapes follow GitHub's REST documentation and have NOT yet been run
 * against a real repo, so every read is defensive.
 */
import { GithubGraphqlError } from "./projects";

const API = "https://api.github.com";
const PER_PAGE = 100;
const MAX_PAGES = 30;

/** The hidden key `npm run tasks:sync` puts in every issue it creates. */
export const KEY_MARKER = /<!-- tasks-md-key:([0-9a-f]+) -->/;

export interface RepoMilestone {
  number: number;
  title: string;
  state: "open" | "closed";
  /** The milestone's description, which the sync fills from the "Done when" line. */
  description: string;
}

export interface RepoIssue {
  number: number;
  /** The issue's GraphQL node id, needed to add it to a Project. */
  nodeId: string;
  title: string;
  /**
   * The full task text. Titles are cut to one short line, so the sync keeps the whole text first
   * in the body; this reads it back, and is the title for issues made any other way.
   */
  text: string;
  state: "open" | "closed";
  milestone: number | null;
  /** The hidden task key from the body, or null for an issue the sync did not create. */
  key: string | null;
}

export interface RepoWriter {
  listMilestones(fullName: string): Promise<RepoMilestone[]>;
  /** Every issue, open and closed, without pull requests. */
  listIssues(fullName: string): Promise<RepoIssue[]>;
  /** A file's text from the repo's default branch, or null when the file is not there. */
  readFile(fullName: string, path: string): Promise<string | null>;
  createMilestone(
    fullName: string,
    input: { title: string; description: string; dueOn?: string | null },
  ): Promise<RepoMilestone>;
  createIssue(
    fullName: string,
    input: { title: string; body: string; milestone: number | null },
  ): Promise<RepoIssue>;
  closeIssue(fullName: string, number: number): Promise<void>;
}

export interface RepoWriterOptions {
  /** Replaces the global `fetch`; used by tests. */
  fetch?: typeof fetch;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null;
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function checkName(fullName: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName))
    throw new Error(`Expected "owner/name", got "${fullName}"`);
  return fullName;
}

/** The body of an issue the mirror creates: the full text when the title is shortened, then the key. */
export function issueBody(text: string, title: string, milestone: string | null, key: string) {
  const full = text !== title ? `${text}\n\n---\n` : "";
  const origin = milestone ?? "Discovered during work";
  return `${full}From \`TASKS.md\` · ${origin}\n<!-- tasks-md-key:${key} -->\n`.slice(0, 60_000);
}

/** The text before the `---` rule `issueBody` writes when the title was shortened, else the title. */
function fullText(body: string, title: string): string {
  const cut = body.indexOf("\n\n---\nFrom `TASKS.md`");
  const first = cut > 0 ? body.slice(0, cut).trim() : "";
  return first.length > 0 && first.length <= 4000 ? first.replace(/\s+/g, " ") : title;
}

export function readMilestone(raw: unknown): RepoMilestone | null {
  if (!isObject(raw) || typeof raw.number !== "number") return null;
  const title = text(raw.title);
  if (!title) return null;
  return {
    number: raw.number,
    title,
    state: raw.state === "closed" ? "closed" : "open",
    description: typeof raw.description === "string" ? raw.description : "",
  };
}

/** Null for pull requests and anything unreadable. */
export function readIssue(raw: unknown): RepoIssue | null {
  if (!isObject(raw) || "pull_request" in raw) return null;
  const nodeId = text(raw.node_id);
  const title = text(raw.title);
  if (typeof raw.number !== "number" || !nodeId || !title) return null;
  const body = typeof raw.body === "string" ? raw.body : "";
  const milestone =
    isObject(raw.milestone) && typeof raw.milestone.number === "number"
      ? raw.milestone.number
      : null;
  return {
    number: raw.number,
    nodeId,
    title,
    text: fullText(body, title),
    state: raw.state === "closed" ? "closed" : "open",
    milestone,
    key: KEY_MARKER.exec(body)?.[1] ?? null,
  };
}

export function createRepoWriter(token: string, options: RepoWriterOptions = {}): RepoWriter {
  const doFetch = options.fetch ?? fetch;

  async function call(method: "GET" | "POST" | "PATCH", path: string, body?: object) {
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

  async function readRaw(path: string): Promise<string | null> {
    const response = await doFetch(`${API}/${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const headers: Record<string, string> = {};
      for (const name of ["x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
        const value = response.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      throw new GithubGraphqlError(`GitHub answered ${response.status}.`, response.status, headers);
    }
    return await response.text();
  }

  async function pages(path: string): Promise<unknown[]> {
    const all: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const sep = path.includes("?") ? "&" : "?";
      const batch = await call("GET", `${path}${sep}per_page=${PER_PAGE}&page=${page}`);
      if (!Array.isArray(batch)) break;
      all.push(...batch);
      if (batch.length < PER_PAGE) break;
    }
    return all;
  }

  return {
    async listMilestones(fullName) {
      const raw = await pages(`repos/${checkName(fullName)}/milestones?state=all`);
      return raw.map(readMilestone).filter((m): m is RepoMilestone => m !== null);
    },

    async listIssues(fullName) {
      const raw = await pages(`repos/${checkName(fullName)}/issues?state=all`);
      return raw.map(readIssue).filter((i): i is RepoIssue => i !== null);
    },

    async readFile(fullName, path) {
      const clean = path.replace(/^\/+/, "");
      if (!clean || clean.split("/").includes("..") || clean.length > 200) {
        throw new Error("That is not a path inside the repo.");
      }
      return readRaw(
        `repos/${checkName(fullName)}/contents/${clean.split("/").map(encodeURIComponent).join("/")}`,
      );
    },

    async createMilestone(fullName, input) {
      const title = input.title.trim();
      if (!title || title.length > 250)
        throw new Error("A milestone title needs 1 to 250 characters.");
      const made = readMilestone(
        await call("POST", `repos/${checkName(fullName)}/milestones`, {
          title,
          description: input.description.slice(0, 900),
          // Noon UTC, so the due date lands on the same calendar day in every timezone.
          ...(input.dueOn ? { due_on: `${input.dueOn}T12:00:00Z` } : {}),
        }),
      );
      if (!made) throw new GithubGraphqlError("GitHub did not return the new milestone.", 502);
      return made;
    },

    async createIssue(fullName, input) {
      const title = input.title.trim();
      if (!title || title.length > 256)
        throw new Error("An issue title needs 1 to 256 characters.");
      const made = readIssue(
        await call("POST", `repos/${checkName(fullName)}/issues`, {
          title,
          body: input.body.slice(0, 60_000),
          ...(input.milestone !== null ? { milestone: input.milestone } : {}),
        }),
      );
      if (!made) throw new GithubGraphqlError("GitHub did not return the new issue.", 502);
      return made;
    },

    async closeIssue(fullName, number) {
      if (!Number.isInteger(number) || number < 1) throw new Error("An issue number is required.");
      await call("PATCH", `repos/${checkName(fullName)}/issues/${number}`, {
        state: "closed",
        state_reason: "completed",
      });
    },
  };
}
