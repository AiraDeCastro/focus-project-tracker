import { DashboardView } from "@/components/DashboardView";
import { getDataSource } from "@/lib/data";

export default async function Home() {
  const data = await getDataSource().getDashboard();
  return <DashboardView data={data} />;
}
