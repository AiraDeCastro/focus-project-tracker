import { greetingForHour } from "../greeting";
import { percentComplete } from "../progress";
import type { Dashboard, DashboardAlert, Project } from "../types";
import { localHour, resolveTimeZone } from "../timezone";

/** Palette values, written out because email clients ignore CSS variables. */
const COLOR = { text: "#2E3B31", muted: "#5F7A61", card: "#F7FAF4", warn: "#D98B73" };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A link only when it is https, so odd data can never become a script or other scheme. */
function safeUrl(url: string | undefined): string | null {
  return url && url.startsWith("https://") ? url : null;
}

export type SkipReason = "disabled" | "away" | "no_focus";

/**
 * Whether the daily reminder should go out. It is a nudge, never a requirement, so it stays quiet
 * when the owner turned it off, is Away, or has no focus project to talk about.
 */
export function reminderSkipReason(
  dashboard: Pick<Dashboard, "awayUntil" | "projects">,
  channel: "email" | "none",
): SkipReason | null {
  if (channel === "none") return "disabled";
  if (dashboard.awayUntil) return "away";
  if (!dashboard.projects.some((p) => p.status === "focus")) return "no_focus";
  return null;
}

export interface DailyEmail {
  subject: string;
  text: string;
  html: string;
}

function alertLines(alerts: DashboardAlert[]): DashboardAlert[] {
  return alerts.filter((a) => a.kind !== "info");
}

/**
 * The reminder email: the focus project's next tasks (each linking to its issue), any warnings, and
 * a link to the dashboard. Returns null when there is no focus project. The tone is a nudge: it
 * says outright that skipping a day is fine.
 */
export function buildDailyEmail(
  dashboard: Dashboard,
  dashboardUrl: string,
  /** When it is sent and the owner's timezone, so the greeting matches the hour. */
  when: { now?: Date; timeZone?: string } = {},
  /** Calm extra lines, such as a sync nudge, shown under "Also". */
  notes: string[] = [],
): DailyEmail | null {
  const focus: Project | undefined = dashboard.projects.find((p) => p.status === "focus");
  if (!focus) return null;

  const percent = percentComplete(focus);
  const hello = greetingForHour(localHour(when.now ?? new Date(), resolveTimeZone(when.timeZone)));
  const greeting =
    dashboard.ownerName && dashboard.ownerName !== "there"
      ? `${hello}, ${dashboard.ownerName}.`
      : `${hello}.`;
  const tasks = focus.todayTasks;
  const warnings = alertLines(dashboard.alerts);
  const link = safeUrl(dashboardUrl) ?? "";
  const footer =
    "This is a nudge, not a to-do. Skipping a day is fine. Turn this email off in Settings, or pause alerts with Away mode.";

  const text = [
    greeting,
    "",
    `Today in ${focus.id} (${percent}% done):`,
    ...(tasks.length
      ? tasks.flatMap((t, i) => {
          const url = safeUrl(t.url);
          return [`${i + 1}. #${t.number} ${t.title}`, ...(url ? [`   ${url}`] : [])];
        })
      : ["No open tasks right now. Add the next issue on GitHub, or mark the project finished."]),
    ...(warnings.length
      ? ["", "Worth a look:", ...warnings.map((a) => `- ${a.title} ${a.text}`)]
      : []),
    ...(notes.length ? ["", "Also:", ...notes.map((n) => `- ${n}`)] : []),
    ...(link ? ["", `Open your dashboard: ${link}`] : []),
    "",
    footer,
  ].join("\n");

  const taskItems = tasks
    .map((t) => {
      const url = safeUrl(t.url);
      const label = `#${t.number} ${escapeHtml(t.title)}`;
      return `<li style="margin:6px 0">${url ? `<a href="${escapeHtml(url)}" style="color:${COLOR.muted}">${label}</a>` : label}</li>`;
    })
    .join("");
  const warningItems = warnings
    .map(
      (a) =>
        `<li style="margin:6px 0"><b style="color:${COLOR.warn}">${escapeHtml(a.title)}</b> ${escapeHtml(a.text)}</li>`,
    )
    .join("");

  const noteItems = notes.map((n) => `<li style="margin:6px 0">${escapeHtml(n)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:${COLOR.card};color:${COLOR.text};font-family:Nunito,Arial,sans-serif;line-height:1.5"><div style="max-width:520px;margin:0 auto"><p style="font-size:18px;margin:0 0 12px">${escapeHtml(greeting)}</p><p style="margin:0 0 8px">Today in <b>${escapeHtml(focus.id)}</b> (${percent}% done):</p>${
    tasks.length
      ? `<ol style="padding-left:20px;margin:0 0 16px">${taskItems}</ol>`
      : `<p style="margin:0 0 16px">No open tasks right now. Add the next issue on GitHub, or mark the project finished.</p>`
  }${warnings.length ? `<p style="margin:0 0 4px"><b>Worth a look:</b></p><ul style="padding-left:20px;margin:0 0 16px">${warningItems}</ul>` : ""}${notes.length ? `<p style="margin:0 0 4px"><b>Also:</b></p><ul style="padding-left:20px;margin:0 0 16px">${noteItems}</ul>` : ""}${
    link
      ? `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="color:${COLOR.muted}">Open your dashboard</a></p>`
      : ""
  }<p style="font-size:13px;color:${COLOR.muted};margin:0">${escapeHtml(footer)}</p></div></body></html>`;

  return { subject: `Today in ${focus.id}`, text, html };
}
