"""
Router: /api/master
Handles single-file upload → append to Master, and Master data retrieval.
All endpoints are scoped to the caller's session_id (X-Session-ID header).
The export endpoint accepts session_id as a query param (window.location.href workaround).

Target tables:
  - master_os_cedant_web   → tipe_data contains "OS Cedant" (default)
  - master_os_infopack_web → tipe_data contains "infopack"
"""
import json
import logging
import re
from datetime import date, datetime
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models import (
    get_db, get_session_id,
    UploadJob, MasterOsCedant, MasterOsInfopack,
    ScannedSchema, MasterRawRow,
)
from ..services.excel_service import (
    ingest_excel, ingest_kbins, inspect_excel_workbook, KBINS_TIPE_DATA,
)

router = APIRouter(prefix="/api/master", tags=["master"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

CEDANT_TABLE   = "master_os_cedant_web"
INFOPACK_TABLE = "master_os_infopack_web"
INFOPACK_TIPE_KEYWORDS = ("infopack", "info_pack", "info-pack")


def _target_table(tipe_data: str) -> str:
    td = (tipe_data or "").lower()
    for kw in INFOPACK_TIPE_KEYWORDS:
        if kw in td:
            return INFOPACK_TABLE
    return CEDANT_TABLE


def _columns_for(table: str) -> list:
    if table == INFOPACK_TABLE:
        return ["cedant_code", "class_code", "title", "value",
                "row_index", "month", "year", "file_name", "sheet_name"]
    return ["cedant_code", "doc_no", "dol", "outstanding",
            "currency", "month", "year", "file_name", "sheet_name"]


OUTSTANDING_PATTERNS = (
    r"^Orig Currency Amt$", r"^Amount_Net_OS$", r"^outstanding$",
    r"^net_outstanding$", r"^OS$", r"^net_os$", r"^R/I Share Amount$",
    r"^Remain OS", r"^Outstanding Claim$", r"^Sum of Outstanding$",
    r"^RENDO SHARE$", r"^NET BALANCE$", r"^NET_AMT$",
    r"^Saldo Akhir Tagih$", r"^AMOUNT$", r"outstanding|balance",
)
DOL_PATTERNS = (
    r"^Trans Desc/DOL$", r"^DOL$", r"^DOL \(Date of Loss\)$",
    r"^DATE OF LOSS$", r"^Date of Loss$", r"^date_of_loss$",
    r"^loss_date$", r"^Tgl\. DOL$", r"^DOCL$", r"^Loss Date$",
    r"^D\.O\.L$", r"^LossClaim$", r"^tg_kejadian$",
    r"date.*loss|loss.*date|\bdol\b",
)
CURRENCY_PATTERNS = (
    r"^Currency$", r"^Curr$", r"^curr$", r"^Mata Uang$",
    r"^currency$", r"^CCY$", r"^ccy$",
)
DOC_NO_PATTERNS = (r"doc.*no", r"ref.*no", r"claim.*no", r"^no$", r"nomor",)
CLASS_CODE_PATTERNS = (
    r"^Class Code$", r"^class_code$", r"^classcode$", r"class.*code",
)
INSURED_PATTERNS = (
    r"^Insured$", r"^Insured Name$", r"^Tertanggung$",
    r"^Nama Tertanggung$", r"insured|tertanggung",
)
VALUE_PATTERNS = (
    r"^Gross$", r"^Gross Premium$", r"^Gross Amount$",
    r"^Value$", r"^value$", r"gross|value",
)


def _find(data: dict, *patterns) -> str:
    for pat in patterns:
        for k, v in data.items():
            if re.search(pat, k, re.IGNORECASE):
                val = str(v).strip() if v is not None else ""
                if val and val.lower() not in ("", "nan", "none", "-"):
                    return val
    return ""


def _parse_number(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "-", "n/a"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    s = s.replace(" ", "").replace("\u00a0", "").replace("Rp", "").replace("$", "")
    has_comma, has_dot = "," in s, "." in s
    if has_comma and has_dot:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif has_comma:
        s = s.replace(",", "") if s.count(",") > 1 else s.replace(",", ".")
    try:
        n = float(s)
    except ValueError:
        return None
    return -n if neg else n


def _parse_dol(val) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "-", "n/a"):
        return None
    if re.fullmatch(r"\d{5}(\.\d+)?", s):
        try:
            from datetime import timedelta
            return date(1899, 12, 30) + timedelta(days=int(float(s)))
        except Exception:
            pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y",
                "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%Y/%m/%d", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        from dateutil import parser as dparser
        return dparser.parse(s, dayfirst=True).date()
    except Exception:
        return None


def _detect_file_name(original: str) -> str:
    if not original:
        return ""
    return re.split(r"[\\/]", original.strip())[-1]


def _normalize_field_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _canonical_field_name(value: str) -> str:
    normalized = _normalize_field_name(value)
    return {
        "claim_no": "doc_no",
        "claim_number": "doc_no",
        "loss_ref": "doc_no",
        "loss_reference": "doc_no",
        "date_of_loss": "dol",
        "loss_date": "dol",
        "net_outstanding": "outstanding",
        "currency_code": "currency",
    }.get(normalized, normalized)


def _normalize_mapping_value(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _load_column_mapping(db: Session, cedant_code: str, sheet_name: str) -> dict:
    """
    Load column mapping dari master_upload_column_mapping.
    Returns dict: { field_name: excel_column_name }
    Misal: { "doc_no": "DocNo", "dol": "DOL", "outstanding": "Amount_Net_OS" }

    Filtering:
    - cedant_code harus cocok
    - sheet_name harus ada di argument.sheet_names (atau sheet_names kosong = semua sheet)
    - is_active = True
    """
    if not cedant_code:
        return {}
    try:
        rows = db.execute(
            text(
                "SELECT m.excel_name, f.field_name, m.argument "
                "FROM master_upload_column_mapping m "
                "JOIN master_field f ON f.id = m.field_id "
                "WHERE m.cedant_code = :cc AND m.is_active = TRUE"
            ),
            {"cc": cedant_code},
        ).mappings().all()
    except Exception:
        return {}

    mapping = {}
    for row in rows:
        excel_name = row.get("excel_name") or ""
        field_name = _canonical_field_name(row.get("field_name") or "")
        if not excel_name or not field_name:
            continue

        argument = row.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail=f"Argument mapping untuk cedant {cedant_code} tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]

        if sheet_names and sheet_name:
            if not any(
                _normalize_mapping_value(str(sheet)) == _normalize_mapping_value(sheet_name)
                for sheet in sheet_names
            ):
                continue

        mapping[field_name] = excel_name

    return mapping


@router.get("/mappings", summary="Ambil mapping kolom aktif dari database")
def get_column_mappings(db: Session = Depends(get_db)):
    from ..models.database import DB_MODE, DB_LAST_ERROR
    try:
        rows = db.execute(
            text(
                "SELECT m.cedant_code, "
                "COALESCE(NULLIF(BTRIM(m.cedant_name), ''), c.cedant_name, m.cedant_code) AS cedant_name, "
                "m.excel_name, f.field_name, m.argument "
                "FROM master_upload_column_mapping m "
                "JOIN master_field f ON f.id = m.field_id "
                "LEFT JOIN master_oscedant_code c ON c.cedant_code = m.cedant_code "
                "WHERE m.is_active = TRUE "
                "ORDER BY cedant_name, m.cedant_code, f.field_name"
            )
        ).mappings().all()
    except Exception as exc:
        return {
            "profiles": [],
            "db_connected": False,
            "db_mode": DB_MODE,
            "db_error": DB_LAST_ERROR or str(exc),
        }

    profiles = {}
    for row in rows:
        field_name = _canonical_field_name(row.get("field_name") or "")
        excel_name = (row.get("excel_name") or "").strip()
        if not field_name or not excel_name:
            continue

        argument = row.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            argument = {}
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        sheet_names = [str(sheet).strip() for sheet in sheet_names if str(sheet).strip()]
        cedant_code = row.get("cedant_code") or ""
        cedant_name = row.get("cedant_name") or cedant_code or "—"
        key = (cedant_code, cedant_name, tuple(sorted(sheet.lower() for sheet in sheet_names)))

        if key not in profiles:
            profiles[key] = {
                "tipe_data": "OS Cedant",
                "cedant": cedant_name,
                "cedantCode": cedant_code,
                "sheetNames": sheet_names,
                "sheetMet": ", ".join(sheet_names) if sheet_names else "All sheets",
                "lossRef": "—",
                "outstanding": "—",
                "dateOfLoss": "—",
                "mapping": {},
            }

        profile = profiles[key]
        profile["mapping"][field_name] = excel_name

    result = []
    for profile in profiles.values():
        field_names = set(profile["mapping"])
        is_infopack = bool(field_names & {"class_code", "classcode", "title", "value"})
        profile["tipe_data"] = "Infopack" if is_infopack else "OS Cedant"
        profile["lossRef"] = (
            profile["mapping"].get("doc_no")
            or profile["mapping"].get("title")
            or "—"
        )
        profile["outstanding"] = (
            profile["mapping"].get("outstanding")
            or profile["mapping"].get("value")
            or "—"
        )
        profile["dateOfLoss"] = profile["mapping"].get("dol", "—")
        profile["status"] = (
            "READY"
            if (is_infopack and field_names & {"class_code", "classcode", "title"})
            or (not is_infopack and "doc_no" in field_names)
            else "INCOMPLETE"
        )
        result.append(profile)

    return {"profiles": result}


def _extract_cedant_row_with_mapping(
    r: dict,
    cedant_code: str,
    bulan: str,
    tahun: str,
    file_name: str,
    sheet_name: str,
    col_map: dict,
) -> dict:
    """
    Versi _extract_cedant_row yang menggunakan column mapping dari DB.
    col_map: { field_name: excel_column_name }
    Misal: { "doc_no": "DocNo", "dol": "DOL", "outstanding": "Amount_Net_OS" }
    """
    data = r.get("data", {})

    normalized_columns = {
        _normalize_mapping_value(str(column)): column for column in data
    }

    def mapped_value(field: str) -> str:
        excel_col = col_map.get(field)
        if not excel_col:
            return ""
        column = normalized_columns.get(_normalize_mapping_value(excel_col))
        value = data.get(column) if column is not None else None
        result = str(value).strip() if value is not None else ""
        return result if result.lower() not in ("", "nan", "none", "-") else ""

    def get_col(field: str, fallback_patterns: tuple) -> str:
        """Ambil nilai dari data menggunakan mapping atau fallback patterns."""
        value = mapped_value(field)
        if value:
            return value
        # Fallback ke pattern matching
        return _find(data, *fallback_patterns)

    # doc_no
    doc_no_raw = mapped_value("doc_no") or None
    if not doc_no_raw:
        # Fallback ke pk
        pk_raw = str(r.get("pk") or "").strip()
        if pk_raw and not _parse_dol(pk_raw):
            doc_no_raw = pk_raw

    # dol
    raw_dol = get_col("dol", DOL_PATTERNS)
    dol = _parse_dol(raw_dol) if raw_dol else None

    # outstanding
    raw_os = get_col("outstanding", OUTSTANDING_PATTERNS)
    outstanding = _parse_number(raw_os) if raw_os else None

    # currency
    currency = get_col("currency", CURRENCY_PATTERNS) or None
    if currency and len(currency) > 10:
        currency = currency[:10]

    return {
        "cedant_code": (cedant_code or "")[:50] or None,
        "doc_no":      (doc_no_raw or "")[:255] or None,
        "dol":         dol,
        "outstanding": outstanding,
        "currency":    currency,
        "month":       int(bulan) if bulan and str(bulan).isdigit() else None,
        "year":        int(tahun) if tahun and str(tahun).isdigit() else None,
        "file_name":   file_name or None,
        "sheet_name":  sheet_name or None,
    }


def _resolve_cedant_code(db: Session, cedant_name: str) -> Optional[str]:
    """
    Look up cedant_code.
    Priority:
    1. master_upload_column_mapping.cedant_name (exact) — paling akurat
    2. master_oscedant_code (exact → partial)
    """
    if not cedant_name:
        return None
    name = cedant_name.strip()
    try:
        mapping_codes = db.execute(
            text(
                "SELECT DISTINCT cedant_code FROM master_upload_column_mapping "
                "WHERE LOWER(BTRIM(cedant_name)) = LOWER(:name) "
                "AND is_active = TRUE AND cedant_code IS NOT NULL"
            ),
            {"name": name},
        ).scalars().all()
        if len(mapping_codes) == 1:
            return mapping_codes[0]

        exact_codes = db.execute(
            text(
                "SELECT DISTINCT cedant_code FROM master_oscedant_code "
                "WHERE LOWER(BTRIM(cedant_name)) = LOWER(:name) "
                "AND cedant_code IS NOT NULL"
            ),
            {"name": name},
        ).scalars().all()
        if len(exact_codes) == 1:
            return exact_codes[0]

        partial_codes = db.execute(
            text(
                "SELECT DISTINCT cedant_code FROM master_oscedant_code "
                "WHERE LOWER(cedant_name) LIKE LOWER(:pattern) AND cedant_code IS NOT NULL"
            ),
            {"pattern": f"%{name}%"},
        ).scalars().all()
        return partial_codes[0] if len(partial_codes) == 1 else None
    except Exception:
        return name


def _detect_cedant_from_mapping(db: Session, rows: list, sheet_name: str):
    """Resolve a cedant from active mappings when upload form's cedant is blank."""
    data = next((row.get("data") for row in rows if row.get("data")), {})
    headers = {_normalize_mapping_value(str(header)) for header in data}
    if not headers:
        return None, None

    try:
        mappings = db.execute(
            text(
                "SELECT m.cedant_code, m.cedant_name, m.excel_name, m.argument, f.field_name "
                "FROM master_upload_column_mapping m "
                "JOIN master_field f ON f.id = m.field_id "
                "WHERE m.is_active = TRUE AND m.cedant_code IS NOT NULL"
            )
        ).mappings().all()
    except Exception:
        return None, None

    candidates = {}
    for mapping in mappings:
        field_name = _canonical_field_name(mapping.get("field_name") or "")
        if field_name not in {"doc_no", "outstanding", "dol", "currency"}:
            continue
        excel_name = mapping.get("excel_name") or ""
        if _normalize_mapping_value(excel_name) not in headers:
            continue

        argument = mapping.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail=f"Argument mapping untuk cedant {mapping['cedant_code']} tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        if sheet_names and sheet_name and not any(
            _normalize_mapping_value(str(name)) == _normalize_mapping_value(sheet_name)
            for name in sheet_names
        ):
            continue

        code = mapping["cedant_code"]
        candidate = candidates.setdefault(
            code, {"name": mapping.get("cedant_name"), "fields": set()}
        )
        candidate["fields"].add(field_name)

    candidates = {
        code: candidate
        for code, candidate in candidates.items()
        if "doc_no" in candidate["fields"]
    }
    if not candidates:
        return None, None

    best_score = max(len(candidate["fields"]) for candidate in candidates.values())
    best = [
        (code, candidate)
        for code, candidate in candidates.items()
        if len(candidate["fields"]) == best_score
    ]
    if len(best) != 1:
        logger.warning(
            "Cedant mapping is ambiguous for sheet=%s (%s candidates)",
            sheet_name,
            len(best),
        )
        return None, None

    code, candidate = best[0]
    return code, candidate["name"]


def _extract_cedant_row(r, cedant_code, bulan, tahun, file_name, sheet_name):
    data = r.get("data", {})

    # doc_no: gunakan pk langsung (itu adalah loss ref / claim no dari kolom mapping)
    pk_raw = str(r.get("pk") or "").strip()

    # Cek apakah pk berbentuk pure tanggal (mis "2026-07-23 00:00:00" atau "23/07/2026")
    # Jika iya, coba cari doc_no dari kolom lain di data
    _is_date_pk = False
    if pk_raw:
        parsed = _parse_dol(pk_raw)
        if parsed and re.match(r"^\d{4}-\d{2}-\d{2}|^\d{2}/\d{2}/\d{4}|^\d{2}-\d{2}-\d{4}", pk_raw):
            _is_date_pk = True

    if _is_date_pk:
        # Cari dari kolom yang namanya mengandung "ref", "no", "claim" tapi BUKAN date/dol
        doc_no = None
        for k, v in data.items():
            k_lower = k.lower()
            if any(x in k_lower for x in ("ref", "claim", "doc", "invoice", "faktur", "no_berkas")):
                if not any(x in k_lower for x in ("date", "dol", "loss", "tanggal", "tgl", "kejadian")):
                    val = str(v).strip() if v is not None else ""
                    if val and val.lower() not in ("", "nan", "none", "-"):
                        # Pastikan tidak berbentuk tanggal
                        if not _parse_dol(val) or not re.match(r"^\d{4}-\d{2}-\d{2}|^\d{2}/\d{2}/\d{4}", val):
                            doc_no = val[:255]
                            break
    else:
        doc_no = pk_raw[:255] if pk_raw else None

    # dol: cari dari DOL patterns di data
    raw_dol = _find(data, *DOL_PATTERNS)
    dol = _parse_dol(raw_dol) if raw_dol else None

    # outstanding
    raw_os = _find(data, *OUTSTANDING_PATTERNS)
    outstanding = _parse_number(raw_os) if raw_os else None

    # currency
    currency = _find(data, *CURRENCY_PATTERNS) or None
    if currency and len(currency) > 10:
        currency = currency[:10]

    return {
        "cedant_code": (cedant_code or "")[:50] or None,
        "doc_no":      doc_no or None,
        "dol":         dol,
        "outstanding": outstanding,
        "currency":    currency,
        "month":       int(bulan) if bulan and str(bulan).isdigit() else None,
        "year":        int(tahun) if tahun and str(tahun).isdigit() else None,
        "file_name":   file_name or None,
        "sheet_name":  sheet_name or None,
    }


def _extract_infopack_row(
    r, cedant_code, bulan, tahun, file_name, sheet_name, row_index, col_map=None
):
    data = r.get("data", {})
    col_map = col_map or {}

    def get_col(field, fallback_patterns):
        excel_col = col_map.get(field)
        if excel_col:
            for key, value in data.items():
                if key.lower() == excel_col.lower():
                    mapped_value = str(value).strip() if value is not None else ""
                    if mapped_value and mapped_value.lower() not in ("nan", "none", "-"):
                        return mapped_value
        return _find(data, *fallback_patterns)

    class_code = get_col("class_code", CLASS_CODE_PATTERNS) or None
    if class_code and len(class_code) > 50:
        class_code = class_code[:50]
    title = get_col("title", INSURED_PATTERNS) or None
    value = get_col("value", VALUE_PATTERNS) or None
    return {
        "cedant_code": (cedant_code or "")[:50] or None,
        "class_code":  class_code,
        "title":       title,
        "value":       value,
        "row_index":   row_index,
        "month":       int(bulan) if bulan and str(bulan).isdigit() else None,
        "year":        int(tahun) if tahun and str(tahun).isdigit() else None,
        "file_name":   file_name or None,
        "sheet_name":  sheet_name or None,
    }


def _write_cedant_rows(db: Session, rows: list) -> dict:
    if not rows:
        return {"inserted": 0, "skipped": 0, "updated": 0}

    rows_with_data = [
        row for row in rows
        if any(row.get(field) not in (None, "") for field in ("doc_no", "dol", "outstanding", "currency"))
    ]
    empty_rows_skipped = len(rows) - len(rows_with_data)
    rows = rows_with_data
    if not rows:
        return {"inserted": 0, "skipped": empty_rows_skipped, "updated": 0}

    # Pisahkan rows yang punya doc_no (bisa di-dedup) vs yang tidak (selalu insert)
    rows_with_key   = [r for r in rows if r.get("doc_no")]
    rows_without_key = [r for r in rows if not r.get("doc_no")]

    # Dedup hanya untuk rows yang punya doc_no
    doc_nos = [r["doc_no"] for r in rows_with_key]
    existing: dict = {}
    if doc_nos:
        for row in (
            db.query(
                MasterOsCedant.cedant_code,
                MasterOsCedant.doc_no,
                MasterOsCedant.dol,
                MasterOsCedant.outstanding,
                MasterOsCedant.currency,
            )
            .filter(MasterOsCedant.doc_no.in_(doc_nos))
            .all()
        ):
            key = (row[0] or "", row[1] or "")
            existing.setdefault(key, []).append({
                "dol": row[2],
                "outstanding": row[3],
                "currency": row[4],
            })

    to_insert, to_update, skipped = [], [], empty_rows_skipped
    seen = set()
    for r in rows_with_key:
        key = (r.get("cedant_code") or "", r.get("doc_no") or "")
        if key in seen:
            skipped += 1
            continue
        seen.add(key)

        existing_rows = existing.get(key)
        if existing_rows:
            missing_values = {
                field: r.get(field)
                for field in ("dol", "outstanding", "currency")
                if r.get(field) is not None
                and any(
                    current.get(field) is None
                    or (field == "currency" and not str(current.get(field)).strip())
                    for current in existing_rows
                )
            }
            if missing_values:
                to_update.append({
                    "cedant_code": r.get("cedant_code"),
                    "doc_no": r.get("doc_no"),
                    **{
                        field: r.get(field)
                        for field in ("dol", "outstanding", "currency")
                    },
                })
            else:
                skipped += 1
        else:
            to_insert.append(r)

    # Rows tanpa doc_no selalu diinsert (tidak ada dedup)
    to_insert.extend(rows_without_key)

    BATCH = 1000
    for i in range(0, len(to_insert), BATCH):
        db.execute(
            text("INSERT INTO master_os_cedant_web "
                 "(cedant_code, doc_no, dol, outstanding, currency, month, year, file_name, sheet_name) "
                 "VALUES (:cedant_code, :doc_no, :dol, :outstanding, :currency, :month, :year, :file_name, :sheet_name)"),
            to_insert[i:i + BATCH],
        )
        db.commit()
    for i in range(0, len(to_update), BATCH):
        db.execute(
            text(
                "UPDATE master_os_cedant_web AS target SET "
                "dol = COALESCE(target.dol, :dol), "
                "outstanding = COALESCE(target.outstanding, :outstanding), "
                "currency = COALESCE(NULLIF(BTRIM(target.currency), ''), :currency) "
                "WHERE target.cedant_code IS NOT DISTINCT FROM :cedant_code "
                "AND target.doc_no = :doc_no"
            ),
            to_update[i:i + BATCH],
        )
        db.commit()
    return {
        "inserted": len(to_insert),
        "skipped": skipped,
        "updated": len(to_update),
    }


def _write_infopack_rows(db: Session, rows: list) -> dict:
    if not rows:
        return {"inserted": 0, "skipped": 0, "updated": 0}
    BATCH = 1000
    inserted = 0
    for i in range(0, len(rows), BATCH):
        db.execute(
            text("INSERT INTO master_os_infopack_web "
                 "(cedant_code, class_code, title, value, row_index, month, year, file_name, sheet_name) "
                 "VALUES (:cedant_code, :class_code, :title, :value, :row_index, :month, :year, :file_name, :sheet_name)"),
            rows[i:i + BATCH],
        )
        db.commit()
        inserted += len(rows[i:i + BATCH])
    return {"inserted": inserted, "skipped": 0, "updated": 0}


CEDANT_TARGET_SCHEMA = [
    {
        "dbField": "doc_no",
        "label": "Loss Ref / Document No",
        "required": True,
        "sqlType": "VARCHAR(255)",
        "description": "Nomor dokumen / referensi klaim utama (Primary Key)",
    },
    {
        "dbField": "outstanding",
        "label": "Outstanding Claim (Net OS)",
        "required": True,
        "sqlType": "NUMERIC(30, 2)",
        "description": "Nilai nominal cadangan klaim outstanding",
    },
    {
        "dbField": "dol",
        "label": "Date of Loss (DOL)",
        "required": False,
        "sqlType": "DATE",
        "description": "Tanggal terjadinya kerugian / klaim",
    },
    {
        "dbField": "currency",
        "label": "Currency (Mata Uang)",
        "required": False,
        "sqlType": "VARCHAR(10)",
        "description": "Kode mata uang klaim (IDR, USD, dll.)",
    },
]

INFOPACK_TARGET_SCHEMA = [
    {
        "dbField": "class_code",
        "label": "Class Code (COB)",
        "required": False,
        "sqlType": "VARCHAR(50)",
        "description": "Kode lini bisnis / Class of Business",
    },
    {
        "dbField": "title",
        "label": "Title / Insured / Uraian",
        "required": True,
        "sqlType": "TEXT",
        "description": "Nama tertanggung atau judul baris InfoPack",
    },
    {
        "dbField": "value",
        "label": "Value / Gross Amount",
        "required": True,
        "sqlType": "TEXT",
        "description": "Nilai angka / nominal pada laporan InfoPack",
    },
]


def _match_header_by_patterns(columns: list[str], patterns: tuple) -> str:
    for pat in patterns:
        for col in columns:
            if re.search(pat, str(col).strip(), re.IGNORECASE):
                return str(col)
    return ""


def _auto_match_headers_for_sheet(
    columns: list[str],
    is_infopack: bool,
    db_col_map: dict,
) -> dict:
    """
    Petakan daftar nama kolom Excel (`columns`) ke field utama DB.
    Prioritas:
    1. Mapping aktif dari tabel `master_upload_column_mapping` (`db_col_map`)
    2. Regex fallback patterns
    """
    lower_lookup = {str(c).strip().lower(): str(c) for c in columns}
    matched: dict[str, str] = {}

    # 1. Coba dari db_col_map terlebih dahulu
    for field_name, excel_col in (db_col_map or {}).items():
        if not excel_col:
            continue
        if "|" in str(excel_col):
            parts = [p.strip() for p in str(excel_col).split("|") if p.strip()]
            resolved_parts = [lower_lookup.get(p.lower(), "") for p in parts]
            if all(resolved_parts):
                matched[field_name] = "|".join(resolved_parts)
        else:
            found = lower_lookup.get(str(excel_col).strip().lower())
            if found:
                matched[field_name] = found

    # 2. Fallback regex untuk field yang belum terpetakan
    if is_infopack:
        if not matched.get("class_code"):
            m = _match_header_by_patterns(columns, CLASS_CODE_PATTERNS)
            if m:
                matched["class_code"] = m
        if not matched.get("title"):
            m = _match_header_by_patterns(columns, INSURED_PATTERNS + (r"title|uraian|description|nama",))
            if m:
                matched["title"] = m
        if not matched.get("value"):
            m = _match_header_by_patterns(columns, VALUE_PATTERNS + OUTSTANDING_PATTERNS)
            if m:
                matched["value"] = m
    else:
        if not matched.get("doc_no"):
            m = _match_header_by_patterns(columns, (r"^DocNo$", r"^Doc No$", r"^Loss Ref$",) + DOC_NO_PATTERNS)
            if m:
                matched["doc_no"] = m
        if not matched.get("outstanding"):
            m = _match_header_by_patterns(columns, OUTSTANDING_PATTERNS)
            if m:
                matched["outstanding"] = m
        if not matched.get("dol"):
            m = _match_header_by_patterns(columns, DOL_PATTERNS)
            if m:
                matched["dol"] = m
        if not matched.get("currency"):
            m = _match_header_by_patterns(columns, CURRENCY_PATTERNS)
            if m:
                matched["currency"] = m

    return matched


# ═══════════════════════════════════════════════════════════
# POST /api/master/inspect
# ═══════════════════════════════════════════════════════════

@router.post("/inspect", summary="Scan sheet dan seluruh header kolom dari file Excel sebelum disimpan")
async def inspect_master_excel(
    tipe_data:   Optional[str] = Form("OS Cedant"),
    cedant:      Optional[str] = Form(None),
    cedant_code: Optional[str] = Form(None),
    file:        UploadFile    = File(...),
    db:          Session       = Depends(get_db),
    session_id:  str           = Depends(get_session_id),
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx, .xls, .xlsm, atau .xlsb")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB")

    try:
        info = inspect_excel_workbook(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Failed to inspect Excel workbook")
        raise HTTPException(status_code=500, detail=f"Gagal memindai struktur file Excel: {e}")

    target_table = _target_table(tipe_data or "OS Cedant")
    is_infopack = target_table == INFOPACK_TABLE
    resolved_cedant = (cedant_code or "").strip()
    if not resolved_cedant and cedant:
        try:
            resolved_cedant = _resolve_cedant_code(db, cedant) or ""
        except Exception:
            resolved_cedant = ""
    detected_cedant_name = (cedant or "").strip()

    # Jika cedant belum dipilih, coba deteksi dari header sheet default atau nama file
    default_sheet = info.get("default_sheet") or ""
    default_cols = info.get("sheet_columns", {}).get(default_sheet, [])
    if not resolved_cedant and default_cols:
        dummy_rows = [{"pk": "", "data": {c: "1" for c in default_cols}}]
        try:
            det_code, det_name = _detect_cedant_from_mapping(db, dummy_rows, default_sheet)
            if det_code:
                resolved_cedant = det_code
                detected_cedant_name = det_name or detected_cedant_name
        except Exception:
            pass

    auto_mappings: dict[str, dict] = {}
    for sh, cols in (info.get("sheet_columns") or {}).items():
        db_col_map = {}
        if resolved_cedant:
            try:
                db_col_map = _load_column_mapping(db, resolved_cedant, sh)
            except Exception:
                db_col_map = {}
        auto_mappings[sh] = _auto_match_headers_for_sheet(cols, is_infopack, db_col_map)

    return {
        "status": "success",
        "file_name": file.filename,
        "detected_file_tag": _detect_file_name(file.filename),
        "cedant_code": resolved_cedant or None,
        "cedant_name": detected_cedant_name or None,
        "tipe_data": "Infopack" if is_infopack else "OS Cedant",
        "available_sheets": info["available_sheets"],
        "default_sheet": info["default_sheet"],
        "sheet_columns": info["sheet_columns"],
        "sheet_samples": info["sheet_samples"],
        "sheet_row_counts": info["sheet_row_counts"],
        "auto_mappings": auto_mappings,
        "target_schema": INFOPACK_TARGET_SCHEMA if is_infopack else CEDANT_TARGET_SCHEMA,
    }


# ═══════════════════════════════════════════════════════════
# POST /api/master/upload
# ═══════════════════════════════════════════════════════════

@router.post("/upload", summary="Unggah satu file Excel, simpan seluruh header & baris lengkap, serta append kolom inti ke Master")
async def upload_to_master(
    bulan:           str           = Form(...),
    tahun:           str           = Form(...),
    tipe_data:       str           = Form(...),
    primary_key_col: Optional[str] = Form(None),
    cedant:          Optional[str] = Form(None),
    cedant_code:     Optional[str] = Form(None),
    sheet_name:      Optional[str] = Form(None),
    custom_mapping:  Optional[str] = Form(None),
    file:            UploadFile    = File(...),
    db:              Session       = Depends(get_db),
    session_id:      str           = Depends(get_session_id),
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx, .xls, .xlsm, atau .xlsb")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB")

    parsed_custom_map: dict = {}
    if custom_mapping:
        try:
            raw_cm = json.loads(custom_mapping)
            if isinstance(raw_cm, dict):
                parsed_custom_map = {str(k): str(v).strip() for k, v in raw_cm.items() if v and str(v).strip()}
        except Exception:
            parsed_custom_map = {}

    pk_col = (
        (primary_key_col or "").strip()
        or parsed_custom_map.get("doc_no")
        or parsed_custom_map.get("title")
        or None
    )
    # Gunakan cedant_code dari frontend jika ada, fallback ke lookup DB
    resolved_cedant = (cedant_code or "").strip() or _resolve_cedant_code(db, cedant or "") or ""
    target_table = _target_table(tipe_data)
    is_infopack  = target_table == INFOPACK_TABLE

    job = UploadJob(
        session_id=session_id, bulan=bulan, tahun=tahun, tipe_data=tipe_data,
        primary_key_col=pk_col or "", file_name=file.filename,
        sheet_name=sheet_name or None, cedant=cedant or None, status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    is_kbins = (cedant or "").strip().upper().startswith("KB INS")
    try:
        if is_kbins:
            from msoffcrypto.exceptions import InvalidKeyError
            try:
                result = ingest_kbins(file_bytes, cedant or "")
            except InvalidKeyError:
                job.status = "error"
                job.error_message = "Password Excel salah."
                db.commit()
                raise HTTPException(status_code=400, detail="Password Excel salah.")
        else:
            result = ingest_excel(file_bytes, pk_col or "", sheet_name or None)
    except HTTPException:
        raise
    except ValueError as e:
        job.status = "error"; job.error_message = str(e); db.commit()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during ingestion")
        job.status = "error"; job.error_message = str(e); db.commit()
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan internal: {e}")

    sheet_val = result.get("sheet", "")
    job.sheet_name = sheet_val or job.sheet_name
    if not resolved_cedant:
        resolved_cedant, detected_cedant_name = _detect_cedant_from_mapping(
            db, result["rows"], sheet_val
        )
        if resolved_cedant and not cedant:
            job.cedant = detected_cedant_name
        if not resolved_cedant:
            logger.warning(
                "Could not resolve cedant code from active mappings for file=%s sheet=%s",
                file.filename,
                sheet_val,
            )
    db.commit()

    detected_name = _detect_file_name(file.filename)
    scanned_headers = result.get("columns") or (
        list(result["rows"][0]["data"].keys()) if result.get("rows") and result["rows"][0].get("data") else []
    )

    db_col_map = _load_column_mapping(db, resolved_cedant, sheet_val) if resolved_cedant else {}
    effective_col_map = {**db_col_map, **parsed_custom_map}
    if not effective_col_map and scanned_headers:
        effective_col_map = _auto_match_headers_for_sheet(scanned_headers, is_infopack, {})

    if is_infopack:
        rows_to_write = [
            _extract_infopack_row(
                r, resolved_cedant, bulan, tahun, detected_name, sheet_val, idx, effective_col_map
            )
            for idx, r in enumerate(result["rows"])
            if r.get("data")
        ]
        rows_to_write = [row for row in rows_to_write
                         if row.get("class_code") or row.get("title") or row.get("value")]
        stats = _write_infopack_rows(db, rows_to_write)
    else:
        if effective_col_map:
            logger.info("Using column mapping for %s sheet=%s: %s", resolved_cedant, sheet_val, effective_col_map)
            rows_to_write = [
                _extract_cedant_row_with_mapping(r, resolved_cedant, bulan, tahun, detected_name, sheet_val, effective_col_map)
                for r in result["rows"]
            ]
        else:
            rows_to_write = [
                _extract_cedant_row(r, resolved_cedant, bulan, tahun, detected_name, sheet_val)
                for r in result["rows"]
            ]

        stats = _write_cedant_rows(db, rows_to_write)

    # ── Simpan Scanned Schema (seluruh header Excel) & Raw Rows (seluruh kolom per baris) ──
    mapped_excel_cols = set()
    for v in (effective_col_map or {}).values():
        if v:
            for part in str(v).split("|"):
                if part.strip():
                    mapped_excel_cols.add(part.strip())
    unmapped_headers = [h for h in scanned_headers if h not in mapped_excel_cols]
    sample_row_data = result["rows"][0]["data"] if result.get("rows") else {}

    try:
        schema_entry = ScannedSchema(
            job_id=job.id,
            session_id=session_id,
            cedant_code=resolved_cedant or None,
            cedant_name=job.cedant or cedant or None,
            tipe_data="Infopack" if is_infopack else "OS Cedant",
            bulan=str(bulan),
            tahun=str(tahun),
            file_name=detected_name,
            sheet_name=sheet_val,
            scanned_headers=json.dumps(scanned_headers, ensure_ascii=False),
            column_mapping=json.dumps(effective_col_map, ensure_ascii=False),
            unmapped_headers=json.dumps(unmapped_headers, ensure_ascii=False),
            sample_row=json.dumps(sample_row_data, ensure_ascii=False),
            total_columns=len(scanned_headers),
            total_rows=result["total_rows"],
        )
        db.add(schema_entry)

        month_int = int(bulan) if str(bulan).isdigit() else None
        year_int = int(tahun) if str(tahun).isdigit() else None
        raw_objects = []
        for idx, r in enumerate(result.get("rows", [])):
            row_dict = r.get("data") or {}
            if not row_dict:
                continue
            pk_val = str(r.get("pk") or "").strip()
            if idx < len(rows_to_write):
                pk_val = (
                    rows_to_write[idx].get("doc_no")
                    or rows_to_write[idx].get("title")
                    or pk_val
                )
            raw_objects.append(
                MasterRawRow(
                    job_id=job.id,
                    session_id=session_id,
                    target_table=target_table,
                    cedant_code=resolved_cedant or None,
                    primary_key_value=str(pk_val) if pk_val else None,
                    month=month_int,
                    year=year_int,
                    file_name=detected_name,
                    sheet_name=sheet_val,
                    full_row_data=json.dumps(row_dict, ensure_ascii=False),
                )
            )
        if raw_objects:
            db.bulk_save_objects(raw_objects)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Could not persist ScannedSchema / MasterRawRow: %s", e)

    job.status = "done"
    job.total_rows    = result["total_rows"]
    job.rows_appended = stats["inserted"]
    job.rows_skipped  = stats["skipped"]
    db.commit()

    return {
        "job_id": job.id,
        "sheet": sheet_val,
        "target_table": target_table,
        "cedant_code": resolved_cedant or None,
        "file_name": detected_name,
        "total_rows": result["total_rows"],
        "rows_appended": stats["inserted"],
        "rows_skipped": stats["skipped"],
        "rows_updated": stats["updated"],
        "total_columns": len(scanned_headers),
        "scanned_headers": scanned_headers,
        "column_mapping": effective_col_map,
        "unmapped_headers": unmapped_headers,
        "message": (
            f"Upload berhasil. {stats['inserted']} baris ditambahkan, "
            f"{stats['updated']} baris dilengkapi, {stats['skipped']} dilewati. "
            f"({len(scanned_headers)} kolom header disimpan)."
        ),
    }


# ═══════════════════════════════════════════════════════════
# GET /api/master/headers
# ═══════════════════════════════════════════════════════════

@router.get("/headers", summary="Ambil katalog seluruh header Excel yang sudah di-scan dan dikumpulkan")
def get_scanned_headers(
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
    db:         Session       = Depends(get_db),
    session_id: str           = Depends(get_session_id),
):
    q = db.query(ScannedSchema)
    if tipe_data:
        is_info = _target_table(tipe_data) == INFOPACK_TABLE
        q = q.filter(ScannedSchema.tipe_data == ("Infopack" if is_info else "OS Cedant"))
    if cedant:
        q = q.filter(ScannedSchema.cedant_code == cedant)

    schemas = q.order_by(ScannedSchema.id.desc()).limit(100).all()

    collected_headers: list[str] = []
    seen_headers: set[str] = set()
    schema_list = []

    for s in schemas:
        try:
            hdrs = json.loads(s.scanned_headers) if s.scanned_headers else []
        except Exception:
            hdrs = []
        try:
            col_map = json.loads(s.column_mapping) if s.column_mapping else {}
        except Exception:
            col_map = {}
        try:
            unmapped = json.loads(s.unmapped_headers) if s.unmapped_headers else []
        except Exception:
            unmapped = []
        try:
            sample = json.loads(s.sample_row) if s.sample_row else {}
        except Exception:
            sample = {}

        for h in hdrs:
            if h and h not in seen_headers:
                seen_headers.add(h)
                collected_headers.append(h)

        schema_list.append({
            "id": s.id,
            "job_id": s.job_id,
            "cedant_code": s.cedant_code,
            "cedant_name": s.cedant_name,
            "tipe_data": s.tipe_data,
            "bulan": s.bulan,
            "tahun": s.tahun,
            "file_name": s.file_name,
            "sheet_name": s.sheet_name,
            "scanned_headers": hdrs,
            "column_mapping": col_map,
            "unmapped_headers": unmapped,
            "sample_row": sample,
            "total_columns": s.total_columns,
            "total_rows": s.total_rows,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    return {
        "total_schemas": len(schema_list),
        "collected_headers": collected_headers,
        "schemas": schema_list,
    }


# ═══════════════════════════════════════════════════════════
# GET /api/master/data
# ═══════════════════════════════════════════════════════════

@router.get("/data", summary="Ambil data Master beserta seluruh kolom hasil scan (paginated)")
def get_master_data(
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
    skip:       int           = Query(0,  ge=0),
    limit:      int           = Query(50, ge=1, le=500),
    db:         Session       = Depends(get_db),
    session_id: str           = Depends(get_session_id),
):
    table = _target_table(tipe_data or "")
    is_infopack = table == INFOPACK_TABLE

    where, params = [], {}
    if cedant:
        where.append("cedant_code = :cedant")
        params["cedant"] = cedant
    if not is_infopack:
        where.append(
            "(NULLIF(TRIM(doc_no), '') IS NOT NULL OR dol IS NOT NULL "
            "OR outstanding IS NOT NULL OR NULLIF(TRIM(currency), '') IS NOT NULL)"
        )
    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        if is_infopack:
            where.append(
                "(LOWER(COALESCE(cedant_code, '')) LIKE LOWER(:q) OR LOWER(COALESCE(class_code, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(title, '')) LIKE LOWER(:q) OR LOWER(COALESCE(value, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(sheet_name, '')) LIKE LOWER(:q))"
            )
        else:
            where.append(
                "(LOWER(COALESCE(cedant_code, '')) LIKE LOWER(:q) OR LOWER(COALESCE(doc_no, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(currency, '')) LIKE LOWER(:q) OR LOWER(COALESCE(sheet_name, '')) LIKE LOWER(:q) "
                "OR LOWER(CAST(COALESCE(outstanding, 0) AS TEXT)) LIKE LOWER(:q))"
            )
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(text(f"SELECT COUNT(*) FROM {table}{where_sql}"), params).scalar() or 0
    rows  = db.execute(
        text(f"SELECT * FROM {table}{where_sql} ORDER BY id DESC LIMIT :lim OFFSET :off"),
        {**params, "lim": limit, "off": skip},
    ).mappings().all()

    # ── Perkaya dengan full_row_data (seluruh kolom Excel asli) dari master_raw_rows ──
    raw_lookup: dict[tuple, dict] = {}
    scanned_headers: list[str] = []
    seen_hdrs: set[str] = set()

    try:
        schema_q = db.query(ScannedSchema).filter(
            ScannedSchema.tipe_data == ("Infopack" if is_infopack else "OS Cedant")
        )
        if cedant:
            schema_q = schema_q.filter(ScannedSchema.cedant_code == cedant)
        for sc in schema_q.order_by(ScannedSchema.id.desc()).limit(30).all():
            for h in (json.loads(sc.scanned_headers) if sc.scanned_headers else []):
                if h and h not in seen_hdrs:
                    seen_hdrs.add(h)
                    scanned_headers.append(h)

        pks = [
            str((r.get("title") if is_infopack else r.get("doc_no")) or "").strip()
            for r in rows
            if (r.get("title") if is_infopack else r.get("doc_no"))
        ]
        if pks:
            raw_matches = (
                db.query(MasterRawRow)
                .filter(
                    MasterRawRow.target_table == table,
                    MasterRawRow.primary_key_value.in_(pks),
                )
                .order_by(MasterRawRow.id.desc())
                .all()
            )
            for rm in raw_matches:
                key_specific = (rm.cedant_code or "", rm.primary_key_value or "", rm.sheet_name or "")
                key_fallback = (rm.cedant_code or "", rm.primary_key_value or "")
                try:
                    parsed_full = json.loads(rm.full_row_data) if rm.full_row_data else {}
                except Exception:
                    parsed_full = {}
                if parsed_full:
                    for h in parsed_full.keys():
                        if h and h not in seen_hdrs:
                            seen_hdrs.add(h)
                            scanned_headers.append(h)
                    if key_specific not in raw_lookup:
                        raw_lookup[key_specific] = parsed_full
                    if key_fallback not in raw_lookup:
                        raw_lookup[key_fallback] = parsed_full
    except Exception as e:
        logger.warning("Could not enrich rows from master_raw_rows: %s", e)

    result_rows = []
    for r in rows:
        dol_val = r.get("dol")
        dol_str = dol_val.strftime("%Y-%m-%d") if hasattr(dol_val, "strftime") else str(dol_val or "")
        cc_val = r.get("cedant_code") or ""
        sh_val = r.get("sheet_name") or ""
        if is_infopack:
            pk_val = r.get("title") or str(r.get("id"))
            full_cols = (
                raw_lookup.get((cc_val, str(pk_val).strip(), sh_val))
                or raw_lookup.get((cc_val, str(pk_val).strip()))
                or {}
            )
            base_row_data = {
                **full_cols,
                "cedant_code": r.get("cedant_code"), "class_code": r.get("class_code"),
                "title": r.get("title"), "value": r.get("value"),
                "row_index": r.get("row_index"), "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "_cedant": r.get("cedant_code"),
            }
            result_rows.append({
                "id": r.get("id"), "tipe_data": "Infopack",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "primary_key_value": pk_val,
                "source_job_id": None, "sheet_name": r.get("sheet_name"),
                "row_data": base_row_data,
                "full_row_data": full_cols,
                "created_at": None,
            })
        else:
            doc_no = r.get("doc_no")
            outstanding = r.get("outstanding")
            full_cols = (
                raw_lookup.get((cc_val, str(doc_no or "").strip(), sh_val))
                or raw_lookup.get((cc_val, str(doc_no or "").strip()))
                or {}
            )
            base_row_data = {
                **full_cols,
                "doc_no": doc_no, "dol": dol_str,
                "outstanding": str(outstanding) if outstanding is not None else "",
                "currency": r.get("currency"),
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "_cedant": r.get("cedant_code"),
            }
            result_rows.append({
                "id": r.get("id"), "tipe_data": "OS Cedant",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "primary_key_value": doc_no,
                "source_job_id": None, "sheet_name": r.get("sheet_name"),
                "row_data": base_row_data,
                "full_row_data": full_cols,
                "created_at": None,
            })
    return {
        "total": total,
        "scanned_headers": scanned_headers,
        "rows": result_rows,
    }


# ═══════════════════════════════════════════════════════════
# GET /api/master/jobs
# ═══════════════════════════════════════════════════════════

@router.get("/jobs", summary="Riwayat upload jobs")
def list_upload_jobs(
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), session_id: str = Depends(get_session_id),
):
    q     = db.query(UploadJob).filter(UploadJob.session_id == session_id)
    total = q.count()
    jobs  = q.order_by(UploadJob.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "jobs": [_upload_job_to_dict(j) for j in jobs]}


# ═══════════════════════════════════════════════════════════
# GET /api/master/library
# ═══════════════════════════════════════════════════════════

@router.get("/library", summary="Library file per tipe data")
def get_library(
    tipe_data: Optional[str] = Query(None),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db), session_id: str = Depends(get_session_id),
):
    q = db.query(UploadJob).filter(UploadJob.session_id == session_id)
    if tipe_data:
        q = q.filter(UploadJob.tipe_data == tipe_data)
    total = q.count()
    jobs  = q.order_by(UploadJob.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "files": [_library_entry(j) for j in jobs]}


# ═══════════════════════════════════════════════════════════
# DELETE /api/master/library/{job_id}
# ═══════════════════════════════════════════════════════════

@router.delete("/library/{job_id}", summary="Hapus file dari Library")
def delete_library_entry(
    job_id: int,
    db: Session = Depends(get_db), session_id: str = Depends(get_session_id),
):
    job = db.query(UploadJob).filter(UploadJob.id == job_id, UploadJob.session_id == session_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")

    table = _target_table(job.tipe_data or "")
    detected = _detect_file_name(job.file_name or "")
    deleted = 0
    if detected:
        try:
            deleted = db.execute(
                text(f"DELETE FROM {table} WHERE file_name = :fn AND month = :m AND year = :y"),
                {"fn": detected, "m": job.bulan, "y": job.tahun},
            ).rowcount or 0
        except Exception as e:
            logger.warning("Could not delete from %s: %s", table, e)

    try:
        db.query(ScannedSchema).filter(ScannedSchema.job_id == job_id).delete(synchronize_session=False)
        db.query(MasterRawRow).filter(MasterRawRow.job_id == job_id).delete(synchronize_session=False)
    except Exception as e:
        logger.warning("Could not delete ScannedSchema / MasterRawRow for job %s: %s", job_id, e)

    db.delete(job)
    db.commit()
    return {"message": f"File '{job.file_name}' dihapus.", "rows_deleted": deleted}


# ═══════════════════════════════════════════════════════════
# GET /api/master/export
# ═══════════════════════════════════════════════════════════

@router.get("/export", summary="Export Master data sebagai Excel")
def export_master_excel(
    session_id: str           = Query(..., alias="session_id"),
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
    db:         Session       = Depends(get_db),
):
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    table = _target_table(tipe_data or "")
    is_infopack = table == INFOPACK_TABLE
    cols = _columns_for(table)

    where, params = [], {}
    if cedant:
        where.append("cedant_code = :cedant")
        params["cedant"] = cedant
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    rows = db.execute(
        text(f"SELECT id, {', '.join(cols)} FROM {table}{where_sql} ORDER BY id ASC"),
        params,
    ).mappings().all()

    if is_infopack:
        META_COLS = ["No", "Cedant", "Class Code", "Title", "Value",
                     "Row Index", "Month", "Year", "File Name", "Sheet Name"]
        excel_rows = [{
            "No": i, "Cedant": r.get("cedant_code") or "", "Class Code": r.get("class_code") or "",
            "Title": r.get("title") or "", "Value": r.get("value") or "",
            "Row Index": r.get("row_index") or "", "Month": r.get("month") or "",
            "Year": r.get("year") or "", "File Name": r.get("file_name") or "",
            "Sheet Name": r.get("sheet_name") or "",
        } for i, r in enumerate(rows, 1)]
    else:
        META_COLS = ["No", "Cedant", "Doc No", "DOL", "Outstanding",
                     "Currency", "Month", "Year", "File Name", "Sheet Name"]
        excel_rows = []
        for i, r in enumerate(rows, 1):
            dol_val = r.get("dol")
            excel_rows.append({
                "No": i, "Cedant": r.get("cedant_code") or "", "Doc No": r.get("doc_no") or "",
                "DOL": dol_val.strftime("%d/%m/%Y") if dol_val else "",
                "Outstanding": r.get("outstanding"), "Currency": r.get("currency") or "",
                "Month": r.get("month") or "", "Year": r.get("year") or "",
                "File Name": r.get("file_name") or "", "Sheet Name": r.get("sheet_name") or "",
            })

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Master Data"

    TEAL = "1E6E6E"; TEAL_LIGHT = "E6F4F4"
    GRAY_BORDER = Side(style="thin", color="D1D5DB")
    THIN_BORDER = Border(left=GRAY_BORDER, right=GRAY_BORDER, top=GRAY_BORDER, bottom=GRAY_BORDER)
    HEADER_FILL = PatternFill("solid", fgColor=TEAL)
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=10)
    HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ALT_FILL = PatternFill("solid", fgColor=TEAL_LIGHT)
    NORMAL_FILL = PatternFill("solid", fgColor="FFFFFF")
    NUM_ALIGN = Alignment(horizontal="right", vertical="center")
    DATA_ALIGN = Alignment(vertical="center")

    ws.merge_cells(f"A1:{get_column_letter(len(META_COLS))}1")
    tc = ws["A1"]
    tc.value = f"Master {tipe_data or 'Data'}" + (f" — {cedant}" if cedant else "")
    tc.font = Font(bold=True, size=13, color=TEAL)
    tc.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 28

    for ci, col in enumerate(META_COLS, 1):
        c = ws.cell(row=2, column=ci, value=col)
        c.fill = HEADER_FILL; c.font = HEADER_FONT
        c.alignment = HEADER_ALIGN; c.border = THIN_BORDER
    ws.row_dimensions[2].height = 22

    NUMERIC_COLS = {"Outstanding", "Value"}
    CENTER_COLS  = {"No", "Month", "Year", "Row Index"}

    for ri, row_dict in enumerate(excel_rows, 3):
        fill = ALT_FILL if ri % 2 == 0 else NORMAL_FILL
        for ci, col in enumerate(META_COLS, 1):
            val = row_dict.get(col, "")
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.fill = fill; cell.border = THIN_BORDER
            if col in CENTER_COLS:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col in NUMERIC_COLS:
                try:
                    num = float(str(val).replace(",", "").replace(" ", ""))
                    cell.value = num; cell.number_format = "#,##0.00"; cell.alignment = NUM_ALIGN
                except (ValueError, TypeError):
                    cell.alignment = DATA_ALIGN
            else:
                cell.alignment = DATA_ALIGN

    COL_WIDTHS = {"No": 6, "Cedant": 28, "Doc No": 30, "DOL": 14, "Outstanding": 18,
                  "Currency": 10, "Month": 8, "Year": 8, "File Name": 32, "Sheet Name": 22,
                  "Class Code": 18, "Title": 36, "Value": 18, "Row Index": 10}
    for ci, col in enumerate(META_COLS, 1):
        ws.column_dimensions[get_column_letter(ci)].width = COL_WIDTHS.get(col, 15)

    ws.freeze_panes = "A3"
    ws.auto_filter.ref = f"A2:{get_column_letter(len(META_COLS))}2"

    ws_info = wb.create_sheet("Info")
    ws_info["A1"] = "Export Info"
    ws_info["A1"].font = Font(bold=True, size=12)
    for i, (k, v) in enumerate([
        ("Tipe Data", tipe_data or "Semua"), ("Cedant", cedant or "Semua"),
        ("Total Baris", len(excel_rows)), ("Diekspor", datetime.now().strftime("%d/%m/%Y %H:%M:%S")),
    ], 2):
        ws_info.cell(row=i, column=1, value=k).font = Font(bold=True)
        ws_info.cell(row=i, column=2, value=v)
    ws_info.column_dimensions["A"].width = 18
    ws_info.column_dimensions["B"].width = 30

    buf = BytesIO()
    wb.save(buf); buf.seek(0)

    safe_tipe   = (tipe_data or "all").replace(" ", "_")
    safe_cedant = f"_{cedant.replace(' ', '_')}" if cedant else ""
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="master_{safe_tipe}{safe_cedant}.xlsx"'},
    )


# ═══════════════════════════════════════════════════════════
# Serialization helpers
# ═══════════════════════════════════════════════════════════

def _upload_job_to_dict(j: UploadJob) -> dict:
    return {
        "id": j.id, "bulan": j.bulan, "tahun": j.tahun, "tipe_data": j.tipe_data,
        "cedant": j.cedant, "primary_key_col": j.primary_key_col,
        "file_name": j.file_name, "sheet_name": j.sheet_name, "status": j.status,
        "total_rows": j.total_rows, "rows_appended": j.rows_appended,
        "rows_skipped": j.rows_skipped, "error_message": j.error_message,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }


def _library_entry(j: UploadJob) -> dict:
    return {
        "id": j.id, "file_name": j.file_name, "tipe_data": j.tipe_data,
        "cedant": j.cedant, "bulan": j.bulan, "tahun": j.tahun,
        "sheet_name": j.sheet_name, "primary_key_col": j.primary_key_col,
        "status": j.status, "total_rows": j.total_rows or 0,
        "rows_appended": j.rows_appended or 0, "rows_skipped": j.rows_skipped or 0,
        "error_message": j.error_message,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }
