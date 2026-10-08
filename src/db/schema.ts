import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const PROJECT_STATUSES = ["focus", "backlog", "paused", "deployed", "finished"] as const;
export type StoredProjectStatus = (typeof PROJECT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["email", "none"] as const;

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
    deployedUrl: text("deployed_url"),
    /** ISO timestamps. */
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    lastSyncedAt: text("last_synced_at"),
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
