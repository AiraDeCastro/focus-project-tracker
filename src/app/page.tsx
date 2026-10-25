import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardView } from "@/components/DashboardView";
import { getDataSource } from "@/lib/data";
import { SignInRequiredError } from "@/lib/data/github";
import {
  DatabaseNotMigratedError,
  DatabaseUnavailableError,
  describeDatabaseProblem,
} from "@/lib/db-errors";
import { GithubRateLimitError, rateLimitMessage } from "@/lib/github/errors";
import type { Dashboard } from "@/lib/types";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { Notice, noticeStyles } from "./Notice";
import {
  addChecklistItemAction,
  addSuggestedChecklistAction,
  markDoneAction,
  setFinishedDateAction,
  removeChecklistItemAction,
  reopenAction,
  setAwayAction,
  setFocusAction,
  setChecklistCheckedAction,
  moveHighPriorityAction,
  setHighPriorityAction,
  setKindAction,
  addTaskAction,
  addMilestoneAction,
} from "./actions";

async function DashboardLoader() {
  let data: Dashboard;
  try {
    data = await getDataSource().getDashboard();
  } catch (error) {
    if (error instanceof SignInRequiredError) redirect("/sign-in");
    if (error instanceof DatabaseNotMigratedError || error instanceof DatabaseUnavailableError) {
      const problem = describeDatabaseProblem(error);
      return (
        <Notice
          title={problem.title}
          actions={
            <Link href="/" className={noticeStyles.button}>
              Try again
            </Link>
          }
        >
          {problem.text}
          {problem.command && <code className={noticeStyles.code}>{problem.command}</code>}
        </Notice>
      );
    }
    if (error instanceof GithubRateLimitError) {
      return (
        <Notice
          title="GitHub needs a short break"
          actions={
            <Link href="/" className={noticeStyles.button}>
              Try again
            </Link>
          }
        >
          {rateLimitMessage(error.resetAt)}
        </Notice>
      );
    }
    throw error;
  }
  return (
    <DashboardView
      data={data}
      onSetPriority={data.isExample ? undefined : setHighPriorityAction}
      onMovePriority={data.isExample ? undefined : moveHighPriorityAction}
      onSetFocus={data.isExample ? undefined : setFocusAction}
      onMarkDone={data.isExample ? undefined : markDoneAction}
      onSetFinishedDate={data.isExample ? undefined : setFinishedDateAction}
      onReopen={data.isExample ? undefined : reopenAction}
      onSetKind={data.isExample ? undefined : setKindAction}
      onSetAway={data.isExample ? undefined : setAwayAction}
      onAddTask={data.isExample ? undefined : addTaskAction}
      onAddMilestone={data.isExample ? undefined : addMilestoneAction}
      checklistActions={
        data.isExample
          ? undefined
          : {
              add: addChecklistItemAction,
              suggest: addSuggestedChecklistAction,
              toggle: setChecklistCheckedAction,
              remove: removeChecklistItemAction,
            }
      }
    />
  );
}

// Example data renders statically. GitHub data reads the session, so it streams in behind this.
export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLoader />
    </Suspense>
  );
}
