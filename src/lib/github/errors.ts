import { SignInRequiredError } from "../data/github";

/** GitHub is refusing requests for now. `resetAt` is when it says they can resume, if it said. */
export class GithubRateLimitError extends Error {
  readonly resetAt: Date | null;
  constructor(resetAt: Date | null) {
    super("GitHub is limiting requests for now.");
    this.name = "GithubRateLimitError";
    this.resetAt = resetAt;
  }
}

function header(error: unknown, name: string): string | undefined {
  const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
  const value = headers?.[name];
  return value === undefined || value === null ? undefined : String(value);
}

/**
 * Turns a failed GitHub call into the error the page knows how to show:
 * - 401 (the saved login's token was revoked or is no longer valid) becomes `SignInRequiredError`,
 *   so the owner is sent to sign in again instead of seeing a crash;
 * - a rate limit (429, or 403 with no requests left) becomes `GithubRateLimitError`;
 * - anything else is returned unchanged.
 */
export function translateGithubError(error: unknown, now: Date = new Date()): unknown {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return new SignInRequiredError();

  const message = error instanceof Error ? error.message : "";
  const limited =
    status === 429 ||
    (status === 403 &&
      (header(error, "x-ratelimit-remaining") === "0" || /rate limit/i.test(message)));
  if (!limited) return error;

  const reset = Number(header(error, "x-ratelimit-reset"));
  const retryAfter = Number(header(error, "retry-after"));
  if (Number.isFinite(reset) && reset > 0) return new GithubRateLimitError(new Date(reset * 1000));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new GithubRateLimitError(new Date(now.getTime() + retryAfter * 1000));
  }
  return new GithubRateLimitError(null);
}

/** A plain sentence about when GitHub will let requests through again. */
export function rateLimitMessage(resetAt: Date | null, now: Date = new Date()): string {
  const lead = "GitHub is limiting requests right now.";
  if (!resetAt) return `${lead} Try again in a few minutes.`;
  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 60000));
  if (minutes <= 90)
    return `${lead} Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  const hours = Math.ceil(minutes / 60);
  return `${lead} Try again in about ${hours} hours.`;
}
