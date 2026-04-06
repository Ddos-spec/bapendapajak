# Pajak Bapenda Intelligence

App ini dipakai untuk:

- narik kandidat objek pajak dari Google Places
- fokus wilayah Pamulang dan Serpong
- kategori hotel, restoran, dan hiburan
- hitung scoring prioritas, estimasi omzet, dan potensi pajak
- tampilkan hasilnya di dashboard modern yang enak dipakai tim operasional

## Stack

- Next.js App Router
- API route untuk sync harian
- Google Places API
- Postgres cloud untuk persistence production
- Optional Vercel Blob untuk arsip snapshot JSON
- Vercel Cron untuk trigger harian

## Environment

Salin `.env.example` jadi `.env.local` untuk lokal.

Variable yang dipakai:

- `GOOGLE_MAPS_API_KEY`
- `CRON_SECRET`
- `DATABASE_URL`
- `DATABASE_SSL`
- `BLOB_READ_WRITE_TOKEN` (opsional)

Catatan:

- Untuk Neon atau Postgres cloud lain, biasanya `DATABASE_SSL=require`
- Untuk local/internal container tanpa SSL, bisa `DATABASE_SSL=disable`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run sync`

`npm run sync` akan:

1. cari kandidat usaha di Google Places
2. filter rating minimum
3. dedupe hasil
4. hitung scoring dan estimasi omzet
5. simpan snapshot ke local file
6. jika `DATABASE_URL` tersedia, simpan juga ke database

## API

- `GET /api/dashboard`
  Mengembalikan snapshot terakhir

- `GET /api/sync`
- `POST /api/sync`
  Menjalankan sync harian. Aman kalau `CRON_SECRET` diisi.

## Deploy yang direkomendasikan

### Opsi utama

- Frontend + API: Vercel
- Database: Neon Postgres

Alasan:

- tidak nambah beban ke server existing
- cron dan deployment lebih simpel
- koneksi DB lebih cocok untuk app serverless

### Opsi alternatif

- Deploy container ini ke platform lain yang support Docker
- Gunakan `Dockerfile` yang sudah ada

## Status saat ini

Yang sudah beres:

- app full-stack dasar sudah hidup
- dashboard baru sudah jalan
- build production lulus
- sync live dari Google Places sudah berhasil

Yang belum final:

- provisioning database cloud production
- deploy Vercel production
- penyesuaian scoring final sesuai rule lapangan terbaru
