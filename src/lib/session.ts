import "server-only";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";

/**
 * The signed-in owner's GitHub access token, or null when not signed in. Reads the encrypted
 * session cookie on the server so the token never reaches the browser.
 */
export async function getAccessToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const h = await headers();
  const secureCookie = h.get("x-forwarded-proto") === "https";
  const token = await getToken({ req: { headers: h }, secret, secureCookie });
  return typeof token?.accessToken === "string" ? token.accessToken : null;
}
