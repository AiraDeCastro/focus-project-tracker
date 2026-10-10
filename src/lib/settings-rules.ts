/** Settings rules with no database code, so the settings form can use them in the browser. */

export const STALL_DAYS_MIN = 1;
export const STALL_DAYS_MAX = 90;

/** The values on the settings page. Away mode and the reminder channel are set elsewhere. */
export interface EditableSettings {
  /** Days without a closed issue before the focus project counts as stalled. */
  stallDays: number;
  hideForks: boolean;
  hideArchived: boolean;
}

export const DEFAULT_SETTINGS: EditableSettings = {
  stallDays: 7,
  hideForks: true,
  hideArchived: true,
};

export type SettingsError = "invalid_days" | "invalid_choice";

export const SETTINGS_ERROR_MESSAGES: Record<SettingsError, string> = {
  invalid_days: `Pick a whole number of days from ${STALL_DAYS_MIN} to ${STALL_DAYS_MAX}.`,
  invalid_choice: "Those settings were not understood. Reload the page and try again.",
};

/** Checks a submitted settings object. Server actions are public endpoints, so nothing is assumed. */
export function validateSettings(value: unknown): SettingsError | null {
  if (typeof value !== "object" || value === null) return "invalid_choice";
  const v = value as Record<string, unknown>;
  if (typeof v.hideForks !== "boolean" || typeof v.hideArchived !== "boolean") {
    return "invalid_choice";
  }
  if (
    typeof v.stallDays !== "number" ||
    !Number.isInteger(v.stallDays) ||
    v.stallDays < STALL_DAYS_MIN ||
    v.stallDays > STALL_DAYS_MAX
  ) {
    return "invalid_days";
  }
  return null;
}
