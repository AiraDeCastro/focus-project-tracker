"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_TITLE_MAX,
  TASK_NOTE_MAX,
  TASK_TITLE_MAX,
  ADD_ERROR_MESSAGES,
  checkMilestoneInput,
  checkTaskInput,
} from "@/lib/add-rules";
import styles from "./Dashboard.module.css";

export interface TaskPreviewView {
  title: string;
  milestone: string | null;
  body: string;
}
export interface MilestonePreviewView {
  title: string;
  dueDate: string | null;
  description: string;
}
export type TaskReply =
  | { ok: true; created: boolean; preview: TaskPreviewView; issueNumber?: number }
  | { ok: false; message: string };
export type MilestoneReply =
  | { ok: true; created: boolean; preview: MilestonePreviewView; number?: number }
  | { ok: false; message: string };

interface Props {
  /** The project's name, as the server knows it. */
  repo: string;
  /** Titles of the milestones the repo already has (not the implicit "All issues"). */
  milestones: string[];
  /** Today, "YYYY-MM-DD", the earliest due date offered. */
  today: string;
  /** Left out for example data, which shows the same dialog but saves nothing. */
  onAddTask?: (repo: string, input: unknown, confirm: boolean) => Promise<TaskReply>;
  onAddMilestone?: (repo: string, input: unknown, confirm: boolean) => Promise<MilestoneReply>;
  say: (message: string) => void;
}

type Mode = "task" | "milestone" | null;

/**
 * "Add a task" and "Add a milestone" for the focus project. Each opens a dialog that shows exactly
 * what will be created and writes only when the owner confirms. Nothing here edits or deletes.
 */
