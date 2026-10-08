CREATE TABLE `done_checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
	`label` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `projects`(`repo_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checklist_repo` ON `done_checklist_items` (`repo_id`);--> statement-breakpoint
CREATE TABLE `focus_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`switch_reason` text,
	FOREIGN KEY (`repo_id`) REFERENCES `projects`(`repo_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `focus_log_repo` ON `focus_log` (`repo_id`);--> statement-breakpoint
CREATE TABLE `milestone_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` integer NOT NULL,
	`milestone_number` integer NOT NULL,
	`milestone_title` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`open_count` integer NOT NULL,
	`closed_count` integer NOT NULL,
	`percent_complete` integer NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `projects`(`repo_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_repo_milestone_date` ON `milestone_snapshots` (`repo_id`,`milestone_number`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `snapshots_repo_date` ON `milestone_snapshots` (`repo_id`,`snapshot_date`);--> statement-breakpoint
CREATE TABLE `projects` (
	`repo_id` integer PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`name` text NOT NULL,
	`html_url` text NOT NULL,
	`is_fork` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`needs_deploy` integer DEFAULT true NOT NULL,
	`deployed_url` text,
	`started_at` text,
	`finished_at` text,
	`last_synced_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_full_name_unique` ON `projects` (`full_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_one_focus` ON `projects` (`status`) WHERE "projects"."status" = 'focus';--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`stall_days` integer DEFAULT 7 NOT NULL,
	`away_until` text,
	`notification_channel` text DEFAULT 'email' NOT NULL,
	`hide_forks` integer DEFAULT true NOT NULL,
	`hide_archived` integer DEFAULT true NOT NULL
);
