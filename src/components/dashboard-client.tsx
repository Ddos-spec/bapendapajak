"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { PlaceMap } from "@/components/place-map";
import { SEARCH_REGIONS } from "@/lib/config";
import type { DailySnapshot, PlaceAnalysis, PriorityLevel, TaxCategory } from "@/lib/types";

type CategoryFilter = "all" | TaxCategory;
type PriorityFilter = "all" | PriorityLevel;
type RegionFilter = "all" | string;

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

const CATEGORY_THEME: Record<TaxCategory, { color: string; soft: string; accent: string }> = {
  restaurant: {
    color: "#246bff",
    soft: "rgba(36, 107, 255, 0.14)",
    accent: "#1e4dd0",
  },
  hotel: {
    color: "#089167",
    soft: "rgba(8, 145, 103, 0.14)",
    accent: "#0b6b4b",
  },
  entertainment: {
    color: "#f59e0b",
    soft: "rgba(245, 158, 11, 0.16)",
    accent: "#9a6706",
  },
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return `Rp ${numberFormatter.format(value)}`;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "medium",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
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

function formatMonthLabel(date: Date) {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

function buildRecentMonths(generatedAt: string, count = 6) {
  const source = new Date(generatedAt);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() - (count - 1 - index), 1));

    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: formatMonthLabel(date),
      date,
    };
  });
}

function buildOutlierScore(place: PlaceAnalysis) {
  const ratingStrength = clamp(((place.rating ?? 3) - 3) / 2, 0, 1);
  const taxStrength = Math.max(place.estimatedMonthlyTax, 1);
  const priorityBoost =
    place.priority === "high" ? 1.18 : place.priority === "medium" ? 1.08 : 1;

  return taxStrength * (0.82 + ratingStrength * 0.3) * priorityBoost;
}

function truncateLabel(value: string, maxLength = 24) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
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

function buildSignalHighlights(place: PlaceAnalysis) {
  const googleTypes = place.types.length
    ? place.types
        .slice(0, 4)
        .map((type) => type.replaceAll("_", " "))
        .join(", ")
    : "tipe Google belum kebaca";

  return [
    `${place.rating?.toFixed(1) ?? "-"} rating dari ${numberFormatter.format(place.userRatingCount)} ulasan publik.`,
    `${openNowLabel(place.openNow)} dengan status usaha ${businessStatusLabel(place.businessStatus).toLowerCase()}.`,
    `Query pemicu: "${place.sourceQuery}" dan klasifikasi Google: ${googleTypes}.`,
  ];
}

function buildEstimationHighlights(place: PlaceAnalysis) {
  return [
    `Rata-rata transaksi diasumsikan ${formatCurrency(place.averageTicket)} per kunjungan.`,
    `Estimasi pengunjung ${place.estimatedVisitorsWeekday} weekday dan ${place.estimatedVisitorsWeekend} weekend.`,
    `Tarif pajak asumsi ${Math.round(place.assumptions.taxRate * 100)}% dengan review velocity ${place.assumptions.reviewVelocityFactor.toFixed(2)}x.`,
  ];
}

function buildFollowUpHighlights(place: PlaceAnalysis) {
  const actions: string[] = [];

  if (place.priority === "high") {
    actions.push("Naikkan ke shortlist pemeriksaan awal karena skor sinyal sudah kuat.");
  } else if (place.priority === "medium") {
    actions.push("Masuk antrean pengamatan aktif sebelum dipilih untuk cek lapangan.");
  } else {
    actions.push("Pantau berkala sambil tunggu sinyal tambahan atau pembanding wilayah.");
  }

  if (!place.website) {
    actions.push("Lengkapi identitas digital usaha karena website publik belum terdeteksi.");
  }

  if (!place.phoneNumber) {
    actions.push("Cari nomor kontak saat verifikasi lapangan agar data objek lebih lengkap.");
  }

  if (place.category === "restaurant") {
    actions.push("Bandingkan kepadatan review dengan kewajaran omzet makan-minum dan jam ramai.");
  } else if (place.category === "hotel") {
    actions.push("Cek kapasitas kamar, okupansi, dan pola tarif harian sebagai pembanding omzet.");
  } else {
    actions.push("Validasi layanan hiburan yang benar-benar aktif dan skema tarif yang dikenakan.");
  }

  return actions.slice(0, 4);
}

