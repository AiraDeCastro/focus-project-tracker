"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Dashboard.module.css";
import type { OnboardReply } from "./OnboardRepo";

export interface SyncStateView {
  kind: "in_sync" | "lines_to_import" | "file_out_of_date" | "both" | "no_project";
  linesToImport: number;
  fileOutOfDate: boolean;
  ignoredInFile: number;
  message: string;
}
export type SyncCheckReply =
  { ok: true; path: string; state: SyncStateView } | { ok: false; message: string };

interface Props {
  repo: string;
  /** Left out for example data, which shows a sample answer and saves nothing. */
  onCheck?: (repo: string) => Promise<SyncCheckReply>;
  /** Adds the lines the file has and the Project lacks (the same call that connects a repo). */
  onAddLines?: (repo: string) => Promise<OnboardReply>;
  onRefresh?: (repo: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  say: (message: string) => void;
}

const EXAMPLE: SyncStateView = {
  kind: "both",
  linesToImport: 2,
  fileOutOfDate: true,
  ignoredInFile: 1,
  message: "TASKS.md has 2 lines the Project lacks. TASKS.md is out of date with the Project.",
};

/**
 * "Check sync" for a repo that is connected to a Project: says whether its TASKS.md and the Project
 * agree, and offers the two fixes. The check is a dry run. Adding lines only adds. Refreshing
 * TASKS.md asks the repo's own workflow to run, because the app never writes files in other repos.
 */
export function SyncState({ repo, onCheck, onAddLines, onRefresh, say }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SyncStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);

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

  async function check() {
    setError("");
    if (!onCheck) return setState(EXAMPLE);
    setBusy(true);
    try {
      const reply = await onCheck(repo);
      if (!reply.ok) return setError(reply.message);
      setState(reply.state);
    } finally {
      setBusy(false);
    }
  }

  function show(button: HTMLElement) {
    opener.current = button;
    setState(null);
    setError("");
    setOpen(true);
    void check();
  }

  async function addLines() {
    if (!onAddLines) return say("Example data: nothing was saved.");
    setBusy(true);
    setError("");
    try {
      // Each call does a limited number of writes; keep going until everything is in.
      for (;;) {
        const reply = await onAddLines(repo);
        if (!reply.ok) return setError(reply.message);
        if (reply.complete) break;
      }
      say("The new lines are in the Project");
      router.refresh();
    } finally {
      setBusy(false);
    }
    await check();
  }

  async function refresh() {
    if (!onRefresh) return say("Example data: nothing was started.");
    setBusy(true);
    setError("");
    try {
      const reply = await onRefresh(repo);
      if (!reply.ok) return setError(reply.message);
      say("Asked the repo to refresh TASKS.md. A pull request should appear in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.btnLink} onClick={(e) => show(e.currentTarget)}>
        Check sync
      </button>

      {open && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) close();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-title"
          >
            <h2 id="sync-title">Is TASKS.md in sync with the Project?</h2>
            <p>
              <b>{repo}</b>. The Project is the source of truth; TASKS.md is a copy. This check
              writes nothing.
            </p>
            {busy && !state && <p role="status">Checking&hellip;</p>}
            {state && (
              <ul className={styles.previewList}>
                <li>{state.message}</li>
                {state.ignoredInFile > 0 && (
                  <li>
                    {state.ignoredInFile} {state.ignoredInFile === 1 ? "edit" : "edits"} in the file{" "}
                    {state.ignoredInFile === 1 ? "is" : "are"} ignored (ticks, renames or removals).
                  </li>
                )}
              </ul>
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
                onClick={close}
                disabled={busy}
              >
                Close
              </button>
              {state && state.linesToImport > 0 && (
                <button type="button" className={styles.btn} onClick={addLines} disabled={busy}>
                  Add the new lines to the Project
                </button>
              )}
              {state && state.fileOutOfDate && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={refresh}
                  disabled={busy}
                >
                  Refresh TASKS.md
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
