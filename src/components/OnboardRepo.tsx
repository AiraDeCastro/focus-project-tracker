"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionIcon } from "./ActionIcon";
import styles from "./Dashboard.module.css";

export interface SummaryView {
  tasksFile: string;
  project: { action: "found" | "created" | "would_create"; title: string; statusMissing: string[] };
  tasksToImport: number;
  tasksAlreadyDone: number;
  issuesAlreadyThere: number;
  issuesToCreate: number;
  milestonesToCreate: number;
  ignoredInFile: number;
  writes: number;
}
export type PreviewReply = { ok: true; summary: SummaryView } | { ok: false; message: string };
export type OnboardReply =
  | { ok: true; summary: SummaryView; complete: boolean; remaining: number; written: number }
  | { ok: false; message: string };

interface Props {
  /** Repos that are not connected to a Project yet. */
  repos: string[];
  /** Left out for example data, which shows a sample plan and saves nothing. */
  onPreview?: (repo: string) => Promise<PreviewReply>;
  onOnboard?: (repo: string) => Promise<OnboardReply>;
  say: (message: string) => void;
}

const EXAMPLE: SummaryView = {
  tasksFile: "TASKS.md",
  project: { action: "would_create", title: "example-repo", statusMissing: [] },
  tasksToImport: 12,
  tasksAlreadyDone: 8,
  issuesAlreadyThere: 0,
  issuesToCreate: 12,
  milestonesToCreate: 3,
  ignoredInFile: 0,
  writes: 51,
};

/**
 * "Connect a repo to a GitHub Project": a dialog that checks a repo's task list, shows exactly what
 * would be created, and only then does it, a limited number of writes at a time. Once a repo is
 * connected, its progress on the dashboard comes from its Project.
 */
export function OnboardRepo({ repos, onPreview, onOnboard, say }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [progress, setProgress] = useState<{ remaining: number; written: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const stop = useRef(false);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // While it is writing, closing or reloading the tab would stop it halfway, so ask the browser to
  // confirm. Nothing is lost if it does stop (running it again carries on), but it is a hassle.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function show(button: HTMLElement) {
    opener.current = button;
    setRepo(repos[0] ?? "");
    setSummary(null);
    setProgress(null);
    setError("");
    setOpen(true);
  }

  async function check() {
    setError("");
    if (!onPreview) return setSummary({ ...EXAMPLE, project: { ...EXAMPLE.project, title: repo } });
    setBusy(true);
    try {
      const reply = await onPreview(repo);
      if (!reply.ok) return setError(reply.message);
      setSummary(reply.summary);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setError("");
    if (!onOnboard) {
      say("Example data: nothing was saved.");
      return close();
    }
    setBusy(true);
    stop.current = false;
    let written = progress?.written ?? 0;
    try {
      // Each call does a limited number of writes; keep going until everything is in, an error
      // stops it, or the owner chooses Stop. Running it again carries on where it left off.
      for (;;) {
        const reply = await onOnboard(repo);
        if (!reply.ok) return setError(reply.message);
        written += reply.written;
        if (reply.complete) {
          say(`${repo} is connected to its Project`);
          close();
          router.refresh();
          return;
        }
        setProgress({ remaining: reply.remaining, written });
        if (stop.current) return;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.btnLink}
        onClick={(e) => show(e.currentTarget)}
        disabled={repos.length === 0}
      >
        <ActionIcon name="link" />
        Connect a repo to a Project
      </button>

      {open && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboard-title"
          >
            <h2 id="onboard-title">Connect a repo to a GitHub Project</h2>
            <p>
              Its tasks from TASKS.md become issues in a Project, and the dashboard then reads this
              repo&rsquo;s progress from that Project. Nothing is written until you confirm.
            </p>
            <label htmlFor="onboard-repo" className={`${styles.eyebrow} ${styles.addLabel}`}>
              Repo
            </label>
            <select
              id="onboard-repo"
              className={styles.input}
              value={repo}
              disabled={busy || summary !== null}
              onChange={(e) => setRepo(e.target.value)}
            >
              {repos.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {summary && (
              <ul className={styles.previewList}>
                <li>
                  <b>Task list:</b> {summary.tasksFile}
                </li>
                <li>
                  <b>Project:</b>{" "}
                  {summary.project.action === "would_create"
                    ? `will be created, named ${summary.project.title}`
                    : `${summary.project.action === "created" ? "created" : "found"}, ${summary.project.title}`}
                </li>
                <li>
                  <b>Tasks to put in the Project:</b> {summary.tasksToImport}
                  {summary.tasksAlreadyDone > 0 && ` (${summary.tasksAlreadyDone} already done)`}
                </li>
                <li>
                  <b>New issues to create:</b> {summary.issuesToCreate}
                  {summary.issuesAlreadyThere > 0 &&
                    `; ${summary.issuesAlreadyThere} already exist on GitHub and are reused`}
                </li>
                <li>
                  <b>Milestones to create:</b> {summary.milestonesToCreate}
                </li>
                {summary.ignoredInFile > 0 && (
                  <li>
                    <b>Ignored in the file:</b> {summary.ignoredInFile}
                  </li>
                )}
                <li>
                  <b>GitHub writes:</b> about {summary.writes}
                  {!onPreview && " (example)"}
                </li>
              </ul>
            )}
            {summary && !busy && !progress && (
              <p>
                This takes a few minutes. <b>Stay on this tab until it finishes.</b> Do not close it
                or reload the page.
              </p>
            )}
            {busy && (
              <p role="status" className={styles.stayNote}>
                <b>Working. Please stay on this tab until it finishes.</b>
                {progress
                  ? ` ${progress.written} writes done so far, ${progress.remaining} tasks left.`
                  : " Starting…"}
              </p>
            )}
            {!busy && progress && (
              <p role="status">
                It stopped with {progress.remaining} tasks left ({progress.written} writes done so
                far). Nothing is lost: choose Continue to carry on where it stopped.
              </p>
            )}
            {error && (
              <p className={styles.fieldError} role="alert">
                {error}
              </p>
            )}
            <div className={styles.acts}>
              {busy && progress ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  Stop after this step
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={close}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
              {summary === null ? (
                <button
                  type="button"
                  className={styles.btn}
                  disabled={busy || !repo}
                  onClick={check}
                >
                  Check
                </button>
              ) : (
                <button type="button" className={styles.btn} disabled={busy} onClick={connect}>
                  {progress ? "Continue" : "Create and fill the Project"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
