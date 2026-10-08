import type { Db } from "@/db/client";
import type { ProjectRow } from "@/db/schema";
import {
  closedActivity,
  dueDaysInMonth,
  idealEndIndex,
  isoDate,
  mapLimit,
  monthStart,
  relativeDay,
  seriesFromHistory,
  weekStart,
  weekWindow,
} from "../dashboard-utils";
import type { GithubApi, GithubRepo } from "../github/api";
import {
  IMPLICIT_MILESTONE_NUMBER,
  orderMilestones,
  type OrderedMilestone,
} from "../github/mapping";
import { currentMilestoneIndex, percentComplete } from "../progress";
import { sortByPriority } from "../priority";
import { loadHistory, recordSnapshots } from "../snapshots";
import { listVisibleProjects, syncProjects } from "../sync";
import type { Dashboard, Project } from "../types";
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
  now?: () => Date;
}

/** Repos fetched at the same time. Keeps a first load of many repos under GitHub's burst limits. */
const CONCURRENCY = 4;
const TODAY_TASK_LIMIT = 3;

/** Issues can be turned off on a repo; GitHub then answers 410 (or 404). Treat that as empty. */
async function orEmpty<T>(load: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404 || status === 410) return empty;
    throw error;
  }
}

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
  now = () => new Date(),
}: GithubSourceDeps): DataSource {
  return {
    async getDashboard(): Promise<Dashboard> {
      const moment = now();
      const today = isoDate(moment);

      await syncProjects(db, api, moment);
      const rows = await listVisibleProjects(db);
      const repos = new Map((await api.listRepos()).map((r) => [r.repoId, r]));

      const data = await mapLimit(rows, CONCURRENCY, async (row): Promise<RepoData> => {
        const milestones = await orEmpty(() => api.listMilestones(row.fullName), []);
        const issues =
          milestones.length > 0
            ? { open: 0, closed: 0 }
            : await orEmpty(() => api.countIssues(row.fullName), { open: 0, closed: 0 });
        const ordered = orderMilestones(milestones, issues);
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

      const window = weekWindow(today);
      const focus = data.find((d) => d.row.status === "focus");

      const projects: Project[] = [];
      for (const d of data) {
        const base: Project = {
          id: d.row.name,
          status: d.row.status,
          highPriority: d.row.highPriority,
          lastActivity: relativeDay(d.repo?.pushedAt, today),
          series: [],
          milestones: d.milestones.map((m) => ({
            name: m.name,
            closed: m.closed,
            total: m.total,
            due: m.due,
            ...(m.dueDate ? { dueDate: m.dueDate } : {}),
          })),
          todayTasks: [],
        };
        const live = percentComplete(base);
        base.series = seriesFromHistory(await loadHistory(db, d.row.repoId), window.dates, live);
        projects.push(base);
      }

      let closedPerDay = [0, 0, 0, 0, 0, 0, 0];
      let closedDays: number[] = [];
      let dueDays: number[] = [];
      let endIndex = window.dates.length - 1;

      if (focus) {
        const project = projects.find((p) => p.id === focus.row.name)!;
        const current = focus.milestones[currentMilestoneIndex(project)];
        const since = `${weekStart(today) < monthStart(today) ? weekStart(today) : monthStart(today)}T00:00:00Z`;

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

        project.lastActivity = relativeDay(lastClosed, today);
        project.todayTasks = open.map((i) => ({ number: i.number, title: i.title }));
        ({ closedPerDay, closedDays } = closedActivity(closedAt, today));

        const dueDates = focus.milestones.map((m) => m.dueDate);
        dueDays = dueDaysInMonth(dueDates, today);
        const lastDue = dueDates
          .filter((d): d is string => !!d)
          .sort()
          .at(-1);
        endIndex = idealEndIndex(lastDue, window.dates);
      }

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
        projects: sortByPriority(projects),
      };
    },
  };
}
