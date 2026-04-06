import * as XLSX from "xlsx";

import { readLatestSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function GET() {
  const snapshot = await readLatestSnapshot();
  const rows = snapshot.places.map((place, index) => ({
    rank: index + 1,
    place_id: place.placeId,
    nama: place.name,
    kategori: place.category,
    wilayah: place.regionId,
    prioritas: place.priority,
    signal_score: place.signalScore,
    rating: place.rating ?? "",
    jumlah_ulasan: place.userRatingCount,
    alamat: place.address,
    status_usaha: place.businessStatus ?? "",
    buka_sekarang: place.openNow == null ? "" : place.openNow ? "ya" : "tidak",
    website: place.website ?? "",
    telepon: place.phoneNumber ?? "",
    latitude: place.latitude ?? "",
    longitude: place.longitude ?? "",
    query_sumber: place.sourceQuery,
    rata_rata_transaksi: place.averageTicket,
    pengunjung_weekday: place.estimatedVisitorsWeekday,
    pengunjung_weekend: place.estimatedVisitorsWeekend,
    omzet_bulanan_estimasi: place.estimatedMonthlyRevenue,
    pajak_bulanan_estimasi: place.estimatedMonthlyTax,
    tax_rate: place.assumptions.taxRate,
    weekend_multiplier: place.assumptions.weekendMultiplier,
    review_velocity_factor: place.assumptions.reviewVelocityFactor,
    flags: place.flags.join(" | "),
    jam_operasional: (place.openingHoursText ?? []).join(" | "),
    google_maps: place.googleMapsUri,
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Raw Data");

  const summarySheet = XLSX.utils.json_to_sheet([
    {
      generated_at: snapshot.generatedAt,
      mode: snapshot.mode,
      total_places: snapshot.summary.totalPlaces,
      high_priority: snapshot.summary.highPriority,
      medium_priority: snapshot.summary.mediumPriority,
      monitor_priority: snapshot.summary.monitorPriority,
      estimated_monthly_revenue: snapshot.summary.estimatedMonthlyRevenue,
      estimated_monthly_tax: snapshot.summary.estimatedMonthlyTax,
      top_place_name: snapshot.summary.topPlaceName ?? "",
      regions: snapshot.regions.join(" | "),
    },
  ]);

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });

  const filename = sanitizeFilePart(
    `bapenda-raw-data-${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}`,
  );

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
