# OS Claim Hub

Aplikasi web untuk mengelola data Master OS Claim Cedant dan Infopack, membandingkan file Excel, serta merekonsiliasi data Master dengan snapshot CSV OSCLN.

## Status dan dokumentasi

Dokumentasi fitur yang sudah ada, alur data, progress implementasi, dan batas verifikasi saat ini tersedia di [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md).

## Teknologi

- Frontend: React 18, Vite, Tailwind CSS
- Backend: FastAPI, SQLAlchemy, pandas, openpyxl
- Database: PostgreSQL

## Menjalankan aplikasi secara lokal

### Backend

1. Masuk ke folder `backend`, buat dan aktifkan virtual environment.
2. Install dependensi: `pip install -r requirements.txt`.
3. Konfigurasikan koneksi PostgreSQL melalui `DATABASE_URL`, atau variabel `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, dan opsional `DB_SCHEMA`.
4. Jalankan `uvicorn app.main:app --reload --port 8000`.

Dokumentasi API tersedia di `http://localhost:8000/docs`. Backend mencoba membuat tabel yang didefinisikan oleh SQLAlchemy saat aplikasi diimpor; tabel mapping eksternal dan akses ke tabel Master tetap harus tersedia di database yang dikonfigurasi.

Untuk file KB INS tertentu, pembacaan workbook terenkripsi memerlukan variabel `EXCEL_PASSWORD`.

### Frontend

1. Masuk ke folder `frontend`.
2. Install dependensi: `npm install`.
3. Jalankan `npm run dev`.

Frontend tersedia di `http://localhost:3000`. Secara default, permintaan API diarahkan ke backend `http://localhost:8000`; URL dapat diubah menggunakan `VITE_API_URL`.

## Navigasi fitur

- **Overview**: ringkasan job terbaru dan pintasan fitur.
- **Upload Data**: upload Excel OS Cedant atau Infopack ke Master.
- **Mapping Rules**: melihat referensi mapping kolom dari database.
- **Master Data**: melihat data Master.
- **OSCLN Reconciliation**: upload CSV snapshot dan cocokkan dengan Master.
- **Activity Log**: melihat job dan hasil perbandingan.
- **Library**: melihat riwayat upload Master dan menghapus entry library.

Detail endpoint dan perilaku tiap alur ada di [dokumentasi kondisi saat ini](docs/CURRENT_STATUS.md).
