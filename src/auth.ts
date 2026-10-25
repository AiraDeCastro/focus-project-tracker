import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedLogin } from "@/lib/allow-list";
import { githubCredentials, githubScope } from "@/lib/auth-config";

/**
 * GitHub sign-in for one person. Only `ALLOWED_GITHUB_LOGIN` may sign in.
 *
 * Scope: GitHub OAuth Apps have no read-only scope for private repos, so `repo` is the
 * narrowest that includes them. `project` lets the Project features read your GitHub Projects and
 * add tasks to them (see `githubScope`). Set `GITHUB_SCOPE=read:user public_repo` to limit it to
 * public repos; that also turns the Project features off.
 *
 * The access token is kept in the encrypted session cookie and is never copied into the session
 * object the browser can fetch. Server code reads it through `getAccessToken()`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      ...githubCredentials(),
      authorization: { params: { scope: githubScope() } },
    }),
  ],
  pages: { signIn: "/sign-in", error: "/sign-in" },
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      return isAllowedLogin(profile?.login as string | undefined, process.env.ALLOWED_GITHUB_LOGIN);
    },
    jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
  },
});
