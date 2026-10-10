import type { ProjectKind } from "./project-kind";

export type ProjectStatus = "focus" | "backlog" | "paused" | "deployed" | "finished";

export interface MilestoneProgress {
  name: string;
  closed: number;
  total: number;
  /** Display date, for example "Oct 22". */
  due: string;
  /** ISO date ("2026-10-22") when the milestone has one. Used to place the due-date marker. */
  dueDate?: string;
}

export interface TodayTask {
  number: number;
  title: string;
  /** The issue on GitHub. Missing in example data, which has no real issues. */
  url?: string;
}

export interface Project {
  /** Repo name; unique for one owner. */
  id: string;
  status: ProjectStatus;
  /** Project, practice code or school work. Only a project can take focus. */
  kind: ProjectKind;
  /** Marked by the owner as one of the projects that matter most. */
  highPriority: boolean;
  /** Live address of a deployed project (always http or https). */
  deployedUrl?: string;
  /** Display text, for example "yesterday". */
  lastActivity: string;
  /**
   * Percent complete at each date in `Dashboard.weekDates`, up to and including today.
   * `null` means no history exists for that week yet.
   */
  series: (number | null)[];
  milestones: MilestoneProgress[];
  todayTasks: TodayTask[];
}

/** One alert on the dashboard. Only the focus project raises alerts. */
export interface DashboardAlert {
  /** "stalled" and "overdue" are warnings; "info" is a calm note (on track, or Away mode). */
  kind: "stalled" | "overdue" | "info";
  /** Short bold lead-in, for example "Stalled.". */
  title: string;
  text: string;
}

/** What changed in the focus project since the owner last opened the dashboard. */
export interface SinceVisit {
  project: string;
  /** "YYYY-MM-DD" of the last visit. */
  lastVisit: string;
  daysAway: number;
  /** Issues closed in the project since then. */
  closed: number;
  /** Change in percent complete since then, or null when there is no older number to compare. */
  percentChange: number | null;
}

export interface Dashboard {
  /** True for the built-in example data; false for real GitHub data. */
  isExample: boolean;
  ownerName: string;
  /** ISO date of "today" for the data set. */
  today: string;
  /** ISO dates of the graph's weekly points, oldest first. Today is the last past point. */
  weekDates: string[];
  /** Display labels for `weekDates`, for example "Oct 8". */
  weekLabels: string[];
  /** Index into `weekLabels` where the ideal-pace line reaches 100%. */
  idealEndIndex: number;
  /** Issues closed Monday to Sunday of the current week. */
  closedPerDay: number[];
  /** Day numbers of the current month with at least one closed issue. */
  closedDays: number[];
  /** Day numbers of the current month with a milestone due date. */
  dueDays: number[];
  /** News since the last visit, or null on a first visit, a same-day return, or with no focus project. */
  sinceLastVisit: SinceVisit | null;
  /** Return date ("YYYY-MM-DD") while Away mode is on, otherwise null. */
  awayUntil: string | null;
  /** Alerts for the focus project, most urgent first. Empty when there is nothing to say. */
  alerts: DashboardAlert[];
  projects: Project[];
}
