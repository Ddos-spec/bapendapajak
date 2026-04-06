import {
  CATEGORY_CONFIG,
  MINIMUM_RATING,
  PRIORITY_THRESHOLDS,
} from "@/lib/config";
import type { PlaceAnalysis, PlaceLead, PriorityLevel, TaxCategory } from "@/lib/types";

function estimateVisitors(category: TaxCategory, reviewCount: number) {
  const config = CATEGORY_CONFIG[category];
  const band =
    config.weekdayReviewBands.find((entry) => reviewCount >= entry.minReviews) ??
    config.weekdayReviewBands[config.weekdayReviewBands.length - 1];

  const weekday = band.visitors;
  const weekend = Math.round(weekday * config.weekendMultiplier);

  return { weekday, weekend };
}

function determinePriority(score: number): PriorityLevel {
  if (score >= PRIORITY_THRESHOLDS.high) {
    return "high";
  }

  if (score >= PRIORITY_THRESHOLDS.medium) {
    return "medium";
  }

  return "monitor";
}

function buildFlags(place: PlaceLead) {
  const flags: string[] = [];

  if ((place.rating ?? 0) >= 4.5) {
    flags.push("rating tinggi");
  } else if ((place.rating ?? 0) >= MINIMUM_RATING) {
    flags.push("rating lolos ambang minimum");
  }

  if (place.userRatingCount >= 150) {
    flags.push("volume review tinggi");
  } else if (place.userRatingCount >= 50) {
    flags.push("volume review menengah");
  }

  if (!place.website) {
    flags.push("website belum terdeteksi");
  }

  if (place.openNow === false) {
    flags.push("perlu cek pola jam operasional");
  }

  if (!place.phoneNumber) {
    flags.push("nomor telepon belum terdeteksi");
  }

  if (place.category === "entertainment") {
    flags.push("kategori hiburan perlu atensi tarif pajak");
  }

  return flags;
}

export function analyzePlace(place: PlaceLead): PlaceAnalysis {
  const config = CATEGORY_CONFIG[place.category];
  const visitors = estimateVisitors(place.category, place.userRatingCount);
  const reviewVelocityFactor = Math.min(
    1.35,
    Math.max(0.75, 0.78 + place.userRatingCount / 500),
  );

  const adjustedWeekdayVisitors = Math.max(
    8,
    Math.round(visitors.weekday * reviewVelocityFactor),
  );
  const adjustedWeekendVisitors = Math.max(
    adjustedWeekdayVisitors,
    Math.round(visitors.weekend * reviewVelocityFactor),
  );

  const monthlyRevenue =
    adjustedWeekdayVisitors * config.averageTicket * 22 +
    adjustedWeekendVisitors * config.averageTicket * 8;
  const monthlyTax = Math.round(monthlyRevenue * config.taxRate);

  const ratingScore = Math.round(((place.rating ?? 0) / 5) * 35);
  const reviewScore = Math.min(35, Math.round(place.userRatingCount / 8));
  const operationalScore = place.openNow === false ? 4 : 8;
  const contactScore = place.website ? 6 : 3;
  const categoryScore = Math.round(config.weight * 10);
  const signalScore = Math.min(
    100,
    ratingScore + reviewScore + operationalScore + contactScore + categoryScore,
  );

  return {
    ...place,
    estimatedVisitorsWeekday: adjustedWeekdayVisitors,
    estimatedVisitorsWeekend: adjustedWeekendVisitors,
    averageTicket: config.averageTicket,
    estimatedMonthlyRevenue: monthlyRevenue,
    estimatedMonthlyTax: monthlyTax,
    signalScore,
    priority: determinePriority(signalScore),
    flags: buildFlags(place),
    assumptions: {
      taxRate: config.taxRate,
      weekendMultiplier: config.weekendMultiplier,
      reviewVelocityFactor,
    },
  };
}
