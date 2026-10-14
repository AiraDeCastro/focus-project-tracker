"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { advanceVisit, parseVisit, serializeVisit, VISIT_COOKIE } from "@/lib/last-visit";
import { isValidTimeZone, TZ_COOKIE } from "@/lib/timezone";

const TWO_YEARS = 60 * 60 * 24 * 730;

/**
 * Remembers when the dashboard was opened, in a cookie, so the next visit can show what changed.
 * It stores two timestamps and nothing else. It draws nothing.
 */
export function VisitTracker() {
  const router = useRouter();
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

      // The owner's timezone, so the server works out "today" and the week on their clock. When
      // it is new or changed (first visit, or travelling), redraw once so this page already uses it.
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (isValidTimeZone(zone)) {
        const known = document.cookie
          .split("; ")
          .find((c) => c.startsWith(`${TZ_COOKIE}=`))
          ?.slice(TZ_COOKIE.length + 1);
        if (known !== encodeURIComponent(zone)) {
          document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; Max-Age=${TWO_YEARS}; Path=/; SameSite=Lax${secure}`;
          router.refresh();
        }
      }
    } catch {
      // Cookies can be blocked; the card simply never appears.
    }
  }, [router]);
  return null;
}
