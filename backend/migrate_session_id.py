"""
One-time migration: add session_id column + index to the four tables.
Compatible with MySQL 5.7+ (does NOT use IF NOT EXISTS on ALTER).
Safe to run multiple times — checks INFORMATION_SCHEMA before altering.
"""
from app.models.database import engine
from sqlalchemy import text


def column_exists(conn, table: str, column: str, db: str) -> bool:
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl AND COLUMN_NAME = :col"
        ),
        {"db": db, "tbl": table, "col": column},
    ).scalar()
    return row > 0


def index_exists(conn, table: str, index: str, db: str) -> bool:
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
            "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl AND INDEX_NAME = :idx"
        ),
        {"db": db, "tbl": table, "idx": index},
    ).scalar()
    return row > 0


TABLES = [
    "comparison_jobs",
    "upload_jobs",
    "master_data",
    "oscln_snapshots",
]

INDEX_NAMES = {
    "comparison_jobs":  "idx_cj_session",
    "upload_jobs":      "idx_uj_session",
    "master_data":      "idx_md_session",
    "oscln_snapshots":  "idx_os_session",
}


def run():
    # Derive DB name from the URL
    url = str(engine.url)
    db_name = url.split("/")[-1].split("?")[0]
    print(f"Database: {db_name}\n")

    with engine.connect() as conn:
        for table in TABLES:
            # ── Add column ──────────────────────────────────────────────────
            if column_exists(conn, table, "session_id", db_name):
                print(f"  SKIP {table}.session_id already exists")
            else:
                conn.execute(text(
                    f"ALTER TABLE `{table}` "
                    f"ADD COLUMN session_id VARCHAR(36) NULL "
                    f"COMMENT 'Browser session UUID' AFTER id"
                ))
                conn.commit()
                print(f"  OK   {table}.session_id added")

            # ── Add index ───────────────────────────────────────────────────
            idx = INDEX_NAMES[table]
            if index_exists(conn, table, idx, db_name):
                print(f"  SKIP {table}.{idx} already exists")
            else:
                conn.execute(text(
                    f"ALTER TABLE `{table}` ADD INDEX `{idx}` (session_id)"
                ))
                conn.commit()
                print(f"  OK   {table}.{idx} added")

    print("\nMigration selesai.")


if __name__ == "__main__":
    run()
