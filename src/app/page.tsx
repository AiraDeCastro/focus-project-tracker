import Link from "next/link";
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
import { Landing } from "./Landing";
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
  signOutAction,
  setKindAction,
  addTaskAction,
  addMilestoneAction,
  previewOnboardAction,
  onboardAction,
  checkSyncAction,
  refreshTasksMdAction,
  previewRulesPrAction,
  openRulesPrAction,
  previewDuplicatesAction,
  closeDuplicatesAction,
} from "./actions";

async function DashboardLoader() {
  let data: Dashboard;
  try {
    data = await getDataSource().getDashboard();
  } catch (error) {
    // Nobody is signed in (a recruiter following a link, for example): show the front page.
    if (error instanceof SignInRequiredError) return <Landing />;
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
      onSignOut={data.isExample ? undefined : signOutAction}
      onAddTask={data.isExample ? undefined : addTaskAction}
      onAddMilestone={data.isExample ? undefined : addMilestoneAction}
      onPreviewOnboard={data.isExample ? undefined : previewOnboardAction}
      onOnboard={data.isExample ? undefined : onboardAction}
      onCheckSync={data.isExample ? undefined : checkSyncAction}
      onRefreshTasksMd={data.isExample ? undefined : refreshTasksMdAction}
      onPreviewRules={data.isExample ? undefined : previewRulesPrAction}
      onOpenRules={data.isExample ? undefined : openRulesPrAction}
      onFindDuplicates={data.isExample ? undefined : previewDuplicatesAction}
      onCloseDuplicates={data.isExample ? undefined : closeDuplicatesAction}
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
