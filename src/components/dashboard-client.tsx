"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { PlaceMap } from "@/components/place-map";
import { SEARCH_REGIONS } from "@/lib/config";
import type { DailySnapshot, PlaceAnalysis, PriorityLevel, TaxCategory } from "@/lib/types";

type CategoryFilter = "all" | TaxCategory;
type PriorityFilter = "all" | PriorityLevel;

const CATEGORY_META: Array<{ id: TaxCategory; label: string; description: string }> = [
  {
    id: "restaurant",
    label: "Restoran",
    description: "Cafe, rumah makan, resto, dan tempat makan lain.",
  },
  {
    id: "hotel",
    label: "Penginapan",
    description: "Hotel, guest house, dan penginapan harian.",
  },
  {
    id: "entertainment",
    label: "Hiburan",
    description: "Karaoke, spa, massage, reflexology, dan billiard.",
  },
];

const PRIORITY_META: Array<{ id: PriorityLevel; label: string; description: string }> = [
  {
    id: "high",
    label: "Tinggi",
    description: "Layak diperiksa lebih dulu.",
  },
  {
    id: "medium",
    label: "Sedang",
    description: "Perlu dipantau aktif.",
  },
  {
    id: "monitor",
    label: "Pantau",
    description: "Masih dipantau rutin.",
  },
];

