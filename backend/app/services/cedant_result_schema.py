import re

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


RESULT_METADATA_COLUMNS = {
    "id",
    "cedant_code",
    "class_code",
    "upload_table_id",
    "excel_row_number",
    "reporting_month",
    "reporting_year",
    "file_name",
    "sheet_name",
    "created_at",
}
RESULT_METADATA_TYPES = {
    "id": "int8",
    "cedant_code": "varchar",
    "class_code": "varchar",
    "upload_table_id": "int8",
    "excel_row_number": "int4",
    "reporting_month": "int4",
    "reporting_year": "int4",
    "file_name": "text",
    "sheet_name": "text",
    "created_at": "timestamptz",
}
FIELD_SQL_TYPES = {
    "text": ("TEXT", {"text", "varchar"}),
    "string": ("TEXT", {"text", "varchar"}),
    "date": ("DATE", {"date"}),
    "decimal": ("NUMERIC(30, 2)", {"numeric"}),
    "numeric": ("NUMERIC(30, 2)", {"numeric"}),
    "integer": ("INTEGER", {"int4"}),
    "int": ("INTEGER", {"int4"}),
}
REQUIRED_FOREIGN_KEYS = {
    ("cedant_code", "rekonsiliasi", "master_oscedant_code", "cedant_code"),
    ("upload_table_id", "rekonsiliasi", "upload_table", "table_id"),
}


def result_table_name(short_name: str, dataset_type: str = "OS CEDANT") -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (short_name or "").lower()).strip("_")
    prefix = (
        "os_claim_infopack"
        if dataset_type.strip().upper() in {"INFOPACK", "INFO_PACK", "INFO-PACK"}
        else "os_claim_cedant"
    )
    name = f"{prefix}_{slug}"
    if not slug or len(name) > 63:
        raise HTTPException(
            status_code=422,
            detail=f"Nama cedant '{short_name}' tidak dapat digunakan untuk nama tabel hasil.",
        )
    return name


def infopack_result_table_name(short_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (short_name or "").lower()).strip("_")
    name = f"os_infopack_{slug}"
    if not slug or len(name) > 63:
        raise HTTPException(
            status_code=422,
            detail=f"Nama cedant '{short_name}' tidak dapat digunakan untuk nama tabel hasil Infopack.",
        )
    return name


def result_column_name(
    field_name: str,
    source_header: str,
    first_mapping_headers: dict[str, str] | None = None,
) -> str:
    canonical_field = {
        "doc_no": "loss_ref",
    }.get(field_name, field_name)
    return (first_mapping_headers or {}).get(canonical_field) or source_header


def sql_type_for_field(data_type: str) -> tuple[str, set[str]]:
    try:
        return FIELD_SQL_TYPES[data_type.strip().lower()]
    except KeyError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Tipe field hasil cedant belum didukung: {data_type!r}.",
        ) from exc


def _quoted_table(db: Session, table_name: str) -> str:
    preparer = db.get_bind().dialect.identifier_preparer
    return f"{preparer.quote_schema('hasil_rekonsiliasi')}.{preparer.quote(table_name)}"


def _table_columns(db: Session, table_name: str) -> dict[str, dict]:
    rows = db.execute(
        text(
            "SELECT column_name, udt_name, is_nullable, is_identity, column_default "
            "FROM information_schema.columns "
            "WHERE table_schema = 'hasil_rekonsiliasi' AND table_name = :table_name"
        ),
        {"table_name": table_name},
    ).mappings()
    return {row["column_name"]: dict(row) for row in rows}


