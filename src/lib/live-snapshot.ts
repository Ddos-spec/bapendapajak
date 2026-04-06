import { unstable_cache } from "next/cache";

import { CATEGORY_CONFIG, SEARCH_REGIONS } from "@/lib/config";
import { requireGoogleMapsApiKey } from "@/lib/env";
import { collectPlaceLeads } from "@/lib/places";
import { analyzePlace } from "@/lib/score";
import type { DailySnapshot, PlaceAnalysis } from "@/lib/types";

export const DAILY_SNAPSHOT_TAG = "daily-snapshot";
const DAILY_REVALIDATE_SECONDS = 60 * 60 * 24;

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

export async function createLiveSnapshot() {
  const apiKey = requireGoogleMapsApiKey();
  const searchTerms = Object.values(CATEGORY_CONFIG).flatMap(
    (category) => category.searchTerms,
  );

  const leads = await collectPlaceLeads(apiKey, SEARCH_REGIONS, searchTerms);
  const places = leads
    .map(analyzePlace)
    .sort((left, right) => right.signalScore - left.signalScore);

  return {
    generatedAt: new Date().toISOString(),
    mode: "live",
    regions: SEARCH_REGIONS.map((region) => region.id),
    summary: summarize(places),
    places,
  } satisfies DailySnapshot;
}

const getCachedSnapshot = unstable_cache(createLiveSnapshot, [DAILY_SNAPSHOT_TAG], {
  revalidate: DAILY_REVALIDATE_SECONDS,
  tags: [DAILY_SNAPSHOT_TAG],
});

export function getCachedLiveSnapshot() {
  return getCachedSnapshot();
}
