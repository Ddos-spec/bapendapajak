import { CATEGORY_CONFIG, SEARCH_REGIONS } from "@/lib/config";
import { getDbPool, upsertAnalyzedPlaces } from "@/lib/db";
import { requireGoogleMapsApiKey } from "@/lib/env";
import { collectPlaceLeads } from "@/lib/places";
import { analyzePlace } from "@/lib/score";
import { writeSnapshot } from "@/lib/storage";
import type { DailySnapshot, PlaceAnalysis } from "@/lib/types";

function summarize(places: PlaceAnalysis[]): DailySnapshot["summary"] {
  return {
    totalPlaces: places.length,
    highPriority: places.filter((place) => place.priority === "high").length,
    mediumPriority: places.filter((place) => place.priority === "medium").length,
    monitorPriority: places.filter((place) => place.priority === "monitor").length,
    estimatedMonthlyRevenue: places.reduce(
      (sum, place) => sum + place.estimatedMonthlyRevenue,
      0,
    ),
    estimatedMonthlyTax: places.reduce(
      (sum, place) => sum + place.estimatedMonthlyTax,
      0,
    ),
    topPlaceName: places[0]?.name ?? null,
  };
}

export async function runDailySync() {
  const apiKey = requireGoogleMapsApiKey();

  const searchTerms = Object.values(CATEGORY_CONFIG).flatMap(
    (category) => category.searchTerms,
  );

  const leads = await collectPlaceLeads(apiKey, SEARCH_REGIONS, searchTerms);
  const places = leads
    .map(analyzePlace)
    .sort((left, right) => right.signalScore - left.signalScore);

  const snapshot: DailySnapshot = {
    generatedAt: new Date().toISOString(),
    mode: "live",
    regions: SEARCH_REGIONS.map((region) => region.id),
    summary: summarize(places),
    places,
  };

  const pool = getDbPool();
  if (pool) {
    await upsertAnalyzedPlaces(pool, places);
  }

  await writeSnapshot(snapshot);
  return snapshot;
}
