"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  STEP_COUNT,
  WALKTHROUGH,
  cleanAnswers,
  summarizeWalkthrough,
  type Answers,
  type Mark,
} from "@/lib/walkthrough";
import styles from "./checklist.module.css";

const KEY = "ft_walkthrough";

const EVENT = "ft-walkthrough";
/** What was last saved in this visit, so answers still work when the browser refuses storage. */
let memory: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function snapshot(): string {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function save(next: Answers) {
  memory = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    // Private windows can refuse storage; the page still works for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function Walkthrough() {
  // null on the server and during hydration, so the first paint matches the server's.
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const ready = raw !== null;
  const answers = useMemo<Answers>(() => {
    try {
      return cleanAnswers(JSON.parse(raw || "null"));
    } catch {
      return {};
    }
  }, [raw]);
  const [copied, setCopied] = useState("");

  function update(next: Answers) {
    setCopied("");
    save(next);
  }

  function mark(id: string, value: Mark) {
    const current = answers[id];
    update({ ...answers, [id]: { ...current, mark: current?.mark === value ? undefined : value } });
  }

  async function copy() {
    const text = summarizeWalkthrough(answers);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied. Paste it into the chat.");
    } catch {
      setCopied(text);
    }
  }

  const done = Object.values(answers).filter((a) => a?.mark).length;

  return (
    <>
      <p className={styles.progress} role="status" aria-live="polite">
        {ready ? `${done} of ${STEP_COUNT} tried` : "Loading..."}
      </p>
      {WALKTHROUGH.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2>{section.title}</h2>
          <ol className={styles.steps}>
            {section.steps.map((step) => {
              const a = answers[step.id];
              return (
                <li key={step.id} className={styles.step}>
                  <p>
                    <b>Do:</b> {step.do}
                  </p>
                  <p>
                    <b>Expect:</b> {step.expect}
                  </p>
                  {step.careful && <p className={styles.careful}>{step.careful}</p>}
                  <div className={styles.marks} role="group" aria-label={`Result for: ${step.do}`}>
                    <button
                      type="button"
                      className={`${styles.mark} ${a?.mark === "worked" ? styles.worked : ""}`}
                      aria-pressed={a?.mark === "worked"}
                      onClick={() => mark(step.id, "worked")}
                    >
                      Worked
                    </button>
                    <button
                      type="button"
                      className={`${styles.mark} ${a?.mark === "problem" ? styles.problem : ""}`}
                      aria-pressed={a?.mark === "problem"}
                      onClick={() => mark(step.id, "problem")}
                    >
                      Problem
                    </button>
                  </div>
                  {a?.mark === "problem" && (
                    <input
                      className={styles.note}
                      type="text"
                      maxLength={300}
                      placeholder="What happened?"
                      aria-label={`What went wrong: ${step.do}`}
                      value={a.note ?? ""}
                      onChange={(e) =>
                        update({ ...answers, [step.id]: { ...a, note: e.target.value } })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <div className={styles.actions}>
        <button type="button" className={styles.copy} onClick={copy}>
          Copy my results
        </button>
        <button type="button" className={styles.reset} onClick={() => update({})}>
          Start over
        </button>
      </div>
      {copied && (
        <p className={styles.copied} role="status">
          {copied}
        </p>
      )}
    </>
  );
}
