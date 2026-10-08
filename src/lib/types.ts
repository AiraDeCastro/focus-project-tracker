export type ProjectStatus = "focus" | "backlog" | "paused" | "deployed";

export interface MilestoneProgress {
  name: string;
  closed: number;
  total: number;
  /** Display date, for example "Oct 22". */
  due: string;
}

export interface TodayTask {
  number: number;
  title: string;
}

export interface Project {
  /** Repo name; unique for one owner. */
  id: string;
  status: ProjectStatus;
  /** Display text, for example "yesterday". */
  lastActivity: string;
  /** Percent complete at each point in `Dashboard.weekLabels`. */
  series: number[];
  milestones: MilestoneProgress[];
  todayTasks: TodayTask[];
}

export interface Dashboard {
  ownerName: string;
  /** ISO date of "today" for the data set. */
  today: string;
  weekLabels: string[];
  /** Index into `weekLabels` of the focus project's final milestone due date. */
  idealEndIndex: number;
  /** Issues closed Monday to Sunday of the current week. */
  closedPerDay: number[];
  /** Day numbers of the current month with at least one closed issue. */
  closedDays: number[];
  /** Day numbers of the current month with a milestone due date. */
  dueDays: number[];
  projects: Project[];
}
