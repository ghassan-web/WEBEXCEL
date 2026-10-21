# ExcelCompare — Komparasi Data Reasuransi

Aplikasi web untuk membandingkan dua file Excel secara otomatis berdasarkan **Primary Key**,  
menampilkan perbedaan baris (berubah, hanya di File A, hanya di File B, identik),  
dan menghasilkan laporan Excel berwarna yang bisa diunduh.

---

## Stack

| Layer    | Teknologi                        |
|----------|----------------------------------|
| Frontend | React 18 + Vite + Tailwind CSS 3 |
| Backend  | Python 3.11 + FastAPI            |
| Database | MySQL (Laragon) via SQLAlchemy   |
| Excel    | pandas + openpyxl                |

---

## Struktur Proyek

```
WEBexcel/
├── backend/
│   ├── app/
│   │   ├── main.py             ← FastAPI entry point
│   │   ├── models/             ← SQLAlchemy models & DB session
│   │   ├── routers/            ← API route handlers
│   │   └── services/           ← Business logic (excel diff, report gen)
│   ├── uploads/                ← Temp folder (tidak dipakai, file diproses in-memory)
│   ├── schema.sql              ← SQL DDL untuk Laragon
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/         ← FileDropZone, SummaryCards, ResultTable, HistoryTable, Navbar
    │   ├── pages/              ← ComparePage, HistoryPage
    │   ├── hooks/              ← useCompare.js
    │   ├── services/           ← api.js
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── .env.example
```

---

## Cara Menjalankan

### 1. Persiapkan Database (Laragon)

1. Buka **phpMyAdmin** di Laragon (`http://localhost/phpmyadmin`)
2. Import atau jalankan isi file `backend/schema.sql`
3. Database `excel_compare` dan kedua tabelnya akan terbuat otomatis

### 2. Backend (FastAPI)

```bash
cd backend

# Buat virtual environment
python -m venv venv
venv\Scripts\activate        # Windows

# Install dependencies
pip install -r requirements.txt

# Buat file .env
copy .env.example .env
# Edit .env: sesuaikan DATABASE_URL jika password MySQL berbeda

# Jalankan server
uvicorn app.main:app --reload --port 8000
```

Backend akan berjalan di **http://localhost:8000**  
Dokumentasi API: **http://localhost:8000/docs**

> Catatan: Tabel akan dibuat otomatis oleh SQLAlchemy saat server pertama kali dijalankan.  
> Tapi lebih aman jalankan `schema.sql` terlebih dahulu di phpMyAdmin.

### 3. Frontend (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Buat file .env
copy .env.example .env

# Jalankan dev server
npm run dev
```

Frontend akan berjalan di **http://localhost:3000**

---

## API Endpoints

| Method | URL                                    | Deskripsi                          |
|--------|----------------------------------------|------------------------------------|
| POST   | `/api/compare/upload`                  | Upload 2 file + proses komparasi   |
| POST   | `/api/compare/sheets`                  | Ambil daftar sheet dari 1 file     |
| GET    | `/api/compare/jobs`                    | Daftar semua job (paginated)       |
| GET    | `/api/compare/jobs/{id}`               | Detail satu job                    |
| GET    | `/api/compare/jobs/{id}/results`       | Hasil per baris (paginated+filter) |
| GET    | `/api/compare/jobs/{id}/download`      | Download laporan Excel             |

---

## Alur Kerja

```
User → Isi form (Bulan, Tahun, Tipe, Primary Key)
     → Upload File A & File B
     → Klik "Bandingkan Data"
     → Frontend POST ke /api/compare/upload
     → Backend:
         1. Baca kedua file dengan pandas
         2. Outer-join berdasarkan Primary Key
         3. Identifikasi: matched / changed / only_in_a / only_in_b
         4. Simpan metadata ke comparison_jobs (MySQL)
         5. Simpan detail per baris ke comparison_results (MySQL)
         6. Return summary JSON
     → Frontend tampilkan Summary Cards + Tabel Detail
     → User bisa filter per kategori & Download laporan Excel
```

---

## Laporan Excel (Download)

File hasil download berisi **4 sheet**:

| Sheet             | Isi                                      |
|-------------------|------------------------------------------|
| Summary           | Metadata job + ringkasan jumlah baris    |
| Semua Data        | Semua baris hasil komparasi              |
| Berubah           | Hanya baris yang ada perubahan nilai     |
| Hanya di File A   | Baris yang hilang di File B              |
| Hanya di File B   | Baris baru yang tidak ada di File A      |

Warna baris:
- 🟢 Hijau = Matched
- 🟡 Kuning = Changed (sel yang berubah ditandai merah)
- 🔴 Merah = Only in File A
- 🔵 Biru = Only in File B
