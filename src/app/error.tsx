"use client";

import Link from "next/link";
import { Notice, noticeStyles } from "./Notice";

/**
 * What the owner sees when the dashboard fails for a reason the app did not expect, instead of
 * Next.js's blank default. Signing in again fixes the most common cause, a login GitHub no longer
 * accepts, so that is offered next to the retry.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Notice
      title="The dashboard could not load"
      actions={
        <>
          <button type="button" className={noticeStyles.button} onClick={reset}>
            Try again
          </button>
          <Link href="/sign-in" className={noticeStyles.link}>
            Sign in again
          </Link>
        </>
      }
    >
      Reloading often fixes it. If it keeps happening, sign in again.
    </Notice>
  );
}
