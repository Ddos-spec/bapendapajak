import { Pool } from "pg";

import { env, shouldUseDatabaseSsl } from "@/lib/env";
import type { PlaceAnalysis } from "@/lib/types";

declare global {
  // eslint-disable-next-line no-var
  var __pajakDbPool: Pool | undefined;
}

export function getDbPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!global.__pajakDbPool) {
    global.__pajakDbPool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 3,
      ssl: shouldUseDatabaseSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }

  return global.__pajakDbPool;
}

export async function ensureDashboardSchema(pool: Pool) {
  await pool.query(`
    create table if not exists dashboard_snapshots (
      id bigserial primary key,
      generated_at timestamptz not null,
      mode text not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )
  `);
}

export async function upsertAnalyzedPlaces(pool: Pool, places: PlaceAnalysis[]) {
  for (const place of places) {
    await pool.query(
      `
        insert into leads_database (
          place_id,
          name,
          phone,
          address,
          rating,
          website,
          business_status,
          search_query,
          location,
          scraped_at,
          has_phone,
          updated_at,
          business_hours,
          services_offered,
          lead_score,
          market_segment
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          current_timestamp,
          $10,
          current_timestamp,
          $11::jsonb,
          $12,
          $13,
          $14
        )
        on conflict (place_id) do update set
          name = excluded.name,
          phone = excluded.phone,
          address = excluded.address,
          rating = excluded.rating,
          website = excluded.website,
          business_status = excluded.business_status,
          search_query = excluded.search_query,
          location = excluded.location,
          scraped_at = current_timestamp,
          has_phone = excluded.has_phone,
          updated_at = current_timestamp,
          business_hours = excluded.business_hours,
          services_offered = excluded.services_offered,
          lead_score = excluded.lead_score,
          market_segment = excluded.market_segment
      `,
      [
        place.placeId,
        place.name,
        place.phoneNumber,
        place.address,
        place.rating,
        place.website,
        place.businessStatus,
        place.sourceQuery,
        place.regionId,
        Boolean(place.phoneNumber),
        JSON.stringify({
          openNow: place.openNow,
          estimatedVisitorsWeekday: place.estimatedVisitorsWeekday,
          estimatedVisitorsWeekend: place.estimatedVisitorsWeekend,
        }),
        place.types.join(", "),
        place.signalScore,
        place.category,
      ],
    );
  }
}
