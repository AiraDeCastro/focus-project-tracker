import { SignInRequiredError } from "./data/github";
import { GithubRateLimitError, rateLimitMessage, translateGithubError } from "./github/errors";
import { GithubGraphqlError, ProjectScopeError } from "./github/projects";
import { StatusFieldError } from "./importer";

/**
 * Turns whatever went wrong while adding to a Project into one plain sentence for the owner, or
 * null when it is not an error the app knows (the caller then lets it surface as a real error).
 * Never includes a token: the messages come from our own code or from GitHub's answer.
 */
export function explainAddError(error: unknown, now: Date = new Date()): string | null {
  const translated = translateGithubError(error, now);
  if (translated instanceof SignInRequiredError) {
    return "GitHub no longer accepts your sign-in. Sign in again.";
  }
  if (translated instanceof GithubRateLimitError) return rateLimitMessage(translated.resetAt, now);
  if (error instanceof ProjectScopeError) return error.message;
  if (error instanceof StatusFieldError) return error.message;
  if (error instanceof GithubGraphqlError)
    return "GitHub did not accept that. Nothing was changed.";
  return null;
}
