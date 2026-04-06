import { DashboardClient } from "@/components/dashboard-client";
import { readLatestSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatGeneratedAtLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default async function HomePage() {
  const snapshot = await readLatestSnapshot();

  return (
    <DashboardClient
      snapshot={snapshot}
      generatedAtLabel={formatGeneratedAtLabel(snapshot.generatedAt)}
    />
  );
}
