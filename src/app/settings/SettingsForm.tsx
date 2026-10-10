"use client";

import { useState } from "react";
import type { ActionResult } from "@/app/actions";
import {
  STALL_DAYS_MAX,
  STALL_DAYS_MIN,
  SETTINGS_ERROR_MESSAGES,
  validateSettings,
  type EditableSettings,
} from "@/lib/settings-rules";
import styles from "./settings.module.css";

interface SettingsFormProps {
  initial: EditableSettings;
  /** Saves the settings. Left out for example data, where nothing is stored. */
  onSave?: (values: EditableSettings) => Promise<ActionResult>;
}

export function SettingsForm({ initial, onSave }: SettingsFormProps) {
  const [days, setDays] = useState(String(initial.stallDays));
  const [hideForks, setHideForks] = useState(initial.hideForks);
  const [hideArchived, setHideArchived] = useState(initial.hideArchived);
  const [reminder, setReminder] = useState(initial.reminderChannel);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const values: EditableSettings = {
      stallDays: days.trim() === "" ? Number.NaN : Number(days),
      hideForks,
      hideArchived,
      reminderChannel: reminder,
    };
    const problem = validateSettings(values);
    if (problem) {
      setMessage({ kind: "error", text: SETTINGS_ERROR_MESSAGES[problem] });
      return;
    }
    if (!onSave) {
      setMessage({ kind: "ok", text: "Example data: this change is not saved." });
      return;
    }
    setSaving(true);
    try {
      const result = await onSave(values);
      setMessage(
        result.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: result.error },
      );
    } catch {
      setMessage({ kind: "error", text: "Could not save. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="stall-days">Stalled alert after (days)</label>
        <p id="stall-days-hint" className={styles.hint}>
          How many days without a closed issue before your focus project counts as stalled. You can
          pause the alert any time with Away mode on the dashboard.
        </p>
        <input
          id="stall-days"
          type="number"
          inputMode="numeric"
          min={STALL_DAYS_MIN}
          max={STALL_DAYS_MAX}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          aria-describedby="stall-days-hint"
          className={styles.input}
        />
      </div>

      <fieldset className={styles.field}>
        <legend>Repos to show</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={hideForks}
            onChange={(e) => setHideForks(e.target.checked)}
          />
          <span>Hide forks</span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(e) => setHideArchived(e.target.checked)}
          />
          <span>Hide archived repos</span>
        </label>
        <p className={styles.hint}>
          Hidden repos are kept and come back as soon as you turn these off.
        </p>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Daily reminder</legend>
        <label className={styles.check}>
          <input
            type="radio"
            name="reminder"
            checked={reminder === "email"}
            onChange={() => setReminder("email")}
          />
          <span>Email me my next tasks each morning</span>
        </label>
        <label className={styles.check}>
          <input
            type="radio"
            name="reminder"
            checked={reminder === "none"}
            onChange={() => setReminder("none")}
          />
          <span>No reminder</span>
        </label>
        <p className={styles.hint}>
          It is a nudge, never a requirement. No email goes out while Away mode is on.
        </p>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" className={styles.button} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={message.kind === "error" ? styles.error : styles.ok}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
