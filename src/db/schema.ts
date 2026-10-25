import { sql } from "drizzle-orm";
import { PROJECT_KINDS } from "../lib/project-kind";
import { REMINDER_CHANNELS } from "../lib/settings-rules";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const PROJECT_STATUSES = ["focus", "backlog", "paused", "deployed", "finished"] as const;
export type StoredProjectStatus = (typeof PROJECT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = REMINDER_CHANNELS;

/** One row per GitHub repo the app tracks. GitHub stays the source of truth for issues. */
export const projects = sqliteTable(
  "projects",
  {
    /** GitHub's numeric repo id; survives renames. */
    repoId: integer("repo_id").primaryKey(),
    /** "owner/name", for example "AiraDeCastro/recipe-box". */
    fullName: text("full_name").notNull().unique(),
    name: text("name").notNull(),
    htmlUrl: text("html_url").notNull(),
    isFork: integer("is_fork", { mode: "boolean" }).notNull().default(false),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("backlog"),
    /** False for libraries, CLIs and scripts that can be marked Finished without a URL. */
    needsDeploy: integer("needs_deploy", { mode: "boolean" }).notNull().default(true),
    /**
     * Marked by the owner for projects that matter most (for example, to land a job).
     * 0 = not starred; 1 or more = starred, at that place in the ranking (see priority-rules.ts).
     */
    // The column began as a boolean. Its default is still written as `false` (SQLite stores 0) so
    // the SQL and drizzle's snapshot stay identical to migration 0001: no migration is needed.
    highPriority: integer("high_priority")
      .notNull()
      .default(false as unknown as number),
    /** Only a "project" can take focus. Practice code and school work never can. */
    kind: text("kind", { enum: PROJECT_KINDS }).notNull().default("project"),
    deployedUrl: text("deployed_url"),
    /** ISO timestamps. */
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    lastSyncedAt: text("last_synced_at"),
    /** "YYYY-MM-DD" the past graph history was rebuilt from issue dates; null until it has run. */
    historyBackfilledOn: text("history_backfilled_on"),
    /**
     * The repo's GitHub Project (Phase 5): the number in its address and its GraphQL node id.
     * Both null until the repo is onboarded. The app keeps no copy of the Project's tasks.
     */
    githubProjectNumber: integer("github_project_number"),
    githubProjectId: text("github_project_id"),
    /**
     * What the last check of TASKS.md against the Project found ("in_sync", "lines_to_import",
     * "file_out_of_date" or "both") and when (ISO). Null until a check has run. Only a note for the
     * repo card: the check itself is always redone from GitHub.
     */
    projectSyncKind: text("project_sync_kind"),
    projectCheckedAt: text("project_checked_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    // At most one row can have status 'focus': every focus row gets the same index key.
    uniqueIndex("projects_one_focus")
      .on(t.status)
      .where(sql`${t.status} = 'focus'`),
  ],
);

/** One row per repo, milestone and day, so the progress graph has history. */
export const milestoneSnapshots = sqliteTable(
  "milestone_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: integer("repo_id")
      .notNull()
      .references(() => projects.repoId, { onDelete: "cascade" }),
    /** GitHub milestone number; 0 is the implicit milestone for repos without milestones. */
    milestoneNumber: integer("milestone_number").notNull(),
    milestoneTitle: text("milestone_title").notNull(),
    /** Local calendar date, "YYYY-MM-DD". */
    snapshotDate: text("snapshot_date").notNull(),
    openCount: integer("open_count").notNull(),
    closedCount: integer("closed_count").notNull(),
    percentComplete: integer("percent_complete").notNull(),
  },
  (t) => [
    uniqueIndex("snapshots_repo_milestone_date").on(t.repoId, t.milestoneNumber, t.snapshotDate),
    index("snapshots_repo_date").on(t.repoId, t.snapshotDate),
  ],
);

/** Which project had focus when. A switch closes one row and opens the next. */
export const focusLog = sqliteTable(
  "focus_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: integer("repo_id")
      .notNull()
      .references(() => projects.repoId, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    /** Null while the project still has focus. */
    endedAt: text("ended_at"),
    /** Why the owner left this project early. Null for the first pick or a finished project. */
    switchReason: text("switch_reason"),
  },
  (t) => [index("focus_log_repo").on(t.repoId)],
);

export const doneChecklistItems = sqliteTable(
  "done_checklist_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repoId: integer("repo_id")
      .notNull()
      .references(() => projects.repoId, { onDelete: "cascade" }),
    label: text("label").notNull(),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("checklist_repo").on(t.repoId)],
);

/** A single row (id 1) because the app has one owner. */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  /** Days without a closed issue before the focus project counts as stalled. */
  stallDays: integer("stall_days").notNull().default(7),
  /** While set and in the future, stalled alerts are paused. "YYYY-MM-DD". */
  awayUntil: text("away_until"),
  notificationChannel: text("notification_channel", { enum: NOTIFICATION_CHANNELS })
    .notNull()
    .default("email"),
  hideForks: integer("hide_forks", { mode: "boolean" }).notNull().default(true),
  hideArchived: integer("hide_archived", { mode: "boolean" }).notNull().default(true),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
