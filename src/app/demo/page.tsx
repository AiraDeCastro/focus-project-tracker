import type { Metadata } from "next";
import { DashboardView } from "@/components/DashboardView";
import { fixtureDashboard } from "@/lib/data/fixtures";

export const metadata: Metadata = {
  title: "Focus Trail demo",
  description: "Try Focus Trail with example data. No sign-in needed and nothing is saved.",
};

/**
 * A public tour of the dashboard. It always shows the example data, whatever `DATA_SOURCE` says,
 * and passes no actions, so it never reads GitHub, the session or the database.
 */
export default function DemoPage() {
  return <DashboardView data={fixtureDashboard} />;
}
