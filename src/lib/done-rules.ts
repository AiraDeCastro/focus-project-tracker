/**
 * Rules for finishing a project, shared by the server (which enforces them) and the browser
 * (which previews them). Keep this file free of database imports so it is safe in client code.
 */

export type DoneKind = "finished" | "deployed";

const MAX_URL_LENGTH = 300;

/**
 * Turns what the owner typed into a safe web address, or null when it is not one.
 * - A missing scheme gets `https://` ("my-site.vercel.app" works).
 * - Only http and https are allowed, so a link can never run script.
 * - The host needs a dot, and logins in the address ("user:pass@") are refused.
 */
export function normalizeLiveUrl(input: string | null | undefined): string | null {
  const text = (input ?? "").trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;
  return url.href;
}
