/**
 * The signed-in walkthrough: the things Claude can never run because it cannot sign in as the owner,
 * written as steps to follow and what to expect. The page keeps the owner's answers in the browser;
 * `summarizeWalkthrough` turns them into a short report to send back.
 */

export interface WalkStep {
  id: string;
  /** What to do. */
  do: string;
  /** What should happen. */
  expect: string;
  /** Only when it changes something real the owner may not want to leave behind. */
  careful?: string;
}

export interface WalkSection {
  title: string;
  steps: WalkStep[];
}

export const WALKTHROUGH: WalkSection[] = [
  {
    title: "Signing in and out",
    steps: [
      {
        id: "sign-out",
        do: "Click the Sign out icon in the sidebar (below Settings; at the right end of the top bar on a phone).",
        expect: "You land on the sign-in page.",
      },
      {
        id: "sign-in",
        do: "Click Sign in with GitHub and approve if GitHub asks.",
        expect: "You come back to your dashboard with your repos, no error message.",
      },
    ],
  },
  {
    title: "The dashboard on real data",
    steps: [
      {
        id: "repos",
        do: "Pick three repos and compare each card's percentage with GitHub (closed issues divided by all issues).",
        expect: "They match. A repo with no milestones counts all its issues.",
      },
      {
        id: "focus-card",
        do: "Look at the focus card, the milestone progress card and the Today list.",
        expect: "They are about the same project, and the Today tasks link to real open issues.",
      },
    ],
  },
  {
    title: "Stars, focus and types",
    steps: [
      {
        id: "star",
        do: "Star a project, move it up and down, then unstar it.",
        expect: "It appears under High priority, the order changes, and it all survives a reload.",
      },
      {
        id: "switch-focus",
        do: "Make focus on a backlog project. Type a reason shorter than 5 characters first, then a real one.",
        expect:
          "The short reason is refused. The real one switches focus, the old project becomes paused, and the Focus log card shows your reason.",
        careful: "This changes your real focus. Switch back afterwards with the reason “testing”.",
      },
      {
        id: "kind",
        do: "Change a project's type to Practice, then back to Project.",
        expect:
          "It moves to Practice and school, loses its star and focus buttons, and comes back.",
      },
    ],
  },
  {
    title: "Finishing a project",
    steps: [
      {
        id: "finish",
        do: "On a spare project, choose Mark project finished, pick Finished, set a date that is not in the future, and confirm.",
        expect: "It moves to Finished and deployed with that date. A future date is refused.",
        careful: "Use a project you do not mind changing. Reopen it afterwards.",
      },
      {
        id: "reopen",
        do: "Click Change date, then Reopen.",
        expect: "The date changes. Reopen puts it back in the backlog.",
      },
      {
        id: "deployed",
        do: "Mark another spare project as Deployed with an address that is not http or https, then with a real one.",
        expect: "The wrong address is refused. The real one is saved and shows Visit site.",
        careful: "Reopen it afterwards.",
      },
    ],
  },
  {
    title: "Away mode, settings and the checklist",
    steps: [
      {
        id: "away",
        do: "Click Going away? and set a return date, then clear it.",
        expect: "The stalled alert pauses until that date, and comes back when you clear it.",
      },
      {
        id: "settings",
        do: "Open Settings, change the stalled days, save, reload, then put it back.",
        expect: "It says saved, the new value is there after the reload, and the old one returns.",
      },
      {
        id: "done-checklist",
        do: "In the definition of done card, add an item, tick it, then remove it.",
        expect: "Each change stays after a reload. It never blocks Mark project finished.",
      },
    ],
  },
  {
    title: "GitHub Projects",
    steps: [
      {
        id: "add-task",
        do: "Add a task: type a title, read the preview, then confirm.",
        expect: "An issue appears on GitHub in the Project, and the issue count goes up by one.",
        careful: "It creates a real issue. Close it on GitHub afterwards.",
      },
      {
        id: "add-milestone",
        do: "Add a milestone with a title and no date, then read the preview and confirm.",
        expect: "The milestone exists on GitHub.",
        careful: "It creates a real milestone. Close it on GitHub afterwards.",
      },
      {
        id: "check-sync",
        do: "Open Check sync and expand Show the ignored edits.",
        expect:
          "The message makes sense, the ignored edits are listed by name, and the card shows a pill with the answer.",
      },
      {
        id: "rules-pr",
        do: "On a spare repo that is connected to a Project, click Add the rules to this repo, read the text, and open the pull request.",
        expect:
          "One pull request on GitHub that changes only CLAUDE.md. Nothing is merged for you.",
        careful: "Close the pull request if you do not want the rules.",
      },
      {
        id: "duplicates",
        do: "Click Look for duplicate issues.",
        expect:
          "Each listed issue really does repeat the one named beside it. Close only those you are sure about.",
        careful: "Closing marks them not planned. You can reopen any of them on GitHub.",
      },
    ],
  },
  {
    title: "The daily jobs",
    steps: [
      {
        id: "cron",
        do: "In Vercel, open the project, then Settings, then Cron Jobs, and press Run on the snapshot and the daily email.",
        expect:
          "Both finish with a success. The email arrives with the right greeting and today's tasks.",
      },
    ],
  },
];

export type Mark = "worked" | "problem";

export interface Answers {
  [stepId: string]: { mark?: Mark; note?: string } | undefined;
}

const ALL_STEPS = WALKTHROUGH.flatMap((s) =>
  s.steps.map((step) => ({ ...step, section: s.title })),
);

/** How many steps there are, in total. */
export const STEP_COUNT = ALL_STEPS.length;

/** Keeps only answers for steps that exist, with a valid mark and a short note. */
export function cleanAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const step of ALL_STEPS) {
    const value = (raw as Record<string, unknown>)[step.id];
    if (typeof value !== "object" || value === null) continue;
    const { mark, note } = value as { mark?: unknown; note?: unknown };
    const cleaned: { mark?: Mark; note?: string } = {};
    if (mark === "worked" || mark === "problem") cleaned.mark = mark;
    if (typeof note === "string" && note.trim()) cleaned.note = note.trim().slice(0, 300);
    if (cleaned.mark || cleaned.note) out[step.id] = cleaned;
  }
  return out;
}

/** A short report to paste back: what worked, what did not (with notes), and what is not tried yet. */
export function summarizeWalkthrough(answers: Answers): string {
  const worked: string[] = [];
  const problems: string[] = [];
  const todo: string[] = [];
  for (const step of ALL_STEPS) {
    const a = answers[step.id];
    if (a?.mark === "worked") worked.push(step.id);
    else if (a?.mark === "problem") problems.push(`${step.id}${a.note ? `: ${a.note}` : ""}`);
    else todo.push(step.id);
  }
  return [
    `Signed-in check: ${worked.length} worked, ${problems.length} problems, ${todo.length} not tried (of ${STEP_COUNT}).`,
    ...(problems.length ? ["", "Problems:", ...problems.map((p) => `- ${p}`)] : []),
    ...(todo.length ? ["", `Not tried: ${todo.join(", ")}`] : []),
  ].join("\n");
}
