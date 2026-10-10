import { getDb } from "@/db/client";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createGithubApi } from "@/lib/github/api";
import { runDailySnapshot } from "@/lib/snapshot-job";

/**
 * Daily snapshot, called by Vercel Cron (see vercel.json). There is no signed-in owner here, so
 * it reads GitHub with `GITHUB_CRON_TOKEN`, a personal access token the owner creates. The token
 * is never logged or returned.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const token = process.env.GITHUB_CRON_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "GITHUB_CRON_TOKEN is not set" }, { status: 500 });
  }
  try {
    const result = await runDailySnapshot({ db: getDb(), api: createGithubApi(token) });
    return Response.json(result, { status: result.failed.length > 0 ? 207 : 200 });
  } catch {
    return Response.json({ error: "Snapshot failed" }, { status: 500 });
  }
}
