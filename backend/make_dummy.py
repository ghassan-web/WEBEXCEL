"""
Dummy Excel untuk LA059 (PT ASURANSI KREDIT INDONESIA)
Kolom: DLA/PLA | Insured | DOL | Piutang sd 2026 | Curr

File yang dibuat:
  dummy_la059_v1.xlsx  → 5 baris, outstanding LAMA  (upload sebagai bulan Oktober 2026)
  dummy_la059_v2.xlsx  → 5 baris sama + 1 baru, outstanding BARU  (upload SAMA bulan Oktober 2026 → harus REPLACE)
  dummy_la059_v3.xlsx  → sama persis dengan v1  (upload bulan NOVEMBER 2026 → harus APPEND)
"""
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment
import os

SHEET    = "Sheet1"
HEADERS  = ["DLA/PLA", "Insured", "DOL", "Piutang sd 2026", "Curr"]

DATA_V1 = [
    ["DLA/TEST/001", "PT MAJU BERSAMA",       "15/01/2024", 1_000_000, "IDR"],
    ["DLA/TEST/002", "PT SEJAHTERA ABADI",    "20/02/2024", 2_500_000, "IDR"],
    ["DLA/TEST/003", "PT CAHAYA NUSANTARA",   "10/03/2024",   500_000, "IDR"],
    ["DLA/TEST/004", "PT DAMAI MAKMUR",       "05/04/2024", 3_200_000, "IDR"],
    ["DLA/TEST/005", "PT EMAS PRATAMA",       "12/05/2024",   750_000, "IDR"],
]

# v2: doc_no SAMA, outstanding BERUBAH + 1 baris baru → upload bulan sama = REPLACE
DATA_V2 = [
    ["DLA/TEST/001", "PT MAJU BERSAMA",       "15/01/2024", 1_200_000, "IDR"],  # ← naik
    ["DLA/TEST/002", "PT SEJAHTERA Abadi",    "20/02/2024", 2_000_000, "IDR"],  # ← turun
    ["DLA/TEST/003", "PT CAHAYA NUSANTARA",   "10/03/2024",   500_000, "IDR"],  # ← sama
    ["DLA/TEST/004", "PT DAMAI MAKMUR",       "05/04/2024", 3_500_000, "IDR"],  # ← naik
    ["DLA/TEST/005", "PT EMAS PRATAMA",       "12/05/2024",   900_000, "IDR"],  # ← naik
    ["DLA/TEST/006", "PT FORTUNA BARU",       "01/06/2024", 4_000_000, "IDR"],  # ← BARU
]

# v3: sama persis dengan v1 → upload bulan beda = APPEND
DATA_V3 = DATA_V1[:]

TEAL = PatternFill("solid", fgColor="1E6E6E")

def make_excel(filename, data):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = SHEET
    for col, h in enumerate(HEADERS, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = TEAL
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center")
    for ri, row in enumerate(data, 2):
        for ci, val in enumerate(row, 1):
            ws.cell(row=ri, column=ci, value=val)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = max(len(str(c.value or "")) for c in col) + 4
    path = os.path.join(os.path.dirname(__file__), filename)
    wb.save(path)
    print(f"✅ {filename}")

make_dummy = lambda: (
    make_excel("dummy_la059_v1.xlsx", DATA_V1),
    make_excel("dummy_la059_v2.xlsx", DATA_V2),
    make_excel("dummy_la059_v3.xlsx", DATA_V3),
)
make_dummy()

print("""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SKENARIO TEST:

TEST 1 — REPLACEMENT (bulan sama)
  1. Upload dummy_la059_v1.xlsx  → cedant LA059, bulan Oktober 2026
     Expected: rows_appended=5, rows_updated=0

  2. Upload dummy_la059_v2.xlsx  → cedant LA059, bulan Oktober 2026 (SAMA)
     Expected: rows_updated=5, rows_appended=1 (DLA/TEST/006 baru)

  3. Cek Master → filter LA059
     DLA/TEST/001 outstanding harus 1.200.000 (bukan 1.000.000)
     DLA/TEST/006 harus muncul

TEST 2 — APPEND (bulan beda)
  4. Upload dummy_la059_v3.xlsx  → cedant LA059, bulan November 2026 (BEDA)
     Expected: rows_appended=5 (semua insert baru, bulan beda)

  5. Cek Master → filter LA059
     DLA/TEST/001 sekarang ada 2 baris: Oktober & November 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
