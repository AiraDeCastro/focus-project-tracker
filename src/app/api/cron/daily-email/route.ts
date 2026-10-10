import { getDb } from "@/db/client";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runDailyReminder } from "@/lib/email/daily-reminder";
import { createResendSender } from "@/lib/email/resend";
import { createGithubApi } from "@/lib/github/api";

const DEFAULT_FROM = "Focus Trail <onboarding@resend.dev>";
const DEFAULT_URL = "https://focus-project-tracker.vercel.app";

/**
 * Daily reminder email, called by Vercel Cron (see vercel.json). Like the snapshot job it has no
 * signed-in owner, so it reads GitHub with `GITHUB_CRON_TOKEN`. Secrets are never logged or
 * returned; a missing setting is reported by its name only.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const githubToken = process.env.GITHUB_CRON_TOKEN?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const missing = [!githubToken && "GITHUB_CRON_TOKEN", !resendKey && "RESEND_API_KEY"].filter(
    Boolean,
  );
  if (missing.length > 0 || !githubToken || !resendKey) {
    return Response.json({ error: `Not set: ${missing.join(", ")}` }, { status: 500 });
  }

  try {
    const result = await runDailyReminder({
      db: getDb(),
      api: createGithubApi(githubToken),
      send: createResendSender(resendKey),
      config: {
        to: process.env.REMINDER_EMAIL_TO?.trim(),
        from: process.env.REMINDER_EMAIL_FROM?.trim() || DEFAULT_FROM,
        ownerName: process.env.REMINDER_NAME,
        dashboardUrl: process.env.AUTH_URL?.trim() || DEFAULT_URL,
      },
    });
    return Response.json(result, { status: result.status === "failed" ? 502 : 200 });
  } catch {
    return Response.json({ error: "Reminder failed" }, { status: 500 });
  }
}
