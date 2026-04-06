"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { SEARCH_REGIONS } from "@/lib/config";
import { PlaceMap } from "@/components/place-map";
import type { DailySnapshot, PlaceAnalysis, PriorityLevel, TaxCategory } from "@/lib/types";

type SortKey = "signal" | "revenue" | "reviews" | "rating" | "name";

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

const PRIORITY_META: Array<{
  id: PriorityLevel;
  label: string;
  description: string;
}> = [
  {
    id: "high",
    label: "Tinggi",
    description: "Layak masuk pemeriksaan awal atau validasi cepat.",
  },
  {
    id: "medium",
    label: "Sedang",
    description: "Perlu dipantau dan dibandingkan dengan data lapangan.",
  },
  {
    id: "monitor",
    label: "Pantau",
    description: "Masih layak dipantau rutin walau belum paling mendesak.",
  },
];

const REGION_OPTIONS = [
  { id: "all", label: "Semua kecamatan" },
  ...SEARCH_REGIONS.map((region) => ({
    id: region.id,
    label: region.name,
  })),
];

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

function priorityLabel(priority: PriorityLevel) {
  return PRIORITY_META.find((entry) => entry.id === priority)?.label ?? priority;
}

function categoryLabel(category: TaxCategory) {
  return CATEGORY_META.find((entry) => entry.id === category)?.label ?? category;
}

