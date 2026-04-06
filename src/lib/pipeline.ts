import { getDbPool, upsertAnalyzedPlaces } from "@/lib/db";
import { env } from "@/lib/env";
import { createLiveSnapshot, getCachedLiveSnapshot } from "@/lib/live-snapshot";
import { writeSnapshot } from "@/lib/storage";

export function usesRuntimeCacheOnly() {
  return Boolean(env.VERCEL === "1" && !getDbPool() && !env.BLOB_READ_WRITE_TOKEN);
}

function shouldPersistSnapshot() {
  return !usesRuntimeCacheOnly();
}

export async function runDailySync() {
  if (usesRuntimeCacheOnly()) {
    return getCachedLiveSnapshot();
  }

  const snapshot = await createLiveSnapshot();
  const places = snapshot.places;

  const pool = getDbPool();
  if (pool) {
    await upsertAnalyzedPlaces(pool, places);
  }

  if (shouldPersistSnapshot()) {
    await writeSnapshot(snapshot);
  }

  return snapshot;
}
