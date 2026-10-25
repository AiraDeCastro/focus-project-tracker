/**
 * The GitHub OAuth App credentials. The documented names are `GITHUB_CLIENT_ID` and
 * `GITHUB_CLIENT_SECRET`; Auth.js's own names (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`) work too.
 * A missing value is left out entirely instead of being sent to GitHub as the text "undefined".
 */
export function githubCredentials(env: Record<string, string | undefined> = process.env): {
  clientId?: string;
  clientSecret?: string;
} {
  const clientId = (env.GITHUB_CLIENT_ID || env.AUTH_GITHUB_ID || "").trim();
  const clientSecret = (env.GITHUB_CLIENT_SECRET || env.AUTH_GITHUB_SECRET || "").trim();
  return {
    ...(clientId ? { clientId } : {}),
    ...(clientSecret ? { clientSecret } : {}),
  };
}

/**
 * What the app asks GitHub for at sign-in: your identity, your repos and issues (`repo`, the
 * narrowest scope that includes private repos), and your GitHub Projects (`project`, which the
 * Project features need to read and to add tasks). `GITHUB_SCOPE` replaces the whole list, so a
 * value that leaves out `project` turns the Project features off and they say so.
 */
export const DEFAULT_GITHUB_SCOPE = "read:user repo project";

export function githubScope(env: Record<string, string | undefined> = process.env): string {
  const set = (env.GITHUB_SCOPE ?? "").trim().replace(/\s+/g, " ");
  return set || DEFAULT_GITHUB_SCOPE;
}
