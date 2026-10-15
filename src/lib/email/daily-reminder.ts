import type { Db } from "@/db/client";
import { createGithubSource } from "../data/github";
import type { GithubApi } from "../github/api";
import { ensureSettings } from "../sync";
import { buildDailyEmail, reminderSkipReason, type SkipReason } from "./daily-email";
import type { SendEmail } from "./resend";

export interface ReminderConfig {
  /** Where the email goes. Without it nothing is sent. */
  to: string | undefined;
  from: string;
  /** The owner's first name for the greeting; "there" when unknown. */
  ownerName?: string;
  /** The owner's IANA timezone for "today"; UTC when missing. */
  timeZone?: string;
  dashboardUrl: string;
}

export type ReminderResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: SkipReason | "no_recipient" }
  | { status: "failed"; error: string };

/**
 * The daily reminder: if the owner has it on, is not Away and has a focus project, email them the
 * Today list. The cheap checks (setting, recipient) run before GitHub is asked for anything.
 * Building the dashboard also syncs repos and stores today's snapshot, like the dashboard does.
 */
export async function runDailyReminder(deps: {
  db: Db;
  api: GithubApi;
  send: SendEmail;
  config: ReminderConfig;
  now?: () => Date;
}): Promise<ReminderResult> {
  const { db, api, send, config, now } = deps;
  const settings = await ensureSettings(db);
  const channel = settings.notificationChannel;
  if (channel === "none") return { status: "skipped", reason: "disabled" };
  if (!config.to) return { status: "skipped", reason: "no_recipient" };

  const dashboard = await createGithubSource({
    db,
    api,
    ownerName: config.ownerName?.trim() || "there",
    ...(config.timeZone ? { timeZone: config.timeZone } : {}),
    now,
  }).getDashboard();

  const skip = reminderSkipReason(dashboard, channel);
  if (skip) return { status: "skipped", reason: skip };

  const email = buildDailyEmail(dashboard, config.dashboardUrl);
  if (!email) return { status: "skipped", reason: "no_focus" };

  const result = await send({ from: config.from, to: config.to, ...email });
  return result.ok ? { status: "sent", id: result.id } : { status: "failed", error: result.error };
}
