# Kondisi dan Progress OS Claim Hub

**Diperbarui:** 
**Dasar dokumentasi:** pemeriksaan source code di repository. Status ini menjelaskan implementasi yang terlihat di kode, bukan bukti bahwa aplikasi sudah berjalan atau dirilis di lingkungan tertentu.

## Ringkasan

Repository ini berisi aplikasi web OS Claim Hub. Fungsinya sudah lebih luas daripada komparasi dua workbook: ada ingest file Excel ke Master, komparasi dua file, dan rekonsiliasi data Master dengan snapshot CSV OSCLN. Frontend menyediakan halaman Overview, Upload Data, Mapping Rules, Master Data, OSCLN Reconciliation, Activity Log, dan Library.

Secara implementasi, alur-alur inti tersebut telah memiliki UI dan endpoint backend. Belum ada hasil validasi runtime atau deployment yang dapat dipastikan dari pemeriksaan source ini. Karena itu, progress di bawah berarti fitur tersedia di kode; bukan berarti sudah diuji menyeluruh dengan database dan file produksi.

## Fitur yang sudah diimplementasikan

### 1. Upload Excel ke Master

- Menerima workbook `.xlsx`, `.xls`, `.xlsm`, dan `.xlsb` dengan batas ukuran 50 MB.
- Membaca sheet yang dipilih, mendukung deteksi header, dan memproses variasi struktur file.
- Memetakan nilai ke tabel Master OS Cedant atau Infopack dengan mapping dari database bila tersedia, dan pola fallback untuk data Cedant.
- Menghapus duplikat berdasarkan Primary Key yang dipilih di dalam file (kemunculan pertama dipertahankan).
- Untuk OS Cedant, penyimpanan melewati kombinasi `cedant_code` + `doc_no` yang sudah ada; saat upload ulang, nilai DOL, outstanding, dan currency yang masih kosong dapat dilengkapi dari mapping tanpa menimpa nilai yang sudah ada. Baris tanpa `doc_no` tetap disimpan jika memiliki data mapped, sementara baris yang seluruh field mapped-nya kosong dilewati dan tidak ditampilkan di Master. Untuk Infopack, jalur penyimpanan meng-append baris dan tidak melakukan pemeriksaan duplikat lintas upload.
- Menyimpan status dan ringkasan upload ke `upload_jobs`.
- Menyediakan endpoint untuk membaca data Master, melihat riwayat upload/library, menghapus entry library, dan mengekspor data.
- Ada jalur khusus KB INS yang menggunakan sheet `2.11` dan memerlukan `EXCEL_PASSWORD` bila workbook terenkripsi.

Endpoint utama berada di `/api/master`: `mappings`, `upload`, `data`, `jobs`, `library`, `library/{job_id}`, dan `export`.

### 2. Perbandingan Excel

- Mengunggah dua workbook Excel, memilih sheet dan kolom Primary Key.
- Mendukung primary key gabungan dengan format nama kolom dipisahkan `|`, misalnya `DOL|COB`.
- Membandingkan berdasarkan key, lalu mengklasifikasikan baris sebagai `matched`, `changed`, `only_in_a`, atau `only_in_b`.
- Menyimpan metadata job dan hasil per baris, menyediakan pagination/filter hasil, riwayat, serta unduhan laporan Excel.
- Jika terdapat key duplikat di masing-masing file, implementasi perbandingan menggunakan kemunculan pertama.

Endpoint utama berada di `/api/compare`: `sheets`, `upload`, `jobs`, `jobs/{job_id}`, `jobs/{job_id}/results`, dan `jobs/{job_id}/download`. Batas upload per file adalah 50 MB.

### 3. Rekonsiliasi OSCLN

- Menerima CSV snapshot dengan batas ukuran 15 MB, memvalidasi dan menyimpan baris serta metadata snapshot.
- Memilih snapshot dan jenis data Master, kemudian menghasilkan job rekonsiliasi.
- Membandingkan keberadaan Primary Key: key di kedua sumber menjadi `matched`, key hanya di Master menjadi `only_in_a`, dan key hanya di snapshot OSCLN menjadi `only_in_b`.
- Hasil rekonsiliasi disimpan sebagai job/result komparasi sehingga dapat ditampilkan melalui halaman OSCLN dan riwayat.
- Snapshot dapat dilihat dan dihapus melalui endpoint `/api/oscln/snapshots`.