const REGION_LABELS = new Map(
  SEARCH_REGIONS.map((region) => [region.id, region.name] as const),
);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  }

  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1)} Jt`;
  }

  return formatCurrency(value);
}

function categoryLabel(category: TaxCategory) {
  return CATEGORY_META.find((entry) => entry.id === category)?.label ?? category;
}

function priorityLabel(priority: PriorityLevel) {
  return PRIORITY_META.find((entry) => entry.id === priority)?.label ?? priority;
}

function regionLabel(regionId: string) {
  return REGION_LABELS.get(regionId) ?? regionId;
}

function businessStatusLabel(status: string | null) {
  switch (status) {
    case "OPERATIONAL":
      return "Operasional";
    case "CLOSED_TEMPORARILY":
      return "Tutup sementara";
    case "CLOSED_PERMANENTLY":
      return "Tutup permanen";
    default:
      return "Status belum pasti";
  }
}

function openNowLabel(openNow: boolean | null) {
  if (openNow === true) {
    return "Sedang buka";
  }

  if (openNow === false) {
    return "Sedang tutup";
  }

  return "Jam belum pasti";
}

function matchesSearch(place: PlaceAnalysis, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    place.name,
    place.address,
    place.sourceQuery,
    place.category,
    place.regionId,
    ...place.flags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function makeCountMap<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function buildObjectNarrative(place: PlaceAnalysis) {
  const drivers: string[] = [];

  if ((place.rating ?? 0) >= 4.6) {
    drivers.push("rating publik sangat kuat");
  } else if ((place.rating ?? 0) >= 4) {
    drivers.push("rating publik cukup stabil");
  } else {
    drivers.push("rating baru lolos ambang minimum");
  }

  if (place.userRatingCount >= 180) {
    drivers.push("jumlah ulasan tinggi yang mengindikasikan arus pengunjung aktif");
  } else if (place.userRatingCount >= 60) {
    drivers.push("ulasan publik berada di level menengah");
  } else {
    drivers.push("ulasan masih sedikit sehingga validasi lapangan makin penting");
  }

  if (place.category === "hotel") {
    drivers.push("objek masuk kategori penginapan dengan asumsi okupansi harian");
  } else if (place.category === "entertainment") {
    drivers.push("objek masuk kategori hiburan dengan tarif pajak lebih tinggi");
  } else {
    drivers.push("objek masuk kategori restoran dengan pola transaksi harian berulang");
  }

  const closingLine =
    place.priority === "high"
      ? "Objek ini layak naik ke daftar pemeriksaan awal."
      : place.priority === "medium"
        ? "Objek ini cocok masuk antrean pengamatan aktif sebelum dicek lapangan."
        : "Objek ini masih aman dipantau sambil menunggu sinyal tambahan.";

  return `${place.name} masuk prioritas ${priorityLabel(place.priority).toLowerCase()} karena ${drivers.join(", ")}. ${closingLine}`;
}

function comparePlaces(left: PlaceAnalysis, right: PlaceAnalysis) {
  return (
    right.signalScore - left.signalScore ||
    right.estimatedMonthlyRevenue - left.estimatedMonthlyRevenue ||
    right.userRatingCount - left.userRatingCount
  );
}

interface DashboardClientProps {
  snapshot: DailySnapshot;
}

export function DashboardClient({ snapshot }: DashboardClientProps) {
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    snapshot.places[0]?.placeId ?? null,
  );

  const deferredSearch = useDeferredValue(searchText.trim().toLowerCase());

  const searchablePlaces = useMemo(
    () => snapshot.places.filter((place) => matchesSearch(place, deferredSearch)),
    [deferredSearch, snapshot.places],
  );

  const categoryCounts = useMemo(
    () => makeCountMap(searchablePlaces.map((place) => place.category)),
    [searchablePlaces],
  );

  const priorityCounts = useMemo(
    () => makeCountMap(searchablePlaces.map((place) => place.priority)),
    [searchablePlaces],
  );

  const filteredPlaces = useMemo(
    () =>
      [...searchablePlaces]
        .filter((place) => categoryFilter === "all" || place.category === categoryFilter)
        .filter((place) => priorityFilter === "all" || place.priority === priorityFilter)
        .sort(comparePlaces),
    [categoryFilter, priorityFilter, searchablePlaces],
  );

  useEffect(() => {
    if (!filteredPlaces.length) {
      setSelectedPlaceId(null);
      return;
    }

    if (!selectedPlaceId || !filteredPlaces.some((place) => place.placeId === selectedPlaceId)) {
      setSelectedPlaceId(filteredPlaces[0].placeId);
    }
  }, [filteredPlaces, selectedPlaceId]);

  const selectedPlace = useMemo(
    () =>
      filteredPlaces.find((place) => place.placeId === selectedPlaceId) ??
      filteredPlaces[0] ??
      null,
    [filteredPlaces, selectedPlaceId],
  );

  const filteredSummary = useMemo(
    () => ({
      totalPlaces: filteredPlaces.length,
      highPriority: filteredPlaces.filter((place) => place.priority === "high").length,
      mediumPriority: filteredPlaces.filter((place) => place.priority === "medium").length,
      monitorPriority: filteredPlaces.filter((place) => place.priority === "monitor").length,
      estimatedMonthlyRevenue: filteredPlaces.reduce(
        (sum, place) => sum + place.estimatedMonthlyRevenue,
        0,
      ),
      estimatedMonthlyTax: filteredPlaces.reduce(
        (sum, place) => sum + place.estimatedMonthlyTax,
        0,
      ),
    }),
    [filteredPlaces],
  );

  const mapPlaces = useMemo(
    () =>
      filteredPlaces.filter(
        (place) =>
          typeof place.latitude === "number" && typeof place.longitude === "number",
      ),
    [filteredPlaces],
  );

  return (
    <main className="dashboard-shell">
      <section className="hero-panel compact-hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Tax Object Intelligence</p>
          <h1>Pilih tempat di kiri, baca detailnya di kanan, lalu lihat lokasinya langsung di map.</h1>
          <p className="hero-text">
            Dashboard ini gue sederhanain jadi pola kerja yang lebih natural:
            cari tempat, pilih objek, lihat analisis, lalu cek titik lokasinya
            tanpa kebanyakan filter yang bikin ribet.
          </p>
          <div className="hero-badges">
            <span>Wilayah: Seluruh Tangerang Selatan</span>
            <span>Mode: {snapshot.mode === "live" ? "Live snapshot" : "Seed snapshot"}</span>
            <span>Data tampil: {filteredSummary.totalPlaces} objek</span>
          </div>
        </div>

        <div className="hero-meta-grid">
          <div className="hero-meta-card">
            <span>Snapshot terakhir</span>
            <strong>{new Date(snapshot.generatedAt).toLocaleString("id-ID")}</strong>
          </div>
          <div className="hero-meta-card">
            <span>Potensi pajak aktif</span>
            <strong>{formatCompactCurrency(filteredSummary.estimatedMonthlyTax)}</strong>
          </div>
          <div className="hero-meta-card action-card">
            <span>Data mentah</span>
            <Link className="ghost-button hero-action" href="/api/export">
              Download Excel
            </Link>
          </div>
        </div>
      </section>

      <section className="panel compact-toolbar">
        <div className="toolbar-head">
          <div>
            <p className="eyebrow">Pencarian cepat</p>
            <h2>Cari nama tempat atau alamat tanpa ngacak filter lain</h2>
          </div>
        </div>
        <div className="toolbar-row">
          <label className="field-block search-wide">
            <span>Cari tempat</span>
            <input
              className="text-field"
              type="search"
              placeholder="Cari nama, alamat, kategori, atau flag..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="workspace-grid master-detail-grid">
        <article className="panel master-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Pilih objek</p>
              <h2>Daftar tempat</h2>
            </div>
            <span className="result-counter">{filteredPlaces.length} objek</span>
          </div>

          <div className="list-toolbar">
            <div className="priority-switches">
              <button
                className={`priority-switch ${priorityFilter === "all" ? "is-active" : ""}`}
                type="button"
                onClick={() => setPriorityFilter("all")}
              >
                <span>All</span>
                <small>{searchablePlaces.length}</small>
              </button>
              {PRIORITY_META.map((priority) => (
                <button
                  key={priority.id}
                  className={`priority-switch ${priorityFilter === priority.id ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setPriorityFilter(priority.id)}
                >
                  <span>{priority.label}</span>
                  <small>{priorityCounts[priority.id] ?? 0}</small>
                </button>
              ))}
            </div>

            <label className="list-select">
              <span>Kategori</span>
              <select
                className="select-field"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              >
                <option value="all">Semua kategori</option>
                {CATEGORY_META.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label} ({categoryCounts[category.id] ?? 0})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="results-scroll">
            {filteredPlaces.map((place, index) => (
              <button
                key={place.placeId}
                className={`place-row ${selectedPlaceId === place.placeId ? "is-selected" : ""}`}
                type="button"
                onClick={() => setSelectedPlaceId(place.placeId)}
              >
                <div className="place-rank">{index + 1}</div>
                <div className="place-main">
                  <strong>{place.name}</strong>
                  <span>
                    {categoryLabel(place.category)} • {regionLabel(place.regionId)}
                  </span>
                  <small>{place.address}</small>
                </div>
                <div className="place-metrics">
                  <span>{place.rating?.toFixed(1) ?? "-"} rating</span>
                  <span>{place.userRatingCount} review</span>
                  <span>{formatCompactCurrency(place.estimatedMonthlyRevenue)}</span>
                </div>
                <span className={`priority-pill priority-${place.priority}`}>
                  {priorityLabel(place.priority)}
                </span>
              </button>
            ))}

            {!filteredPlaces.length ? (
              <div className="empty-block compact-empty">
                <strong>Tidak ada tempat yang cocok.</strong>
                <span>Coba ganti keyword pencarian atau balik ke semua kategori.</span>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel inspector-panel detail-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Detail objek</p>
              <h2>{selectedPlace?.name ?? "Belum ada objek terpilih"}</h2>
            </div>
            {selectedPlace ? (
              <span className={`priority-pill priority-${selectedPlace.priority}`}>
                {priorityLabel(selectedPlace.priority)}
              </span>
            ) : null}
          </div>

          {selectedPlace ? (
            <>
              <div className="detail-meta">
                <span className="detail-pill">{categoryLabel(selectedPlace.category)}</span>
                <span className="detail-pill">{regionLabel(selectedPlace.regionId)}</span>
                <span className="detail-pill">{openNowLabel(selectedPlace.openNow)}</span>
                <span className="detail-pill">
                  {businessStatusLabel(selectedPlace.businessStatus)}
                </span>
              </div>

              <div className="stat-triplet">
                <div className="stat-box">
                  <span>Signal score</span>
                  <strong>{selectedPlace.signalScore}</strong>
                  <small>Skor prioritas internal</small>
                </div>
                <div className="stat-box">
                  <span>Omzet estimasi</span>
                  <strong>{formatCompactCurrency(selectedPlace.estimatedMonthlyRevenue)}</strong>
                  <small>{formatCompactCurrency(selectedPlace.estimatedMonthlyTax)} potensi pajak</small>
                </div>
                <div className="stat-box">
                  <span>Rating publik</span>
                  <strong>{selectedPlace.rating?.toFixed(1) ?? "-"}</strong>
                  <small>{selectedPlace.userRatingCount} ulasan</small>
                </div>
              </div>

              <div className="analysis-card">
                <span>Analisis objek</span>
                <p>{buildObjectNarrative(selectedPlace)}</p>
              </div>

              <div className="location-panel">
                <div className="location-head">
                  <div>
                    <span className="eyebrow">Map lokasi</span>
                    <h3>Lokasi tempat terpilih</h3>
                  </div>
                  <p className="map-caption">
                    Pin terpilih otomatis difokuskan. Map bisa digeser dan dizoom untuk lihat area sekitar.
                  </p>
                </div>

                <PlaceMap
                  places={mapPlaces}
                  selectedPlaceId={selectedPlace.placeId}
                  onSelectPlace={setSelectedPlaceId}
                />
              </div>

              <div className="detail-links">
                {selectedPlace.googleMapsUri ? (
                  <Link
                    href={selectedPlace.googleMapsUri}
                    className="action-link primary-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka di Google Maps
                  </Link>
                ) : null}
                {selectedPlace.website ? (
                  <Link
                    href={selectedPlace.website}
                    className="action-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka website
                  </Link>
                ) : null}
                {selectedPlace.phoneNumber ? (
                  <a className="action-link" href={`tel:${selectedPlace.phoneNumber}`}>
                    Hubungi tempat
                  </a>
                ) : null}
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span>Alamat</span>
                  <strong>{selectedPlace.address}</strong>
                </div>
                <div className="detail-card">
                  <span>Rata-rata transaksi</span>
                  <strong>{formatCurrency(selectedPlace.averageTicket)}</strong>
                </div>
                <div className="detail-card">
                  <span>Estimasi pengunjung</span>
                  <strong>
                    {selectedPlace.estimatedVisitorsWeekday} weekday / {selectedPlace.estimatedVisitorsWeekend} weekend
                  </strong>
                </div>
                <div className="detail-card">
                  <span>Koordinat</span>
                  <strong>
                    {selectedPlace.latitude?.toFixed(5) ?? "-"},{" "}
                    {selectedPlace.longitude?.toFixed(5) ?? "-"}
                  </strong>
                </div>
              </div>

              <div className="mini-chart-grid">
                <div className="mini-chart-card">
                  <span>Komponen skor</span>
                  <div className="mini-bar">
                    <div style={{ width: `${Math.min(100, selectedPlace.signalScore)}%` }} />
                  </div>
                  <small>{selectedPlace.signalScore}/100</small>
                </div>
                <div className="mini-chart-card">
                  <span>Multiplier akhir pekan</span>
                  <div className="mini-bar">
                    <div
                      style={{
                        width: `${Math.min(100, selectedPlace.assumptions.weekendMultiplier * 55)}%`,
                      }}
                    />
                  </div>
                  <small>{selectedPlace.assumptions.weekendMultiplier.toFixed(2)}x</small>
                </div>
                <div className="mini-chart-card">
                  <span>Review velocity</span>
                  <div className="mini-bar">
                    <div
                      style={{
                        width: `${Math.min(100, selectedPlace.assumptions.reviewVelocityFactor * 64)}%`,
                      }}
                    />
                  </div>
                  <small>{selectedPlace.assumptions.reviewVelocityFactor.toFixed(2)}x</small>
                </div>
              </div>

              <div className="opening-hours-card">
                <span>Jam operasional publik</span>
                {selectedPlace.openingHoursText?.length ? (
                  <ul>
                    {selectedPlace.openingHoursText.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Belum ada jam operasional detail dari data publik.</p>
                )}
              </div>

              <div className="flag-stack">
                {selectedPlace.flags.map((flag) => (
                  <span key={flag} className="flag-chip">
                    {flag}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-block">
              <strong>Belum ada objek untuk ditampilkan.</strong>
              <span>Coba ubah keyword pencarian atau pilih kategori lain.</span>
            </div>
          )}
        </article>
      </section>

      <section className="panel snapshot-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Grafik ringkas</p>
            <h2>Ringkasan cepat dari hasil yang sedang tampil</h2>
          </div>
        </div>

        <div className="snapshot-charts">
          <div className="chart-block">
            <div className="chart-head">
              <strong>Sebaran kategori</strong>
              <span>ringkas dan gampang dibaca</span>
            </div>
            <div className="chart-stack">
              {CATEGORY_META.map((category) => {
                const count = categoryCounts[category.id] ?? 0;
                const percentage = searchablePlaces.length
                  ? Math.round((count / searchablePlaces.length) * 100)
                  : 0;

                return (
                  <div key={category.id} className="chart-row">
                    <div className="chart-label">
                      <strong>{category.label}</strong>
                      <span>{count} objek</span>
                    </div>
                    <div className="chart-bar">
                      <div style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="chart-block">
            <div className="chart-head">
              <strong>Sebaran prioritas</strong>
              <span>semua level tetap kelihatan</span>
            </div>
            <div className="chart-stack">
              {PRIORITY_META.map((priority) => {
                const count = priorityCounts[priority.id] ?? 0;
                const percentage = searchablePlaces.length
                  ? Math.round((count / searchablePlaces.length) * 100)
                  : 0;

                return (
                  <div key={priority.id} className="chart-row">
                    <div className="chart-label">
                      <strong>{priority.label}</strong>
                      <span>{count} objek</span>
                    </div>
                    <div className={`chart-bar priority-bar-${priority.id}`}>
                      <div style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
