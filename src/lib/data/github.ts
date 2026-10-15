import type { Db } from "@/db/client";
import type { ProjectRow } from "@/db/schema";
import {
  closedActivity,
  dueDaysInMonth,
  idealEndIndex,
  mapLimit,
  monthStart,
  relativeDay,
  seriesFromHistory,
  weekStart,
  weekWindow,
} from "../dashboard-utils";
import type { GithubApi, GithubRepo } from "../github/api";
import { IMPLICIT_MILESTONE_NUMBER, type OrderedMilestone } from "../github/mapping";
import { orEmpty, readMilestones } from "../github/read";
import { currentMilestoneIndex, percentComplete } from "../progress";
import { sortByPriority } from "../priority";
import { loadChecklists } from "../checklist";
import { buildSinceVisit, daysAway } from "../last-visit";
import { buildStreak, streakSince } from "../streak";
import { buildWeeklyReview } from "../weekly-review";
import { localDate, toLocalStamp } from "../timezone";
import { deployStatusFor, safeVercelMessage } from "../deploy-status";
import type { VercelApi } from "../vercel";
import type { VercelProject } from "../deploy-status";
import { loadHistory, recordSnapshots } from "../snapshots";
import { ensureSettings, listVisibleProjects, syncProjects } from "../sync";
import { activeAwayUntil } from "../away";
import { buildAlerts, overdueMilestones, stallState } from "../alerts";
import type { Dashboard, DashboardAlert, DeployCheck, Project, SinceVisit, Streak } from "../types";
import type { DataSource } from "./index";

/** Thrown when there is no signed-in owner. The page turns it into a redirect to /sign-in. */
export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in with GitHub to continue.");
    this.name = "SignInRequiredError";
  }
}

export interface GithubSourceDeps {
  db: Db;
  api: GithubApi;
  ownerName: string;
  /** When the owner last opened the dashboard before this visit, if known. */
  lastVisit?: string | null;
  /** Reads Vercel for deploy status. Without it no status is shown. */
  vercel?: VercelApi;
  /** The owner's IANA timezone, used for "today" and the week boundaries. Defaults to UTC. */
  timeZone?: string;
  now?: () => Date;
}

/** Repos fetched at the same time. Keeps a first load of many repos under GitHub's burst limits. */
const CONCURRENCY = 4;
const TODAY_TASK_LIMIT = 3;

interface RepoData {
  row: ProjectRow;
  repo: GithubRepo | undefined;
  milestones: OrderedMilestone[];
}

/**
 * Builds the dashboard from the owner's real GitHub repos. Each call syncs the repo list into
 * the database, reads milestones and issue counts, stores today's snapshot, and combines it with
 * earlier snapshots for the graph. GitHub stays the source of truth for issues.
 */