**Catatan semantik:** rekonsiliasi OSCLN saat ini hanya mencocokkan key; nilai kolom lain tidak dibandingkan. Karena itu hasilnya tidak mengidentifikasi perubahan nilai antar-sumber. Label UI `INVALID_KEY` adalah label untuk `only_in_b` (key yang ada di OSCLN tetapi tidak ditemukan di Master), bukan validasi format key. Rekonsiliasi juga tidak menghasilkan kategori `changed`.

Endpoint utama berada di `/api/oscln`: `snapshots`, `upload`, `reconcile`, dan `snapshots/{snapshot_id}` (DELETE).

### 4. Frontend dan identitas sesi

- Frontend menggunakan React/Vite dan menyediakan halaman untuk seluruh alur di atas.
- ID sesi UUID dibuat dan disimpan di `localStorage`, kemudian dikirim sebagai header `X-Session-ID` pada sebagian besar permintaan.
- Backend memvalidasi format UUID v4. Riwayat job komparasi, upload, dan snapshot difilter berdasarkan ID sesi.
- ID sesi ini merupakan pengelompokan data sisi aplikasi, bukan autentikasi pengguna. Kode yang diperiksa tidak menunjukkan login atau manajemen akun.

## Arsitektur data dan dependensi

- Backend: FastAPI dengan SQLAlchemy; entry point berada di `backend/app/main.py`.
- Logika workbook/CSV, komparasi, dan pembuatan laporan berada di `backend/app/services/excel_service.py`.
- Database dikonfigurasi untuk PostgreSQL melalui `DATABASE_URL` atau variabel `DB_*`; `DB_SCHEMA` opsional.
- Model aplikasi meliputi `upload_jobs`, `comparison_jobs`, `comparison_results`, `oscln_snapshots`, dan `oscln_rows`, selain model tabel Master.
- Pembacaan mapping memakai tabel `master_upload_column_mapping` di database. Tabel sumber dan skema database perlu tersedia dan sesuai dengan konfigurasi lingkungan.
- Frontend memakai `VITE_API_URL` jika disediakan; jika tidak, API diarahkan ke `http://localhost:8000`. Server development Vite menggunakan port 3000.

## Progress saat dokumentasi dibuat

| Area | Kondisi berdasarkan source |
|---|---|
| UI navigasi dan halaman utama | Sudah ada |
| Upload dan append data Master | Sudah ada |
| Mapping kolom berbasis database | Sudah ada |
| Komparasi file Excel dan unduh laporan | Sudah ada |
| Upload snapshot CSV dan rekonsiliasi OSCLN | Sudah ada |
| Penyimpanan riwayat dan hasil ke PostgreSQL | Sudah diimplementasikan |
| Panduan kondisi/progress proyek | Didokumentasikan di file ini dan ditautkan dari README |
| Build/lint/test dan pengujian integrasi database | Belum diverifikasi dalam pemeriksaan ini |
| Deployment atau status layanan produksi | Tidak diketahui dari source repository |

## Hal yang perlu diverifikasi berikutnya

1. Jalankan backend dengan konfigurasi PostgreSQL target, lalu pastikan tabel Master, mapping, dan hak akses database cocok dengan query yang digunakan.
2. Jalankan frontend dan lakukan smoke test untuk upload, compare, rekonsiliasi, riwayat, dan ekspor menggunakan file representatif.
3. Jalankan `npm run build` dan `npm run lint`, serta siapkan/ jalankan pengujian backend bila tersedia.
4. Konfirmasi aturan bisnis yang masih tersirat, terutama deduplikasi Primary Key (kemunculan pertama yang dipertahankan), aturan matching OSCLN, dan arti label status bagi pengguna.

Pencarian nama berkas yang mengandung `test` tidak menemukan file yang cocok. Ini bukan bukti bahwa semua bentuk pengujian tidak ada. Tidak ada perubahan pada perilaku aplikasi yang dilakukan sebagai bagian dari pembaruan dokumentasi ini.
