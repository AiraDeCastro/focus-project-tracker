import { GithubGraphqlError } from "./projects";

/**
 * Starts a repo's "sync TASKS.md with the GitHub Project" workflow by hand, for the app's
 * "Sync now" button (Phase 5). GitHub has no trigger for a change to a personal Project, so the
 * workflow also runs on a schedule; this only asks it to run now. Plain `fetch`; the token is only
 * sent in the Authorization header. Needs write access to the repo's Actions, which the `repo`
 * scope covers.
 */

export const SYNC_WORKFLOW_FILE = "focus-trail-sync.yml";

export interface DispatchOptions {
  /** The workflow's file name under .github/workflows. */
  workflow?: string;
  /** The branch to run it on. */
  ref?: string;
  /** Replaces the global `fetch`; used by tests. */
  fetch?: typeof fetch;
}

const REPO = /^[\w.-]+\/[\w.-]+$/;
const WORKFLOW_FILE = /^[\w.-]+\.ya?ml$/;
const REF = /^[\w./-]{1,100}$/;

export async function startSyncWorkflow(
  token: string,
  fullName: string,
  options: DispatchOptions = {},
): Promise<void> {
  const workflow = options.workflow ?? SYNC_WORKFLOW_FILE;
  const ref = options.ref ?? "main";
  if (!REPO.test(fullName)) throw new Error(`Expected "owner/name", got "${fullName}"`);
  if (!WORKFLOW_FILE.test(workflow)) throw new Error("A workflow file name looks like sync.yml.");
  if (!REF.test(ref) || ref.includes("..")) throw new Error("That branch name is not valid.");

  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(
    `https://api.github.com/repos/${fullName}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    },
  );
  if (response.ok) return; // GitHub answers 204 with no body
  const headers: Record<string, string> = {};
  for (const name of ["x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  throw new GithubGraphqlError(
    response.status === 404
      ? `The workflow ${workflow} was not found in ${fullName}. Add it first.`
      : `GitHub answered ${response.status}.`,
    response.status,
    headers,
  );
}
