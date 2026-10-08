import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardView } from "@/components/DashboardView";
import { getDataSource } from "@/lib/data";
import { SignInRequiredError } from "@/lib/data/github";
import type { Dashboard } from "@/lib/types";

async function DashboardLoader() {
  let data: Dashboard;
  try {
    data = await getDataSource().getDashboard();
  } catch (error) {
    if (error instanceof SignInRequiredError) redirect("/sign-in");
    throw error;
  }
  return <DashboardView data={data} />;
}

// Example data renders statically. GitHub data reads the session, so it streams in behind this.
export default function Home() {
  return (
    <Suspense fallback={<p aria-busy="true">Loading your repos...</p>}>
      <DashboardLoader />
    </Suspense>
  );
}