def resolve_result_columns(
    db: Session,
    *,
    table_name: str,
    cedant_code: str,
    mapping: dict[str, str],
    catalog: list[dict],
    dataset_type: str = "OS CEDANT",
) -> dict[str, str]:
    """Keep each cedant's first mapped header as the result column for that field."""
    normalized_dataset_type = str(dataset_type).strip().upper()
    if normalized_dataset_type in {"INFOPACK", "INFO_PACK", "INFO-PACK"}:
        mapping_table = "master_mapping_column_infopack"
        normalized_dataset_type = "INFOPACK"
    else:
        mapping_table = "master_mapping_column"
        normalized_dataset_type = "OS CEDANT"

    source_fields: dict[str, list[str]] = {}
    for field_name, source_header in mapping.items():
        if (
            not source_header
            or field_name == "class_code"
            or (normalized_dataset_type == "INFOPACK" and field_name == "cob")
        ):
            continue
        source_key = str(source_header).strip().casefold()
        source_fields.setdefault(source_key, []).append(field_name)
    for source_key, field_names in source_fields.items():
        if len(set(field_names)) > 1:
            labels = ", ".join(sorted(set(field_names)))
            source_label = next(
                str(source_header).strip()
                for field_name, source_header in mapping.items()
                if str(source_header).strip().casefold() == source_key
            )
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Header sumber '{source_label}' dipetakan ke lebih dari satu field: "
                    f"{labels}. Setiap field harus menggunakan header Excel yang berbeda."
                ),
            )

    table_exists = db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'hasil_rekonsiliasi' AND table_name = :table_name)"
        ),
        {"table_name": table_name},
    ).scalar_one()
    existing_columns = _table_columns(db, table_name) if table_exists else {}

    history = db.execute(
        text(
            "SELECT f.field_name, m.header_name "
            f"FROM rekonsiliasi.{mapping_table} m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type "
            "AND f.default_source = 'column' "
            "AND m.header_name IS NOT NULL "
            "ORDER BY m.mapping_version ASC, m.column_index ASC NULLS LAST, "
            "m.mapping_id ASC"
        ),
        {"cedant_code": cedant_code, "dataset_type": normalized_dataset_type},
    ).mappings()
    first_mapping_headers: dict[str, str] = {}
    for row in history:
        canonical_field = row["field_name"]
        if normalized_dataset_type != "INFOPACK":
            canonical_field = {
                "doc_no": "loss_ref",
                "title": "insured",
            }.get(canonical_field, canonical_field)
        first_mapping_headers.setdefault(canonical_field, row["header_name"])

    fields = {
        field["field_name"]: field
        for field in catalog
        if field.get("default_source") == "column"
    }
    resolved: dict[str, str] = {}
    destination_fields: dict[str, str] = {}
    for field_name, source_header in mapping.items():
        if (
            not source_header
            or field_name == "class_code"
            or (normalized_dataset_type == "INFOPACK" and field_name == "cob")
        ):
            continue
        canonical_field = field_name
        if normalized_dataset_type != "INFOPACK":
            canonical_field = {
                "doc_no": "loss_ref",
                "title": "insured",
            }.get(canonical_field, canonical_field)
        field = fields.get(canonical_field)
        if not field:
            raise HTTPException(
                status_code=422,
                detail=f"Field mapping '{field_name}' tidak memiliki definisi kolom hasil.",
            )

        result_header = result_column_name(
            field_name,
            source_header,
            first_mapping_headers,
        )
        if len(result_header) > 63 or result_header.casefold() in {
            name.casefold() for name in RESULT_METADATA_COLUMNS
        }:
            raise HTTPException(
                status_code=422,
                detail=f"Header hasil '{result_header}' tidak dapat digunakan.",
            )
        if (
            table_exists
            and result_header not in existing_columns
            and normalized_dataset_type != "INFOPACK"
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Kolom hasil pertama '{result_header}' untuk field "
                    f"'{canonical_field}' belum tersedia di "
                    f"hasil_rekonsiliasi.{table_name}; tidak dibuat kolom baru."
                ),
            )
        previous_field = destination_fields.get(result_header)
        if previous_field and previous_field != canonical_field:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Kolom hasil '{result_header}' digunakan oleh lebih dari "
                    "satu field mapping."
                ),
            )
        destination_fields[result_header] = canonical_field
        resolved[field_name] = result_header

    return resolved


