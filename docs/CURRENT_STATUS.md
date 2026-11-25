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
- Untuk OS Cedant di tabel utama dan tabel hasil per cedant, upload dengan cedant, bulan, dan tahun yang sama mengganti seluruh data periode cedant tersebut: data lama dihapus lalu data upload baru disimpan. Periode yang berbeda ditambahkan tanpa menghapus periode lama. Pada batch multi-sheet, penggantian dilakukan sekali saat sheet pertama dikonfirmasi; sheet lain dalam batch yang sama ikut disimpan tanpa menghapus ulang data periode. Baris tanpa `doc_no` tetap disimpan jika memiliki data mapped, sementara baris yang seluruh field mapped-nya kosong dilewati dan tidak ditampilkan di Master. Infopack menghindari pengulangan berdasarkan cedant, nama file, periode, sheet, dan nomor baris Excel.
- Validasi dan penyimpanan Infopack tetap memakai alur yang sudah ada ke `rekonsiliasi.master_os_infopack_web`; perubahan Point 2/3 kali ini dibatasi ke OS Cedant sesuai permintaan untuk menunda cakupan Infopack.
- Alur upload workbook mencatat satu batch dan setiap sheet ke `upload_table`, termasuk sheet kosong/tanpa header sebagai `skipped`. Sheet dengan mapping wajib yang tersedia dan cocok dengan header akan dikonfirmasi serta diproses otomatis; sheet lain tetap `needs_review` untuk pemetaan manual atau ditandai `skipped` bila tidak dipakai. `ready` dan `skipped` dianggap selesai untuk batch. Endpointnya meliputi `POST /api/master/prepare`, `GET /api/master/tables/{table_id}/mapping`, `POST /api/master/tables/{table_id}/confirm`, dan `POST /api/master/tables/{table_id}/skip`.
- Daftar cedant dan aturan mapping di frontend hanya berasal dari `/api/master/mappings`; profil statis di `services/mappingData.js` telah dihapus agar kode cedant yang tidak ada di database tidak ditawarkan. Jika database tidak tersedia, UI menampilkan status kegagalan dan tidak memakai fallback statis.
- Point 2: `upload_batch.uploaded_at` memakai default timestamp DB. `upload_table` terhubung ke batch; `header_library` terhubung ke sheet; seluruh baris asli disimpan di `rekonsiliasi.master_raw_rows`, dipisahkan logis oleh `cedant_code`/`target_table`. Metadata `batch_id`, `table_id`, `job_id`, nomor baris Excel, sumber file, dan sheet ditanam dalam JSON `full_row_data` karena tabel raw aktual tidak memiliki kolom relasi tersebut. Penyiapan sheet/header/raw di satu upload dibatalkan bersama bila gagal, lalu batch/job ditandai error; konfirmasi mapping dan penulisan hasil berada dalam transaksi terpisah yang rollback bersama bila gagal.
- Tabel utama `rekonsiliasi.master_os_cedant_web` tidak memiliki kolom `batch_id`/`table_id`; provenance batch/table disimpan di arsip raw dan tabel hasil. Untuk hasil OS Cedant, tabel berada di schema `hasil_rekonsiliasi`, satu per `cedant_short_name`, dengan kolom tujuan tetap mengikuti header dari mapping pertama per field. Header Excel dari mapping berikutnya tetap dipakai untuk membaca sumber, tetapi nilainya masuk ke kolom tujuan pertama tersebut; upload tidak menambah kolom baru pada tabel hasil yang sudah ada. Jika kolom tujuan pertama tidak tersedia, konfirmasi gagal dengan pesan yang jelas. Tabel hasil yang belum ada dibuat dari header mapping pertama; metadata sumber tetap disimpan dan seluruh header asli tetap tersedia di arsip raw. Pembuatan tabel/kolom hasil dan penyimpanan hasil berada dalam transaksi yang sama, sehingga rollback membatalkan perubahan bila proses gagal. Unique `(upload_table_id, excel_row_number)` membuat pemrosesan ulang sheet yang sama idempotent. Upload Infopack juga menyimpan baris ke tabel `hasil_rekonsiliasi.os_infopack_<cedant_short_name>` dengan nilai COB, DOL, Gross, TSI, title/value, serta metadata periode dan provenance. Skrip `backend/scripts/provision_upload_point2_3.py` menyediakan audit read-only (`python backend\scripts\provision_upload_point2_3.py --check`) dan provisioning berulang eksplisit (`--apply`) untuk tabel hasil OS Cedant/environment lain.
- Pada OS Cedant, baris dengan Loss Ref kosong tetap dapat masuk ke hasil bila memiliki nilai mapped valid lain. Baris tanpa nilai hasil mapped yang valid dilewati dari tabel hasil, tetapi tetap tersimpan di arsip raw.
- Database aktual memiliki `master_raw_rows` (bukan `sheet_raw_rows` atau tabel raw per cedant). `header_library` menyimpan satu baris per posisi kolom (`table_id`, `column_index`, `original_header`); constraint uniknya per `(table_id, column_index)`, bukan per nama header, sehingga nama header berulang antar upload/sheet tetap dicatat. Endpoint `GET /api/master/header-library` dan mode **Header Library** menampilkan seluruh entri sebagai baris, lengkap dengan file, cedant, sheet, index kolom, versi mapping atau status review/skipped, dan timestamp.
- Point 3 OS Cedant: pemilihan versi membandingkan seluruh pasangan field-sumber/header yang bersumber dari kolom, lintas sheet untuk cedant yang sama. Mapping identik menggunakan versi yang sudah ada; mapping berbeda mendapat versi baru. Penguncian transaksi mencegah dua konfirmasi bersamaan membuat versi yang sama. Arsip header tetap membedakan posisi kolom, termasuk nama header yang berulang antar upload/sheet.
- Jalankan `python backend\scripts\provision_upload_point2_3.py --check` untuk audit read-only, atau `--apply` pada environment baru untuk menyediakan tabel/kolom hasil OS berdasarkan Mapping Rules aktif. Skrip menolak tipe/metadata yang tidak cocok dan tidak mengubah tabel Master inti. Aplikasi tidak menjalankan DDL saat startup.
- Menyimpan status dan ringkasan upload ke `upload_jobs`.
- Menyediakan endpoint untuk membaca data Master, melihat riwayat upload/library, menghapus entry library, dan mengekspor data.
- Ada jalur khusus KB INS yang menggunakan sheet `2.11` dan memerlukan `EXCEL_PASSWORD` bila workbook terenkripsi.

