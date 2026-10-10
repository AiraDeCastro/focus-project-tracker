import { timingSafeEqual } from "node:crypto";

/**
 * True only when the request carries `Authorization: Bearer <secret>` (what Vercel Cron sends
 * when `CRON_SECRET` is set). Fails closed: an unset or empty secret authorizes nobody.
 */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
