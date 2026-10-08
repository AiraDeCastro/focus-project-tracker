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
  projects: Project[];
}