def _has_unique_upload_row(db: Session, table_name: str) -> bool:
    rows = db.execute(
        text(
            "SELECT tc.constraint_name, kcu.column_name "
            "FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu "
            "ON tc.constraint_schema = kcu.constraint_schema "
            "AND tc.table_name = kcu.table_name "
            "AND tc.constraint_name = kcu.constraint_name "
            "WHERE tc.table_schema = 'hasil_rekonsiliasi' "
            "AND tc.table_name = :table_name AND tc.constraint_type = 'UNIQUE'"
        ),
        {"table_name": table_name},
    ).mappings()
    by_name: dict[str, set[str]] = {}
    for row in rows:
        by_name.setdefault(row["constraint_name"], set()).add(row["column_name"])
    return any(
        columns == {"upload_table_id", "excel_row_number"}
        for columns in by_name.values()
    )


def _foreign_keys(db: Session, table_name: str) -> set[tuple[str, str, str, str]]:
    rows = db.execute(
        text(
            "SELECT source_column.attname, target_schema.nspname, target_table.relname, "
            "target_column.attname "
            "FROM pg_constraint constraint_row "
            "JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid "
            "JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace "
            "JOIN pg_class target_table ON target_table.oid = constraint_row.confrelid "
            "JOIN pg_namespace target_schema ON target_schema.oid = target_table.relnamespace "
            "JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY "
            "AS source_key(attnum, ordinal) ON TRUE "
            "JOIN pg_attribute source_column ON source_column.attrelid = source_table.oid "
            "AND source_column.attnum = source_key.attnum "
            "JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY "
            "AS target_key(attnum, ordinal) ON target_key.ordinal = source_key.ordinal "
            "JOIN pg_attribute target_column ON target_column.attrelid = target_table.oid "
            "AND target_column.attnum = target_key.attnum "
            "WHERE constraint_row.contype = 'f' "
            "AND source_schema.nspname = 'hasil_rekonsiliasi' "
            "AND source_table.relname = :table_name"
        ),
        {"table_name": table_name},
    )
    return {tuple(row) for row in rows}


