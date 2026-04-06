import { GOOGLE_TEXT_SEARCH_FIELD_MASK, MINIMUM_RATING } from "@/lib/config";
import type { PlaceLead, PlacesSearchCandidate, RegionConfig, TaxCategory } from "@/lib/types";

const GOOGLE_PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

function normalizeCategory(types: string[], query: string): TaxCategory | null {
  const lowerTypes = types.map((entry) => entry.toLowerCase());
  const lowerQuery = query.toLowerCase();

  if (
    lowerTypes.some((entry) =>
      ["restaurant", "cafe", "food", "meal_takeaway"].includes(entry),
    ) ||
    lowerQuery.includes("restaurant") ||
    lowerQuery.includes("cafe") ||
    lowerQuery.includes("rumah makan")
  ) {
    return "restaurant";
  }

  if (
    lowerTypes.some((entry) => ["hotel", "lodging"].includes(entry)) ||
    lowerQuery.includes("hotel") ||
    lowerQuery.includes("penginapan")
  ) {
    return "hotel";
  }

  if (
    lowerTypes.some((entry) =>
      ["spa", "massage", "karaoke", "night_club"].includes(entry),
    ) ||
    lowerQuery.includes("karaoke") ||
    lowerQuery.includes("massage") ||
    lowerQuery.includes("spa")
  ) {
    return "entertainment";
  }

  return null;
}

function normalizeCandidate(
  candidate: PlacesSearchCandidate,
  region: RegionConfig,
  query: string,
): PlaceLead | null {
  const rating = candidate.rating ?? null;
  const userRatingCount = candidate.userRatingCount ?? 0;
  const types = candidate.types ?? [];
  const category = normalizeCategory(types, query);

  if (!candidate.id || !candidate.displayName?.text || !category) {
    return null;
  }

  if ((rating ?? 0) < MINIMUM_RATING) {
    return null;
  }

  return {
    placeId: candidate.id,
    name: candidate.displayName.text,
    category,
    regionId: region.id,
    sourceQuery: query,
    address: candidate.formattedAddress ?? `${region.name}, ${region.cityLabel}`,
    googleMapsUri: candidate.googleMapsUri ?? "",
    types,
    rating,
    userRatingCount,
    businessStatus: candidate.businessStatus ?? null,
    openNow: candidate.currentOpeningHours?.openNow ?? null,
    website: candidate.websiteUri ?? null,
    phoneNumber: candidate.nationalPhoneNumber ?? null,
  };
}

async function searchText(
  apiKey: string,
  region: RegionConfig,
  query: string,
) {
  const response = await fetch(GOOGLE_PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${query} di ${region.name}, ${region.cityLabel}`,
      languageCode: "id",
      regionCode: "ID",
      pageSize: 15,
      locationBias: {
        circle: {
          center: {
            latitude: region.latitude,
            longitude: region.longitude,
          },
          radius: region.radiusMeters,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Places request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { places?: PlacesSearchCandidate[] };
  return payload.places ?? [];
}

export async function collectPlaceLeads(
  apiKey: string,
  regions: RegionConfig[],
  searchTerms: string[],
) {
  const deduped = new Map<string, PlaceLead>();

  for (const region of regions) {
    for (const query of searchTerms) {
      const candidates = await searchText(apiKey, region, query);

      for (const candidate of candidates) {
        const normalized = normalizeCandidate(candidate, region, query);

        if (!normalized) {
          continue;
        }

        const previous = deduped.get(normalized.placeId);
        if (!previous || normalized.userRatingCount > previous.userRatingCount) {
          deduped.set(normalized.placeId, normalized);
        }
      }
    }
  }

  return Array.from(deduped.values());
}