function buildOperatorHeadline(place: PlaceAnalysis) {
  if (place.priority === "high") {
    return `Objek ini sudah layak masuk shortlist pemeriksaan awal dengan potensi pajak ${formatCompactCurrency(place.estimatedMonthlyTax)} per bulan.`;
  }

  if (place.priority === "medium") {
    return `Objek ini cukup kuat untuk masuk pengamatan aktif sambil disiapkan pembanding omzet dan operasionalnya.`;
  }

  return `Objek ini masih level pantau, tetapi tetap menyimpan sinyal yang bisa dinaikkan kalau hasil lapangan menguatkan.`;
}

function buildOperatorSummary(place: PlaceAnalysis) {
  const contactState =
    place.website && place.phoneNumber
      ? "kanal kontak publik relatif lengkap"
      : place.website || place.phoneNumber
        ? "kanal kontak publik baru terbaca sebagian"
        : "kanal kontak publik masih minim";

  return `${categoryLabel(place.category)} di ${regionLabel(place.regionId)} ini tertarik dari query "${place.sourceQuery}" dengan ${contactState}. Cocok dipakai sebagai bahan triase awal sebelum tim mutusin perlu cek lapangan cepat atau cukup dipantau dulu.`;
}

function buildRevenueBreakdown(place: PlaceAnalysis) {
  const weekdayRevenue = place.estimatedVisitorsWeekday * place.averageTicket;
  const weekendRevenue = place.estimatedVisitorsWeekend * place.averageTicket;

  return [
    `Weekday: ${place.estimatedVisitorsWeekday} x ${formatCurrency(place.averageTicket)} = ${formatCurrency(weekdayRevenue)} per hari.`,
    `Weekend: ${place.estimatedVisitorsWeekend} x ${formatCurrency(place.averageTicket)} = ${formatCurrency(weekendRevenue)} per hari.`,
    `Omzet bulanan: (22 x ${formatCurrency(weekdayRevenue)}) + (8 x ${formatCurrency(weekendRevenue)}) = ${formatCompactCurrency(place.estimatedMonthlyRevenue)}.`,
    `Potensi pajak: ${formatCompactCurrency(place.estimatedMonthlyRevenue)} x ${Math.round(place.assumptions.taxRate * 100)}% = ${formatCompactCurrency(place.estimatedMonthlyTax)}.`,
  ];
}

function buildVerificationChecklist(place: PlaceAnalysis) {
  const checklist = [
    "Verifikasi identitas wajib pajak seperti NPWPD, PADL, dan status alat perekam transaksi bila tersedia.",
    "Bandingkan kepadatan review, rating, dan jam operasional dengan kewajaran omzet yang nanti dilaporkan objek.",
  ];

  if (place.category === "restaurant") {
    checklist.push("Cek pola dine-in, takeaway, delivery, dan harga menu dominan saat jam ramai.");
  } else if (place.category === "hotel") {
    checklist.push("Cek jumlah kamar aktif, pola okupansi, dan rentang tarif harian sebagai pembanding omzet.");
  } else {
    checklist.push("Cek layanan hiburan yang aktif, pola paket/tarif, dan jam operasional puncak di lapangan.");
  }

  checklist.push(
    place.openNow === false
      ? "Karena data publik menandai sedang tutup, cocok dipastikan lagi apakah jam operasional digitalnya masih akurat."
      : "Dokumentasikan kondisi outlet saat kunjungan supaya data digital dan kondisi lapangan bisa dibandingkan."
  );

  return checklist;
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
  generatedAtLabel: string;
}