function regionLabel(regionId: string) {
  return REGION_OPTIONS.find((entry) => entry.id === regionId)?.label ?? regionId;
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
      return "Belum terdeteksi";
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

function summarizePlaces(places: PlaceAnalysis[]) {
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

function buildObjectNarrative(place: PlaceAnalysis) {
  const drivers: string[] = [];

  if ((place.rating ?? 0) >= 4.6) {
    drivers.push("rating publik sangat kuat");
  } else if ((place.rating ?? 0) >= 4) {
    drivers.push("rating publik stabil");
  } else {
    drivers.push("rating lolos ambang minimum");
  }

  if (place.userRatingCount >= 180) {
    drivers.push("jejak ulasan tinggi yang mengindikasikan traffic aktif");
  } else if (place.userRatingCount >= 60) {
    drivers.push("volume ulasan menengah");
  } else {
    drivers.push("ulasan masih terbatas sehingga validasi lapangan makin penting");
  }

  if (place.category === "entertainment") {
    drivers.push("kategori hiburan dengan tarif pajak lebih agresif");
  } else if (place.category === "hotel") {
    drivers.push("kategori penginapan dengan asumsi okupansi harian");
  } else {
    drivers.push("kategori restoran dengan pola transaksi berulang harian");
  }

  const riskLine =
    place.priority === "high"
      ? "Objek ini layak diprioritaskan untuk pengujian kewajaran omzet, pengecekan operasional, dan validasi lapangan."
      : place.priority === "medium"
        ? "Objek ini cocok masuk antrean pengamatan aktif sebelum dinaikkan ke pemeriksaan lapangan."
        : "Objek ini masih bisa dipantau rutin sambil menunggu sinyal publik atau data lapangan tambahan.";

  return `${place.name} masuk prioritas ${priorityLabel(place.priority).toLowerCase()} karena ${drivers.join(", ")}. ${riskLine}`;
}

function sortPlaces(places: PlaceAnalysis[], sortBy: SortKey) {
  const next = [...places];

  next.sort((left, right) => {
    switch (sortBy) {
      case "name":
        return left.name.localeCompare(right.name, "id");
      case "rating":
        return (right.rating ?? 0) - (left.rating ?? 0) || right.signalScore - left.signalScore;
      case "reviews":
        return right.userRatingCount - left.userRatingCount || right.signalScore - left.signalScore;
      case "revenue":
        return right.estimatedMonthlyRevenue - left.estimatedMonthlyRevenue || right.signalScore - left.signalScore;
      default:
        return right.signalScore - left.signalScore || right.estimatedMonthlyRevenue - left.estimatedMonthlyRevenue;
    }
  });

  return next;
}

function makeCountMap<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

interface DashboardClientProps {
  snapshot: DailySnapshot;
}

export function DashboardClient({ snapshot }: DashboardClientProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<TaxCategory[]>(
    CATEGORY_META.map((entry) => entry.id),
  );
  const [selectedPriorities, setSelectedPriorities] = useState<PriorityLevel[]>(
    PRIORITY_META.map((entry) => entry.id),
  );
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("signal");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    snapshot.places[0]?.placeId ?? null,
  );

  const deferredSearchText = useDeferredValue(searchText.trim().toLowerCase());

  const placesMatchingSearchAndRegion = useMemo(
    () =>
      snapshot.places.filter((place) => {
        const matchesRegion =
          selectedRegion === "all" || place.regionId === selectedRegion;

        return matchesRegion && matchesSearch(place, deferredSearchText);
      }),
    [deferredSearchText, selectedRegion, snapshot.places],
  );

  const categoryCounts = useMemo(
    () =>
      makeCountMap(
        placesMatchingSearchAndRegion
          .filter((place) => selectedPriorities.includes(place.priority))
          .map((place) => place.category),
      ),
    [placesMatchingSearchAndRegion, selectedPriorities],
  );

  const priorityCounts = useMemo(
    () =>
      makeCountMap(
        placesMatchingSearchAndRegion
          .filter((place) => selectedCategories.includes(place.category))
          .map((place) => place.priority),
      ),
    [placesMatchingSearchAndRegion, selectedCategories],
  );

  const regionCounts = useMemo(
    () => makeCountMap(placesMatchingSearchAndRegion.map((place) => place.regionId)),
    [placesMatchingSearchAndRegion],
  );

  const filteredPlaces = useMemo(
    () =>
      sortPlaces(
        placesMatchingSearchAndRegion.filter(
          (place) =>
            selectedCategories.includes(place.category) &&
            selectedPriorities.includes(place.priority),
        ),
        sortBy,
      ),
    [
      placesMatchingSearchAndRegion,
      selectedCategories,
      selectedPriorities,
      sortBy,
    ],
  );

  const filteredSummary = useMemo(
    () => summarizePlaces(filteredPlaces),
    [filteredPlaces],
  );
  const categoryChartTotal = Object.values(categoryCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const priorityChartTotal = Object.values(priorityCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const regionChartTotal = Object.values(regionCounts).reduce(
    (sum, value) => sum + value,
    0,
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
      snapshot.places.find((place) => place.placeId === selectedPlaceId) ??
      filteredPlaces[0] ??
      null,
    [filteredPlaces, selectedPlaceId, snapshot.places],
  );

  const allCategoriesSelected = selectedCategories.length === CATEGORY_META.length;
  const allPrioritiesSelected = selectedPriorities.length === PRIORITY_META.length;

  function toggleCategory(category: TaxCategory) {
    startTransition(() => {
      setSelectedCategories((current) => {
        if (current.includes(category)) {
          return current.length === 1
            ? current
            : current.filter((entry) => entry !== category);
        }

        return [...current, category];
      });
    });
  }

  function togglePriority(priority: PriorityLevel) {
    startTransition(() => {
      setSelectedPriorities((current) => {
        if (current.includes(priority)) {
          return current.length === 1
            ? current
            : current.filter((entry) => entry !== priority);
        }

        return [...current, priority];
      });
    });
  }

  function resetFilters() {
    startTransition(() => {
      setSelectedCategories(CATEGORY_META.map((entry) => entry.id));
      setSelectedPriorities(PRIORITY_META.map((entry) => entry.id));
      setSelectedRegion("all");
      setSortBy("signal");
      setSearchText("");
    });
  }

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Tax Object Intelligence</p>
          <h1>Dashboard pengamatan objek pajak yang bisa diclick, difilter, dan dibaca detailnya.</h1>
          <p className="hero-text">
            Semua level prioritas ditampilkan. Tim bisa cari objek, klik titik di peta,
            buka detail tempat, baca analisis singkat AI, lalu pindah fokus per kategori
            restoran, penginapan, atau hiburan di seluruh Tangerang Selatan.
          </p>
          <div className="hero-badges">
            <span>Wilayah: Seluruh Tangerang Selatan</span>
            <span>Mode: {snapshot.mode === "live" ? "Live snapshot" : "Seed snapshot"}</span>
            <span>Objek total: {snapshot.summary.totalPlaces}</span>
          </div>
        </div>

        <div className="hero-meta-grid">
          <div className="hero-meta-card">
            <span>Snapshot terakhir</span>
            <strong>{new Date(snapshot.generatedAt).toLocaleString("id-ID")}</strong>
          </div>
          <div className="hero-meta-card">
            <span>Objek tampil sekarang</span>
            <strong>{filteredSummary.totalPlaces}</strong>
          </div>
          <div className="hero-meta-card">
            <span>Lead teratas aktif</span>
            <strong>{filteredSummary.topPlaceName ?? "-"}</strong>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <button
          className={`metric-card interactive-card ${selectedPriorities.includes("high") ? "is-active" : ""}`}
          type="button"
          onClick={() => togglePriority("high")}
        >
          <span className="metric-label">Prioritas tinggi</span>
          <strong>{filteredSummary.highPriority}</strong>
          <p>{PRIORITY_META[0].description}</p>
        </button>
        <button
          className={`metric-card interactive-card ${selectedPriorities.includes("medium") ? "is-active" : ""}`}
          type="button"
          onClick={() => togglePriority("medium")}
        >
          <span className="metric-label">Prioritas sedang</span>
          <strong>{filteredSummary.mediumPriority}</strong>
          <p>{PRIORITY_META[1].description}</p>
        </button>
        <button
          className={`metric-card interactive-card ${selectedPriorities.includes("monitor") ? "is-active" : ""}`}
          type="button"
          onClick={() => togglePriority("monitor")}
        >
          <span className="metric-label">Pantau rutin</span>
          <strong>{filteredSummary.monitorPriority}</strong>
          <p>{PRIORITY_META[2].description}</p>
        </button>
        <article className="metric-card">
          <span className="metric-label">Potensi terfilter</span>
          <strong>{formatCompactCurrency(filteredSummary.estimatedMonthlyTax)}</strong>
          <p>
            {formatCompactCurrency(filteredSummary.estimatedMonthlyRevenue)} omzet estimasi
            untuk hasil yang sedang tampil.
          </p>
        </article>
      </section>

      <section className="control-panel">
        <div className="control-head">
          <div>
            <p className="eyebrow">Filter kerja</p>
            <h2>Atur kategori, level prioritas, wilayah, dan urutan data</h2>
          </div>
          <div className="head-actions">
            <Link className="ghost-button" href="/api/export">
              Download Excel
            </Link>
            <button className="ghost-button" type="button" onClick={resetFilters}>
              Reset filter
            </button>
          </div>
        </div>

        <div className="control-grid">
          <label className="field-block">
            <span>Cari nama atau alamat</span>
            <input
              className="text-field"
              type="search"
              placeholder="Contoh: hotel, pamulang, spa, resto..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <label className="field-block">
            <span>Wilayah</span>
            <select
              className="select-field"
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
            >
              {REGION_OPTIONS.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field-block">
            <span>Urutkan</span>
            <select
              className="select-field"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
            >
              <option value="signal">Signal score tertinggi</option>
              <option value="revenue">Omzet terbesar</option>
              <option value="reviews">Review terbanyak</option>
              <option value="rating">Rating tertinggi</option>
              <option value="name">Nama A-Z</option>
            </select>
          </label>
        </div>

        <div className="filter-section">
          <div className="filter-caption">
            <strong>Kategori objek</strong>
            <button
              className={`filter-chip ${allCategoriesSelected ? "is-active" : ""}`}
              type="button"
              onClick={() =>
                setSelectedCategories(CATEGORY_META.map((entry) => entry.id))
              }
            >
              Semua kategori
            </button>
          </div>
          <div className="chip-row">
            {CATEGORY_META.map((category) => (
              <button
                key={category.id}
                className={`filter-chip ${selectedCategories.includes(category.id) ? "is-active" : ""}`}
                type="button"
                onClick={() => toggleCategory(category.id)}
              >
                <span>{category.label}</span>
                <small>{categoryCounts[category.id] ?? 0} objek</small>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-caption">
            <strong>Level prioritas</strong>
            <button
              className={`filter-chip ${allPrioritiesSelected ? "is-active" : ""}`}
              type="button"
              onClick={() =>
                setSelectedPriorities(PRIORITY_META.map((entry) => entry.id))
              }
            >
              Semua level
            </button>
          </div>
          <div className="chip-row">
            {PRIORITY_META.map((priority) => (
              <button
                key={priority.id}
                className={`filter-chip ${selectedPriorities.includes(priority.id) ? "is-active" : ""}`}
                type="button"
                onClick={() => togglePriority(priority.id)}
              >
                <span>{priority.label}</span>
                <small>{priorityCounts[priority.id] ?? 0} objek</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel map-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Peta Tangsel</p>
              <h2>Semua hasil filter langsung kelihatan titiknya</h2>
            </div>
            <div className="map-legend">
              {PRIORITY_META.map((priority) => (
                <span key={priority.id} className={`legend-pill legend-${priority.id}`}>
                  {priority.label}
                </span>
              ))}
            </div>
          </div>

          <PlaceMap
            places={filteredPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
          />

          <p className="panel-note">
            Klik titik di peta atau pilih nama tempat dari daftar untuk pindah fokus.
          </p>
        </article>

        <article className="panel inspector-panel">
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
                <span className="detail-pill">{businessStatusLabel(selectedPlace.businessStatus)}</span>
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

              <div className="analysis-card">
                <span>Analisis objek</span>
                <p>{buildObjectNarrative(selectedPlace)}</p>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span>Alamat</span>
                  <strong>{selectedPlace.address}</strong>
                </div>
                <div className="detail-card">
                  <span>Asumsi transaksi rata-rata</span>
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
                  <span>Review velocity factor</span>
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
                    {(selectedPlace.openingHoursText ?? []).map((line) => (
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
              <strong>Belum ada hasil untuk filter ini.</strong>
              <span>Coba longgarkan filter atau reset pencarian.</span>
            </div>
          )}
        </article>
      </section>

      <section className="results-grid">
        <article className="panel list-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Daftar objek</p>
              <h2>Semua level prioritas tetap tampil dan bisa dipilih satu-satu</h2>
            </div>
            <span className="result-counter">{filteredPlaces.length} objek</span>
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
                <strong>Tidak ada objek yang cocok.</strong>
                <span>Filter saat ini terlalu sempit untuk snapshot yang tersedia.</span>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel analytics-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Grafik ringkas</p>
              <h2>Sebaran data yang sedang tampil</h2>
            </div>
          </div>

          <div className="chart-block">
            <div className="chart-head">
              <strong>Sebaran kategori</strong>
              <span>klik filter di atas untuk fokus</span>
            </div>
            <div className="chart-stack">
              {CATEGORY_META.map((category) => {
                const count = categoryCounts[category.id] ?? 0;
                const percentage = categoryChartTotal
                  ? Math.round((count / categoryChartTotal) * 100)
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
              <span>semua level tetap bisa dipantau</span>
            </div>
            <div className="chart-stack">
              {PRIORITY_META.map((priority) => {
                const count = priorityCounts[priority.id] ?? 0;
                const percentage = priorityChartTotal
                  ? Math.round((count / priorityChartTotal) * 100)
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

          <div className="chart-block">
            <div className="chart-head">
              <strong>Kepadatan wilayah</strong>
              <span>bisa dipakai buat cari kecamatan paling ramai</span>
            </div>
            <div className="chart-stack">
              {SEARCH_REGIONS.map((region) => {
                const count = regionCounts[region.id] ?? 0;
                const percentage = regionChartTotal
                  ? Math.round((count / regionChartTotal) * 100)
                  : 0;

                return (
                  <button
                    key={region.id}
                    className={`chart-row chart-button ${selectedRegion === region.id ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setSelectedRegion(region.id)}
                  >
                    <div className="chart-label">
                      <strong>{region.name}</strong>
                      <span>{count} objek</span>
                    </div>
                    <div className="chart-bar neutral-bar">
                      <div style={{ width: `${percentage}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
