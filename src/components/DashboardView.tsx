"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ActionResult, ItemResult, ItemsResult } from "@/app/actions";
import { applyAwayToAlerts } from "@/lib/alerts";
import { SUGGESTED_CHECKLIST, cleanLabel } from "@/lib/checklist-rules";
import { monthGrid } from "@/lib/calendar";
import {
  checkFinishedDate,
  EARLIEST_FINISHED_DATE,
  FINISHED_DATE_MESSAGES,
  normalizeLiveUrl,
  type DoneKind,
} from "@/lib/done-rules";
import { MIN_REASON_LENGTH } from "@/lib/focus-rules";
import { suggestFocus } from "@/lib/focus-suggestion";
import { shippedPrompt, type Shipped } from "@/lib/shipped";
import { KIND_LABEL, PROJECT_KINDS, type ProjectKind } from "@/lib/project-kind";
import { currentMilestoneIndex, milestoneClosed, percentComplete, totals } from "@/lib/progress";
import { describeSinceVisit } from "@/lib/last-visit";
import { describeStreak } from "@/lib/streak";
import { describeFocusEntry } from "@/lib/focus-log";
import { dueText } from "@/lib/due-text";
import { moveInRanking, normalizeRanks } from "@/lib/priority-rules";
import { describeWeeklyReview } from "@/lib/weekly-review";
import { describeDeployCheck, describeDeployStatus } from "@/lib/deploy-status";
import { dayLabel, isoDate, positionOnGraph, relativeDay } from "@/lib/dashboard-utils";
import { formatDue } from "@/lib/github/mapping";
import type { ChecklistItem, Dashboard, Project, ProjectStatus } from "@/lib/types";
import logo from "@/assets/focus-trail-logo.png";
import styles from "./Dashboard.module.css";
import { DoneChecklist } from "./DoneChecklist";
import { ProgressGraph } from "./ProgressGraph";
import { VisitTracker } from "./VisitTracker";
import { IssueTrend } from "./IssueTrend";
import { Ring } from "./Ring";
import { ThemeToggle } from "./ThemeToggle";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  focus: "Focus",
  backlog: "Backlog",
  paused: "Paused",
  deployed: "Deployed",
  finished: "Finished",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  focus: "var(--yellow)",
  backlog: "var(--sage)",
  paused: "var(--terra)",
  deployed: "var(--teal)",
  finished: "var(--teal)",
};
const PILL_CLASS: Record<ProjectStatus, string> = {
  focus: styles.pillFocus,
  backlog: styles.pillBacklog,
  paused: styles.pillPaused,
  deployed: styles.pillDeployed,
  finished: styles.pillDeployed,
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function PriorityStar({
  project,
  onToggle,
  className = "",
}: {
  project: Project;
  onToggle: (project: Project) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.star} ${project.highPriority ? styles.starOn : ""} ${className}`}
      aria-pressed={project.highPriority}
      aria-label={`High priority: ${project.id}`}
      title={project.highPriority ? "High priority. Tap to remove." : "Mark as high priority"}
      onClick={() => onToggle(project)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
      </svg>
    </button>
  );
}

interface DashboardViewProps {
  data: Dashboard;
  /** Saves a priority change. Left out for example data, where changes only last until reload. */
  onSetPriority?: (name: string, value: boolean) => Promise<ActionResult>;
  /** Saves a move up or down in the ranking of starred projects. Left out for example data. */
  onMovePriority?: (name: string, direction: "up" | "down") => Promise<ActionResult>;
  /** Saves a focus choice and its reason. Left out for example data. */
  onSetFocus?: (name: string, reason: string) => Promise<ActionResult>;
  /** Marks a project finished or deployed. Left out for example data. */
  onMarkDone?: (
    name: string,
    kind: DoneKind,
    liveUrl: string,
    finishedOn: string,
  ) => Promise<ActionResult>;
  /** Changes the day a done project is recorded as finished. Left out for example data. */
  onSetFinishedDate?: (name: string, date: string) => Promise<ActionResult>;
  /** Puts a done project back in the backlog. Left out for example data. */
  onReopen?: (name: string) => Promise<ActionResult>;
  /** Saves whether a repo is a project, practice code or school work. Left out for example data. */
  onSetKind?: (name: string, kind: ProjectKind) => Promise<ActionResult>;
  /** Turns Away mode on until a return date ("YYYY-MM-DD"), or off with null. Left out for example data. */
  onSetAway?: (returnDate: string | null) => Promise<ActionResult>;
  /** Saves the definition-of-done checklist. Left out for example data. */
  checklistActions?: {
    add: (name: string, label: string) => Promise<ItemResult>;
    suggest: (name: string) => Promise<ItemsResult>;
    toggle: (id: number, checked: boolean) => Promise<ActionResult>;
    remove: (id: number) => Promise<ActionResult>;
  };
}

export function DashboardView({
  data,
  onSetPriority,
  onMovePriority,
  onSetFocus,
  onMarkDone,
  onSetFinishedDate,
  onReopen,
  onSetKind,
  onSetAway,
  checklistActions,
}: DashboardViewProps) {
  const [projects, setProjects] = useState<Project[]>(data.projects);
  const [selectedId, setSelectedId] = useState(
    () =>
      data.projects.find((p) => p.status === "focus")?.id ??
      suggestFocus(data.projects)?.id ??
      data.projects[0]?.id,
  );
  const [checked, setChecked] = useState<Record<string, number[]>>({});
  const [query, setQuery] = useState("");
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [doneKind, setDoneKind] = useState<DoneKind>("finished");
  const [liveUrl, setLiveUrl] = useState("");
  const [finishedOn, setFinishedOn] = useState("");
  /** The done project whose finished date is being changed, and the date typed so far. */
  const [dating, setDating] = useState<string | null>(null);
  const [datingValue, setDatingValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Away mode: real data comes from the server (the page refreshes after a save). Example data
  // has no server, so a change is kept here and applied to the sample alerts.
  // Set when the focus project is finished or deployed, so the next card can say so.
  const [shipped, setShipped] = useState<Shipped | null>(null);
  const pickButton = useRef<HTMLButtonElement | null>(null);
  const [exampleAway, setExampleAway] = useState<string | null | undefined>(undefined);
  const [awayOpen, setAwayOpen] = useState(false);
  const [awayDate, setAwayDate] = useState("");
  const [awayError, setAwayError] = useState("");
  const [awaySaving, setAwaySaving] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Example data has no database to give items ids, so they count down from -1000.
  const localId = useRef(-1000);

  const awayUntil = exampleAway !== undefined ? exampleAway : data.awayUntil;
  const alerts =
    exampleAway !== undefined ? applyAwayToAlerts(data.alerts, exampleAway) : data.alerts;
  const tomorrow = isoDate(new Date(Date.parse(`${data.today}T00:00:00Z`) + 24 * 60 * 60 * 1000));

  const focus = projects.find((p) => p.status === "focus");
  const suggestion = focus ? undefined : suggestFocus(projects);
  const shippedNow = focus ? null : shipped;
  // Milestone progress follows only the projects that matter: the starred ones, plus whichever
  // project currently has focus, so the card is never about something you are not working on.
  const graphProjects = projects.filter(
    (p) => p.kind === "project" && (p.highPriority || p.status === "focus"),
  );
  const selected = graphProjects.find((p) => p.id === selectedId) ?? graphProjects[0];

  const extra = (p: Project) => (checked[p.id] ?? []).length;
  const pct = (p: Project) => percentComplete(p, extra(p));

  // The button that opened the finish dialog is gone once its project ships, so keyboard focus
  // moves to the next step instead of being lost.
  useEffect(() => {
    if (shipped) pickButton.current?.focus();
  }, [shipped]);

  useEffect(() => {
    if (!switchTo && !finishing && !dating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSwitchTo(null);
      setFinishing(null);
      setDating(null);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [switchTo, finishing, dating]);

  function say(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  async function saveAway(returnDate: string | null) {
    setAwayError("");
    setAwaySaving(true);
    try {
      if (onSetAway) {
        const result = await onSetAway(returnDate);
        if (!result.ok) {
          setAwayError(result.error);
          return;
        }
      } else {
        setExampleAway(returnDate);
        say("Example data: this change is not saved");
      }
      setAwayOpen(false);
      setAwayDate("");
      if (onSetAway) {
        say(returnDate ? `Away until ${formatDue(returnDate)}` : "Welcome back. Alerts are on");
      }
    } catch {
      setAwayError("Could not save. Try again.");
    } finally {
      setAwaySaving(false);
    }
  }

  function closeModal() {
    setSwitchTo(null);
    opener.current?.focus();
  }

  function openModal(id: string, trigger: HTMLElement) {
    opener.current = trigger;
    setReason("");
    setSwitchTo(id);
  }

  async function confirmSwitch() {
    if (!switchTo || saving) return;
    const text = reason.trim();
    // Leaving a project needs a reason. Picking the first focus project does not.
    if (focus && text.length < MIN_REASON_LENGTH) return;
    const target = switchTo;
    const previous = focus?.id;

    setSaving(true);
    if (onSetFocus) {
      try {
        const result = await onSetFocus(target, text);
        if (!result.ok) {
          setSaving(false);
          say(result.error);
          return;
        }
      } catch {
        setSaving(false);
        say("Could not save. Try again.");
        return;
      }
    }
    // Example data has no database, so the change only lasts until reload.
    setProjects((all) =>
      all.map((p) =>
        p.id === target
          ? { ...p, status: "focus" }
          : p.id === previous
            ? { ...p, status: "paused" }
            : p,
      ),
    );
    setSelectedId(target);
    setSaving(false);
    closeModal();
    say(`Focus is now ${target}`);
  }

  function openFinish(id: string, trigger: HTMLElement) {
    opener.current = trigger;
    setDoneKind("finished");
    setLiveUrl("");
    setFinishedOn(data.today);
    setFinishing(id);
  }

  function closeFinish() {
    setFinishing(null);
    opener.current?.focus();
  }

  async function confirmFinish() {
    if (!finishing || saving) return;
    if (doneKind === "deployed" && !normalizeLiveUrl(liveUrl)) return;
    if (checkFinishedDate(finishedOn, data.today)) return;
    const target = finishing;
    const kind = doneKind;
    const typed = liveUrl.trim();

    setSaving(true);
    if (onMarkDone) {
      try {
        const result = await onMarkDone(target, kind, typed, finishedOn);
        if (!result.ok) {
          setSaving(false);
          say(result.error);
          return;
        }
      } catch {
        setSaving(false);
        say("Could not save. Try again.");
        return;
      }
    }
    const address = kind === "deployed" ? (normalizeLiveUrl(typed) ?? undefined) : undefined;
    const wasFocus = projects.find((p) => p.id === target)?.status === "focus";
    if (wasFocus) setShipped({ name: target, kind });
    setProjects((all) =>
      all.map((p) =>
        p.id === target ? { ...p, status: kind, deployedUrl: address, finishedOn } : p,
      ),
    );
    setSaving(false);
    closeFinish();
    say(
      wasFocus
        ? `${target} is marked ${kind}. Choose your next focus`
        : `${target} is marked ${kind}`,
    );
  }

  function openDating(project: Project, trigger: HTMLElement) {
    opener.current = trigger;
    setDatingValue(project.finishedOn ?? data.today);
    setDating(project.id);
  }

  function closeDating() {
    setDating(null);
    opener.current?.focus();
  }

  async function confirmDating() {
    if (!dating || saving || checkFinishedDate(datingValue, data.today)) return;
    const target = dating;
    const date = datingValue;
    setSaving(true);
    if (onSetFinishedDate) {
      try {
        const result = await onSetFinishedDate(target, date);
        if (!result.ok) {
          setSaving(false);
          say(result.error);
          return;
        }
      } catch {
        setSaving(false);
        say("Could not save. Try again.");
        return;
      }
    }
    setProjects((all) => all.map((p) => (p.id === target ? { ...p, finishedOn: date } : p)));
    setSaving(false);
    closeDating();
    say(
      onSetFinishedDate
        ? `Finished date saved for ${target}`
        : "Example data: this change is not saved",
    );
  }

  async function changeKind(project: Project, kind: ProjectKind) {
    if (kind === project.kind) return;
    // The current focus project must stay a project; the server enforces this too.
    if (kind !== "project" && project.status === "focus") {
      say("This is your focus project. Switch focus first, then change its type.");
      return;
    }
    const set = (value: ProjectKind) =>
      setProjects((all) => all.map((p) => (p.id === project.id ? { ...p, kind: value } : p)));
    const previous = project.kind;
    set(kind);
    if (!onSetKind) {
      say("Example data: this change is not saved");
      return;
    }
    try {
      const result = await onSetKind(project.id, kind);
      if (result.ok) {
        say(`${project.id} is now ${KIND_LABEL[kind].toLowerCase()} work`);
      } else {
        set(previous);
        say(result.error);
      }
    } catch {
      set(previous);
      say("Could not save. Try again.");
    }
  }

  async function reopen(project: Project) {
    if (onReopen) {
      try {
        const result = await onReopen(project.id);
        if (!result.ok) {
          say(result.error);
          return;
        }
      } catch {
        say("Could not save. Try again.");
        return;
      }
    }
    setProjects((all) => all.map((p) => (p.id === project.id ? { ...p, status: "backlog" } : p)));
    say(`${project.id} is back in your backlog`);
  }

  async function movePriority(project: Project, direction: "up" | "down") {
    const before = projects;
    const order = priorityOthers.map((p) => p.id);
    const next = moveInRanking(order, project.id, direction);
    if (!next || next.join() === order.join()) return;
    // The visible starred projects take the places the visible ones held, in the new order; the
    // focus project and finished ones keep theirs.
    const places = priorityOthers.map((p) => p.priorityRank ?? 0).sort((a, b) => a - b);
    const placeOf = new Map(next.map((id, i) => [id, places[i]]));
    setProjects((all) =>
      all.map((p) => (placeOf.has(p.id) ? { ...p, priorityRank: placeOf.get(p.id) } : p)),
    );
    if (!onMovePriority) {
      say("Example data: this change is not saved");
      return;
    }
    try {
      const result = await onMovePriority(project.id, direction);
      if (!result.ok) {
        setProjects(before);
        say(result.error);
      }
    } catch {
      setProjects(before);
      say("Could not save. Try again.");
    }
  }

  async function togglePriority(project: Project) {
    const next = !project.highPriority;
    // A newly starred project goes to the bottom of the ranking; the places are then renumbered.
    const set = (value: boolean) =>
      setProjects((all) =>
        normalizeRanks(
          all.map((p) =>
            p.id === project.id
              ? { ...p, highPriority: value, priorityRank: Number.MAX_SAFE_INTEGER }
              : p,
          ),
        ),
      );
    set(next);
    if (!onSetPriority) {
      say("Example data: this change is not saved");
      return;
    }
    try {
      const result = await onSetPriority(project.id, next);
      if (result.ok) {
        say(
          next ? `${project.id} is now high priority` : `${project.id} is no longer high priority`,
        );
      } else {
        set(!next);
        say(result.error);
      }
    } catch {
      set(!next);
      say("Could not save. Try again.");
    }
  }

  function editChecklist(project: Project, change: (items: ChecklistItem[]) => ChecklistItem[]) {
    setProjects((all) =>
      all.map((p) => (p.id === project.id ? { ...p, checklist: change(p.checklist) } : p)),
    );
  }

  async function checklistAdd(project: Project, label: string): Promise<boolean> {
    if (!cleanLabel(label)) {
      say("Write an item first");
      return false;
    }
    if (!checklistActions) {
      const item = { id: localId.current--, label: cleanLabel(label)!, checked: false };
      editChecklist(project, (items) => [...items, item]);
      say("Example data: this change is not saved");
      return true;
    }
    try {
      const result = await checklistActions.add(project.id, label);
      if (!result.ok) {
        say(result.error);
        return false;
      }
      editChecklist(project, (items) => [...items, result.item]);
      return true;
    } catch {
      say("Could not save. Try again.");
      return false;
    }
  }

  async function checklistSuggest(project: Project): Promise<boolean> {
    if (!checklistActions) {
      const items = SUGGESTED_CHECKLIST.map((label) => ({
        id: localId.current--,
        label,
        checked: false,
      }));
      editChecklist(project, () => items);
      say("Example data: this change is not saved");
      return true;
    }
    try {
      const result = await checklistActions.suggest(project.id);
      if (!result.ok) {
        say(result.error);
        return false;
      }
      editChecklist(project, () => result.items);
      return true;
    } catch {
      say("Could not save. Try again.");
      return false;
    }
  }

  async function checklistToggle(project: Project, item: ChecklistItem, checked: boolean) {
    const set = (value: boolean) =>
      editChecklist(project, (items) =>
        items.map((i) => (i.id === item.id ? { ...i, checked: value } : i)),
      );
    set(checked);
    if (!checklistActions) {
      say("Example data: this change is not saved");
      return;
    }
    try {
      const result = await checklistActions.toggle(item.id, checked);
      if (!result.ok) {
        set(!checked);
        say(result.error);
      }
    } catch {
      set(!checked);
      say("Could not save. Try again.");
    }
  }

  async function checklistRemove(project: Project, item: ChecklistItem) {
    if (checklistActions) {
      try {
        const result = await checklistActions.remove(item.id);
        if (!result.ok) {
          say(result.error);
          return;
        }
      } catch {
        say("Could not save. Try again.");
        return;
      }
    } else {
      say("Example data: this change is not saved");
    }
    editChecklist(project, (items) => items.filter((i) => i.id !== item.id));
  }

  function toggleTask(project: Project, taskNumber: number, done: boolean) {
    setChecked((c) => {
      const list = c[project.id] ?? [];
      return {
        ...c,
        [project.id]: done ? [...list, taskNumber] : list.filter((n) => n !== taskNumber),
      };
    });
    say(done ? `Closed #${taskNumber} on GitHub` : `Reopened #${taskNumber}`);
  }

  const month = monthGrid(data.today);
  const counts = (["focus", "backlog", "paused", "deployed", "finished"] as ProjectStatus[]).map(
    (s) => ({
      status: s,
      count: projects.filter((p) => p.kind === "project" && p.status === s).length,
    }),
  );
  const maxClosed = Math.max(...data.closedPerDay, 1);
  const todayIndex = (new Date(`${data.today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const others = projects.filter(
    (p) => p.status !== "focus" && p.id.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const focusTotals = focus ? totals(focus, extra(focus)) : null;
  const focusIndex = focus ? currentMilestoneIndex(focus, extra(focus)) : 0;
  const focusMilestone = focus?.milestones[focusIndex];
  const selectedSeries = selected ? [...selected.series.slice(0, -1), pct(selected)] : [];
  const dueMarkers =
    selected?.status === "focus"
      ? selected.milestones.flatMap((m) => {
          const index = m.dueDate ? positionOnGraph(m.dueDate, data.weekDates) : null;
          return index === null ? [] : [{ index, label: `${m.name} due` }];
        })
      : [];

  const isDone = (p: Project) => p.status === "deployed" || p.status === "finished";
  const realOthers = others.filter((p) => p.kind === "project");
  const sideWork = others.filter((p) => p.kind !== "project");
  const priorityOthers = realOthers
    .filter((p) => !isDone(p) && p.highPriority)
    .sort((a, b) => (a.priorityRank ?? Infinity) - (b.priorityRank ?? Infinity));
  const restOthers = realOthers.filter((p) => !isDone(p) && !p.highPriority);
  const doneOthers = realOthers.filter(isDone);

  /** Vercel's view of the live site, shown only when the repo's homepage matched a Vercel project. */
  function renderDeploy(p: Project) {
    if (!p.deploy) return null;
    const { label, tone } = describeDeployStatus(p.deploy);
    const toneClass =
      tone === "good"
        ? styles.pillDeployed
        : tone === "bad"
          ? styles.pillPaused
          : styles.pillBacklog;
    return (
      <span className={`${styles.pill} ${toneClass}`}>
        {label}
        {p.deploy.at ? ` (${relativeDay(p.deploy.at, data.today)})` : ""}
      </span>
    );
  }

  /** The place in the owner's ranking, with buttons to move it. Only for starred projects in play. */
  function renderRank(p: Project) {
    const place = priorityOthers.findIndex((x) => x.id === p.id);
    if (place === -1) return null;
    return (
      <div className={styles.rankRow} role="group" aria-label={`Priority order of ${p.id}`}>
        <span className={`${styles.rankNo} ${styles.num}`}>
          #{place + 1} of {priorityOthers.length}
        </span>
        <button
          type="button"
          className={styles.rankBtn}
          aria-label={`Move ${p.id} up in priority`}
          disabled={place === 0}
          onClick={() => movePriority(p, "up")}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          className={styles.rankBtn}
          aria-label={`Move ${p.id} down in priority`}
          disabled={place === priorityOthers.length - 1}
          onClick={() => movePriority(p, "down")}
        >
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    );
  }

  function renderCard(p: Project) {
    const milestone = p.milestones[currentMilestoneIndex(p)];
    const isSideWork = p.kind !== "project";
    return (
      <article key={p.id} className={`${styles.card} ${styles.proj}`}>
        <div className={styles.projRow}>
          <div className={styles.mini}>
            <Ring percent={pct(p)} size={64} strokeWidth={8} />
            <b className={styles.num}>{pct(p)}%</b>
          </div>
          <div className={styles.projText}>
            <h3>{p.id}</h3>
            <div className={styles.pillRow}>
              <span className={`${styles.pill} ${PILL_CLASS[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </span>
              {renderDeploy(p)}
              <select
                className={styles.kindSelect}
                aria-label={`Type of ${p.id}`}
                value={p.kind}
                onChange={(e) => changeKind(p, e.target.value as ProjectKind)}
              >
                {PROJECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!isSideWork && (
            <PriorityStar project={p} onToggle={togglePriority} className={styles.starEnd} />
          )}
        </div>
        <div className={styles.sub}>
          {isSideWork ? (
            `${KIND_LABEL[p.kind]} work. It never competes for your focus.`
          ) : p.status === "deployed" || p.status === "finished" ? (
            <>
              {p.status === "deployed" ? "Shipped. All milestones closed." : "Finished."}
              {p.finishedOn && (
                <>
                  {" "}
                  <span className={styles.num}>{dayLabel(p.finishedOn)}</span>.{" "}
                  <button
                    type="button"
                    className={styles.btnLink}
                    onClick={(e) => openDating(p, e.currentTarget)}
                    aria-label={`Change date for ${p.id}`}
                  >
                    Change date
                  </button>
                </>
              )}
            </>
          ) : milestone ? (
            <>
              Next milestone: <b>{milestone.name}</b>, {dueText(milestone.due, "sentence")}
            </>
          ) : (
            "No milestones or issues yet"
          )}
        </div>
        {renderRank(p)}
        <div className={styles.foot}>
          <span className={styles.sub}>Active {p.lastActivity}</span>
          {isSideWork ? null : isDone(p) ? (
            <span className={styles.footActions}>
              {p.deployedUrl && (
                <a
                  className={styles.btnLink}
                  href={p.deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit site
                </a>
              )}
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => reopen(p)}
              >
                Reopen
              </button>
            </span>
          ) : (
            <span className={styles.footActions}>
              <button
                type="button"
                className={styles.btnLink}
                onClick={(e) => openFinish(p.id, e.currentTarget)}
              >
                Mark finished
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={(e) => openModal(p.id, e.currentTarget)}
              >
                {focus ? "Switch focus" : "Make focus"}
              </button>
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <>
      <div className={styles.frame}>
        <nav className={styles.side} aria-label="Main">
          <div className={styles.avatar} aria-hidden="true">
            {data.ownerName.slice(0, 1).toUpperCase()}
          </div>
          <a href="#top" className={`${styles.nav} ${styles.navOn}`} aria-label="Home" title="Home">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
            </svg>
          </a>
          <a href="#others" className={styles.nav} aria-label="Projects" title="Projects">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="2" />
              <rect x="14" y="3" width="7" height="7" rx="2" />
              <rect x="3" y="14" width="7" height="7" rx="2" />
              <rect x="14" y="14" width="7" height="7" rx="2" />
            </svg>
          </a>
          <a href="#ladder" className={styles.nav} aria-label="Milestones" title="Milestones">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 21V4m0 0h12l-2 4 2 4H5" />
            </svg>
          </a>
          <a href="#cal" className={styles.nav} aria-label="Calendar" title="Calendar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
          </a>
          <span className={styles.spacer} />
          <Link href="/settings" className={styles.nav} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
            </svg>
          </Link>
        </nav>

        <main className={styles.main} id="top">
          <header className={styles.top}>
            <div className={styles.hello}>
              <h1>Good morning, {data.ownerName}</h1>
              <p>
                {focus && focusTotals
                  ? `Finish ${focus.id} before anything else. ${focusTotals.open} issues left.`
                  : "No focus project yet. Pick one below."}
              </p>
              {data.streak && (
                <p className={`${styles.streak} ${styles.num}`}>{describeStreak(data.streak)}</p>
              )}
            </div>
            <Image
              src={logo}
              alt="Focus Trail"
              width={113}
              height={44}
              priority
              className={styles.brand}
            />
            <div className={styles.topActions}>
              <label className={styles.search}>
                <input
                  type="search"
                  placeholder="Find a repo"
                  aria-label="Find a repo"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className={styles.searchIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="6" />
                    <path d="M20 20l-4-4" />
                  </svg>
                </span>
              </label>
              <ThemeToggle />
            </div>
          </header>

          <VisitTracker />
          {data.sinceLastVisit && (
            <section
              className={`${styles.card} ${styles.since}`}
              aria-label="Since your last visit"
            >
              <div className={styles.eyebrow}>Since your last visit</div>
              <h2>{describeSinceVisit(data.sinceLastVisit).heading}</h2>
              <ul>
                {describeSinceVisit(data.sinceLastVisit).lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.grid}>
            {!focus && (
              <section
                className={`${styles.card} ${styles.cRing} ${styles.ringCard}`}
                aria-label="Pick your focus project"
              >
                {shippedNow ? (
                  <span className={`${styles.pill} ${styles.pillDeployed}`}>
                    {shippedPrompt(shippedNow, suggestion?.id).pill}
                  </span>
                ) : (
                  <span className={`${styles.pill} ${styles.pillBacklog}`}>No focus yet</span>
                )}
                {suggestion ? (
                  <>
                    <h2>
                      {shippedNow
                        ? shippedPrompt(shippedNow, suggestion.id).heading
                        : `Start with ${suggestion.id}`}
                    </h2>
                    <div className={styles.ring}>
                      <Ring percent={pct(suggestion)} size={150} strokeWidth={14} />
                      <div className={`${styles.pct} ${styles.num}`}>
                        <span>
                          {pct(suggestion)}
                          <small>%</small>
                        </span>
                      </div>
                    </div>
                    <div className={styles.meta}>
                      {suggestion.highPriority
                        ? pct(suggestion) > 0
                          ? "High priority and the closest to done."
                          : "High priority."
                        : pct(suggestion) > 0
                          ? "The closest to done."
                          : "Has issues ready to start."}
                      <br />
                      One project at a time until it ships.
                    </div>
                    <button
                      type="button"
                      ref={pickButton}
                      className={styles.btn}
                      onClick={(e) => openModal(suggestion.id, e.currentTarget)}
                    >
                      Make this my focus
                    </button>
                  </>
                ) : (
                  <>
                    <h2>
                      {shippedNow
                        ? shippedPrompt(shippedNow, undefined).heading
                        : projects.length === 0
                          ? "No repos yet"
                          : "Nothing to focus on yet"}
                    </h2>
                    <div className={styles.meta}>
                      {projects.length === 0
                        ? "Focus Trail reads your GitHub repos. Create one on GitHub, then reload. Forks and archived repos are hidden."
                        : "None of your repos has issues yet. Add milestones and issues on GitHub and reload, or pick any project below with Make focus."}
                    </div>
                  </>
                )}
              </section>
            )}

            {focus && focusTotals && (
              <section
                className={`${styles.card} ${styles.cRing} ${styles.ringCard}`}
                aria-label="Focus project"
              >
                <PriorityStar
                  project={focus}
                  onToggle={togglePriority}
                  className={styles.starCorner}
                />
                <span className={`${styles.pill} ${styles.pillFocus}`}>Focus project</span>
                {focus.highPriority && (
                  <span className={`${styles.pill} ${styles.pillPriority}`}>High priority</span>
                )}
                {renderDeploy(focus)}
                <h2>{focus.id}</h2>
                <div className={styles.ring}>
                  <Ring percent={pct(focus)} size={150} strokeWidth={14} />
                  <div className={`${styles.pct} ${styles.num}`}>
                    <span>
                      {pct(focus)}
                      <small>%</small>
                    </span>
                  </div>
                </div>
                <div className={styles.meta}>
                  {focusMilestone ? (
                    <>
                      <b>{focusMilestone.name}</b> milestone,{" "}
                      {dueText(focusMilestone.due, "sentence")}
                    </>
                  ) : (
                    "No milestones or issues yet"
                  )}
                  <br />
                  Last task closed {focus.lastActivity}
                </div>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    say(
                      focusTotals.open > 0
                        ? `${focusTotals.open} issues still open in ${focus.id}`
                        : "Milestone complete. Nice.",
                    )
                  }
                >
                  Mark milestone done
                </button>
                <button
                  type="button"
                  className={styles.btnLink}
                  onClick={(e) => openFinish(focus.id, e.currentTarget)}
                >
                  Mark project finished
                </button>
              </section>
            )}

            {selected ? (
              <section
                className={`${styles.card} ${styles.cGraph}`}
                aria-label="Milestone progress"
              >
                <div className={styles.gh}>
                  <div>
                    <div className={styles.eyebrow}>Milestone progress</div>
                    <h2>{selected.id}</h2>
                  </div>
                  <div className={styles.tabs} role="group" aria-label="Choose a repo">
                    {graphProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={styles.tab}
                        aria-pressed={p.id === selected.id}
                        onClick={() => setSelectedId(p.id)}
                      >
                        {p.id}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.graph}>
                  <ProgressGraph
                    repo={selected.id}
                    weekLabels={data.weekLabels}
                    series={selectedSeries}
                    dueMarkers={dueMarkers}
                    showIdeal={selected.status === "focus"}
                    idealEndIndex={data.idealEndIndex}
                  />
                </div>
                <div className={styles.legend}>
                  <span>
                    <i />
                    Actual progress
                  </span>
                  {selected.status === "focus" && (
                    <>
                      <span>
                        <i className={styles.dashed} />
                        Ideal pace to {data.weekLabels[data.idealEndIndex]}
                      </span>
                      <span>
                        <i className={styles.marker} />
                        Milestone due date
                      </span>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <section
                className={`${styles.card} ${styles.cGraph}`}
                aria-label="Milestone progress"
              >
                <div className={styles.eyebrow}>Milestone progress</div>
                <h2>Nothing to follow yet</h2>
                <p className={styles.emptyToday}>
                  Tap the star on a project to follow its milestones here. Your focus project always
                  appears.
                </p>
              </section>
            )}

            <section className={`${styles.card} ${styles.cToday}`} aria-label="Today">
              <div className={styles.eyebrow}>Today</div>
              <h2>{focus ? `Next tasks in ${focus.id}` : "Next tasks"}</h2>
              {focus && focus.todayTasks.length > 0 ? (
                <ul className={styles.todo}>
                  {focus.todayTasks.map((t) => (
                    <li key={t.number}>
                      {data.isExample || !t.url?.startsWith("https://") ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={(checked[focus.id] ?? []).includes(t.number)}
                            onChange={(e) => toggleTask(focus, t.number, e.target.checked)}
                          />
                          <span>
                            <span className={styles.taskId}>#{t.number}</span> {t.title}
                          </span>
                        </label>
                      ) : (
                        // Real issues are closed on GitHub, the source of truth, so this opens
                        // the issue instead of offering a checkbox that would only look done.
                        <a
                          className={styles.taskLink}
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open issue #${t.number} on GitHub: ${t.title}`}
                        >
                          <span>
                            <span className={styles.taskId}>#{t.number}</span> {t.title}
                          </span>
                          <span aria-hidden="true" className={styles.taskOut}>
                            ↗
                          </span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyToday}>
                  {focus
                    ? "No open tasks. Mark the project deployed or pick the next one."
                    : "Pick a focus project to see your next tasks."}
                </p>
              )}
              {focus &&
                alerts.map((a) => (
                  <div
                    key={`${a.kind}-${a.text}`}
                    className={`${styles.alert} ${a.kind === "info" ? styles.alertOk : ""}`}
                    role={a.kind === "info" ? undefined : "status"}
                  >
                    <b>{a.title}</b> {a.text}
                  </div>
                ))}
              <div className={styles.away}>
                {awayUntil ? (
                  <p>
                    Away until {formatDue(awayUntil)}.{" "}
                    <button
                      type="button"
                      className={styles.btnLink}
                      disabled={awaySaving}
                      onClick={() => saveAway(null)}
                    >
                      I&apos;m back
                    </button>
                  </p>
                ) : awayOpen ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveAway(awayDate);
                    }}
                  >
                    <label htmlFor="away-date">Back on</label>
                    <input
                      id="away-date"
                      type="date"
                      className={styles.input}
                      value={awayDate}
                      min={tomorrow}
                      required
                      aria-describedby={awayError ? "away-error" : undefined}
                      onChange={(e) => setAwayDate(e.target.value)}
                    />
                    {awayError && (
                      <p id="away-error" role="alert" className={styles.fieldError}>
                        {awayError}
                      </p>
                    )}
                    <div className={styles.awayActions}>
                      <button
                        type="submit"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        disabled={awaySaving || !awayDate}
                      >
                        Pause stalled alerts
                      </button>
                      <button
                        type="button"
                        className={styles.btnLink}
                        onClick={() => {
                          setAwayOpen(false);
                          setAwayError("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className={styles.btnLink}
                    onClick={() => setAwayOpen(true)}
                  >
                    Going away? Pause stalled alerts
                  </button>
                )}
                {awayError && !awayOpen && (
                  <p role="alert" className={styles.fieldError}>
                    {awayError}
                  </p>
                )}
              </div>
            </section>

            <div className={`${styles.col} ${styles.cLeft}`}>
              <section className={styles.card} aria-label="Issue counts">
                <div className={styles.eyebrow} style={{ marginBottom: 8 }}>
                  {focus ? `Issues in ${focus.id}` : "Issues"}
                </div>
                {!focusTotals && (
                  <p className={styles.emptyToday}>Pick a focus project to see its issue counts.</p>
                )}
                {focusTotals && (
                  <div className={styles.stats}>
                    <div>
                      <div className={`${styles.statN} ${styles.num}`}>{focusTotals.total}</div>
                      <div className={styles.statL}>Total</div>
                      <IssueTrend
                        name="Total issues"
                        values={focus?.issueSeries?.total ?? []}
                        labels={data.weekLabels}
                        now={focusTotals.total}
                      />
                    </div>
                    <div>
                      <div className={`${styles.statN} ${styles.num}`}>{focusTotals.open}</div>
                      <div className={styles.statL}>Still open</div>
                      <IssueTrend
                        name="Issues still open"
                        values={focus?.issueSeries?.open ?? []}
                        labels={data.weekLabels}
                        now={focusTotals.open}
                      />
                    </div>
                  </div>
                )}
              </section>
              <section className={styles.card} aria-label="Repos by status">
                <h2>Repos by status</h2>
                <div className={styles.strip}>
                  {counts
                    .filter((c) => c.count > 0)
                    .map((c) => (
                      <span
                        key={c.status}
                        style={{ flex: c.count, background: STATUS_COLOR[c.status] }}
                        title={`${STATUS_LABEL[c.status]}: ${c.count}`}
                      />
                    ))}
                </div>
                <div className={styles.keys}>
                  {counts.map((c) => (
                    <span key={c.status}>
                      <i style={{ background: STATUS_COLOR[c.status] }} />
                      {STATUS_LABEL[c.status]} {c.count}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <div className={`${styles.col} ${styles.cMid}`} id="ladder">
              <section className={styles.card} aria-label="Milestone ladder">
                <h2>Milestone ladder</h2>
                {!focus && (
                  <p className={styles.emptyToday}>Pick a focus project to see its milestones.</p>
                )}
                {focus && focus.milestones.length === 0 && (
                  <p className={styles.emptyToday}>
                    No milestones or issues yet. Add them on GitHub and they show up here.
                  </p>
                )}
                {focus && focus.milestones.length > 0 && (
                  <div
                    className={styles.ladderScroll}
                    tabIndex={0}
                    role="region"
                    aria-label="Milestone steps"
                  >
                    <div
                      className={styles.ladder}
                      style={{ "--n": focus.milestones.length } as React.CSSProperties}
                    >
                      {focus.milestones.map((m, i) => {
                        const closed = milestoneClosed(focus, i, extra(focus));
                        const done = closed >= m.total;
                        const cls = done ? styles.stepDone : i === focusIndex ? styles.stepNow : "";
                        return (
                          <div key={m.name} className={`${styles.step} ${cls}`}>
                            <div className={styles.dot} />
                            <b>{m.name}</b>
                            <span className={styles.num}>
                              {closed} of {m.total} closed
                              <br />
                              {dueText(m.due, "label")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
              {focus && (
                <DoneChecklist
                  project={focus.id}
                  items={focus.checklist}
                  onAdd={(label) => checklistAdd(focus, label)}
                  onSuggest={() => checklistSuggest(focus)}
                  onToggle={(item, checked) => checklistToggle(focus, item, checked)}
                  onRemove={(item) => checklistRemove(focus, item)}
                />
              )}
              <section className={styles.card} aria-label="Issues closed this week">
                <h2>Issues closed this week</h2>
                <div className={styles.bars}>
                  {data.closedPerDay.map((v, i) => (
                    <div
                      key={DAY_NAMES[i]}
                      className={`${styles.bar} ${i === todayIndex ? styles.barToday : ""} ${v === 0 ? styles.barZero : ""}`}
                    >
                      <span className={styles.num}>{i <= todayIndex ? v : ""}</span>
                      <i style={{ height: `${(v / maxClosed) * 70}%` }} />
                      {DAY_NAMES[i]}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className={`${styles.card} ${styles.cCal}`} id="cal" aria-label="Calendar">
              <div className={styles.calHead}>
                <h2>{month.title}</h2>
              </div>
              <div className={styles.cal}>
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <div key={d} className={styles.dw}>
                    {d}
                  </div>
                ))}
                {month.leading.map((d) => (
                  <div key={`p${d}`} className={`${styles.day} ${styles.dayOut}`}>
                    <span>{d}</span>
                  </div>
                ))}
                {Array.from({ length: month.daysInMonth }, (_, i) => i + 1).map((d) => {
                  const cls = [
                    styles.day,
                    data.closedDays.includes(d) ? styles.dayHit : "",
                    d === month.todayDay ? styles.dayToday : "",
                    data.dueDays.includes(d) ? styles.dayDue : "",
                  ].join(" ");
                  return (
                    <div key={d} className={cls}>
                      <span>{d}</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.calKey}>
                <span>
                  <i style={{ background: "var(--sage)" }} />
                  Task closed
                </span>
                <span>
                  <i style={{ border: "2px solid var(--yellow)" }} />
                  Milestone due
                </span>
              </div>
            </section>
          </div>

          {data.weeklyReview && (
            <section
              className={`${styles.card} ${styles.since} ${styles.review}`}
              aria-label="Last week in review"
            >
              <div className={styles.eyebrow}>
                Last week,{" "}
                <span className={styles.num}>{describeWeeklyReview(data.weeklyReview).range}</span>
              </div>
              <h2 className={styles.num}>{describeWeeklyReview(data.weeklyReview).heading}</h2>
              <ul className={styles.num}>
                {describeWeeklyReview(data.weeklyReview).lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {data.focusLog && (
            <section
              className={`${styles.card} ${styles.since} ${styles.review}`}
              aria-label="Focus log"
            >
              <div className={styles.eyebrow}>Focus log</div>
              <h2>Where your focus has been</h2>
              {data.focusLog.length === 0 ? (
                <p className={styles.emptyToday}>
                  Nothing yet. The log starts when you pick your first focus project.
                </p>
              ) : (
                <ol className={styles.focusLog}>
                  {data.focusLog.map((entry) => {
                    const text = describeFocusEntry(entry);
                    return (
                      <li key={`${entry.project}-${entry.from}`}>
                        <b>{text.title}</b> <span className={styles.num}>{text.when}</span>
                        {text.note && <div className={styles.logNote}>{text.note}</div>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          <div className={styles.sec} id="others">
            <h2>High priority</h2>
            <span className={styles.eyebrow}>The projects that matter most</span>
          </div>
          <div className={styles.others}>
            {priorityOthers.length === 0 && (
              <div className={styles.empty}>
                {query.trim()
                  ? "No high priority repo matches that name."
                  : "No high priority projects yet. Tap the star on a project to add it."}
              </div>
            )}
            {priorityOthers.map(renderCard)}
          </div>

          <div className={styles.sec}>
            <h2>Other projects</h2>
            <span className={styles.eyebrow}>Parked until the focus project ships</span>
          </div>
          <div className={styles.others}>
            {restOthers.length === 0 && (
              <div className={styles.empty}>
                {query.trim()
                  ? "No other repo matches that name."
                  : projects.length === 0
                    ? "No repos yet."
                    : "No other projects. The rest are starred, finished or practice work."}
              </div>
            )}
            {restOthers.map(renderCard)}
          </div>

          {doneOthers.length > 0 && (
            <>
              <div className={styles.sec}>
                <h2>Finished and deployed</h2>
                <span className={styles.eyebrow}>
                  {doneOthers.length} {doneOthers.length === 1 ? "project" : "projects"} shipped
                </span>
              </div>
              <div className={styles.others}>{doneOthers.map(renderCard)}</div>
            </>
          )}

          {sideWork.length > 0 && (
            <>
              <div className={styles.sec}>
                <h2>Practice and school</h2>
                <span className={styles.eyebrow}>Tracked, but never your focus</span>
              </div>
              <div className={styles.others}>{sideWork.map(renderCard)}</div>
            </>
          )}
        </main>
      </div>
      <footer className={styles.note}>
        {data.isExample
          ? "Example data. Switch to real data by setting DATA_SOURCE=github."
          : "Data from GitHub, refreshed each time this page loads."}
        {data.deployCheck && (
          <>
            <br />
            {describeDeployCheck(data.deployCheck)}
          </>
        )}
      </footer>

      {switchTo && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="switch-title"
          >
            {focus ? (
              <>
                <h2 id="switch-title">Switch to {switchTo}?</h2>
                <p>
                  You still have {totals(focus, extra(focus)).open} open issues on {focus.id} (
                  {pct(focus)}% done). Finishing it is the goal. If you switch, {focus.id} is paused
                  and the reason is logged.
                </p>
                {focus.highPriority && !projects.find((p) => p.id === switchTo)?.highPriority && (
                  <p>
                    <b>{focus.id}</b> is high priority and {switchTo} is not.
                  </p>
                )}
                <label htmlFor="switch-reason" className={styles.eyebrow}>
                  Why are you switching?
                </label>
                <textarea
                  id="switch-reason"
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Write at least a few words. This is logged."
                />
                <div className={styles.acts}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={saving || reason.trim().length < MIN_REASON_LENGTH}
                    onClick={confirmSwitch}
                  >
                    Switch anyway
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => {
                      closeModal();
                      say(`Good call. Back to ${focus.id}`);
                    }}
                  >
                    Stay focused
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="switch-title">Make {switchTo} your focus?</h2>
                <p>
                  Everything else is parked until {switchTo} is deployed or finished. You can switch
                  later, but you will be asked why.
                </p>
                <div className={styles.acts}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={closeModal}
                  >
                    Not yet
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    autoFocus
                    disabled={saving}
                    onClick={confirmSwitch}
                  >
                    Make it my focus
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {finishing && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFinish();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
          >
            <h2 id="finish-title">Mark {finishing} as done?</h2>
            <p>
              {projects.find((p) => p.id === finishing)?.status === "focus"
                ? "It stops being your focus, and you can pick the next project. "
                : "It moves to Finished and deployed. "}
              You can reopen it later if you change your mind.
            </p>
            <fieldset className={styles.choices}>
              <legend className={styles.eyebrow}>What kind of done?</legend>
              <label>
                <input
                  type="radio"
                  name="done-kind"
                  checked={doneKind === "finished"}
                  onChange={() => setDoneKind("finished")}
                />
                <span>
                  <b>Finished</b>
                  <small>Nothing to deploy, like a script or a practice project.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="done-kind"
                  checked={doneKind === "deployed"}
                  onChange={() => setDoneKind("deployed")}
                />
                <span>
                  <b>Deployed</b>
                  <small>It is live on the web.</small>
                </span>
              </label>
            </fieldset>
            {doneKind === "deployed" && (
              <>
                <label htmlFor="live-url" className={styles.eyebrow}>
                  Live address
                </label>
                <input
                  id="live-url"
                  className={styles.input}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoFocus
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="my-site.vercel.app"
                />
                {liveUrl.trim() && !normalizeLiveUrl(liveUrl) && (
                  <p className={styles.fieldError} role="alert">
                    That does not look like a web address.
                  </p>
                )}
              </>
            )}
            <label htmlFor="finished-on" className={styles.eyebrow}>
              When did it finish?
            </label>
            <input
              id="finished-on"
              className={styles.input}
              type="date"
              min={EARLIEST_FINISHED_DATE}
              max={data.today}
              value={finishedOn}
              onChange={(e) => setFinishedOn(e.target.value)}
            />
            {checkFinishedDate(finishedOn, data.today) && (
              <p className={styles.fieldError} role="alert">
                {FINISHED_DATE_MESSAGES[checkFinishedDate(finishedOn, data.today)!]}
              </p>
            )}
            <div className={styles.acts}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={closeFinish}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={
                  saving ||
                  (doneKind === "deployed" && !normalizeLiveUrl(liveUrl)) ||
                  !!checkFinishedDate(finishedOn, data.today)
                }
                onClick={confirmFinish}
              >
                Mark as {doneKind}
              </button>
            </div>
          </div>
        </div>
      )}

      {dating && (
        <div
          className={styles.scrim}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDating();
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dating-title"
          >
            <h2 id="dating-title">When did {dating} finish?</h2>
            <p>This only changes the date shown. Your focus log is not touched.</p>
            <label htmlFor="dating-input" className={styles.eyebrow}>
              Finished on
            </label>
            <input
              id="dating-input"
              className={styles.input}
              type="date"
              min={EARLIEST_FINISHED_DATE}
              max={data.today}
              autoFocus
              value={datingValue}
              onChange={(e) => setDatingValue(e.target.value)}
            />
            {checkFinishedDate(datingValue, data.today) && (
              <p className={styles.fieldError} role="alert">
                {FINISHED_DATE_MESSAGES[checkFinishedDate(datingValue, data.today)!]}
              </p>
            )}
            <div className={styles.acts}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={closeDating}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={saving || !!checkFinishedDate(datingValue, data.today)}
                onClick={confirmDating}
              >
                Save date
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </>
  );
}
