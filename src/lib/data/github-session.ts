import "server-only";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { createGithubApi } from "../github/api";
import { translateGithubError } from "../github/errors";
import { advanceVisit, parseVisit, VISIT_COOKIE } from "../last-visit";
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
      // The same rule the browser uses when it writes the cookie, so the card matches it.
      const now = new Date();
      const visit = advanceVisit(parseVisit((await cookies()).get(VISIT_COOKIE)?.value, now), now);
      try {
        return await createGithubSource({
          db: getDb(),
          api: createGithubApi(token),
          ownerName,
          lastVisit: visit.prev,
        }).getDashboard();
      } catch (error) {
        // A rejected token becomes "sign in again" and a rate limit becomes a friendly notice.
        throw translateGithubError(error);
      }
    },
  };
}