export function createGithubSource({
  db,
  api,
  ownerName,
  lastVisit = null,
  vercel,
  timeZone = "UTC",
  now = () => new Date(),
}: GithubSourceDeps): DataSource {
  return {
    async getDashboard(): Promise<Dashboard> {
      const moment = now();
      const today = localDate(moment, timeZone);
      // GitHub sends instants in UTC; the owner's day, week and streak follow their own clock.
      // Dates are shifted into their timezone only for day bucketing, never for API queries.
      const local = (stamp: string) => toLocalStamp(stamp, timeZone);
      const localOrNull = (stamp: string | null) => toLocalStamp(stamp, timeZone);
      // Queries start a day early so a late-evening close in a timezone behind UTC is not missed;
      // the day bucketing then decides which of those count.
      const dayBefore = (isoDay: string) =>
        `${new Date(Date.parse(`${isoDay}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00Z`;

      await syncProjects(db, api, moment);
      const settings = await ensureSettings(db);
      const checklists = await loadChecklists(db);
      const rows = await listVisibleProjects(db);
      const repos = new Map((await api.listRepos()).map((r) => [r.repoId, r]));

      const data = await mapLimit(rows, CONCURRENCY, async (row): Promise<RepoData> => {
        const ordered = await readMilestones(api, row.fullName);
        await recordSnapshots(
          db,
          row.repoId,
          today,
          ordered.map((m) => ({
            number: m.number,
            title: m.name,
            closed: m.closed,
            total: m.total,
          })),
        );
        return { row, repo: repos.get(row.repoId), milestones: ordered };
      });

      // Deploy status is a nice extra: if Vercel is slow, down or refuses the token, show none.
      let vercelProjects: VercelProject[] = [];
      let vercelSkipped = 0;
      let vercelError: string | null = null;
      if (vercel) {
        try {
          const list = await vercel.listProjects();
          vercelProjects = list.projects;
          vercelSkipped = list.skipped;
        } catch (error) {
          // No pills this time; nothing else on the dashboard depends on it. The footer says why.
          vercelError = safeVercelMessage(error);
        }
      }

      const window = weekWindow(today);
      const focus = data.find((d) => d.row.status === "focus");

      const projects: Project[] = [];
      for (const d of data) {
        const base: Project = {
          id: d.row.name,
          status: d.row.status,
          kind: d.row.kind,
          highPriority: d.row.highPriority,
          ...(d.row.deployedUrl ? { deployedUrl: d.row.deployedUrl } : {}),
          lastActivity: relativeDay(localOrNull(d.repo?.pushedAt ?? null), today),
          series: [],
          milestones: d.milestones.map((m) => ({
            name: m.name,
            closed: m.closed,
            total: m.total,
            due: m.due,
            ...(m.dueDate ? { dueDate: m.dueDate } : {}),
          })),
          todayTasks: [],
          checklist: checklists.get(d.row.repoId) ?? [],
        };
        const deploy = deployStatusFor([d.repo?.homepage, d.row.deployedUrl], vercelProjects);
        if (deploy) base.deploy = deploy;
        const live = percentComplete(base);
        base.series = seriesFromHistory(await loadHistory(db, d.row.repoId), window.dates, live);
        projects.push(base);
      }

      let closedPerDay = [0, 0, 0, 0, 0, 0, 0];
      let closedDays: number[] = [];
      let dueDays: number[] = [];
      let alerts: DashboardAlert[] = [];
      let sinceLastVisit: SinceVisit | null = null;
      let endIndex = window.dates.length - 1;

      if (focus) {
        const project = projects.find((p) => p.id === focus.row.name)!;
        const current = focus.milestones[currentMilestoneIndex(project)];
        const since = dayBefore(
          weekStart(today) < monthStart(today) ? weekStart(today) : monthStart(today),
        );

        const [lastClosed, open, closedAt] = await Promise.all([
          orEmpty(() => api.lastClosedAt(focus.row.fullName), null),
          current
            ? orEmpty(
                () =>
                  api.openIssues(
                    focus.row.fullName,
                    current.number === IMPLICIT_MILESTONE_NUMBER ? undefined : current.number,
                    TODAY_TASK_LIMIT,
                  ),
                [],
              )
            : Promise.resolve([]),
          orEmpty(() => api.closedSince(focus.row.fullName, since), [] as string[]),
        ]);

        project.lastActivity = relativeDay(localOrNull(lastClosed), today);

        const visitDay = localOrNull(lastVisit);
        if (lastVisit && visitDay && daysAway(visitDay, today) >= 1) {
          const closedSinceVisit = await orEmpty(
            () => api.closedSince(focus.row.fullName, lastVisit),
            [] as string[],
          );
          sinceLastVisit = buildSinceVisit({
            lastVisit: visitDay,
            today,
            project: focus.row.name,
            closedCount: closedSinceVisit.length,
            percentNow: percentComplete(project),
            history: await loadHistory(db, focus.row.repoId),
          });
        }
        alerts = buildAlerts({
          projectName: focus.row.name,
          stall: stallState({
            lastClosedAt: localOrNull(lastClosed),
            focusStartedAt: localOrNull(focus.row.startedAt ?? null),
            today,
            thresholdDays: settings.stallDays,
            awayUntil: settings.awayUntil,
          }),
          overdue: overdueMilestones(project.milestones, today),
          thresholdDays: settings.stallDays,
        });
        project.todayTasks = open.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.htmlUrl,
        }));
        ({ closedPerDay, closedDays } = closedActivity(
          closedAt.map((c) => local(c)),
          today,
        ));

        const dueDates = focus.milestones.map((m) => m.dueDate);
        dueDays = dueDaysInMonth(dueDates, today);
        const lastDue = dueDates
          .filter((d): d is string => !!d)
          .sort()
          .at(-1);
        endIndex = idealEndIndex(lastDue, window.dates);
      }

      // The streak follows the projects that matter: the starred ones plus the focus project.
      const streakRepos = data.filter(
        (d) => d.row.kind === "project" && (d.row.highPriority || d.row.status === "focus"),
      );
      const streakSinceIso = dayBefore(streakSince(today));
      const closedLists = await mapLimit(streakRepos, CONCURRENCY, (d) =>
        orEmpty(() => api.closedSince(d.row.fullName, streakSinceIso), [] as string[]),
      );
      const localLists = closedLists.map((list) => list.map((c) => local(c)));
      const streak: Streak | null = buildStreak(
        localLists.flat(),
        today,
        activeAwayUntil(settings.awayUntil, today) !== null,
      );
      const weeklyReview = buildWeeklyReview(
        streakRepos.map((d, i) => ({ name: d.row.name, closedAt: localLists[i] })),
        today,
      );

      const deployCheck: DeployCheck | undefined = vercel
        ? {
            status: vercelError ? "failed" : "ok",
            ...(vercelError ? { message: vercelError } : {}),
            projects: vercelProjects.length,
            skipped: vercelSkipped,
            matched: projects.filter((p) => p.deploy).length,
            sample: vercelProjects
              .slice(0, 4)
              .map((p) => `${p.name}: ${p.domains[0] ?? "no address"}`),
          }
        : undefined;

      return {
        isExample: false,
        ownerName,
        today,
        weekDates: window.dates,
        weekLabels: window.labels,
        idealEndIndex: endIndex,
        closedPerDay,
        closedDays,
        dueDays,
        streak,
        ...(deployCheck ? { deployCheck } : {}),
        weeklyReview,
        sinceLastVisit,
        awayUntil: activeAwayUntil(settings.awayUntil, today),
        alerts,
        projects: sortByPriority(projects),
      };
    },
  };
}
