/**
 * Only the owner may sign in. Compares GitHub logins case-insensitively (GitHub treats them
 * that way). With no allowed login configured, nobody gets in, so a missing setting fails closed.
 */
export function isAllowedLogin(
  login: string | null | undefined,
  allowed: string | null | undefined,
): boolean {
  const want = allowed?.trim().toLowerCase();
  const got = login?.trim().toLowerCase();
  return Boolean(want && got && want === got);
}
