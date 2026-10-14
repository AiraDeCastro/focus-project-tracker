import { resolveTimeZone } from "./timezone";

/** The timezone for jobs that run without a browser (the daily cron routes): `APP_TIMEZONE`, else UTC. */
export function jobTimeZone(): string {
  return resolveTimeZone(process.env.APP_TIMEZONE);
}