def _create_table(
    db: Session,
    table_name: str,
    source_columns: dict[str, dict],
) -> None:
    preparer = db.get_bind().dialect.identifier_preparer
    quote = preparer.quote
    constraints = [
        f"CONSTRAINT {quote(f'fk_{table_name[:40]}_cedant')} "
        "FOREIGN KEY (cedant_code) "
        "REFERENCES rekonsiliasi.master_oscedant_code (cedant_code)",
        f"CONSTRAINT {quote(f'fk_{table_name[:40]}_upload')} "
        "FOREIGN KEY (upload_table_id) "
        "REFERENCES rekonsiliasi.upload_table (table_id)",
        f"CONSTRAINT {quote(f'uq_{table_name[:44]}_upload_row')} "
        "UNIQUE (upload_table_id, excel_row_number)",
    ]
    columns = [
        '"id" BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
        '"cedant_code" VARCHAR(50) NOT NULL',
        '"class_code" VARCHAR(50)',
        '"upload_table_id" BIGINT NOT NULL',
        '"excel_row_number" INTEGER NOT NULL',
    ]
    columns.extend(
        f"{quote(header)} {details['sql_type']}"
        for header, details in source_columns.items()
    )
    columns.extend(
        [
            '"reporting_month" INTEGER NOT NULL',
            '"reporting_year" INTEGER NOT NULL',
            '"file_name" TEXT NOT NULL',
            '"sheet_name" TEXT NOT NULL',
            '"created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ]
    )
    db.execute(
        text(
            f"CREATE TABLE {_quoted_table(db, table_name)} "
            f"({', '.join(columns + constraints)})"
        )
    )


def ensure_result_table(
    db: Session,
    *,
    table_name: str,
    mapping: dict[str, str],
    catalog: list[dict],
    dataset_type: str = "OS CEDANT",
) -> None:
    schema_exists = db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata "
            "WHERE schema_name = 'hasil_rekonsiliasi')"
        )
    ).scalar_one()
    if not schema_exists:
        raise HTTPException(
            status_code=422,
            detail="Schema hasil_rekonsiliasi tidak tersedia untuk tabel hasil cedant.",
        )

    fields = {
        field["field_name"]: field
        for field in catalog
        if field.get("default_source") == "column"
    }
    if dataset_type.strip().upper() in {"INFOPACK", "INFO_PACK", "INFO-PACK"}:
        fields.setdefault(
            "cob",
            {
                "field_name": "cob",
                "default_source": "column",
                "data_type": "text",
            },
        )
    source_columns = {}
    for raw_field, header in mapping.items():
        if not header or raw_field == "class_code":
            continue
        field_name = raw_field
        if table_name.startswith("os_claim_cedant_"):
            field_name = {
                "doc_no": "loss_ref",
                "title": "insured",
            }.get(field_name, field_name)
        result_header = result_column_name(field_name, header)
        field = fields.get(field_name)
        if not field:
            raise HTTPException(
                status_code=422,
                detail=f"Field mapping '{raw_field}' tidak memiliki definisi kolom di master_field.",
            )
        if len(result_header) > 63 or result_header.casefold() in {
            name.casefold() for name in RESULT_METADATA_COLUMNS
        }:
            raise HTTPException(
                status_code=422,
                detail=f"Header sumber '{result_header}' tidak dapat dipakai sebagai kolom hasil.",
            )
        sql_type, compatible_types = sql_type_for_field(field["data_type"])
        existing = source_columns.get(result_header)
        if existing and existing["sql_type"] != sql_type:
            raise HTTPException(
                status_code=422,
                detail=f"Kolom hasil '{result_header}' dipetakan ke tipe data yang berbeda.",
            )
        source_columns[result_header] = {
            "sql_type": sql_type,
            "compatible_types": compatible_types,
        }

    if not source_columns:
        return

    table_exists = db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'hasil_rekonsiliasi' AND table_name = :table_name)"
        ),
        {"table_name": table_name},
    ).scalar_one()
    if not table_exists:
        _create_table(db, table_name, source_columns)

    columns = _table_columns(db, table_name)
    missing_metadata = RESULT_METADATA_COLUMNS - columns.keys()
    if missing_metadata:
        raise HTTPException(
            status_code=422,
            detail=(
                f"hasil_rekonsiliasi.{table_name} tidak memiliki metadata wajib: "
                + ", ".join(sorted(missing_metadata))
            ),
        )
    for name, expected_udt in RESULT_METADATA_TYPES.items():
        if columns[name]["udt_name"] != expected_udt:
            raise HTTPException(
                status_code=422,
                detail=f"Jenis metadata hasil {table_name}.{name} tidak cocok.",
            )
    required_non_null = RESULT_METADATA_COLUMNS - {"class_code"}
    if any(columns[name]["is_nullable"] != "NO" for name in required_non_null):
        raise HTTPException(
            status_code=422,
            detail=f"Metadata wajib hasil_rekonsiliasi.{table_name} harus NOT NULL.",
        )
    if (
        columns["id"]["is_identity"] != "YES"
        and not columns["id"]["column_default"]
    ) or not columns["created_at"]["column_default"]:
        raise HTTPException(
            status_code=422,
            detail=f"ID/timestamp default hasil_rekonsiliasi.{table_name} tidak tersedia.",
        )

    for header, details in source_columns.items():
        column = columns.get(header)
        if column is None:
            db.execute(
                text(
                    f"ALTER TABLE {_quoted_table(db, table_name)} "
                    f"ADD COLUMN {db.get_bind().dialect.identifier_preparer.quote(header)} "
                    f"{details['sql_type']}"
                )
            )
        elif column["udt_name"] not in details["compatible_types"]:
            raise HTTPException(
                status_code=422,
                detail=f"Jenis kolom hasil {table_name}.{header} tidak cocok.",
            )

    if not _has_unique_upload_row(db, table_name):
        raise HTTPException(
            status_code=422,
            detail=(
                f"hasil_rekonsiliasi.{table_name} belum memiliki unique "
                "(upload_table_id, excel_row_number); jalankan skrip provisioning."
            ),
        )
    missing_fks = REQUIRED_FOREIGN_KEYS - _foreign_keys(db, table_name)
    if missing_fks:
        raise HTTPException(
            status_code=422,
            detail=(
                f"hasil_rekonsiliasi.{table_name} belum memiliki foreign key provenance; "
                "jalankan skrip provisioning."
            ),
        )
