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
