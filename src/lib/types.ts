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

/** One line of a project's optional definition-of-done checklist. */
export interface ChecklistItem {
  id: number;
  label: string;
  checked: boolean;
}

/** What Vercel last did with a project's production deployment. */
export type DeployState = "ready" | "failed" | "building" | "queued" | "canceled";

export interface DeployStatus {
  state: DeployState;
  /** ISO time of that deployment, when Vercel gave one. */
  at: string | null;
}

/** What the dashboard learned from Vercel this time, so a missing pill can be explained. */
export interface DeployCheck {
  /** "failed" means Vercel could not be read; `message` says why, without any secret. */
  status: "ok" | "failed";
  message?: string;
  /** Vercel projects the app could read, and entries it could not make sense of. */
  projects: number;
  skipped: number;
  /** Repos whose homepage (or live address) matched a Vercel project. */
  matched: number;
  /** A few "project: domain" lines, shown only when nothing matched. */
  sample: string[];
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
  /** Vercel's view of the live site, when the repo's homepage matches a Vercel project. */
  deploy?: DeployStatus;
  /** The owner's optional "is it done?" list. Empty until they add items. */
  checklist: ChecklistItem[];
}

/** One alert on the dashboard. Only the focus project raises alerts. */
export interface DashboardAlert {
  /** "stalled" and "overdue" are warnings; "info" is a calm note (on track, or Away mode). */
  kind: "stalled" | "overdue" | "info";
  /** Short bold lead-in, for example "Stalled.". */
  title: string;
  text: string;
}

/** Consecutive weeks with at least one closed issue. Never zero: there is no streak to show then. */
export interface Streak {
  weeks: number;
  /** True while Away mode keeps an older streak alive instead of letting it break. */
  paused: boolean;
  /** Issues closed so far this week. */
  thisWeek: number;
}

/** Issues closed in the last full week (Monday to Sunday), against the week before it. */
export interface WeeklyReview {
  /** ISO dates of the Monday and Sunday of the reviewed week. */
  start: string;
  end: string;
  closed: number;
  previousClosed: number;
  /** Projects that closed at least one issue, most first. */
  projects: { name: string; closed: number }[];
}

/** One stretch of focus in the log, with dates in the owner's timezone. */
export interface FocusLogEntry {
  project: string;
  /** "YYYY-MM-DD" the project took focus. */
  from: string;
  /** "YYYY-MM-DD" it stopped having focus, or null while it still has it. */
  to: string | null;
  /** Whole days between `from` and `to` (or today). */
  days: number;
  /** Why the owner left early; null for a finished project or a stretch still running. */
  reason: string | null;
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
  /** The weekly streak across the projects that matter, or null when there is none to show. */
  streak: Streak | null;
  /** The newest stretches of focus, newest first. */
  focusLog?: FocusLogEntry[];
  /** Set only when VERCEL_TOKEN is configured. */
  deployCheck?: DeployCheck;
  /** The last full week in review. Null in a first-run example with no data. */
  weeklyReview: WeeklyReview | null;
  /** Alerts for the focus project, most urgent first. Empty when there is nothing to say. */
  alerts: DashboardAlert[];
  projects: Project[];
}
