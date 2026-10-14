import "server-only";
import { cookies } from "next/headers";
import { resolveTimeZone, TZ_COOKIE } from "./timezone";

/**
 * The owner's timezone for this request: the one their browser reported in a cookie, else
 * `APP_TIMEZONE`, else UTC. A cookie value is only trusted if it is a real timezone name.
 */
export async function requestTimeZone(): Promise<string> {
  const fromCookie = (await cookies()).get(TZ_COOKIE)?.value;
  return resolveTimeZone(
    fromCookie ? decodeURIComponent(fromCookie) : undefined,
    process.env.APP_TIMEZONE,
  );
}