export function AddToProject({ repo, milestones, today, onAddTask, onAddMilestone, say }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [title, setTitle] = useState("");
  const [milestone, setMilestone] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<TaskPreviewView | MilestonePreviewView | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  function open(next: Exclude<Mode, null>, button: HTMLElement) {
    opener.current = button;
    setMode(next);
    setStep("form");
    setTitle("");
    setMilestone("");
    setNote("");
    setDueDate("");
    setDescription("");
    setError("");
    setPreview(null);
  }

  function close() {
    setMode(null);
    opener.current?.focus();
  }

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  const taskInput = { title, milestone: milestone || null, note };
  const milestoneInput = { title, dueDate, description };

  async function showPreview() {
    setError("");
    if (mode === "task") {
      const checked = checkTaskInput(taskInput);
      if (!checked.ok) return setError(ADD_ERROR_MESSAGES[checked.error]);
      if (!onAddTask) {
        setPreview({
          title: checked.value.title,
          milestone: checked.value.milestone,
          body: checked.value.note,
        });
        return setStep("preview");
      }
      setBusy(true);
      try {
        const reply = await onAddTask(repo, taskInput, false);
        if (!reply.ok) return setError(reply.message);
        setPreview(reply.preview);
        setStep("preview");
      } finally {
        setBusy(false);
      }
    } else {
      const checked = checkMilestoneInput(milestoneInput);
      if (!checked.ok) return setError(ADD_ERROR_MESSAGES[checked.error]);
      if (!onAddMilestone) {
        setPreview({
          title: checked.value.title,
          dueDate: checked.value.dueDate || null,
          description: checked.value.description,
        });
        return setStep("preview");
      }
      setBusy(true);
      try {
        const reply = await onAddMilestone(repo, milestoneInput, false);
        if (!reply.ok) return setError(reply.message);
        setPreview(reply.preview);
        setStep("preview");
      } finally {
        setBusy(false);
      }
    }
  }

  async function confirm() {
    setError("");
    if (mode === "task" && !onAddTask) {
      say("Example data: nothing was saved.");
      return close();
    }
    if (mode === "milestone" && !onAddMilestone) {
      say("Example data: nothing was saved.");
      return close();
    }
    setBusy(true);
    try {
      if (mode === "task" && onAddTask) {
        const reply = await onAddTask(repo, taskInput, true);
        if (!reply.ok) return setError(reply.message);
        say(`Added #${reply.issueNumber ?? ""} to the Project`.replace("# ", ""));
      } else if (mode === "milestone" && onAddMilestone) {
        const reply = await onAddMilestone(repo, milestoneInput, true);
        if (!reply.ok) return setError(reply.message);
        say(`Added the milestone ${title.trim()}`);
      }
      close();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "task" ? `Add a task to ${repo}` : `Add a milestone to ${repo}`;

  return (
    <>
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.btnLink}
          onClick={(e) => open("task", e.currentTarget)}
        >
          Add a task
        </button>
        <button
          type="button"
          className={styles.btnLink}
          onClick={(e) => open("milestone", e.currentTarget)}
        >
          Add a milestone
        </button>
      </div>

      {mode && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-title">
            <h2 id="add-title">{heading}</h2>

            {step === "form" ? (
              <>
                <label htmlFor="add-name" className={`${styles.eyebrow} ${styles.addLabel}`}>
                  {mode === "task" ? "Task" : "Milestone name"}
                </label>
                <input
                  id="add-name"
                  className={styles.input}
                  type="text"
                  autoComplete="off"
                  autoFocus
                  maxLength={mode === "task" ? TASK_TITLE_MAX : MILESTONE_TITLE_MAX}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={mode === "task" ? "What needs doing?" : "Milestone 6: Launch"}
                />
                {mode === "task" ? (
                  <>
                    <label
                      htmlFor="add-milestone"
                      className={`${styles.eyebrow} ${styles.addLabel}`}
                    >
                      Milestone
                    </label>
                    <select
                      id="add-milestone"
                      className={styles.input}
                      value={milestone}
                      onChange={(e) => setMilestone(e.target.value)}
                    >
                      <option value="">No milestone</option>
                      {milestones.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="add-note" className={`${styles.eyebrow} ${styles.addLabel}`}>
                      Note (optional)
                    </label>
                    <textarea
                      id="add-note"
                      className={styles.input}
                      rows={3}
                      maxLength={TASK_NOTE_MAX}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="add-due" className={`${styles.eyebrow} ${styles.addLabel}`}>
                      Due date (optional)
                    </label>
                    <input
                      id="add-due"
                      className={styles.input}
                      type="date"
                      min={today}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                    <label
                      htmlFor="add-description"
                      className={`${styles.eyebrow} ${styles.addLabel}`}
                    >
                      Description (optional)
                    </label>
                    <textarea
                      id="add-description"
                      className={styles.input}
                      rows={3}
                      maxLength={MILESTONE_DESCRIPTION_MAX}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <p>This is what will be created on GitHub. Nothing is saved until you confirm.</p>
                {mode === "task" && preview && "milestone" in preview ? (
                  <ul className={styles.previewList}>
                    <li>
                      <b>Task:</b> {preview.title}
                    </li>
                    <li>
                      <b>Milestone:</b> {preview.milestone ?? "none"}
                    </li>
                    <li>
                      <b>Status:</b> Todo
                    </li>
                    {note.trim() && (
                      <li>
                        <b>Note:</b> {note.trim()}
                      </li>
                    )}
                  </ul>
                ) : preview && "dueDate" in preview ? (
                  <ul className={styles.previewList}>
                    <li>
                      <b>Milestone:</b> {preview.title}
                    </li>
                    <li>
                      <b>Due:</b> {preview.dueDate ?? "no due date"}
                    </li>
                    {preview.description && (
                      <li>
                        <b>Description:</b> {preview.description}
                      </li>
                    )}
                  </ul>
                ) : null}
              </>
            )}

            {error && (
              <p className={styles.fieldError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.acts}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={step === "preview" ? () => setStep("form") : close}
              >
                {step === "preview" ? "Back" : "Cancel"}
              </button>
              {step === "form" ? (
                <button
                  type="button"
                  className={styles.btn}
                  disabled={busy || title.trim().length === 0}
                  onClick={showPreview}
                >
                  Preview
                </button>
              ) : (
                <button type="button" className={styles.btn} disabled={busy} onClick={confirm}>
                  {mode === "task" ? "Add task" : "Add milestone"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
