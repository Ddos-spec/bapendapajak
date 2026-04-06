import { readLatestSnapshot } from "@/lib/storage";
import type { PlaceAnalysis } from "@/lib/types";

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

function priorityLabel(priority: PlaceAnalysis["priority"]) {
  switch (priority) {
    case "high":
      return "Tinggi";
    case "medium":
      return "Sedang";
    default:
      return "Pantau";
  }
}

export default async function HomePage() {
  const snapshot = await readLatestSnapshot();
  const spotlight = snapshot.places[0];
  const visiblePlaces = snapshot.places.slice(0, 20);
  const distribution = [
    { label: "Prioritas tinggi", value: snapshot.summary.highPriority, tone: "danger" },
    { label: "Prioritas sedang", value: snapshot.summary.mediumPriority, tone: "warning" },
    { label: "Pantau rutin", value: snapshot.summary.monitorPriority, tone: "success" },
  ];

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Tax Object Intelligence</p>
          <h1>Monitoring objek pajak yang beneran siap dipakai kerja</h1>
          <p className="hero-copy">
            Fokus harian buat Pamulang dan Serpong. Mesin ini disiapkan untuk
            narik kandidat usaha dari Google Places, ngasih scoring prioritas,
            lalu nerjemahin sinyal publik jadi estimasi omzet dan potensi pajak.
          </p>
          <div className="hero-tags">
            <span>Wilayah: Pamulang + Serpong</span>
            <span>Kategori: Hotel, Restoran, Hiburan</span>
            <span>Mode: {snapshot.mode === "live" ? "Live snapshot" : "Seed snapshot"}</span>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-stat">
            <span>Snapshot terakhir</span>
            <strong>{new Date(snapshot.generatedAt).toLocaleString("id-ID")}</strong>
          </div>
          <div className="hero-stat">
            <span>Total objek</span>
            <strong>{snapshot.summary.totalPlaces}</strong>
          </div>
          <div className="hero-stat">
            <span>Top lead</span>
            <strong>{snapshot.summary.topPlaceName ?? "-"}</strong>
          </div>
        </div>
      </section>

      <section className="summary-grid">
        <article className="metric-card accent-blue">
          <span className="metric-label">Total objek aktif</span>
          <strong>{snapshot.summary.totalPlaces}</strong>
          <p>Hasil gabungan query kategori pajak dengan rating minimal 3.</p>
        </article>
        <article className="metric-card accent-red">
          <span className="metric-label">Prioritas tinggi</span>
          <strong>{snapshot.summary.highPriority}</strong>
          <p>Objek yang paling layak masuk pemeriksaan awal atau validasi lapangan.</p>
        </article>
        <article className="metric-card accent-green">
          <span className="metric-label">Omzet estimasi</span>
          <strong>{formatCompactCurrency(snapshot.summary.estimatedMonthlyRevenue)}</strong>
          <p>Agregat estimasi omzet bulanan dari seluruh objek yang lolos scoring.</p>
        </article>
        <article className="metric-card accent-amber">
          <span className="metric-label">Potensi pajak</span>
          <strong>{formatCompactCurrency(snapshot.summary.estimatedMonthlyTax)}</strong>
          <p>Akumulasi pajak estimasi berdasar tarif kategori dan asumsi awal.</p>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel spotlight-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Spotlight</p>
              <h2>{spotlight?.name ?? "Belum ada data"}</h2>
            </div>
            {spotlight ? (
              <span className={`priority-pill priority-${spotlight.priority}`}>
                {priorityLabel(spotlight.priority)}
              </span>
            ) : null}
          </div>

          {spotlight ? (
            <>
              <div className="spotlight-grid">
                <div className="spotlight-box">
                  <span>Rating publik</span>
                  <strong>{spotlight.rating?.toFixed(1) ?? "-"}</strong>
                  <small>{spotlight.userRatingCount} ulasan</small>
                </div>
                <div className="spotlight-box">
                  <span>Omzet bulanan</span>
                  <strong>{formatCompactCurrency(spotlight.estimatedMonthlyRevenue)}</strong>
                  <small>{formatCompactCurrency(spotlight.estimatedMonthlyTax)} potensi pajak</small>
                </div>
                <div className="spotlight-box">
                  <span>Estimasi pengunjung</span>
                  <strong>
                    {spotlight.estimatedVisitorsWeekday} / {spotlight.estimatedVisitorsWeekend}
                  </strong>
                  <small>weekday / weekend</small>
                </div>
              </div>

              <div className="details-list">
                <div>
                  <span>Alamat</span>
                  <strong>{spotlight.address}</strong>
                </div>
                <div>
                  <span>Kategori</span>
                  <strong>{spotlight.category}</strong>
                </div>
                <div>
                  <span>Harga rata-rata</span>
                  <strong>{formatCurrency(spotlight.averageTicket)}</strong>
                </div>
                <div>
                  <span>Status usaha</span>
                  <strong>{spotlight.businessStatus ?? "Tidak diketahui"}</strong>
                </div>
              </div>

              <div className="flag-list">
                {spotlight.flags.map((flag) => (
                  <span key={flag} className="flag-chip">
                    {flag}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">Belum ada snapshot yang bisa ditampilkan.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Distribusi prioritas</p>
              <h2>Fokus kerja harian</h2>
            </div>
          </div>

          <div className="distribution-list">
            {distribution.map((item) => (
              <div className="distribution-row" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.value} objek</strong>
                </div>
                <div className={`distribution-bar tone-${item.tone}`}>
                  <div
                    style={{
                      width: `${Math.max(
                        10,
                        Math.round((item.value / Math.max(snapshot.summary.totalPlaces, 1)) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="workflow-list">
            <div>
              <strong>1. Tarik kandidat dari Places</strong>
              <p>Search harian untuk hotel, restoran, karaoke, spa, dan massage di wilayah target.</p>
            </div>
            <div>
              <strong>2. Bersihkan dan dedupe</strong>
              <p>Filter rating minimum, gabungkan hasil duplikat, lalu turunkan kategori pajaknya.</p>
            </div>
            <div>
              <strong>3. Hitung scoring dan asumsi omzet</strong>
              <p>Model awal pakai rating, jumlah ulasan, jenis usaha, dan multiplier akhir pekan.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="table-grid">
        <article className="panel table-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Ranked leads</p>
              <h2>Objek paling layak ditindaklanjuti</h2>
            </div>
          </div>

          <p className="table-note">
            Menampilkan 20 objek teratas dari {snapshot.summary.totalPlaces} lead. Dataset penuh tetap tersedia lewat API snapshot.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Objek</th>
                  <th>Wilayah</th>
                  <th>Rating</th>
                  <th>Review</th>
                  <th>Omzet</th>
                  <th>Prioritas</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlaces.map((place) => (
                  <tr key={place.placeId}>
                    <td>
                      <div className="cell-title">
                        <strong>{place.name}</strong>
                        <span>{place.category}</span>
                      </div>
                    </td>
                    <td>{place.regionId}</td>
                    <td>{place.rating?.toFixed(1) ?? "-"}</td>
                    <td>{place.userRatingCount}</td>
                    <td>{formatCompactCurrency(place.estimatedMonthlyRevenue)}</td>
                    <td>
                      <span className={`priority-pill priority-${place.priority}`}>
                        {priorityLabel(place.priority)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel assumptions-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Asumsi inti</p>
              <h2>Rumus yang dipakai sekarang</h2>
            </div>
          </div>

          <div className="assumption-card">
            <span>Restoran</span>
            <strong>Ticket avg Rp 62.500</strong>
            <p>Weekday turun dari band review count, weekend naik 45%.</p>
          </div>
          <div className="assumption-card">
            <span>Hotel</span>
            <strong>Ticket avg Rp 450.000</strong>
            <p>Visitor diinterpretasikan sebagai okupansi transaksi harian dengan multiplier 1,3.</p>
          </div>
          <div className="assumption-card">
            <span>Hiburan</span>
            <strong>Ticket avg Rp 165.000</strong>
            <p>Tarif pajak default 15%, weekend multiplier lebih agresif.</p>
          </div>

          <div className="note-card">
            <strong>Catatan penting</strong>
            <p>
              Ini sudah real foundation, tapi tetap butuh validasi lapangan untuk NPWPD,
              tapping box, PADL, dan harga transaksi riil.
            </p>
          </div>
        </article>
      </section>
    </main>
  );
}