Endpoint utama berada di `/api/master`: `mappings`, `inspect`, `prepare`, `tables/{table_id}/mapping`, `tables/{table_id}/confirm`, `tables/{table_id}/skip`, `upload` (kompatibilitas), `data`, `jobs`, `library`, `library/{job_id}`, dan `export`.

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
- Endpoint `GET /health` menjalankan `SELECT 1` ke PostgreSQL yang dikonfigurasi dan hanya melaporkan `healthy` jika query berhasil; jika gagal, endpoint mengembalikan HTTP 503 tanpa membocorkan detail koneksi.
- Logika workbook/CSV, komparasi, dan pembuatan laporan berada di `backend/app/services/excel_service.py`.
- Database dikonfigurasi untuk PostgreSQL melalui `DATABASE_URL` atau variabel `DB_*`; `DB_SCHEMA` hanya mengatur search path untuk query yang tidak berkualifikasi schema. Query upload dan tabel Master yang dibahas di atas menyebut schema `rekonsiliasi` secara eksplisit.
- Model aplikasi meliputi `upload_jobs`, `comparison_jobs`, `comparison_results`, `oscln_snapshots`, dan `oscln_rows`, selain model tabel Master.
- Mapping OS Cedant disimpan di `rekonsiliasi.master_mapping_column`, sedangkan mapping Infopack disimpan di `rekonsiliasi.master_mapping_column_infopack`; keduanya memakai katalog `rekonsiliasi.master_field`. Metadata upload memakai `rekonsiliasi.upload_batch`, `rekonsiliasi.upload_table`, dan `rekonsiliasi.header_library`. Kode model/query Master secara eksplisit menargetkan schema `rekonsiliasi`; tabel-tabel tersebut tidak dibuat atau diubah oleh aplikasi.
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
