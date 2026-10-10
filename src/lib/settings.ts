import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { validateSettings, type EditableSettings, type SettingsError } from "./settings-rules";
import { ensureSettings } from "./sync";

export type SaveSettingsResult =
  { ok: true; settings: EditableSettings } | { ok: false; error: SettingsError };

/** Saves the editable settings, leaving Away mode and the reminder channel alone. */
export async function saveSettings(db: Db, value: unknown): Promise<SaveSettingsResult> {
  const error = validateSettings(value);
  if (error) return { ok: false, error };
  const next = value as EditableSettings;
  const clean: EditableSettings = {
    stallDays: next.stallDays,
    hideForks: next.hideForks,
    hideArchived: next.hideArchived,
  };
  await ensureSettings(db);
  await db.update(settings).set(clean).where(eq(settings.id, 1));
  return { ok: true, settings: clean };
}

/** The saved values, creating the settings row with defaults on first use. */
export async function loadEditableSettings(db: Db): Promise<EditableSettings> {
  const row = await ensureSettings(db);
  return { stallDays: row.stallDays, hideForks: row.hideForks, hideArchived: row.hideArchived };
}
