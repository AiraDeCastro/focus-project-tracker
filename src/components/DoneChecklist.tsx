"use client";

import { useState } from "react";
import { CHECKLIST_LABEL_MAX, CHECKLIST_MAX_ITEMS } from "@/lib/checklist-rules";
import type { ChecklistItem } from "@/lib/types";
import styles from "./Dashboard.module.css";

interface DoneChecklistProps {
  project: string;
  items: ChecklistItem[];
  /** Each handler resolves true when the change went through. */
  onAdd: (label: string) => Promise<boolean>;
  onSuggest: () => Promise<boolean>;
  onToggle: (item: ChecklistItem, checked: boolean) => void;
  onRemove: (item: ChecklistItem) => void;
}

/**
 * The owner's optional "is it done?" list for the focus project. It is an aid, never a gate:
 * nothing here stops a project being marked finished or deployed.
 */
export function DoneChecklist({
  project,
  items,
  onAdd,
  onSuggest,
  onToggle,
  onRemove,
}: DoneChecklistProps) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const done = items.filter((i) => i.checked).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(label);
    setBusy(false);
    if (ok) setLabel("");
  }

  async function suggest() {
    setBusy(true);
    await onSuggest();
    setBusy(false);
  }

  return (
    <section className={styles.card} aria-label="Definition of done">
      <div className={styles.eyebrow}>Definition of done</div>
      <h2>
        {items.length > 0 ? (
          <>
            Is {project} done?{" "}
            <span className={styles.num}>
              {done} of {items.length}
            </span>
          </>
        ) : (
          `What does done mean for ${project}?`
        )}
      </h2>

      {items.length === 0 && (
        <p className={styles.emptyToday}>
          Optional: write the things that must be true before you call it done. It never blocks you
          from finishing.
        </p>
      )}

      {items.length > 0 && (
        <ul className={styles.todo}>
          {items.map((item) => (
            <li key={item.id} className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => onToggle(item, e.target.checked)}
                />
                <span>{item.label}</span>
              </label>
              <button
                type="button"
                className={styles.removeBtn}
                aria-label={`Remove: ${item.label}`}
                title="Remove"
                onClick={() => onRemove(item)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length < CHECKLIST_MAX_ITEMS && (
        <form onSubmit={add} className={styles.checkAdd}>
          <label htmlFor="checklist-new" className={styles.srOnly}>
            New checklist item
          </label>
          <input
            id="checklist-new"
            className={styles.input}
            value={label}
            maxLength={CHECKLIST_LABEL_MAX}
            placeholder="Add an item"
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnGhost}`}
            disabled={busy || !label.trim()}
          >
            Add
          </button>
        </form>
      )}

      {items.length === 0 && (
        <button type="button" className={styles.btnLink} disabled={busy} onClick={suggest}>
          Start with suggested items
        </button>
      )}
    </section>
  );
}
