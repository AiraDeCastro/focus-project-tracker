import { describe, expect, it } from "vitest";
import { SignInRequiredError } from "../data/github";
import { GithubRateLimitError, rateLimitMessage, translateGithubError } from "./errors";

/** Shaped like Octokit's RequestError: a status, a message and the response headers. */
function requestError(
  status: number,
  message: string,
  headers: Record<string, string | number> = {},
) {
  return Object.assign(new Error(message), { status, response: { headers } });
}

const NOW = new Date("2026-10-13T12:00:00Z");

describe("translateGithubError", () => {
  it("turns a rejected login (401) into a request to sign in again", () => {
    const result = translateGithubError(requestError(401, "Bad credentials"));
    expect(result).toBeInstanceOf(SignInRequiredError);
  });

  it("turns a 403 with no requests left into a rate limit, with GitHub's reset time", () => {
    const reset = Math.floor(Date.parse("2026-10-13T12:40:00Z") / 1000);
    const result = translateGithubError(
      requestError(403, "API rate limit exceeded", {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(reset),
      }),
      NOW,
    ) as GithubRateLimitError;
    expect(result).toBeInstanceOf(GithubRateLimitError);
    expect(result.resetAt?.toISOString()).toBe("2026-10-13T12:40:00.000Z");
  });

  it("recognises a rate limit from the message alone, and a 429 with Retry-After", () => {
    expect(
      translateGithubError(requestError(403, "You have exceeded a secondary rate limit")),
    ).toBeInstanceOf(GithubRateLimitError);
    const result = translateGithubError(
      requestError(429, "Too many requests", { "retry-after": "90" }),
      NOW,
    ) as GithubRateLimitError;
    expect(result.resetAt?.toISOString()).toBe("2026-10-13T12:01:30.000Z");
  });

  it("has no reset time when GitHub did not give one", () => {
    const result = translateGithubError(requestError(429, "Slow down")) as GithubRateLimitError;
    expect(result).toBeInstanceOf(GithubRateLimitError);
    expect(result.resetAt).toBeNull();
  });

  it("leaves a plain 403, a missing repo and ordinary errors alone", () => {
    const forbidden = requestError(403, "Resource not accessible by personal access token", {
      "x-ratelimit-remaining": "4000",
    });
    const missing = requestError(404, "Not Found");
    const plain = new Error("boom");
    expect(translateGithubError(forbidden)).toBe(forbidden);
    expect(translateGithubError(missing)).toBe(missing);
    expect(translateGithubError(plain)).toBe(plain);
    expect(translateGithubError(null)).toBeNull();
    expect(translateGithubError("text")).toBe("text");
  });

  it("does not change an error that is already a sign-in request", () => {
    const already = new SignInRequiredError();
    expect(translateGithubError(already)).toBe(already);
  });
});

describe("rateLimitMessage", () => {
  const at = (iso: string) => new Date(iso);

  it("says when to try again, in minutes", () => {
    expect(rateLimitMessage(at("2026-10-13T12:40:00Z"), NOW)).toBe(
      "GitHub is limiting requests right now. Try again in about 40 minutes.",
    );
    expect(rateLimitMessage(at("2026-10-13T12:00:20Z"), NOW)).toContain("about 1 minute.");
  });

  it("rounds up, and never says zero or a negative wait", () => {
    expect(rateLimitMessage(at("2026-10-13T12:00:01Z"), NOW)).toContain("about 1 minute.");
    expect(rateLimitMessage(at("2026-10-13T11:00:00Z"), NOW)).toContain("about 1 minute.");
  });

  it("switches to hours for a long wait", () => {
    expect(rateLimitMessage(at("2026-10-13T15:00:00Z"), NOW)).toBe(
      "GitHub is limiting requests right now. Try again in about 3 hours.",
    );
  });

  it("falls back to a general line when GitHub gave no time", () => {
    expect(rateLimitMessage(null, NOW)).toBe(
      "GitHub is limiting requests right now. Try again in a few minutes.",
    );
  });
});
