import type { CategoryConfig, RegionConfig, TaxCategory } from "@/lib/types";

export const SEARCH_REGIONS: RegionConfig[] = [
  {
    id: "ciputat",
    name: "Ciputat",
    cityLabel: "Tangerang Selatan",
    latitude: -6.3116,
    longitude: 106.7649,
    radiusMeters: 5000,
  },
  {
    id: "ciputat-timur",
    name: "Ciputat Timur",
    cityLabel: "Tangerang Selatan",
    latitude: -6.2941,
    longitude: 106.7717,
    radiusMeters: 4500,
  },
  {
    id: "pamulang",
    name: "Pamulang",
    cityLabel: "Tangerang Selatan",
    latitude: -6.3428,
    longitude: 106.7384,
    radiusMeters: 5500,
  },
  {
    id: "pondok-aren",
    name: "Pondok Aren",
    cityLabel: "Tangerang Selatan",
    latitude: -6.2656,
    longitude: 106.6986,
    radiusMeters: 5000,
  },
  {
    id: "serpong",
    name: "Serpong",
    cityLabel: "Tangerang Selatan",
    latitude: -6.3088,
    longitude: 106.6657,
    radiusMeters: 6500,
  },
  {
    id: "serpong-utara",
    name: "Serpong Utara",
    cityLabel: "Tangerang Selatan",
    latitude: -6.2417,
    longitude: 106.6675,
    radiusMeters: 5000,
  },
  {
    id: "setu",
    name: "Setu",
    cityLabel: "Tangerang Selatan",
    latitude: -6.3412,
    longitude: 106.6836,
    radiusMeters: 5000,
  },
];

export const CATEGORY_CONFIG: Record<TaxCategory, CategoryConfig> = {
  restaurant: {
    id: "restaurant",
    label: "Restoran",
    searchTerms: ["restaurant", "cafe", "rumah makan"],
    averageTicket: 62500,
    taxRate: 0.1,
    weekdayReviewBands: [
      { minReviews: 300, visitors: 140 },
      { minReviews: 180, visitors: 96 },
      { minReviews: 100, visitors: 60 },
      { minReviews: 50, visitors: 40 },
      { minReviews: 20, visitors: 24 },
      { minReviews: 0, visitors: 12 },
    ],
    weekendMultiplier: 1.45,
    weight: 1,
  },
  hotel: {
    id: "hotel",
    label: "Penginapan",
    searchTerms: ["hotel", "penginapan", "guest house", "kost harian"],
    averageTicket: 450000,
    taxRate: 0.1,
    weekdayReviewBands: [
      { minReviews: 400, visitors: 36 },
      { minReviews: 200, visitors: 24 },
      { minReviews: 80, visitors: 16 },
      { minReviews: 30, visitors: 10 },
      { minReviews: 0, visitors: 6 },
    ],
    weekendMultiplier: 1.3,
    weight: 1.15,
  },
  entertainment: {
    id: "entertainment",
    label: "Hiburan",
    searchTerms: ["karaoke", "massage", "spa", "reflexology", "billiard"],
    averageTicket: 165000,
    taxRate: 0.15,
    weekdayReviewBands: [
      { minReviews: 250, visitors: 72 },
      { minReviews: 120, visitors: 48 },
      { minReviews: 60, visitors: 30 },
      { minReviews: 20, visitors: 18 },
      { minReviews: 0, visitors: 10 },
    ],
    weekendMultiplier: 1.55,
    weight: 1.05,
  },
};

export const PRIORITY_THRESHOLDS = {
  high: 80,
  medium: 62,
};

export const MINIMUM_RATING = 3;

export const GOOGLE_TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.currentOpeningHours",
].join(",");
