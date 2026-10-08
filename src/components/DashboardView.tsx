"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/app/actions";
import { monthGrid } from "@/lib/calendar";
import { currentMilestoneIndex, milestoneClosed, percentComplete, totals } from "@/lib/progress";
import { positionOnGraph } from "@/lib/dashboard-utils";
import type { Dashboard, Project, ProjectStatus } from "@/lib/types";
import styles from "./Dashboard.module.css";
import { ProgressGraph, smoothPath } from "./ProgressGraph";
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
const MIN_REASON_LENGTH = 5;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MiniWave({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  const points = values.map((v, i): [number, number] => [
    (i * 100) / (values.length - 1),
    23 - (v / max) * 18,
  ]);
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={smoothPath(points)}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
}

export function DashboardView({ data, onSetPriority }: DashboardViewProps) {
  const [projects, setProjects] = useState<Project[]>(data.projects);
  const [selectedId, setSelectedId] = useState(
    () => data.projects.find((p) => p.status === "focus")?.id ?? data.projects[0]?.id,
  );
  const [checked, setChecked] = useState<Record<string, number[]>>({});
  const [query, setQuery] = useState("");
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const focus = projects.find((p) => p.status === "focus");
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  const extra = (p: Project) => (checked[p.id] ?? []).length;
  const pct = (p: Project) => percentComplete(p, extra(p));

  useEffect(() => {
    if (!switchTo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSwitchTo(null);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [switchTo]);

  function say(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
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

  function confirmSwitch() {
    if (!switchTo || !focus || reason.trim().length < MIN_REASON_LENGTH) return;
    // Fixture mode keeps this in memory. The real focus service will write the focus log.
    setProjects((all) =>
      all.map((p) =>
        p.id === switchTo
          ? { ...p, status: "focus" }
          : p.id === focus.id
            ? { ...p, status: "paused" }
            : p,
      ),
    );
    setSelectedId(switchTo);
    closeModal();
    say(`Focus is now ${switchTo}`);
  }

  async function togglePriority(project: Project) {
    const next = !project.highPriority;
    const set = (value: boolean) =>
      setProjects((all) =>
        all.map((p) => (p.id === project.id ? { ...p, highPriority: value } : p)),
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
      count: projects.filter((p) => p.status === s).length,
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

  const priorityOthers = others.filter((p) => p.highPriority);
  const restOthers = others.filter((p) => !p.highPriority);

  function renderCard(p: Project) {
    const milestone = p.milestones[currentMilestoneIndex(p)];
    return (
      <article key={p.id} className={`${styles.card} ${styles.proj}`}>
        <div className={styles.projRow}>
          <div className={styles.mini}>
            <Ring percent={pct(p)} size={64} strokeWidth={8} />
            <b className={styles.num}>{pct(p)}%</b>
          </div>
          <div>
            <h3>{p.id}</h3>
            <span className={`${styles.pill} ${PILL_CLASS[p.status]}`}>
              {STATUS_LABEL[p.status]}
            </span>
          </div>
          <PriorityStar project={p} onToggle={togglePriority} className={styles.starEnd} />
        </div>
        <div className={styles.sub}>
          {p.status === "deployed" || p.status === "finished" ? (
            p.status === "deployed" ? (
              "Shipped. All milestones closed."
            ) : (
              "Finished."
            )
          ) : milestone ? (
            <>
              Next milestone: <b>{milestone.name}</b>, due {milestone.due}
            </>
          ) : (
            "No milestones or issues yet"
          )}
        </div>
        <div className={styles.foot}>
          <span className={styles.sub}>Active {p.lastActivity}</span>
          {p.status !== "deployed" && p.status !== "finished" && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={(e) => openModal(p.id, e.currentTarget)}
            >
              Switch focus
            </button>
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
          <button
            type="button"
            className={styles.nav}
            disabled
            aria-label="Settings (coming in Milestone 2)"
            title="Settings (coming in Milestone 2)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
            </svg>
          </button>
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
            </div>
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
          </header>

          <div className={styles.grid}>
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
                      <b>{focusMilestone.name}</b> milestone, due {focusMilestone.due}
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
              </section>
            )}

            {selected && (
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
                    {projects.map((p) => (
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
            )}

            <section className={`${styles.card} ${styles.cToday}`} aria-label="Today">
              <div className={styles.eyebrow}>Today</div>
              <h2>{focus ? `Next tasks in ${focus.id}` : "Next tasks"}</h2>
              {focus && focus.todayTasks.length > 0 ? (
                <ul className={styles.todo}>
                  {focus.todayTasks.map((t) => (
                    <li key={t.number}>
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
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyToday}>
                  No open tasks. Mark the project deployed or pick the next one.
                </p>
              )}
              {/* Example copy. Real stalled and overdue results arrive in Milestone 2. */}
              <div className={styles.alert}>
                <b>Stall alert.</b> Close one issue within 7 days or this project is flagged as
                stalled.
              </div>
              <div className={`${styles.alert} ${styles.alertOk}`}>
                <b>On pace.</b> Closing today&apos;s tasks keeps you near the ideal line.
              </div>
            </section>

            <div className={`${styles.col} ${styles.cLeft}`}>
              <section className={styles.card} aria-label="Issue counts">
                <div className={styles.eyebrow} style={{ marginBottom: 8 }}>
                  {focus ? `Issues in ${focus.id}` : "Issues"}
                </div>
                {focusTotals && (
                  <div className={styles.stats}>
                    <div>
                      <div className={`${styles.statN} ${styles.num}`}>{focusTotals.total}</div>
                      <div className={styles.statL}>Total</div>
                      <MiniWave values={[2, 4, 3, 5, 4, 6, 7]} color="var(--sage)" />
                    </div>
                    <div>
                      <div className={`${styles.statN} ${styles.num}`}>{focusTotals.open}</div>
                      <div className={styles.statL}>Still open</div>
                      <MiniWave values={[7, 6, 6, 5, 4, 3, 2]} color="var(--yellow)" />
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
                {focus && focus.milestones.length === 0 && (
                  <p className={styles.emptyToday}>
                    No milestones or issues yet. Add them on GitHub and they show up here.
                  </p>
                )}
                {focus && focus.milestones.length > 0 && (
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
                            Due {m.due}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
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
              <div className={styles.empty}>No other repo matches that name.</div>
            )}
            {restOthers.map(renderCard)}
          </div>
        </main>
      </div>
      <p className={styles.note}>
        {data.isExample
          ? "Example data. Switch to real data by setting DATA_SOURCE=github."
          : "Data from GitHub, refreshed each time this page loads."}
      </p>

      {switchTo && focus && (
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
            <h2 id="switch-title">Switch to {switchTo}?</h2>
            <p>
              You still have {totals(focus, extra(focus)).open} open issues on {focus.id} (
              {pct(focus)}% done). Finishing it is the goal. If you switch, {focus.id} is paused and
              the reason is logged.
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
                disabled={reason.trim().length < MIN_REASON_LENGTH}
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
