from sqlalchemy import text

from app.models.database import engine


TABLE_COLUMNS = {
    "master_os_cedant_web": [
        ("class_code", "VARCHAR(50)"),
        ("upload_batch_id", "BIGINT"),
        ("created_at", "TIMESTAMPTZ"),
    ],
    "master_os_infopack_web": [
        ("dol", "DATE"),
        ("cob", "VARCHAR(100)"),
        ("gross", "NUMERIC(30, 2)"),
        ("tsi", "NUMERIC(30, 2)"),
        ("upload_batch_id", "BIGINT"),
        ("created_at", "TIMESTAMPTZ"),
    ],
    "upload_jobs": [
        ("batch_id", "BIGINT"),
    ],
}


def run():
    with engine.begin() as conn:
        for table, columns in TABLE_COLUMNS.items():
            for column, data_type in columns:
                exists = conn.execute(
                    text(
                        "SELECT EXISTS ("
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_schema = current_schema() "
                        "AND table_name = :table AND column_name = :column"
                        ")"
                    ),
                    {"table": table, "column": column},
                ).scalar()
                if exists:
                    print(f"SKIP {table}.{column}")
                    continue
                if column == "created_at":
                    definition = f"{data_type} NOT NULL DEFAULT now()"
                elif column in {"upload_batch_id", "batch_id"}:
                    definition = f"{data_type} REFERENCES upload_batch(batch_id)"
                else:
                    definition = f"{data_type} NULL"
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                print(f"OK   {table}.{column}")


if __name__ == "__main__":
    run()
