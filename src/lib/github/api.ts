import { Octokit } from "octokit";
import { TtlCache } from "./cache";

export interface GithubRepo {
  repoId: number;
  fullName: string;
  name: string;
  htmlUrl: string;
  isFork: boolean;
  isArchived: boolean;
  pushedAt: string | null;
}

export interface GithubMilestone {
  number: number;
  title: string;
  /** ISO timestamp or null when the milestone has no due date. */
  dueOn: string | null;
  openIssues: number;
  closedIssues: number;
}

export interface IssueCounts {
  open: number;
  closed: number;
}

/** Read-only view of GitHub. The app never writes issues; GitHub is the source of truth. */
export interface GithubApi {
  /** Repos the signed-in user owns, public and private. */
  listRepos(): Promise<GithubRepo[]>;
  listMilestones(fullName: string): Promise<GithubMilestone[]>;
  /** Issue counts excluding pull requests; used for repos that have no milestones. */
  countIssues(fullName: string): Promise<IssueCounts>;
  /** ISO time of the most recently closed issue, or null if none has been closed. */
  lastClosedAt(fullName: string): Promise<string | null>;
  /**
   * Open issues in a milestone, oldest first, at most `limit`. Pass `undefined` for a repo with
   * no milestones to get its open issues overall. Pull requests are skipped.
   */
  openIssues(fullName: string, milestone: number | undefined, limit: number): Promise<OpenIssue[]>;
  /** ISO closing times of issues closed on or after `sinceIso`. Pull requests are skipped. */
  closedSince(fullName: string, sinceIso: string): Promise<string[]>;
}

export interface OpenIssue {
  number: number;
  title: string;
  htmlUrl: string;
}

export interface GithubApiOptions {
  /** Replaces the global `fetch`; used by tests. */
  fetch?: typeof fetch;
  /** How long responses are reused, in milliseconds. Defaults to 5 minutes. */
  cacheTtlMs?: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;

function split(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Expected "owner/name", got "${fullName}"`);
  return { owner, repo };
}

export function createGithubApi(token: string, options: GithubApiOptions = {}): GithubApi {
  const octokit = new Octokit({
    auth: token,
    request: options.fetch ? { fetch: options.fetch } : undefined,
  });
  const cache = new TtlCache(options.cacheTtlMs ?? FIVE_MINUTES);

  return {
    listRepos: () =>
      cache.get("repos", async () => {
        const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
          affiliation: "owner",
          visibility: "all",
          sort: "updated",
          per_page: 100,
        });
        return repos.map((r): GithubRepo => ({
          repoId: r.id,
          fullName: r.full_name,
          name: r.name,
          htmlUrl: r.html_url,
          isFork: r.fork,
          isArchived: r.archived,
          pushedAt: r.pushed_at ?? null,
        }));
      }),

    listMilestones: (fullName) =>
      cache.get(`milestones:${fullName}`, async () => {
        const milestones = await octokit.paginate(octokit.rest.issues.listMilestones, {
          ...split(fullName),
          state: "all",
          sort: "due_on",
          direction: "asc",
          per_page: 100,
        });
        return milestones.map((m): GithubMilestone => ({
          number: m.number,
          title: m.title,
          dueOn: m.due_on,
          openIssues: m.open_issues,
          closedIssues: m.closed_issues,
        }));
      }),

    countIssues: (fullName) =>
      cache.get(`issues:${fullName}`, async () => {
        const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
          ...split(fullName),
          state: "all",
          per_page: 100,
        });
        const real = issues.filter((i) => !i.pull_request);
        const closed = real.filter((i) => i.state === "closed").length;
        return { open: real.length - closed, closed };
      }),

    lastClosedAt: (fullName) =>
      cache.get(`lastClosed:${fullName}`, async () => {
        const { data } = await octokit.rest.issues.listForRepo({
          ...split(fullName),
          state: "closed",
          sort: "updated",
          direction: "desc",
          per_page: 30,
        });
        const times = data
          .filter((i) => !i.pull_request && i.closed_at)
          .map((i) => i.closed_at as string);
        return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
      }),

    openIssues: (fullName, milestone, limit) =>
      cache.get(`open:${fullName}:${milestone ?? "none"}:${limit}`, async () => {
        // Fetch a little extra because pull requests share this endpoint and are filtered out.
        const { data } = await octokit.rest.issues.listForRepo({
          ...split(fullName),
          state: "open",
          // "none" matches issues without a milestone, which is the implicit milestone case.
          milestone: milestone === undefined ? "none" : String(milestone),
          sort: "created",
          direction: "asc",
          per_page: Math.min(limit * 3, 100),
        });
        return data
          .filter((i) => !i.pull_request)
          .slice(0, limit)
          .map((i): OpenIssue => ({ number: i.number, title: i.title, htmlUrl: i.html_url }));
      }),

    closedSince: (fullName, sinceIso) =>
      cache.get(`closedSince:${fullName}:${sinceIso}`, async () => {
        const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
          ...split(fullName),
          state: "closed",
          since: sinceIso, // filters on last update, so closed_at is checked again below
          per_page: 100,
        });
        return issues
          .filter((i) => !i.pull_request && i.closed_at && i.closed_at >= sinceIso)
          .map((i) => i.closed_at as string);
      }),
  };
}
