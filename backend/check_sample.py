from app.models.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Cari tabel hasil_rekonsiliasi untuk LA059 / askrindo
    tables = conn.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'hasil_rekonsiliasi'
        AND table_name LIKE '%askrindo%'
        OR table_name LIKE '%kredit%'
        ORDER BY table_name
    """)).fetchall()
    print("Tabel LA059 di hasil_rekonsiliasi:")
    for t in tables:
        tname = t[0]
        # cek isinya
        count = conn.execute(text(
            f'SELECT COUNT(*) FROM hasil_rekonsiliasi."{tname}"'
        )).scalar()
        months = conn.execute(text(
            f'SELECT DISTINCT reporting_month, reporting_year, cedant_code '
            f'FROM hasil_rekonsiliasi."{tname}" ORDER BY reporting_year, reporting_month'
        )).fetchall()
        print(f"\n  {tname} ({count} rows)")
        for m in months:
            print(f"    cedant={m[2]}  bulan={m[0]}/{m[1]}")
