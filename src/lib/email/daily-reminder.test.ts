import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { projects, settings } from "@/db/schema";
import type { GithubApi, GithubRepo } from "../github/api";
import { runDailyReminder, type ReminderConfig } from "./daily-reminder";
import type { SendEmail } from "./resend";

let db: Db;
const NOW = new Date("2026-10-10T12:00:00Z");

const repo: GithubRepo = {
  repoId: 1,
  fullName: "me/recipe-box",
  name: "recipe-box",
  htmlUrl: "https://github.com/me/recipe-box",
  isFork: false,
  isArchived: false,
  pushedAt: "2026-10-08T10:00:00Z",
};

function fakeApi(): GithubApi {
  return {
    listRepos: vi.fn(async () => [repo]),
    listMilestones: vi.fn(async () => [
      { number: 1, title: "MVP", dueOn: null, openIssues: 1, closedIssues: 3 },
    ]),
    countIssues: vi.fn(async () => ({ open: 0, closed: 0 })),
    lastClosedAt: vi.fn(async () => "2026-10-09T10:00:00Z"),
    openIssues: vi.fn(async () => [
      { number: 41, title: "Empty state", htmlUrl: "https://github.com/me/recipe-box/issues/41" },
    ]),
    closedSince: vi.fn(async () => []),
  };
}

const config: ReminderConfig = {
  to: "me@example.com",
  from: "Focus Trail <onboarding@resend.dev>",
  ownerName: "Aira",
  dashboardUrl: "https://focus-project-tracker.vercel.app",
};

function sender(result: Awaited<ReturnType<SendEmail>> = { ok: true, id: "email_1" }) {
  return vi.fn<SendEmail>(async () => result);
}

const run = (send: SendEmail, api = fakeApi(), cfg = config) =>
  runDailyReminder({ db, api, send, config: cfg, now: () => NOW });

async function focusOnRecipeBox(api: GithubApi) {
  await run(sender(), api); // creates the project row
  await db.update(projects).set({ status: "focus" }).where(eq(projects.repoId, 1));
}

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
});

describe("runDailyReminder", () => {
  it("emails the Today list of the focus project", async () => {
    const api = fakeApi();
    await focusOnRecipeBox(api);
    const send = sender();

    expect(await run(send, api)).toEqual({ status: "sent", id: "email_1" });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message).toMatchObject({
      from: config.from,
      to: "me@example.com",
      subject: "Today in recipe-box",
    });
    expect(message.text).toContain("Good morning, Aira.");
    expect(message.text).toContain("#41 Empty state");
    expect(message.text).toContain("https://github.com/me/recipe-box/issues/41");
  });

  it("does nothing, and asks GitHub for nothing, when the reminder is turned off", async () => {
    const api = fakeApi();
    await db.insert(settings).values({ id: 1, notificationChannel: "none" });
    const send = sender();

    expect(await run(send, api)).toEqual({ status: "skipped", reason: "disabled" });
    expect(send).not.toHaveBeenCalled();
    expect(api.listRepos).not.toHaveBeenCalled();
  });

  it("does nothing when there is nowhere to send it", async () => {
    const api = fakeApi();
    const send = sender();
    expect(await run(send, api, { ...config, to: undefined })).toEqual({
      status: "skipped",
      reason: "no_recipient",
    });
    expect(send).not.toHaveBeenCalled();
    expect(api.listRepos).not.toHaveBeenCalled();
  });

  it("stays quiet while Away mode is on", async () => {
    const api = fakeApi();
    await focusOnRecipeBox(api);
    await db.update(settings).set({ awayUntil: "2026-10-20" }).where(eq(settings.id, 1));
    const send = sender();

    expect(await run(send, api)).toEqual({ status: "skipped", reason: "away" });
    expect(send).not.toHaveBeenCalled();
  });

  it("stays quiet when no project has focus", async () => {
    const send = sender();
    expect(await run(send)).toEqual({ status: "skipped", reason: "no_focus" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends again once Away mode has ended", async () => {
    const api = fakeApi();
    await focusOnRecipeBox(api);
    await db.update(settings).set({ awayUntil: "2026-10-10" }).where(eq(settings.id, 1));
    expect((await run(sender(), api)).status).toBe("sent");
  });

  it("reports a failed send instead of throwing", async () => {
    const api = fakeApi();
    await focusOnRecipeBox(api);
    const send = sender({ ok: false, error: "Resend answered 403. Not verified." });

    expect(await run(send, api)).toEqual({
      status: "failed",
      error: "Resend answered 403. Not verified.",
    });
  });
});
