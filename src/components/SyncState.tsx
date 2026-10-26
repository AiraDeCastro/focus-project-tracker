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
  ignored: { kind: string; title: string; fileText?: string }[];
  message: string;
}
export type SyncCheckReply =
  { ok: true; path: string; state: SyncStateView } | { ok: false; message: string };

export type RulesPreviewView =
  | { state: "already_there" }
  | { state: "pull_request_open"; url: string }
  | { state: "ready"; action: "create" | "append"; added: string; base: string };
export type RulesPreviewReply =
  | {
      ok: true;
      preview: RulesPreviewView;
      workflow: { path: string; text: string } | null;
    }
  | { ok: false; message: string };
export type RulesOpenReply = { ok: true; url: string } | { ok: false; message: string };

export type DuplicatesView = {
  number: number;
  title: string;
  url: string;
  ofNumber: number;
  ofTitle: string;
}[];
export type DuplicatesReply =
  { ok: true; duplicates: DuplicatesView } | { ok: false; message: string };
export type CloseDuplicatesReply =
  | { ok: true; closed: number[]; skipped: number[]; remaining: number }
  | { ok: false; message: string };

interface Props {
  repo: string;
  /** Left out for example data, which shows a sample answer and saves nothing. */
  onCheck?: (repo: string) => Promise<SyncCheckReply>;
  /** Adds the lines the file has and the Project lacks (the same call that connects a repo). */
  onAddLines?: (repo: string) => Promise<OnboardReply>;
  onRefresh?: (repo: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onPreviewRules?: (repo: string) => Promise<RulesPreviewReply>;
  onOpenRules?: (repo: string) => Promise<RulesOpenReply>;
  onFindDuplicates?: (repo: string) => Promise<DuplicatesReply>;
  onCloseDuplicates?: (repo: string, numbers: number[]) => Promise<CloseDuplicatesReply>;
  say: (message: string) => void;
}

const WHAT: Record<string, string> = {
  ticked_in_file: "ticked in the file; still open in the Project",
  unticked_in_file: "unticked in the file; done in the Project",
  removed_from_file: "removed from the file; still in the Project",
  renamed_in_file: "reworded in the file",
  moved_in_file: "moved to another milestone in the file",
};

const EXAMPLE: SyncStateView = {
  kind: "both",
  linesToImport: 2,
  fileOutOfDate: true,
  ignoredInFile: 1,
  ignored: [{ kind: "ticked_in_file", title: "Polish the empty state" }],
  message: "TASKS.md has 2 lines the Project lacks. TASKS.md is out of date with the Project.",
};

/**
 * "Check sync" for a repo that is connected to a Project: says whether its TASKS.md and the Project
 * agree, and offers the two fixes. The check is a dry run. Adding lines only adds. Refreshing
 * TASKS.md asks the repo's own workflow to run, because the app never writes files in other repos.
 */
export function SyncState({
  repo,
  onCheck,
  onAddLines,
  onRefresh,
  onPreviewRules,
  onOpenRules,
  onFindDuplicates,
  onCloseDuplicates,
  say,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SyncStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<Extract<RulesPreviewReply, { ok: true }> | null>(null);
  const [rulesUrl, setRulesUrl] = useState("");
  const [dups, setDups] = useState<DuplicatesView | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
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
    setRules(null);
    setRulesUrl("");
    setDups(null);
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

  async function previewRules() {
    setError("");
    if (!onPreviewRules) {
      return setRules({
        ok: true,
        preview: {
          state: "ready",
          action: "append",
          added: "## Task list and GitHub Project\n…",
          base: "main",
        },
        workflow: null,
      });
    }
    setBusy(true);
    try {
      const reply = await onPreviewRules(repo);
      if (!reply.ok) return setError(reply.message);
      setRules(reply);
    } finally {
      setBusy(false);
    }
  }

  async function openRules() {
    if (!onOpenRules) return say("Example data: nothing was opened.");
    setBusy(true);
    setError("");
    try {
      const reply = await onOpenRules(repo);
      if (!reply.ok) return setError(reply.message);
      setRulesUrl(reply.url);
    } finally {
      setBusy(false);
    }
  }

  async function findDuplicates() {
    setError("");
    if (!onFindDuplicates) {
      const sample = [
        {
          number: 12,
          title: "Add the star button to every card",
          url: "#",
          ofNumber: 150,
          ofTitle: "Add the star button to every card on the dashboard",
        },
      ];
      setDups(sample);
      return setPicked(new Set([12]));
    }
    setBusy(true);
    try {
      const reply = await onFindDuplicates(repo);
      if (!reply.ok) return setError(reply.message);
      setDups(reply.duplicates);
      setPicked(new Set(reply.duplicates.map((d) => d.number)));
    } finally {
      setBusy(false);
    }
  }

  async function closeDuplicates() {
    if (!onCloseDuplicates) return say("Example data: nothing was closed.");
    setBusy(true);
    setError("");
    try {
      const reply = await onCloseDuplicates(repo, [...picked]);
      if (!reply.ok) return setError(reply.message);
      say(
        reply.remaining > 0
          ? `Closed ${reply.closed.length}. ${reply.remaining} more: look again to continue.`
          : `Closed ${reply.closed.length} duplicate ${reply.closed.length === 1 ? "issue" : "issues"}`,
      );
      setDups(null);
      router.refresh();
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
            {state && state.ignored.length > 0 && (
              <details>
                <summary>Show the ignored edits</summary>
                <ul className={styles.previewList}>
                  {state.ignored.map((d, i) => (
                    <li key={i}>
                      <b>{d.title}</b>: {WHAT[d.kind] ?? d.kind}
                      {d.fileText ? ` (“${d.fileText}”)` : ""}
                    </li>
                  ))}
                </ul>
                {state.ignoredInFile > state.ignored.length && (
                  <p>…and {state.ignoredInFile - state.ignored.length} more.</p>
                )}
              </details>
            )}
            {state && (
              <div>
                <h3>Rules for this repo</h3>
                {!rules && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={previewRules}
                    disabled={busy}
                  >
                    Add the rules to this repo
                  </button>
                )}
                {rules?.preview.state === "already_there" && (
                  <p role="status">CLAUDE.md already has the rules.</p>
                )}
                {rules?.preview.state === "pull_request_open" && (
                  <p role="status">
                    A pull request is already open:{" "}
                    <a href={rules.preview.url} target="_blank" rel="noreferrer">
                      open it
                    </a>
                    .
                  </p>
                )}
                {rules?.preview.state === "ready" && !rulesUrl && (
                  <>
                    <p>
                      This opens a pull request on <b>{rules.preview.base}</b> that{" "}
                      {rules.preview.action === "create"
                        ? "creates CLAUDE.md with"
                        : "adds, at the end of CLAUDE.md,"}{" "}
                      this text. Nothing else changes, and nothing is merged for you.
                    </p>
                    <pre className={styles.previewList} tabIndex={0}>
                      {rules.preview.added}
                    </pre>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={openRules}
                      disabled={busy}
                    >
                      Open the pull request
                    </button>
                  </>
                )}
                {rulesUrl && (
                  <p role="status">
                    Opened:{" "}
                    <a href={rulesUrl} target="_blank" rel="noreferrer">
                      review the pull request
                    </a>
                    .
                  </p>
                )}
                {rules?.workflow && (
                  <details>
                    <summary>The sync workflow (add it by hand)</summary>
                    <p>
                      Add the secret <b>FOCUS_TRAIL_PROJECT_TOKEN</b> to the repo first (a classic
                      token with the repo and project scopes), then save this as{" "}
                      <b>{rules.workflow.path}</b>. The app cannot add workflow files for you.
                    </p>
                    <textarea
                      className={styles.input}
                      readOnly
                      rows={8}
                      value={rules.workflow.text}
                      aria-label="Workflow file"
                    />
                  </details>
                )}
              </div>
            )}
            {state && (
              <div>
                <h3>Old duplicates</h3>
                {dups === null ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={findDuplicates}
                    disabled={busy}
                  >
                    Look for duplicate issues
                  </button>
                ) : dups.length === 0 ? (
                  <p role="status">No duplicates found.</p>
                ) : (
                  <>
                    <p>
                      These open issues repeat a task that is already in the Project. Closing marks
                      them <b>not planned</b>. Nothing is deleted, and you can reopen any of them on
                      GitHub.
                    </p>
                    <ul className={styles.previewList}>
                      {dups.map((d) => (
                        <li key={d.number}>
                          <label>
                            <input
                              type="checkbox"
                              checked={picked.has(d.number)}
                              onChange={(e) => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(d.number);
                                else next.delete(d.number);
                                setPicked(next);
                              }}
                            />{" "}
                            <a href={d.url} target="_blank" rel="noreferrer">
                              #{d.number}
                            </a>{" "}
                            {d.title} <i>repeats #{d.ofNumber}</i>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      onClick={closeDuplicates}
                      disabled={busy || picked.size === 0}
                    >
                      Close {picked.size} {picked.size === 1 ? "issue" : "issues"}
                    </button>
                  </>
                )}
              </div>
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