export function DashboardClient({ snapshot, generatedAtLabel }: DashboardClientProps) {
  const [activeSnapshot, setActiveSnapshot] = useState(snapshot);
  const [activeGeneratedAtLabel, setActiveGeneratedAtLabel] = useState(generatedAtLabel);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    snapshot.places[0]?.placeId ?? null,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function refreshSnapshot() {
      setIsRefreshingSnapshot(true);
      setSnapshotError(null);

      try {
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Dashboard API returned ${response.status}`);
        }

        const nextSnapshot = (await response.json()) as DailySnapshot;

        startTransition(() => {
          setActiveSnapshot(nextSnapshot);
          setActiveGeneratedAtLabel(formatGeneratedAt(nextSnapshot.generatedAt));
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setSnapshotError("Snapshot live belum berhasil disegarkan. Tampilan masih pakai data terakhir yang tersedia.");
        console.error(error);
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshingSnapshot(false);
        }
      }
    }

    void refreshSnapshot();

    return () => {
      controller.abort();
    };
  }, []);

  const deferredSearch = useDeferredValue(searchText.trim().toLowerCase());

  const searchablePlaces = useMemo(
    () => activeSnapshot.places.filter((place) => matchesSearch(place, deferredSearch)),
    [activeSnapshot.places, deferredSearch],
  );

  const categoryCounts = useMemo(
    () => makeCountMap(searchablePlaces.map((place) => place.category)),
    [searchablePlaces],
  );

  const regionCounts = useMemo(
    () => makeCountMap(searchablePlaces.map((place) => place.regionId)),
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
        .filter((place) => regionFilter === "all" || place.regionId === regionFilter)
        .filter((place) => priorityFilter === "all" || place.priority === priorityFilter)
        .sort(comparePlaces),
    [categoryFilter, priorityFilter, regionFilter, searchablePlaces],
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

  const chartCategoryStats = useMemo(() => {
    const totalTax = filteredPlaces.reduce((sum, place) => sum + place.estimatedMonthlyTax, 0);

    return CATEGORY_META.map((category) => {
      const categoryPlaces = filteredPlaces.filter((place) => place.category === category.id);
      const monthlyTax = categoryPlaces.reduce((sum, place) => sum + place.estimatedMonthlyTax, 0);
      const monthlyRevenue = categoryPlaces.reduce(
        (sum, place) => sum + place.estimatedMonthlyRevenue,
        0,
      );

      return {
        ...category,
        count: categoryPlaces.length,
        monthlyTax,
        monthlyRevenue,
        share: totalTax ? (monthlyTax / totalTax) * 100 : 0,
        ...CATEGORY_THEME[category.id],
      };
    });
  }, [filteredPlaces]);

  const districtHeatmap = useMemo(() => {
    const districts = SEARCH_REGIONS.map((region) => {
      const places = filteredPlaces.filter((place) => place.regionId === region.id);
      const monthlyTax = places.reduce((sum, place) => sum + place.estimatedMonthlyTax, 0);
      const averageSignal = places.length
        ? places.reduce((sum, place) => sum + place.signalScore, 0) / places.length
        : 0;

      return {
        id: region.id,
        label: region.name,
        count: places.length,
        monthlyTax,
        averageSignal,
      };
    });

    const maxTax = Math.max(...districts.map((district) => district.monthlyTax), 1);

    return districts
      .map((district) => ({
        ...district,
        intensity: district.monthlyTax / maxTax,
      }))
      .sort((left, right) => right.monthlyTax - left.monthlyTax || right.count - left.count);
  }, [filteredPlaces]);

  const donutSegments = useMemo(() => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return chartCategoryStats.map((category) => {
      const segmentLength = circumference * (category.share / 100);
      const segment = {
        ...category,
        radius,
        circumference,
        dashArray: `${segmentLength} ${Math.max(circumference - segmentLength, 0)}`,
        dashOffset: -offset,
      };

      offset += segmentLength;

      return segment;
    });
  }, [chartCategoryStats]);

  const scatterPlot = useMemo(() => {
    const width = 360;
    const height = 232;
    const padding = { top: 16, right: 16, bottom: 28, left: 38 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxTax = Math.max(...filteredPlaces.map((place) => place.estimatedMonthlyTax), 1);
    const topOutliers = new Set(
      [...filteredPlaces]
        .sort((left, right) => buildOutlierScore(right) - buildOutlierScore(left))
        .slice(0, 5)
        .map((place) => place.placeId),
    );

    return {
      width,
      height,
      padding,
      maxTax,
      axisTicks: [3, 3.5, 4, 4.5, 5],
      points: filteredPlaces.map((place) => {
        const rating = clamp(place.rating ?? 3, 3, 5);
        const x = padding.left + ((rating - 3) / 2) * plotWidth;
        const y =
          padding.top +
          (1 - clamp(place.estimatedMonthlyTax / maxTax, 0, 1)) * plotHeight;

        return {
          id: place.placeId,
          name: place.name,
          x,
          y,
          rating,
          monthlyTax: place.estimatedMonthlyTax,
          priority: place.priority,
          category: place.category,
          radius: place.priority === "high" ? 6.5 : place.priority === "medium" ? 5.4 : 4.5,
          isOutlier: topOutliers.has(place.placeId),
        };
      }),
      outliers: [...filteredPlaces]
        .sort((left, right) => buildOutlierScore(right) - buildOutlierScore(left))
        .slice(0, 5),
    };
  }, [filteredPlaces]);

  const monthlyGrowthEstimate = useMemo(() => {
    const months = buildRecentMonths(activeSnapshot.generatedAt, 6);
    const series = months.map((month) => ({
      ...month,
      counts: {
        restaurant: 0,
        hotel: 0,
        entertainment: 0,
      } satisfies Record<TaxCategory, number>,
    }));

    filteredPlaces.forEach((place) => {
      const maturity = clamp(place.userRatingCount / 240, 0, 1);
      const ratingStrength = clamp(((place.rating ?? 3) - 3) / 2, 0, 1);
      const stabilityBias = clamp((1.55 - place.assumptions.reviewVelocityFactor) / 0.7, 0, 1);
      const ageScore = clamp(maturity * 0.58 + ratingStrength * 0.18 + stabilityBias * 0.24, 0.08, 1);
      const introIndex = Math.round((1 - ageScore) * (series.length - 1));

      for (let index = introIndex; index < series.length; index += 1) {
        series[index].counts[place.category] += 1;
      }
    });

    const maxCount = Math.max(
      ...series.flatMap((entry) => Object.values(entry.counts)),
      1,
    );

    return {
      note:
        "Indikasi pertumbuhan disusun dari kematangan ulasan, rating, dan review velocity. Ini bukan histori transaksi riil.",
      maxCount,
      series: series.map((entry) => ({
        ...entry,
        total:
          entry.counts.restaurant + entry.counts.hotel + entry.counts.entertainment,
        ranked: CATEGORY_META.map((category) => ({
          id: category.id,
          label: category.label,
          count: entry.counts[category.id],
          color: CATEGORY_THEME[category.id].color,
          accent: CATEGORY_THEME[category.id].accent,
        })).sort((left, right) => right.count - left.count),
      })),
    };
  }, [activeSnapshot.generatedAt, filteredPlaces]);

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
          <h1>
            DINAS BAPENDA KOTA TANGERANG SELATAN{" "}
            <span className="hero-signoff">Memy</span>
          </h1>
          <p className="hero-text">
            Dashboard ini dirancang supaya pemantauan objek lebih cepat:
            filter wilayah, pilih objek yang relevan, pahami sinyal utamanya,
            lalu lanjut ke verifikasi dari satu tampilan.
          </p>
          <div className="hero-badges">
            <span>Wilayah: Seluruh Tangerang Selatan</span>
            <span>Mode: {activeSnapshot.mode === "live" ? "Live snapshot" : "Seed snapshot"}</span>
            <span>Data tampil: {filteredSummary.totalPlaces} objek</span>
            {isRefreshingSnapshot ? <span>Menyegarkan snapshot live...</span> : null}
          </div>
        </div>

        <div className="hero-meta-grid">
          <div className="hero-meta-card">
            <span>Snapshot terakhir</span>
            <strong>{activeGeneratedAtLabel}</strong>
            {snapshotError ? <small className="hero-meta-note warning-note">{snapshotError}</small> : null}
          </div>
          <div className="hero-meta-card">
            <span>Potensi pajak aktif</span>
            <strong>{formatCompactCurrency(filteredSummary.estimatedMonthlyTax)}</strong>
            <small className="hero-meta-note">
              {filteredSummary.highPriority} prioritas tinggi dari {filteredSummary.totalPlaces} objek aktif
            </small>
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
            <div className="list-filter-group">
              <label className="list-select">
                <span>Prioritas</span>
                <select
                  className="select-field"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                >
                  <option value="all">Semua prioritas ({searchablePlaces.length})</option>
                  {PRIORITY_META.map((priority) => (
                    <option key={priority.id} value={priority.id}>
                      {priority.label} ({priorityCounts[priority.id] ?? 0})
                    </option>
                  ))}
                </select>
              </label>

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

              <label className="list-select">
                <span>Kecamatan</span>
                <select
                  className="select-field"
                  value={regionFilter}
                  onChange={(event) => setRegionFilter(event.target.value)}
                >
                  <option value="all">Semua kecamatan</option>
                  {SEARCH_REGIONS.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name} ({regionCounts[region.id] ?? 0})
                    </option>
                  ))}
                </select>
              </label>
            </div>
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

              <div className="operator-brief-card">
                <span>Brief operator</span>
                <strong>{buildOperatorHeadline(selectedPlace)}</strong>
                <p>{buildOperatorSummary(selectedPlace)}</p>
                <div className="brief-chip-row">
                  <span className="brief-chip">{formatCompactCurrency(selectedPlace.estimatedMonthlyTax)} potensi pajak</span>
                  <span className="brief-chip">{numberFormatter.format(selectedPlace.userRatingCount)} ulasan publik</span>
                  <span className="brief-chip">Signal score {selectedPlace.signalScore}</span>
                  <span className="brief-chip">Query: {selectedPlace.sourceQuery}</span>
                </div>
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

              <div className="insight-grid">
                <div className="insight-card">
                  <span>Sinyal publik</span>
                  <ul>
                    {buildSignalHighlights(selectedPlace).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="insight-card">
                  <span>Dasar estimasi</span>
                  <ul>
                    {buildEstimationHighlights(selectedPlace).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="insight-card">
                  <span>Tindak lanjut</span>
                  <ul>
                    {buildFollowUpHighlights(selectedPlace).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
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
                  key={activeSnapshot.generatedAt}
                  places={mapPlaces}
                  selectedPlaceId={selectedPlace.placeId}
                  onSelectPlace={setSelectedPlaceId}
                  isRefreshing={isRefreshingSnapshot}
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
                  <small>{selectedPlace.latitude != null && selectedPlace.longitude != null ? "Koordinat dari Google Places." : "Koordinat publik belum terbaca di snapshot aktif."}</small>
                </div>
                <div className="detail-card">
                  <span>Query pemicu</span>
                  <strong>{selectedPlace.sourceQuery}</strong>
                  <small>Kata pencarian yang pertama kali menarik objek ini ke dalam hasil.</small>
                </div>
                <div className="detail-card">
                  <span>Tarif pajak asumsi</span>
                  <strong>{Math.round(selectedPlace.assumptions.taxRate * 100)}%</strong>
                  <small>Dipakai untuk menghitung potensi pajak dari estimasi omzet bulanan.</small>
                </div>
              </div>

              <div className="verification-grid">
                <div className="insight-card formula-card">
                  <span>Simulasi omzet dan pajak</span>
                  <ul>
                    {buildRevenueBreakdown(selectedPlace).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="insight-card">
                  <span>Checklist verifikasi lapangan</span>
                  <ul>
                    {buildVerificationChecklist(selectedPlace).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
            <p className="eyebrow">Layer 2 Visualisasi</p>
            <h2>Peta sinyal, komposisi potensi, dan target outlier dalam satu section</h2>
          </div>
        </div>

        <div className="visual-grid">
          <div className="visual-card visual-card-wide">
            <div className="chart-head">
              <div>
                <strong>Heatmap kecamatan</strong>
                <span>Zona pajak paling tebal dari hasil yang sedang tampil</span>
              </div>
              {regionFilter !== "all" ? (
                <button
                  type="button"
                  className="ghost-button chart-action"
                  onClick={() => setRegionFilter("all")}
                >
                  Reset kecamatan
                </button>
              ) : null}
            </div>

            <div className="district-heatmap-grid">
              {districtHeatmap.map((district) => {
                const tint =
                  district.intensity > 0.72
                    ? `rgba(239, 68, 68, ${0.16 + district.intensity * 0.22})`
                    : district.intensity > 0.42
                      ? `rgba(245, 158, 11, ${0.14 + district.intensity * 0.2})`
                      : `rgba(36, 107, 255, ${0.08 + district.intensity * 0.22})`;

                return (
                  <button
                    key={district.id}
                    type="button"
                    className={`district-tile ${regionFilter === district.id ? "is-active" : ""}`}
                    style={{
                      background: `linear-gradient(180deg, ${tint}, rgba(255, 255, 255, 0.98))`,
                    }}
                    onClick={() =>
                      setRegionFilter((current) => (current === district.id ? "all" : district.id))
                    }
                  >
                    <div className="district-tile-head">
                      <strong>{district.label}</strong>
                      <span>{district.count} objek</span>
                    </div>
                    <div className="district-tile-figure">
                      <strong>{formatCompactCurrency(district.monthlyTax)}</strong>
                      <span>potensi pajak</span>
                    </div>
                    <div className="district-meter">
                      <div style={{ width: `${Math.max(8, district.intensity * 100)}%` }} />
                    </div>
                    <small>Rata-rata signal score {district.averageSignal.toFixed(0) || 0}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="visual-card donut-card">
            <div className="chart-head">
              <div>
                <strong>Donut komposisi potensi</strong>
                <span>Hotel vs Resto vs Hiburan berdasarkan pajak estimasi</span>
              </div>
            </div>

            <div className="donut-layout">
              <div className="donut-shell" aria-hidden="true">
                <svg viewBox="0 0 160 160" className="donut-chart">
                  <circle cx="80" cy="80" r="54" className="donut-track" />
                  {donutSegments.map((segment) =>
                    segment.share > 0 ? (
                      <circle
                        key={segment.id}
                        cx="80"
                        cy="80"
                        r={segment.radius}
                        className="donut-segment"
                        stroke={segment.color}
                        strokeDasharray={segment.dashArray}
                        strokeDashoffset={segment.dashOffset}
                      />
                    ) : null,
                  )}
                </svg>
                <div className="donut-center">
                  <strong>{formatCompactCurrency(filteredSummary.estimatedMonthlyTax)}</strong>
                  <span>potensi pajak aktif</span>
                </div>
              </div>

              <div className="donut-legend">
                {chartCategoryStats.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`donut-legend-item ${categoryFilter === category.id ? "is-active" : ""}`}
                    onClick={() =>
                      setCategoryFilter((current) => (current === category.id ? "all" : category.id))
                    }
                  >
                    <span
                      className="legend-dot"
                      style={{ background: category.color }}
                    />
                    <div>
                      <strong>{category.label}</strong>
                      <small>
                        {category.count} objek • {formatCompactCurrency(category.monthlyTax)}
                      </small>
                    </div>
                    <b>{Math.round(category.share)}%</b>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="visual-card visual-card-wide">
            <div className="chart-head">
              <div>
                <strong>Scatter plot rating vs potensi pajak</strong>
                <span>Outlier paling kanan-atas biasanya paling layak naik prioritas</span>
              </div>
            </div>

            <div className="scatter-layout">
              <div className="scatter-shell">
                <svg
                  viewBox={`0 0 ${scatterPlot.width} ${scatterPlot.height}`}
                  className="scatter-chart"
                  role="img"
                  aria-label="Scatter plot rating versus potensi pajak"
                >
                  <line
                    x1={scatterPlot.padding.left}
                    y1={scatterPlot.height - scatterPlot.padding.bottom}
                    x2={scatterPlot.width - scatterPlot.padding.right}
                    y2={scatterPlot.height - scatterPlot.padding.bottom}
                    className="scatter-axis"
                  />
                  <line
                    x1={scatterPlot.padding.left}
                    y1={scatterPlot.padding.top}
                    x2={scatterPlot.padding.left}
                    y2={scatterPlot.height - scatterPlot.padding.bottom}
                    className="scatter-axis"
                  />

                  {scatterPlot.axisTicks.map((tick) => {
                    const x =
                      scatterPlot.padding.left +
                      ((tick - 3) / 2) *
                        (scatterPlot.width - scatterPlot.padding.left - scatterPlot.padding.right);

                    return (
                      <g key={tick}>
                        <line
                          x1={x}
                          y1={scatterPlot.padding.top}
                          x2={x}
                          y2={scatterPlot.height - scatterPlot.padding.bottom}
                          className="scatter-grid-line"
                        />
                        <text
                          x={x}
                          y={scatterPlot.height - 8}
                          textAnchor="middle"
                          className="scatter-tick"
                        >
                          {tick.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {[0.25, 0.5, 0.75, 1].map((step) => {
                    const y =
                      scatterPlot.padding.top +
                      (1 - step) *
                        (scatterPlot.height - scatterPlot.padding.top - scatterPlot.padding.bottom);
                    const tickValue = formatCompactCurrency(scatterPlot.maxTax * step);

                    return (
                      <g key={step}>
                        <line
                          x1={scatterPlot.padding.left}
                          y1={y}
                          x2={scatterPlot.width - scatterPlot.padding.right}
                          y2={y}
                          className="scatter-grid-line"
                        />
                        <text
                          x={10}
                          y={y + 4}
                          textAnchor="start"
                          className="scatter-tick"
                        >
                          {tickValue}
                        </text>
                      </g>
                    );
                  })}

                  {scatterPlot.points.map((point) => (
                    <g key={point.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={point.radius}
                        fill={CATEGORY_THEME[point.category].color}
                        opacity={point.id === selectedPlaceId ? 1 : 0.82}
                        stroke={
                          point.id === selectedPlaceId
                            ? "#0f172a"
                            : point.priority === "high"
                              ? "#ffffff"
                              : "transparent"
                        }
                        strokeWidth={point.id === selectedPlaceId ? 2.8 : point.priority === "high" ? 1.8 : 0}
                        className="scatter-point"
                        onClick={() => setSelectedPlaceId(point.id)}
                      >
                        <title>
                          {`${point.name} | rating ${point.rating.toFixed(1)} | ${formatCompactCurrency(point.monthlyTax)} potensi pajak`}
                        </title>
                      </circle>
                      {point.isOutlier ? (
                        <text
                          x={point.x + 8}
                          y={point.y - 8}
                          className="scatter-label"
                        >
                          {truncateLabel(point.name, 18)}
                        </text>
                      ) : null}
                    </g>
                  ))}
                </svg>
              </div>

              <div className="outlier-stack">
                <div className="outlier-head">
                  <strong>Outlier prioritas</strong>
                  <span>Klik untuk buka detail objek</span>
                </div>
                {scatterPlot.outliers.map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    className={`outlier-item ${selectedPlaceId === place.placeId ? "is-active" : ""}`}
                    onClick={() => setSelectedPlaceId(place.placeId)}
                  >
                    <div>
                      <strong>{place.name}</strong>
                      <small>
                        {place.rating?.toFixed(1) ?? "-"} rating • {formatCompactCurrency(place.estimatedMonthlyTax)}
                      </small>
                    </div>
                    <span className={`priority-pill priority-${place.priority}`}>
                      {priorityLabel(place.priority)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="visual-card">
            <div className="chart-head">
              <div>
                <strong>Bar race pertumbuhan objek per bulan</strong>
                <span>Indikasi laju akumulasi objek dari sinyal publik yang ada</span>
              </div>
            </div>

            <div className="race-stack">
              {monthlyGrowthEstimate.series.map((month) => (
                <div key={month.key} className="race-row">
                  <div className="race-label">
                    <strong>{month.label}</strong>
                    <span>{month.total} objek estimasi</span>
                  </div>
                  <div className="race-bars">
                    {month.ranked.map((category) => (
                      <div key={category.id} className="race-bar-row">
                        <span>{category.label}</span>
                        <div className="race-bar-track">
                          <div
                            className="race-bar-fill"
                            style={{
                              width: `${(category.count / monthlyGrowthEstimate.maxCount) * 100}%`,
                              background: `linear-gradient(90deg, ${category.color}, ${category.accent})`,
                            }}
                          />
                        </div>
                        <b>{category.count}</b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="visual-note">{monthlyGrowthEstimate.note}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
