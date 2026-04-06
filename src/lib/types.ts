export type TaxCategory = "restaurant" | "hotel" | "entertainment";

export type PriorityLevel = "high" | "medium" | "monitor";

export interface RegionConfig {
  id: string;
  name: string;
  cityLabel: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface CategoryConfig {
  id: TaxCategory;
  label: string;
  searchTerms: string[];
  averageTicket: number;
  taxRate: number;
  weekdayReviewBands: Array<{ minReviews: number; visitors: number }>;
  weekendMultiplier: number;
  weight: number;
}

export interface PlacesSearchCandidate {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
}

export interface PlaceLead {
  placeId: string;
  name: string;
  category: TaxCategory;
  regionId: string;
  sourceQuery: string;
  address: string;
  googleMapsUri: string;
  types: string[];
  rating: number | null;
  userRatingCount: number;
  businessStatus: string | null;
  openNow: boolean | null;
  website: string | null;
  phoneNumber: string | null;
}

export interface PlaceAnalysis extends PlaceLead {
  estimatedVisitorsWeekday: number;
  estimatedVisitorsWeekend: number;
  averageTicket: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlyTax: number;
  signalScore: number;
  priority: PriorityLevel;
  flags: string[];
  assumptions: {
    taxRate: number;
    weekendMultiplier: number;
    reviewVelocityFactor: number;
  };
}

export interface DailySnapshotSummary {
  totalPlaces: number;
  highPriority: number;
  mediumPriority: number;
  monitorPriority: number;
  estimatedMonthlyRevenue: number;
  estimatedMonthlyTax: number;
  topPlaceName: string | null;
}

export interface DailySnapshot {
  generatedAt: string;
  mode: "seed" | "live";
  regions: string[];
  summary: DailySnapshotSummary;
  places: PlaceAnalysis[];
}
