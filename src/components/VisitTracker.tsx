"use client";

import { useEffect } from "react";
import { advanceVisit, parseVisit, serializeVisit, VISIT_COOKIE } from "@/lib/last-visit";

const TWO_YEARS = 60 * 60 * 24 * 730;

/**
 * Remembers when the dashboard was opened, in a cookie, so the next visit can show what changed.
 * It stores two timestamps and nothing else. It draws nothing.
 */
export function VisitTracker() {
  useEffect(() => {
    try {
      const now = new Date();
      const existing = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${VISIT_COOKIE}=`))
        ?.slice(VISIT_COOKIE.length + 1);
      const next = advanceVisit(parseVisit(existing, now), now);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${VISIT_COOKIE}=${serializeVisit(next)}; Max-Age=${TWO_YEARS}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Cookies can be blocked; the card simply never appears.
    }
  }, []);
  return null;
}
