import { DashboardClient } from "@/components/dashboard-client";
import { readLatestSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await readLatestSnapshot();

  return <DashboardClient snapshot={snapshot} />;
}
