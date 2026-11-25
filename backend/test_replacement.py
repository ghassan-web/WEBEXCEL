"""
Test replacement & append logic langsung ke DB.
python test_replacement.py
"""
from app.models.database import engine
from sqlalchemy import text

CC  = "TEST_REPL"
DOC = "DOC-DUMMY-99999"

def cleanup(conn):
    conn.execute(text("DELETE FROM rekonsiliasi.master_os_cedant_web WHERE cedant_code = :cc"), {"cc": CC})
    conn.commit()

def show(conn, label):
    rows = conn.execute(text(
        "SELECT doc_no, outstanding, month, year FROM rekonsiliasi.master_os_cedant_web "
        "WHERE cedant_code = :cc ORDER BY month, doc_no"
    ), {"cc": CC}).fetchall()
    print(f"\n{label} ({len(rows)} baris):")
    for r in rows:
        print(f"  doc={r[0]:<20} os={str(r[1]):>12}  bulan={r[2]}/{r[3]}")

def insert(conn, doc, outstanding, month, year):
    conn.execute(text(
        "INSERT INTO rekonsiliasi.master_os_cedant_web "
        "(cedant_code, doc_no, outstanding, currency, dol, month, year, file_name, sheet_name) "
        "VALUES (:cc, :doc, :os, 'IDR', '2024-01-01', :m, :y, 'v1.xlsx', 'Sheet1')"
    ), {"cc": CC, "doc": doc, "os": outstanding, "m": month, "y": year})
    conn.commit()

with engine.connect() as conn:
    cleanup(conn)

    # === SETUP: data awal Oktober & November ===
    insert(conn, DOC,       1_000_000, 10, 2026)   # Oktober, os lama
    insert(conn, DOC+"-B",  2_000_000, 10, 2026)   # Oktober, doc lain
    insert(conn, DOC,       1_000_000, 11, 2026)   # November, bulan beda
    show(conn, "AWAL (Oktober + November)")

    # === TEST 1: UPDATE bulan Oktober (harus replace Oktober, November tidak tersentuh) ===
    conn.execute(text(
        "UPDATE rekonsiliasi.master_os_cedant_web SET outstanding = 9_999_999 "
        "WHERE cedant_code = :cc AND doc_no = :doc AND month = 10 AND year = 2026"
    ), {"cc": CC, "doc": DOC})
    conn.commit()
    show(conn, "Setelah UPDATE Oktober")

    rows = conn.execute(text(
        "SELECT month, outstanding FROM rekonsiliasi.master_os_cedant_web "
        "WHERE cedant_code = :cc AND doc_no = :doc ORDER BY month"
    ), {"cc": CC, "doc": DOC}).fetchall()

    okt_os = next((r[1] for r in rows if r[0] == 10), None)
    nov_os = next((r[1] for r in rows if r[0] == 11), None)

    print("\n🔍 VALIDASI:")
    print(f"  {'✅' if float(okt_os or 0) == 9_999_999 else '❌'} Oktober outstanding = {okt_os} (harusnya 9.999.999 — REPLACED)")
    print(f"  {'✅' if float(nov_os or 0) == 1_000_000 else '❌'} November outstanding = {nov_os} (harusnya 1.000.000 — TIDAK TERSENTUH)")
    print(f"  {'✅' if len(rows) == 2 else '❌'} Total baris DOC = {len(rows)} (harusnya 2: Oktober + November)")

    cleanup(conn)
    print("\n✅ Test selesai.")
