import "server-only";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { createGithubApi } from "../github/api";
import { getAccessToken } from "../session";
import { createGithubSource, SignInRequiredError } from "./github";
import type { DataSource } from "./index";

/**
 * The GitHub data source for the current request: it needs a signed-in owner, and uses that
 * person's token and name. Without a session it throws `SignInRequiredError`.
 */
export function githubSourceForSession(): DataSource {
  return {
    async getDashboard() {
      const [session, token] = await Promise.all([auth(), getAccessToken()]);
      if (!session?.user || !token) throw new SignInRequiredError();
      const ownerName = session.user.name?.split(" ")[0] || "there";
      return createGithubSource({
        db: getDb(),
        api: createGithubApi(token),
        ownerName,
      }).getDashboard();
    },
  };
}
