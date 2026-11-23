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
import hashlib
import logging
import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models import (
    get_db, get_session_id,
    UploadJob, MasterOsCedant, MasterOsInfopack,
    ScannedSchema, MasterRawRow,
)
from ..services.excel_service import (
    ingest_excel, ingest_excel_raw, ingest_kbins, inspect_excel_workbook,
    get_sheet_names, read_excel_with_password, KBINS_TIPE_DATA,
)

router = APIRouter(prefix="/api/master", tags=["master"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

CEDANT_TABLE   = "master_os_cedant_web"
INFOPACK_TABLE = "master_os_infopack_web"
MASTER_SCHEMA = "rekonsiliasi"
INFOPACK_TIPE_KEYWORDS = ("infopack", "info_pack", "info-pack")


def _master_raw_row_lookup_key(
    cedant_code,
    claim_no,
    sheet_name,
    source_file,
    period_number,
    period_year,
):
    return (
        str(cedant_code or "").strip(),
        str(claim_no or "").strip(),
        str(sheet_name or "").strip().casefold(),
        str(source_file or "").strip().casefold(),
        str(period_number or "").strip(),
        str(period_year or "").strip(),
    )


def _target_table(tipe_data: str) -> str:
    td = (tipe_data or "").lower()
    for kw in INFOPACK_TIPE_KEYWORDS:
        if kw in td:
            return INFOPACK_TABLE
    return CEDANT_TABLE


def _qualified_master_table(table: str) -> str:
    if table not in (CEDANT_TABLE, INFOPACK_TABLE):
        raise ValueError(f"Tabel Master tidak dikenal: {table}")
    return f"{MASTER_SCHEMA}.{table}"


def _synchronize_header_library_identity(db: Session) -> None:
    sequence_name = db.execute(
        text(
            "SELECT pg_get_serial_sequence("
            "'rekonsiliasi.header_library', 'header_id')"
        )
    ).scalar_one_or_none()
    if not sequence_name:
        raise RuntimeError(
            "rekonsiliasi.header_library.header_id tidak memiliki identity sequence."
        )

    db.execute(
        text("LOCK TABLE rekonsiliasi.header_library IN SHARE ROW EXCLUSIVE MODE")
    )
    db.execute(
        text(
            "WITH table_state AS ("
            "SELECT COALESCE(MAX(header_id), 0) AS max_id "
            "FROM rekonsiliasi.header_library"
            "), sequence_state AS ("
            "SELECT last_value FROM pg_sequences "
            "WHERE to_regclass(format('%I.%I', schemaname, sequencename)) "
            "= CAST(:sequence_name AS regclass)"
            ") "
            "SELECT setval("
            "CAST(:sequence_name AS regclass), "
            "GREATEST(table_state.max_id, COALESCE(sequence_state.last_value, 0), 1), "
            "table_state.max_id > 0 OR COALESCE(sequence_state.last_value, 0) > 0"
            ") "
            "FROM table_state CROSS JOIN sequence_state"
        ),
        {"sequence_name": sequence_name},
    )


def _columns_for(table: str) -> list:
    if table == INFOPACK_TABLE:
        return ["cedant_code", "class_code", "title", "value",
                "row_index", "month", "year", "file_name", "sheet_name",
                "dol", "cob", "gross", "tsi"]
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
    r"date.*(loss|incident|accident|occurrence)|"
    r"(loss|incident|accident|occurrence).*date|"
    r"tanggal.*(loss|kejadian|kerugian)|"
    r"(loss|kejadian|kerugian).*tanggal|\bdol\b",
)
CURRENCY_PATTERNS = (
    r"^Currency$", r"^Curr$", r"^curr$", r"^Mata Uang$",
    r"^currency$", r"^CCY$", r"^ccy$",
)
DOC_NO_PATTERNS = (
    r"doc.*(no|number|ref)",
    r"ref(erence)?.*(no|number)|^(loss|claim)\s*ref(erence)?$",
    r"claim.*(no|number|ref|reference|id)",
    r"(policy|certificate).*(no|number|ref)",
    r"^no$",
    r"nomor",
)
DOC_NO_DATE_HEADER_PATTERNS = (
    r"\bdate\b",
    r"\bdol\b",
    r"\btgl\b",
    r"\btanggal\b",
    r"kejadian|incident|accident|occurrence",
)
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
COB_PATTERNS = (
    r"\bcob\b", r"class of business", r"business class",
) + CLASS_CODE_PATTERNS
GROSS_PATTERNS = (
    r"^Gross$", r"^Gross Premium$", r"^Gross Amount$", r"gross",
)
TSI_PATTERNS = (
    r"^TSI\b", r"^Total Sum Insured$", r"^Sum Insured$",
    r"total.*sum.*insured",
)


def _find(data: dict, *patterns) -> str:
    for pat in patterns:
        for k, v in data.items():
            if re.search(pat, k, re.IGNORECASE):
                val = str(v).strip() if v is not None else ""
                if val and val.lower() not in ("", "nan", "none", "-"):
                    return val
    return ""


def _find_doc_no(data: dict) -> str:
    for pattern in DOC_NO_PATTERNS:
        for header, value in data.items():
            header_name = str(header).strip()
            if not re.search(pattern, header_name, re.IGNORECASE):
                continue
            if any(
                re.search(date_pattern, header_name, re.IGNORECASE)
                for date_pattern in DOC_NO_DATE_HEADER_PATTERNS
            ):
                continue
            candidate = str(value).strip() if value is not None else ""
            if not candidate or candidate.lower() in ("nan", "none", "-"):
                continue
            if re.fullmatch(
                r"(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
                r"(?:[ T].*)?",
                candidate,
            ) and _parse_dol(candidate):
                continue
            return candidate[:255]
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


def _parse_decimal(val) -> Optional[Decimal]:
    if val is None:
        return None
    value = str(val).strip()
    if not value or value.lower() in ("nan", "none", "-", "n/a"):
        return None
    negative = value.startswith("(") and value.endswith(")")
    if negative:
        value = value[1:-1]
    value = re.sub(r"(?i)\b(?:idr|rp)\b", "", value)
    value = value.replace(" ", "").replace("\u00a0", "").replace("$", "")
    has_comma, has_dot = "," in value, "." in value
    if has_comma and has_dot:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif has_comma:
        value = value.replace(",", "") if value.count(",") > 1 else value.replace(",", ".")
    try:
        amount = Decimal(value)
    except InvalidOperation:
        return None
    return -amount if negative else amount


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
        "class_of_business": "cob",
        "gross_amount": "gross",
        "total_sum_insured": "tsi",
        "sum_insured": "tsi",
        "insured": "title",
    }.get(normalized, normalized)


def _applied_mapping_object(value) -> dict:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=500,
                detail="Mapping tersimpan pada riwayat upload tidak valid.",
            ) from exc
    if not isinstance(value, dict):
        return {}
    mapping = value.get("mapping")
    return mapping if isinstance(mapping, dict) else value


def _load_confirmed_upload_mapping(
    db: Session,
    cedant_code: str,
    dataset_type: str,
    sheet_name: str,
) -> tuple[Optional[int], dict]:
    try:
        rows = db.execute(
            text(
                "SELECT t.mapping_version, t.applied_mapping "
                "FROM rekonsiliasi.upload_table t "
                "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
                "WHERE b.cedant_code = :cedant_code "
                "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type "
                "AND t.sheet_name = :sheet_name "
                "AND t.status = 'ready' AND t.mapping_version IS NOT NULL "
                "ORDER BY t.mapping_version DESC, t.confirmed_at DESC NULLS LAST, "
                "t.table_id DESC"
            ),
            {
                "cedant_code": cedant_code,
                "dataset_type": dataset_type.upper(),
                "sheet_name": sheet_name,
            },
        ).mappings().all()
    except Exception as exc:
        logger.exception("Could not load confirmed upload mapping for cedant=%s", cedant_code)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal membaca mapping dari riwayat upload cedant {cedant_code}.",
        ) from exc
    for row in rows:
        mapping = _applied_mapping_object(row.get("applied_mapping"))
        if mapping:
            return int(row["mapping_version"]), mapping
    return None, {}


def _normalize_mapping_value(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def _load_column_mapping(
    db: Session,
    cedant_code: str,
    sheet_name: str,
    is_infopack: bool,
) -> dict:
    """
    Load mappings from the existing master_mapping_column table.
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
                "SELECT m.header_name AS excel_name, f.field_name, m.argument, "
                "m.mapping_version "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "WHERE m.cedant_code = :cc AND m.is_active = TRUE "
                "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type "
                "ORDER BY m.mapping_version DESC"
            ),
            {
                "cc": cedant_code,
                "dataset_type": "INFOPACK" if is_infopack else "OS CEDANT",
            },
        ).mappings().all()
    except Exception as exc:
        logger.exception("Could not load upload mapping for cedant=%s", cedant_code)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal membaca mapping kolom untuk cedant {cedant_code}.",
        ) from exc

    active_mapping = {}
    if not is_infopack:
        by_version: dict[int, dict[str, str]] = {}
        for row in rows:
            excel_name = (row.get("excel_name") or "").strip()
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
            if sheet_names and sheet_name and not any(
                _normalize_mapping_value(str(sheet))
                == _normalize_mapping_value(sheet_name)
                for sheet in sheet_names
            ):
                continue
            by_version.setdefault(int(row["mapping_version"]), {}).setdefault(
                field_name, excel_name
            )
        for _, version_mapping in sorted(by_version.items(), reverse=True):
            if {"doc_no", "outstanding"} <= version_mapping.keys():
                active_mapping = version_mapping
                break
        if not active_mapping and by_version:
            active_mapping = by_version[max(by_version)]

    else:
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

            active_mapping.setdefault(field_name, excel_name)

    _, stored_mapping = _load_confirmed_upload_mapping(
        db,
        cedant_code,
        "INFOPACK" if is_infopack else "OS CEDANT",
        sheet_name,
    )
    history_mapping = {
        _canonical_field_name(str(field_name)): str(header).strip()
        for field_name, header in stored_mapping.items()
        if header is not None and str(header).strip()
    }
    return {**history_mapping, **active_mapping}


@router.get("/mappings", summary="Ambil mapping kolom aktif dari database")
def get_column_mappings(db: Session = Depends(get_db)):
    from ..models.database import DB_MODE, DB_LAST_ERROR
    try:
        rows = db.execute(
            text(
                "SELECT m.cedant_code, "
                "COALESCE(NULLIF(BTRIM(c.cedant_name), ''), m.cedant_code) AS cedant_name, "
                "m.header_name AS excel_name, f.field_name, f.dataset_type, "
                "m.mapping_version, m.argument "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = m.cedant_code "
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

    profiles = _build_mapping_version_profiles([dict(row) for row in rows])
    return {
        "profiles": profiles,
        "db_connected": True,
        "db_mode": DB_MODE,
        "db_error": None,
    }

    profiles = {}
    os_profile_rows = defaultdict(dict)
    for row in rows:
        if str(row.get("dataset_type") or "").strip().upper() != "OS CEDANT":
            continue
        excel_name = (row.get("excel_name") or "").strip()
        field_name = _canonical_field_name(row.get("field_name") or "")
        if not field_name or not excel_name:
            continue
        argument = row.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail="Argument mapping tersimpan tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        scopes = [
            (str(sheet).strip(), _normalize_mapping_value(str(sheet)))
            for sheet in sheet_names
            if str(sheet).strip()
        ] or [("", "")]
        cedant_code = row.get("cedant_code") or ""
        cedant_name = row.get("cedant_name") or cedant_code or "—"
        version = int(row.get("mapping_version") or 0)
        for sheet_name, sheet_key in scopes:
            version_key = (cedant_code, sheet_key, version)
            profile = os_profile_rows[version_key]
            profile.setdefault(
                "metadata",
                {
                    "cedant": cedant_name,
                    "cedant_code": cedant_code,
                    "sheet_name": sheet_name,
                },
            )
            profile.setdefault("mapping", {}).setdefault(field_name, excel_name)

    latest_os_profiles = {}
    for (cedant_code, sheet_key, version), profile in os_profile_rows.items():
        key = (cedant_code, sheet_key)
        current = latest_os_profiles.get(key)
        if current is None or version > current["version"]:
            latest_os_profiles[key] = {"version": version, **profile}

    grouped_os_profiles = {}
    for (cedant_code, sheet_key), profile in latest_os_profiles.items():
        metadata = profile["metadata"]
        mapping = profile["mapping"]
        group_key = (
            cedant_code,
            profile["version"],
            _mapping_fingerprint(mapping),
        )
        output = grouped_os_profiles.setdefault(
            group_key,
            {
                "tipe_data": "OS Cedant",
                "cedant": metadata["cedant"],
                "cedantCode": cedant_code,
                "sheetNames": [],
                "mappingVersion": profile["version"],
                "mapping": mapping,
            },
        )
        if sheet_key and metadata["sheet_name"] not in output["sheetNames"]:
            output["sheetNames"].append(metadata["sheet_name"])

    for profile in grouped_os_profiles.values():
        profile["sheetNames"].sort(key=str.casefold)
        profile["sheetMet"] = ", ".join(profile["sheetNames"]) or "All sheets"
        profile["lossRef"] = profile["mapping"].get("doc_no", "—")
        profile["outstanding"] = profile["mapping"].get("outstanding", "—")
        profile["dateOfLoss"] = profile["mapping"].get("dol", "—")
        profile["status"] = (
            "READY"
            if {"doc_no", "outstanding"} <= profile["mapping"].keys()
            else "INCOMPLETE"
        )
        result.append(profile)
    return result


def _build_os_mapping_profiles(rows: list[dict]) -> list[dict]:
    os_profile_rows = defaultdict(dict)
    for row in rows:
        if str(row.get("dataset_type") or "").strip().upper() != "OS CEDANT":
            continue
        excel_name = str(row.get("excel_name") or "").strip()
        field_name = _canonical_field_name(str(row.get("field_name") or ""))
        if not field_name or not excel_name:
            continue

        argument = row.get("argument") or {}
        if isinstance(argument, str):
            try:
                argument = json.loads(argument)
            except json.JSONDecodeError:
                argument = {}
        if not isinstance(argument, dict):
            argument = {}

        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        scopes = [str(sheet).strip() for sheet in sheet_names if str(sheet).strip()] or [""]
        cedant_code = str(row.get("cedant_code") or "").strip()
        cedant_name = str(row.get("cedant_name") or cedant_code or "—").strip()
        version = int(row.get("mapping_version") or 0)

        for sheet_name in scopes:
            profile = os_profile_rows.setdefault(
                (cedant_code, _normalize_mapping_value(sheet_name), version),
                {"metadata": {"cedant": cedant_name, "cedant_code": cedant_code, "sheet_name": sheet_name},
                 "mapping": {}, "version": version},
            )
            profile["mapping"].setdefault(field_name, excel_name)

    latest_by_sheet = {}
    for (cedant_code, sheet_key, version), profile in os_profile_rows.items():
        key = (cedant_code, sheet_key)
        current = latest_by_sheet.get(key)
        if current is None or version > current["version"]:
            latest_by_sheet[key] = profile

    grouped = {}
    for (cedant_code, sheet_key), profile in latest_by_sheet.items():
        mapping = profile["mapping"]
        key = (cedant_code, profile["version"], _mapping_fingerprint(mapping))
        output = grouped.setdefault(key, {
            "tipe_data": "OS Cedant",
            "cedant": profile["metadata"]["cedant"],
            "cedantCode": cedant_code,
            "sheetNames": [],
            "mappingVersion": profile["version"],
            "mapping": mapping,
        })
        sheet_name = profile["metadata"]["sheet_name"]
        if sheet_name and sheet_name not in output["sheetNames"]:
            output["sheetNames"].append(sheet_name)

    result = []
    for profile in grouped.values():
        profile["sheetNames"].sort(key=str.casefold)
        profile["sheetMet"] = ", ".join(profile["sheetNames"]) or "All sheets"
        profile["lossRef"] = profile["mapping"].get("doc_no", "—")
        profile["outstanding"] = profile["mapping"].get("outstanding", "—")
        profile["dateOfLoss"] = profile["mapping"].get("dol", "—")
        profile["status"] = (
            "READY" if {"doc_no", "outstanding"} <= profile["mapping"].keys() else "INCOMPLETE"
        )
        result.append(profile)
    return result


def _build_mapping_version_profiles(rows: list[dict]) -> list[dict]:
    profiles = {}
    for row in rows:
        dataset_type = str(row.get("dataset_type") or "").strip().upper()
        if dataset_type not in {"OS CEDANT", "INFOPACK"}:
            continue
        field_name = _canonical_field_name(row.get("field_name") or "")
        header_name = str(row.get("excel_name") or "").strip()
        if not field_name or not header_name:
            continue

        argument = row.get("argument") or {}
        if isinstance(argument, str):
            try:
                argument = json.loads(argument)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=500,
                    detail="Aturan mapping tersimpan memiliki argument JSON tidak valid.",
                ) from exc
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail="Argument mapping tersimpan tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        scopes = [
            str(name).strip()
            for name in sheet_names
            if str(name).strip()
        ] or [""]

        cedant_code = str(row.get("cedant_code") or "")
        version = int(row.get("mapping_version") or 0)
        for sheet_name in scopes:
            key = (
                cedant_code,
                dataset_type,
                _normalize_mapping_value(sheet_name),
                version,
            )
            profile = profiles.setdefault(
                key,
                {
                    "tipe_data": "Infopack" if dataset_type == "INFOPACK" else "OS Cedant",
                    "cedant": row.get("cedant_name") or cedant_code or "—",
                    "cedantCode": cedant_code,
                    "sheetNames": [sheet_name] if sheet_name else [],
                    "sheetMet": sheet_name or "All sheets",
                    "mappingVersion": version,
                    "mapping": {},
                },
            )
            profile["mapping"].setdefault(field_name, header_name)

    return sorted(
        profiles.values(),
        key=lambda profile: (
            profile["tipe_data"],
            profile["cedant"].casefold(),
            profile["sheetMet"].casefold(),
            profile["mappingVersion"],
        ),
    )


def _normalize_manual_mapping(mapping: dict, catalog: list[dict]) -> dict[str, str]:
    if not isinstance(mapping, dict) or not mapping:
        raise HTTPException(status_code=422, detail="Mapping harus berisi field dan header.")

    column_fields = {
        _mapping_key(str(field["field_name"])): field
        for field in catalog
        if field.get("default_source") == "column"
    }
    normalized = {}
    for raw_field, raw_header in mapping.items():
        field_key = _mapping_key(str(raw_field))
        field = column_fields.get(field_key)
        if not field:
            raise HTTPException(
                status_code=422,
                detail=f"Field mapping '{raw_field}' bukan field kolom yang tersedia.",
            )
        if not isinstance(raw_header, str) or not raw_header.strip():
            raise HTTPException(
                status_code=422,
                detail=f"Header untuk field '{raw_field}' wajib diisi.",
            )
        canonical_field = _canonical_field_name(str(field["field_name"]))
        if canonical_field in normalized:
            raise HTTPException(
                status_code=422,
                detail=f"Field mapping '{canonical_field}' dikirim lebih dari sekali.",
            )
        normalized[canonical_field] = raw_header.strip()
    return normalized


@router.get("/mappings", summary="Ambil mapping kolom aktif dari database")
def get_column_mappings(db: Session = Depends(get_db)):
    from ..models.database import DB_MODE, DB_LAST_ERROR
    try:
        rows = db.execute(
            text(
                "SELECT m.cedant_code, "
                "COALESCE(NULLIF(BTRIM(c.cedant_name), ''), m.cedant_code) AS cedant_name, "
                "m.header_name AS excel_name, f.field_name, f.dataset_type, "
                "m.mapping_version, m.argument "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = m.cedant_code "
                "WHERE m.is_active = TRUE "
                "ORDER BY cedant_name, m.cedant_code, f.field_name"
            )
        ).mappings().all()
        mapping_history_rows = db.execute(
            text(
                "SELECT m.cedant_code, "
                "COALESCE(NULLIF(BTRIM(c.cedant_name), ''), m.cedant_code) AS cedant_name, "
                "m.header_name AS excel_name, f.field_name, f.dataset_type, "
                "m.mapping_version, m.argument "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = m.cedant_code "
                "ORDER BY cedant_name, m.cedant_code, f.dataset_type, "
                "m.mapping_version, f.field_name"
            )
        ).mappings().all()
        mapping_fields = db.execute(
            text(
                "SELECT field_name, dataset_type, default_source "
                "FROM rekonsiliasi.master_field ORDER BY field_id"
            )
        ).mappings().all()
        history_rows = db.execute(
            text(
                "SELECT DISTINCT ON (b.cedant_code, "
                "UPPER(BTRIM(b.dataset_type)), LOWER(BTRIM(t.sheet_name))) "
                "b.cedant_code, "
                "COALESCE(NULLIF(BTRIM(c.cedant_name), ''), b.cedant_code) AS cedant_name, "
                "UPPER(BTRIM(b.dataset_type)) AS dataset_type, t.sheet_name, "
                "t.mapping_version, t.applied_mapping "
                "FROM rekonsiliasi.upload_table t "
                "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = b.cedant_code "
                "WHERE t.status = 'ready' AND t.mapping_version IS NOT NULL "
                "ORDER BY b.cedant_code, UPPER(BTRIM(b.dataset_type)), "
                "LOWER(BTRIM(t.sheet_name)), t.mapping_version DESC, "
                "t.confirmed_at DESC NULLS LAST, t.table_id DESC"
            )
        ).mappings().all()
        cedants = db.execute(
            text(
                "SELECT DISTINCT ON (cedant_code) cedant_code, "
                "COALESCE(NULLIF(BTRIM(cedant_name), ''), cedant_code) AS cedant_name "
                "FROM rekonsiliasi.master_oscedant_code "
                "WHERE cedant_code IS NOT NULL "
                "AND LOWER(BTRIM(COALESCE(is_active::text, ''))) "
                "IN ('active', 'true', 't', '1') "
                "ORDER BY cedant_code, cedant_name"
            )
        ).mappings().all()
    except Exception as exc:
        return {
            "profiles": [],
            "cedants": [],
            "mapping_versions": [],
            "mapping_fields": [],
            "db_connected": False,
            "db_mode": DB_MODE,
            "db_error": DB_LAST_ERROR or str(exc),
        }

    active_all_sheets = set()
    active_sheet_scopes = defaultdict(set)
    for row in rows:
        key = (
            row.get("cedant_code") or "",
            str(row.get("dataset_type") or "").strip().upper(),
        )
        argument = row.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail="Argument mapping tersimpan tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        normalized_sheets = {
            _normalize_mapping_value(str(sheet))
            for sheet in sheet_names
            if str(sheet).strip()
        }
        if normalized_sheets:
            active_sheet_scopes[key].update(normalized_sheets)
        else:
            active_all_sheets.add(key)

    for row in history_rows:
        cedant_code = row.get("cedant_code") or ""
        dataset_type = str(row.get("dataset_type") or "").strip().upper()
        sheet_name = str(row.get("sheet_name") or "").strip()
        scope_key = (cedant_code, dataset_type)
        if (
            scope_key in active_all_sheets
            or _normalize_mapping_value(sheet_name) in active_sheet_scopes[scope_key]
        ):
            continue
        mapping = _applied_mapping_object(row.get("applied_mapping"))
        for field_name, excel_name in mapping.items():
            if not excel_name:
                continue
            rows.append(
                {
                    "cedant_code": cedant_code,
                    "cedant_name": row.get("cedant_name") or cedant_code,
                    "excel_name": str(excel_name).strip(),
                    "field_name": str(field_name),
                    "dataset_type": dataset_type,
                    "mapping_version": row.get("mapping_version"),
                    "argument": {"sheet_names": [sheet_name]} if sheet_name else {},
                }
            )

    normalized_mapping_fields = {}
    for row in mapping_fields:
        if row.get("default_source") != "column":
            continue
        dataset_type = str(row.get("dataset_type") or "").strip().upper()
        field_name = _canonical_field_name(str(row.get("field_name") or ""))
        if dataset_type not in {"OS CEDANT", "INFOPACK"} or not field_name:
            continue
        key = (dataset_type, field_name)
        normalized_mapping_fields.setdefault(
            key,
            {
                "field_name": field_name,
                "dataset_type": "Infopack" if dataset_type == "INFOPACK" else "OS Cedant",
            },
        )

    profiles = {}
    for profile in _build_os_mapping_profiles(rows):
        key = (
            profile["cedantCode"],
            profile["cedant"],
            tuple(sorted(sheet.casefold() for sheet in profile["sheetNames"])),
            profile["mappingVersion"],
        )
        profiles[key] = profile

    for row in rows:
        dataset_type = str(row.get("dataset_type") or "").strip().upper()
        if dataset_type == "OS CEDANT":
            continue
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
                "tipe_data": "Infopack" if dataset_type == "INFOPACK" else "OS Cedant",
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
        is_infopack = profile["tipe_data"] == "Infopack"
        profile["lossRef"] = (
            profile["mapping"].get("doc_no")
            or profile["mapping"].get("title")
            or "—"
        )
        profile["outstanding"] = (
            profile["mapping"].get("outstanding")
            or profile["mapping"].get("value")
            or profile["mapping"].get("gross")
            or "—"
        )
        profile["dateOfLoss"] = profile["mapping"].get("dol", "—")
        profile["status"] = (
            "READY"
            if (
                is_infopack
                and field_names & {"class_code", "classcode", "title"}
            )
            or (
                not is_infopack
                and {"doc_no", "outstanding"} <= field_names
            )
            else "INCOMPLETE"
        )
        result.append(profile)

    return {
        "profiles": result,
        "mapping_versions": _build_mapping_version_profiles(
            [*mapping_history_rows, *rows]
        ),
        "mapping_fields": list(normalized_mapping_fields.values()),
        "cedants": [
            {
                "cedant_code": row["cedant_code"],
                "cedant_name": row["cedant_name"],
            }
            for row in cedants
        ],
        "db_connected": True,
    }


@router.post("/mappings", summary="Tambahkan versi mapping untuk cedant")
def add_mapping_version(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Payload mapping harus berupa object.")
    raw_dataset_type = str(
        payload.get("dataset_type") or payload.get("tipe_data") or ""
    ).strip()
    normalized_dataset_type = _normalize_field_name(raw_dataset_type)
    if normalized_dataset_type in {"infopack", "info_pack", "info_pack_claim"}:
        dataset_type = "INFOPACK"
    elif normalized_dataset_type in {"os_cedant", "os_claim_cedant", "os_claim"}:
        dataset_type = "OS CEDANT"
    else:
        raise HTTPException(
            status_code=422,
            detail="Dataset harus OS Cedant atau Infopack.",
        )

    cedant_code = str(payload.get("cedant_code") or "").strip()
    if not cedant_code:
        raise HTTPException(status_code=422, detail="Kode cedant wajib dipilih.")
    sheet_names = payload.get("sheet_names") or []
    if isinstance(sheet_names, str):
        sheet_names = [sheet_names]
    if not isinstance(sheet_names, list):
        raise HTTPException(status_code=422, detail="sheet_names harus berupa daftar.")
    sheet_names = list(dict.fromkeys(
        str(sheet).strip()
        for sheet in sheet_names
        if str(sheet).strip()
    ))
    mapping = payload.get("mapping")

    try:
        cedant_record = db.execute(
            text(
                "SELECT cedant_code FROM rekonsiliasi.master_oscedant_code "
                "WHERE cedant_code = :cedant_code"
            ),
            {"cedant_code": cedant_code},
        ).first()
        if not cedant_record:
            raise HTTPException(
                status_code=422,
                detail=f"Kode cedant '{cedant_code}' tidak terdaftar.",
            )

        catalog = _load_field_catalog(db, dataset_type)
        normalized_mapping = _normalize_manual_mapping(mapping, catalog)
        field_by_key = {
            _mapping_key(str(field["field_name"])): field
            for field in catalog
            if field.get("default_source") == "column"
        }
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
            {
                "lock_key": (
                    f"claim-on-duty:mapping:{cedant_code}:{dataset_type}"
                )
            },
        )
        max_version = db.execute(
            text(
                "SELECT MAX(m.mapping_version) "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "WHERE m.cedant_code = :cedant_code "
                "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type"
            ),
            {"cedant_code": cedant_code, "dataset_type": dataset_type},
        ).scalar()
        max_upload_version = db.execute(
            text(
                "SELECT MAX(t.mapping_version) "
                "FROM rekonsiliasi.upload_table t "
                "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
                "WHERE b.cedant_code = :cedant_code "
                "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type"
            ),
            {"cedant_code": cedant_code, "dataset_type": dataset_type},
        ).scalar()
        version = max(int(max_version or 0), int(max_upload_version or 0)) + 1
        argument = {"sheet_names": sheet_names} if sheet_names else {}
        inserts = [
            {
                "cedant_code": cedant_code,
                "field_id": int(field_by_key[_mapping_key(field_name)]["field_id"]),
                "mapping_version": version,
                "source_type": "column",
                "column_index": None,
                "header_name": header_name,
                "argument": json.dumps(argument, ensure_ascii=False),
                "created_by": session_id,
            }
            for field_name, header_name in normalized_mapping.items()
        ]
        db.execute(
            text(
                "INSERT INTO rekonsiliasi.master_mapping_column "
                "(cedant_code, field_id, mapping_version, source_type, column_index, "
                "header_name, argument, is_active, created_by) "
                "VALUES (:cedant_code, :field_id, :mapping_version, :source_type, "
                ":column_index, :header_name, CAST(:argument AS jsonb), TRUE, :created_by)"
            ),
            inserts,
        )
        db.commit()
        return {
            "cedant_code": cedant_code,
            "dataset_type": dataset_type,
            "sheet_names": sheet_names,
            "mapping_version": version,
            "mapping": normalized_mapping,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        logger.exception("Failed creating mapping version")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menambahkan mapping: {exc}",
        ) from exc


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
    doc_no_raw = mapped_value("doc_no") or _find_doc_no(data) or None
    if not doc_no_raw:
        # Fallback ke pk
        pk_raw = str(r.get("pk") or "").strip()
        if pk_raw.lower() not in ("", "nan", "none", "-") and not _parse_dol(pk_raw):
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
    """Look up a cedant code from the existing cedant master."""
    if not cedant_name:
        return None
    name = cedant_name.strip()
    try:
        exact_codes = db.execute(
            text(
                "SELECT DISTINCT cedant_code FROM rekonsiliasi.master_oscedant_code "
                "WHERE LOWER(BTRIM(cedant_name)) = LOWER(:name) "
                "AND cedant_code IS NOT NULL"
            ),
            {"name": name},
        ).scalars().all()
        if len(exact_codes) == 1:
            return exact_codes[0]

        partial_codes = db.execute(
            text(
                "SELECT DISTINCT cedant_code FROM rekonsiliasi.master_oscedant_code "
                "WHERE LOWER(cedant_name) LIKE LOWER(:pattern) AND cedant_code IS NOT NULL"
            ),
            {"pattern": f"%{name}%"},
        ).scalars().all()
        return partial_codes[0] if len(partial_codes) == 1 else None
    except Exception as exc:
        logger.exception("Could not resolve cedant code for name=%s", name)
        raise HTTPException(status_code=500, detail="Gagal mencari kode cedant.") from exc


def _detect_cedant_from_mapping(db: Session, rows: list, sheet_name: str):
    """Resolve a cedant from active or previously confirmed mappings."""
    data = next((row.get("data") for row in rows if row.get("data")), {})
    headers = {_normalize_mapping_value(str(header)) for header in data}
    if not headers:
        return None, None

    try:
        mappings = db.execute(
            text(
                "SELECT m.cedant_code, c.cedant_name, m.header_name AS excel_name, "
                "m.argument, f.field_name "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = m.cedant_code "
                "WHERE m.is_active = TRUE AND m.cedant_code IS NOT NULL "
                "AND UPPER(BTRIM(f.dataset_type)) = 'OS CEDANT'"
            )
        ).mappings().all()
        history_rows = db.execute(
            text(
                "SELECT DISTINCT ON (b.cedant_code, LOWER(BTRIM(t.sheet_name))) "
                "b.cedant_code, c.cedant_name, t.sheet_name, t.applied_mapping "
                "FROM rekonsiliasi.upload_table t "
                "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
                "LEFT JOIN rekonsiliasi.master_oscedant_code c ON c.cedant_code = b.cedant_code "
                "WHERE t.status = 'ready' AND t.mapping_version IS NOT NULL "
                "AND b.cedant_code IS NOT NULL "
                "AND UPPER(BTRIM(b.dataset_type)) = 'OS CEDANT' "
                "ORDER BY b.cedant_code, LOWER(BTRIM(t.sheet_name)), "
                "t.mapping_version DESC, t.confirmed_at DESC NULLS LAST, t.table_id DESC"
            )
        ).mappings().all()
    except Exception as exc:
        logger.exception("Could not detect cedant from saved mappings")
        raise HTTPException(
            status_code=500,
            detail="Gagal mendeteksi cedant dari mapping tersimpan.",
        ) from exc

    for history in history_rows:
        history_mapping = _applied_mapping_object(history.get("applied_mapping"))
        for field_name, excel_name in history_mapping.items():
            if not excel_name:
                continue
            mappings.append(
                {
                    "cedant_code": history.get("cedant_code"),
                    "cedant_name": history.get("cedant_name"),
                    "excel_name": str(excel_name).strip(),
                    "field_name": field_name,
                    "argument": {
                        "sheet_names": [history["sheet_name"]]
                    } if history.get("sheet_name") else {},
                }
            )

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
    if pk_raw.lower() in ("nan", "none", "-"):
        pk_raw = ""

    # Cek apakah pk berbentuk pure tanggal (mis "2026-07-23 00:00:00" atau "23/07/2026")
    # Jika iya, coba cari doc_no dari kolom lain di data
    _is_date_pk = False
    if pk_raw:
        parsed = _parse_dol(pk_raw)
        if parsed and re.match(r"^\d{4}-\d{2}-\d{2}|^\d{2}/\d{2}/\d{4}|^\d{2}-\d{2}-\d{4}", pk_raw):
            _is_date_pk = True

    if _is_date_pk:
        # Cari dari kolom yang namanya mengandung "ref", "no", "claim" tapi BUKAN date/dol
        doc_no = _find_doc_no(data) or None
    else:
        doc_no = pk_raw[:255] if pk_raw else _find_doc_no(data) or None

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
    normalized_columns = {
        _normalize_mapping_value(str(column)): column for column in data
    }

    def get_col(field, fallback_patterns):
        excel_col = col_map.get(field)
        if excel_col:
            column = normalized_columns.get(_normalize_mapping_value(str(excel_col)))
            value = data.get(column) if column is not None else None
            mapped_value = str(value).strip() if value is not None else ""
            if mapped_value and mapped_value.lower() not in ("nan", "none", "-"):
                return mapped_value
        return _find(data, *fallback_patterns)

    class_code = get_col("class_code", CLASS_CODE_PATTERNS) or None
    if class_code and len(class_code) > 50:
        class_code = class_code[:50]
    title = get_col("title", INSURED_PATTERNS) or None
    value = get_col("value", VALUE_PATTERNS) or None
    raw_dol = get_col("dol", DOL_PATTERNS)
    raw_gross = get_col("gross", GROSS_PATTERNS)
    raw_tsi = get_col("tsi", TSI_PATTERNS)
    cob = get_col("cob", COB_PATTERNS) or None
    if cob and len(cob) > 100:
        cob = cob[:100]
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
        "dol":         _parse_dol(raw_dol) if raw_dol else None,
        "cob":         cob,
        "gross":       _parse_decimal(raw_gross),
        "tsi":         _parse_decimal(raw_tsi),
    }


def _raw_primary_key(row: dict, row_index: int, rows_by_source_index: dict) -> str:
    mapped_row = rows_by_source_index.get(row_index) or {}
    value = mapped_row.get("doc_no") or mapped_row.get("title")
    if value in (None, "") and mapped_row.get("row_index") is not None:
        value = mapped_row["row_index"]
    if value in (None, ""):
        value = row.get("pk")
    return str(value or "").strip()


def _write_cedant_rows(
    db: Session,
    rows: list,
    *,
    upload_batch_id: Optional[int] = None,
) -> dict:
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
            text("INSERT INTO rekonsiliasi.master_os_cedant_web "
                 "(cedant_code, doc_no, dol, outstanding, currency, month, year, file_name, sheet_name, upload_batch_id) "
                 "VALUES (:cedant_code, :doc_no, :dol, :outstanding, :currency, :month, :year, :file_name, :sheet_name, :upload_batch_id)"),
            [
                {**row, "upload_batch_id": upload_batch_id}
                for row in to_insert[i:i + BATCH]
            ],
        )
    for i in range(0, len(to_update), BATCH):
        db.execute(
            text(
                "UPDATE rekonsiliasi.master_os_cedant_web AS target SET "
                "dol = COALESCE(target.dol, :dol), "
                "outstanding = COALESCE(target.outstanding, :outstanding), "
                "currency = COALESCE(NULLIF(BTRIM(target.currency), ''), :currency) "
                "WHERE target.cedant_code IS NOT DISTINCT FROM :cedant_code "
                "AND target.doc_no = :doc_no"
            ),
            to_update[i:i + BATCH],
        )
    return {
        "inserted": len(to_insert),
        "skipped": skipped,
        "updated": len(to_update),
    }


def _write_infopack_rows(
    db: Session,
    rows: list,
    *,
    upload_batch_id: Optional[int] = None,
) -> dict:
    if not rows:
        return {"inserted": 0, "skipped": 0, "updated": 0}
    first = rows[0]
    lock_key = "|".join(
        str(first.get(field) or "")
        for field in ("cedant_code", "file_name", "month", "year", "sheet_name")
    )
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
        {"lock_key": lock_key},
    )
    existing_rows = db.execute(
        text(
            "SELECT row_index FROM rekonsiliasi.master_os_infopack_web "
            "WHERE cedant_code IS NOT DISTINCT FROM :cedant_code "
            "AND file_name IS NOT DISTINCT FROM :file_name "
            "AND month IS NOT DISTINCT FROM :month "
            "AND year IS NOT DISTINCT FROM :year "
            "AND sheet_name IS NOT DISTINCT FROM :sheet_name"
        ),
        {
            "cedant_code": first.get("cedant_code"),
            "file_name": first.get("file_name"),
            "month": first.get("month"),
            "year": first.get("year"),
            "sheet_name": first.get("sheet_name"),
        },
    ).scalars().all()
    existing_indices = set(existing_rows)
    rows_by_index = {}
    for row in rows:
        index = row.get("row_index")
        if index in existing_indices or index in rows_by_index:
            continue
        rows_by_index[index] = row
    skipped = len(rows) - len(rows_by_index)
    rows = list(rows_by_index.values())
    if not rows:
        return {"inserted": 0, "skipped": skipped, "updated": 0}
    BATCH = 1000
    inserted = 0
    for i in range(0, len(rows), BATCH):
        db.execute(
            text("INSERT INTO rekonsiliasi.master_os_infopack_web "
                 "(cedant_code, class_code, title, value, row_index, month, year, file_name, "
                 "sheet_name, dol, cob, gross, tsi, upload_batch_id) "
                 "VALUES (:cedant_code, :class_code, :title, :value, :row_index, :month, :year, "
                 ":file_name, :sheet_name, :dol, :cob, :gross, :tsi, :upload_batch_id)"),
            [
                {**row, "upload_batch_id": upload_batch_id}
                for row in rows[i:i + BATCH]
            ],
        )
        inserted += len(rows[i:i + BATCH])
    return {"inserted": inserted, "skipped": skipped, "updated": 0}


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
        "dbField": "dol",
        "label": "Date of Loss (DOL)",
        "required": True,
        "sqlType": "DATE",
        "description": "Tanggal terjadinya kerugian",
    },
    {
        "dbField": "cob",
        "label": "Class of Business (COB)",
        "required": True,
        "sqlType": "VARCHAR(100)",
        "description": "Kelas bisnis Infopack",
    },
    {
        "dbField": "gross",
        "label": "Gross",
        "required": True,
        "sqlType": "NUMERIC(30, 2)",
        "description": "Nilai gross",
    },
    {
        "dbField": "tsi",
        "label": "Total Sum Insured (TSI)",
        "required": True,
        "sqlType": "NUMERIC(30, 2)",
        "description": "Total nilai pertanggungan",
    },
    {
        "dbField": "title",
        "label": "Title / Insured / Uraian",
        "required": False,
        "sqlType": "TEXT",
        "description": "Nama tertanggung atau judul baris InfoPack",
    },
    {
        "dbField": "value",
        "label": "Value / Gross Amount",
        "required": False,
        "sqlType": "TEXT",
        "description": "Nilai angka / nominal pada laporan InfoPack",
    },
]

INFOPACK_REQUIRED_FIELDS = ("dol", "cob", "gross", "tsi")
INFOPACK_FIELD_LABELS = {
    "dol": "DOL",
    "cob": "COB",
    "gross": "Gross",
    "tsi": "TSI",
}
WORKFLOW_RAW_META_KEY = "__claim_on_duty__"
MAPPING_FIELD_ALIASES = {
    "doc_no": "loss_ref",
    "title": "insured",
    "class_of_business": "cob",
    "gross_amount": "gross",
    "total_sum_insured": "tsi",
    "sum_insured": "tsi",
}
VIRTUAL_MAPPING_FIELDS = {"cob", "tsi", "value", "doc_no", "title", "outstanding"}


def _validate_infopack_headers(columns: list[str], col_map: dict) -> None:
    available = {_normalize_mapping_value(str(column)) for column in columns}
    missing = [
        INFOPACK_FIELD_LABELS[field]
        for field in INFOPACK_REQUIRED_FIELDS
        if not col_map.get(field)
        or _normalize_mapping_value(str(col_map[field])) not in available
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Kolom wajib Infopack tidak ditemukan atau belum dipetakan: "
            + ", ".join(missing),
        )


def _validate_infopack_rows(
    rows_by_index: dict[int, dict],
    *,
    row_numbers_are_excel: bool = False,
) -> None:
    invalid_rows = []
    relevant_fields = (
        "class_code", "title", "value", "dol", "cob", "gross", "tsi",
    )
    for row_index, row in rows_by_index.items():
        if not any(row.get(field) not in (None, "") for field in relevant_fields):
            continue
        missing = [
            INFOPACK_FIELD_LABELS[field]
            for field in INFOPACK_REQUIRED_FIELDS
            if row.get(field) is None or row.get(field) == ""
        ]
        if missing:
            excel_row = row_index if row_numbers_are_excel else row_index + 2
            invalid_rows.append(f"{excel_row} ({', '.join(missing)})")
    if invalid_rows:
        details = "; ".join(invalid_rows[:20])
        if len(invalid_rows) > 20:
            details += f"; dan {len(invalid_rows) - 20} baris lainnya"
        raise HTTPException(
            status_code=422,
            detail=f"Nilai wajib Infopack kosong atau tidak valid pada baris Excel: {details}.",
        )


def _dataset_type(tipe_data: str) -> str:
    target = _target_table(tipe_data)
    return "INFOPACK" if target == INFOPACK_TABLE else "OS CEDANT"


def _workflow_required_fields(dataset_type: str) -> tuple[str, ...]:
    if dataset_type == "INFOPACK":
        return ("dol", "gross", "cob", "tsi")
    return ("loss_ref", "outstanding")


def _load_field_catalog(db: Session, dataset_type: str) -> list[dict]:
    return [
        dict(row)
        for row in db.execute(
            text(
                "SELECT field_id, field_name, data_type, default_source "
                "FROM rekonsiliasi.master_field "
                "WHERE UPPER(BTRIM(dataset_type)) = :dataset_type "
                "ORDER BY field_id"
            ),
            {"dataset_type": dataset_type},
        ).mappings()
    ]


def _mapping_key(field_name: str) -> str:
    normalized = _normalize_field_name(field_name)
    return MAPPING_FIELD_ALIASES.get(normalized, normalized)


def _auto_mapping_for_catalog(
    headers: list[str],
    dataset_type: str,
    catalog: list[dict],
    existing_mapping: Optional[dict] = None,
) -> dict[str, str]:
    is_infopack = dataset_type == "INFOPACK"
    inferred = _auto_match_headers_for_sheet(
        headers, is_infopack, existing_mapping or {}
    )
    allowed = {field["field_name"] for field in catalog}
    allowed.update(VIRTUAL_MAPPING_FIELDS)
    result = {}
    for field_name, header in inferred.items():
        key = _mapping_key(field_name)
        if key in allowed and header in headers:
            result[key] = header
    if is_infopack:
        if "cob" not in result and result.get("class_code"):
            result["cob"] = result["class_code"]
        if "tsi" not in result:
            tsi_header = _match_header_by_patterns(headers, TSI_PATTERNS)
            if tsi_header:
                result["tsi"] = tsi_header
    return result


def _suggest_existing_mapping(
    db: Session,
    cedant_code: str,
    dataset_type: str,
    sheet_name: str,
    headers: list[str],
    catalog: list[dict],
) -> tuple[Optional[int], dict[str, str]]:
    rows = db.execute(
        text(
            "SELECT m.mapping_version, f.field_name, m.header_name, m.argument "
            "FROM rekonsiliasi.master_mapping_column m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code AND m.is_active = TRUE "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type "
            "ORDER BY m.mapping_version DESC, m.column_index"
        ),
        {"cedant_code": cedant_code, "dataset_type": dataset_type},
    ).mappings()
    header_lookup = {_normalize_mapping_value(header): header for header in headers}
    catalog_fields = {
        field["field_name"]
        for field in catalog
        if dataset_type.upper() != "OS CEDANT"
        or field.get("default_source") == "column"
    }
    by_version: dict[int, dict[str, str]] = {}
    for row in rows:
        argument = row.get("argument") or {}
        if isinstance(argument, str):
            try:
                argument = json.loads(argument)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=500, detail="Aturan mapping tersimpan memiliki argument JSON tidak valid."
                ) from exc
        if not isinstance(argument, dict):
            raise HTTPException(status_code=500, detail="Argument mapping tersimpan tidak valid.")
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        if (
            dataset_type.upper() != "OS CEDANT"
            and sheet_names
            and not any(
                _normalize_mapping_value(str(name))
                == _normalize_mapping_value(sheet_name)
                for name in sheet_names
            )
        ):
            continue
        field_name = row.get("field_name") or ""
        header_name = row.get("header_name") or ""
        if field_name not in catalog_fields or not header_name:
            continue
        header = header_lookup.get(_normalize_mapping_value(header_name))
        if header:
            by_version.setdefault(int(row["mapping_version"]), {})[field_name] = header

    required = _workflow_required_fields(dataset_type)
    ranked = sorted(
        by_version.items(),
        key=lambda item: (
            sum(bool(item[1].get(field)) for field in required),
            len(item[1]),
            item[0],
        ),
        reverse=True,
    )
    if not ranked:
        version, stored_mapping = _load_confirmed_upload_mapping(
            db,
            cedant_code,
            dataset_type,
            sheet_name,
        )
        header_lookup = {
            _normalize_mapping_value(header): header
            for header in headers
        }
        selected = {}
        for raw_field, raw_header in stored_mapping.items():
            field_name = _mapping_key(str(raw_field))
            if field_name not in catalog_fields or not raw_header:
                continue
            header = header_lookup.get(_normalize_mapping_value(str(raw_header)))
            if header:
                selected[field_name] = header
        return (version, selected) if selected else (None, {})
    version, selected = ranked[0]
    return version, selected


def _normalize_requested_mapping(
    mapping: dict,
    headers: list[str],
    catalog: list[dict],
    dataset_type: str,
) -> dict[str, str]:
    if not isinstance(mapping, dict):
        raise HTTPException(status_code=422, detail="mapping harus berupa JSON object.")
    allowed = {field["field_name"] for field in catalog} | VIRTUAL_MAPPING_FIELDS
    header_lookup = {_normalize_mapping_value(header): header for header in headers}
    normalized: dict[str, str] = {}
    for raw_field, raw_header in mapping.items():
        field = _mapping_key(str(raw_field))
        if field not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Field mapping '{raw_field}' tidak tersedia untuk {dataset_type}.",
            )
        if raw_header in (None, ""):
            continue
        header = header_lookup.get(_normalize_mapping_value(str(raw_header)))
        if not header:
            raise HTTPException(
                status_code=422,
                detail=f"Header '{raw_header}' tidak ditemukan pada sheet.",
            )
        normalized[field] = header
    if dataset_type == "INFOPACK":
        if "cob" not in normalized and normalized.get("class_code"):
            normalized["cob"] = normalized["class_code"]
        if "class_code" not in normalized and normalized.get("cob"):
            normalized["class_code"] = normalized["cob"]
    return normalized


def _workflow_mapping_status(mapping: dict[str, str], dataset_type: str) -> tuple[bool, list[str]]:
    missing = [
        field
        for field in _workflow_required_fields(dataset_type)
        if not mapping.get(field)
    ]
    return not missing, missing


def _raw_value(data: dict, mapping: dict[str, str], *fields: str) -> str:
    for field in fields:
        header = mapping.get(field)
        if not header:
            continue
        value = data.get(header)
        if value is not None and str(value).strip().lower() not in ("", "nan", "none", "-"):
            return str(value).strip()
    return ""


def _read_workflow_raw_rows(
    db: Session,
    *,
    session_id: str,
    cedant_code: str,
    file_name: str,
    sheet_name: str,
    month: int,
    year: int,
    table_id: int,
) -> list[tuple[MasterRawRow, dict, dict]]:
    rows = (
        db.query(MasterRawRow)
        .filter(
            MasterRawRow.session_id == session_id,
            MasterRawRow.cedant_code == cedant_code,
            MasterRawRow.file_name == file_name,
            MasterRawRow.sheet_name == sheet_name,
            MasterRawRow.month == month,
            MasterRawRow.year == year,
        )
        .order_by(MasterRawRow.id)
        .all()
    )
    selected = []
    for raw in rows:
        try:
            stored = json.loads(raw.full_row_data)
        except (TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Arsip raw row {raw.id} tidak berisi JSON valid.",
            ) from exc
        metadata = stored.pop(WORKFLOW_RAW_META_KEY, {})
        if str(metadata.get("table_id", "")) == str(table_id):
            selected.append((raw, stored, metadata))
    return selected


def _mapping_field_ids(catalog: list[dict]) -> dict[str, int]:
    return {field["field_name"]: int(field["field_id"]) for field in catalog}


def _upload_table_context(
    db: Session,
    table_id: int,
    session_id: str,
    *,
    for_update: bool = False,
) -> dict:
    lock_clause = " FOR UPDATE OF t" if for_update else ""
    row = db.execute(
        text(
            "SELECT t.table_id, t.batch_id, t.sheet_name, t.sheet_index, "
            "t.mapping_version, t.applied_mapping, t.status AS table_status, "
            "b.cedant_code, b.dataset_type, b.file_name, b.reporting_month, "
            "b.reporting_year, b.uploaded_by, b.status AS batch_status "
            "FROM rekonsiliasi.upload_table t "
            "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
            "WHERE t.table_id = :table_id AND b.uploaded_by = :session_id"
            + lock_clause
        ),
        {"table_id": table_id, "session_id": session_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Sheet upload tidak ditemukan.")
    return dict(row)


def _table_headers(db: Session, table_id: int) -> list[str]:
    return [
        row[0] or ""
        for row in db.execute(
            text(
                "SELECT original_header FROM rekonsiliasi.header_library "
                "WHERE table_id = :table_id ORDER BY column_index"
            ),
            {"table_id": table_id},
        ).all()
    ]


def _mapping_fingerprint(mapping: dict[str, str]) -> tuple:
    return tuple(
        sorted(
            (field, _normalize_mapping_value(header))
            for field, header in mapping.items()
        )
    )


def _column_mapping_rules(
    mapping: dict[str, str],
    catalog: list[dict],
) -> dict[str, str]:
    column_fields = {
        field["field_name"]
        for field in catalog
        if field.get("default_source") == "column"
    }
    return {
        field_name: header
        for field_name, header in mapping.items()
        if field_name in column_fields
    }


def _find_identical_mapping_version(
    mapping: dict[str, str],
    versions: list[tuple[int, dict[str, str]]],
    catalog: list[dict],
) -> Optional[int]:
    fingerprint = _mapping_fingerprint(_column_mapping_rules(mapping, catalog))
    for version, candidate in versions:
        if _mapping_fingerprint(_column_mapping_rules(candidate, catalog)) == fingerprint:
            return version
    return None


def _validate_required_mapping_catalog(dataset_type: str, catalog: list[dict]) -> None:
    column_fields = {
        field["field_name"]
        for field in catalog
        if field.get("default_source") == "column"
    }
    missing = [
        field
        for field in _workflow_required_fields(dataset_type)
        if field not in column_fields
    ]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=(
                "master_field belum memiliki definisi sumber kolom untuk field wajib: "
                + ", ".join(missing)
                + ". Jalankan backend/scripts/provision_upload_point2_3.py --apply."
            ),
        )


def _add_mapping_sheet_scope(
    db: Session,
    cedant_code: str,
    dataset_type: str,
    mapping_version: int,
    sheet_name: str,
) -> None:
    rows = db.execute(
        text(
            "SELECT m.mapping_id, m.argument "
            "FROM rekonsiliasi.master_mapping_column m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code "
            "AND m.mapping_version = :mapping_version "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type"
        ),
        {
            "cedant_code": cedant_code,
            "mapping_version": mapping_version,
            "dataset_type": dataset_type.upper(),
        },
    ).mappings()
    normalized_sheet = _normalize_mapping_value(sheet_name)
    for row in rows:
        argument = row.get("argument") or {}
        if isinstance(argument, str):
            argument = json.loads(argument)
        if not isinstance(argument, dict):
            raise HTTPException(
                status_code=500,
                detail="Argument mapping tersimpan tidak valid.",
            )
        sheet_names = argument.get("sheet_names") or []
        if isinstance(sheet_names, str):
            sheet_names = [sheet_names]
        if any(
            _normalize_mapping_value(str(name)) == normalized_sheet
            for name in sheet_names
        ):
            continue
        argument["sheet_names"] = [*sheet_names, sheet_name]
        db.execute(
            text(
                "UPDATE rekonsiliasi.master_mapping_column "
                "SET argument = CAST(:argument AS jsonb) "
                "WHERE mapping_id = :mapping_id"
            ),
            {
                "argument": json.dumps(argument, ensure_ascii=False),
                "mapping_id": row["mapping_id"],
            },
        )


def _select_legacy_mapping_version(
    db: Session,
    context: dict,
    table_id: int,
    mapping: dict[str, str],
    catalog: list[dict],
) -> tuple[int, bool]:
    history = db.execute(
        text(
            "SELECT t.table_id, t.mapping_version, t.applied_mapping "
            "FROM rekonsiliasi.upload_table t "
            "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
            "WHERE b.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type "
            "AND t.sheet_name = :sheet_name AND t.mapping_version IS NOT NULL "
            "AND t.table_id <> :table_id"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
            "sheet_name": context["sheet_name"],
            "table_id": table_id,
        },
    ).mappings()
    fingerprint = _mapping_fingerprint(mapping)
    for row in history:
        previous = row.get("applied_mapping") or {}
        if isinstance(previous, str):
            try:
                previous = json.loads(previous)
            except json.JSONDecodeError:
                continue
        if isinstance(previous, dict) and isinstance(previous.get("mapping"), dict):
            previous = previous["mapping"]
        if isinstance(previous, dict):
            try:
                previous = _normalize_requested_mapping(
                    previous,
                    _table_headers(db, int(row["table_id"])),
                    catalog,
                    context["dataset_type"].upper(),
                )
            except HTTPException:
                pass
            if _mapping_fingerprint(previous) == fingerprint:
                return int(row["mapping_version"]), False

    persistable_fields = {
        field["field_name"]
        for field in catalog
        if field.get("default_source") == "column"
    }
    if set(mapping) <= persistable_fields:
        db_history = db.execute(
            text(
                "SELECT m.mapping_version, f.field_name, m.header_name, m.argument "
                "FROM rekonsiliasi.master_mapping_column m "
                "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
                "WHERE m.cedant_code = :cedant_code "
                "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type "
                "ORDER BY m.mapping_version DESC"
            ),
            {
                "cedant_code": context["cedant_code"],
                "dataset_type": context["dataset_type"].upper(),
            },
        ).mappings()
        db_versions: dict[int, dict[str, str]] = {}
        for row in db_history:
            argument = row.get("argument") or {}
            if isinstance(argument, str):
                try:
                    argument = json.loads(argument)
                except json.JSONDecodeError:
                    continue
            sheet_names = argument.get("sheet_names") or [] if isinstance(argument, dict) else []
            if isinstance(sheet_names, str):
                sheet_names = [sheet_names]
            if sheet_names and not any(
                _normalize_mapping_value(str(name))
                == _normalize_mapping_value(context["sheet_name"])
                for name in sheet_names
            ):
                continue
            field_name = row.get("field_name")
            header_name = row.get("header_name")
            if field_name in mapping and header_name:
                db_versions.setdefault(int(row["mapping_version"]), {})[field_name] = header_name
        for existing_version, existing_mapping in db_versions.items():
            if _mapping_fingerprint(existing_mapping) == fingerprint:
                return existing_version, False

    existing = db.execute(
        text(
            "SELECT MAX(mapping_version) FROM rekonsiliasi.master_mapping_column m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
        },
    ).scalar()
    table_max = db.execute(
        text(
            "SELECT MAX(t.mapping_version) FROM rekonsiliasi.upload_table t "
            "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
            "WHERE b.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
        },
    ).scalar()
    version = max(int(existing or 0), int(table_max or 0)) + 1
    field_ids = _mapping_field_ids(catalog)
    headers = _table_headers(db, table_id)
    inserts = []
    for field in catalog:
        field_name = field["field_name"]
        if field.get("default_source") != "column" or not mapping.get(field_name):
            continue
        header = mapping[field_name]
        inserts.append({
            "cedant_code": context["cedant_code"],
            "field_id": field_ids[field_name],
            "mapping_version": version,
            "source_type": "column",
            "column_index": next(
                (
                    index
                    for index, value in enumerate(headers, start=1)
                    if _normalize_mapping_value(value) == _normalize_mapping_value(header)
                ),
                None,
            ),
            "header_name": header,
            "argument": json.dumps({"sheet_names": [context["sheet_name"]]}),
            "created_by": context["uploaded_by"],
        })
    if inserts:
        db.execute(
            text(
                "INSERT INTO rekonsiliasi.master_mapping_column "
                "(cedant_code, field_id, mapping_version, source_type, column_index, "
                "header_name, argument, is_active, created_by) "
                "VALUES (:cedant_code, :field_id, :mapping_version, :source_type, "
                ":column_index, :header_name, CAST(:argument AS jsonb), TRUE, :created_by)"
            ),
            inserts,
        )
    return version, True


def _select_mapping_version(
    db: Session,
    context: dict,
    table_id: int,
    mapping: dict[str, str],
    catalog: list[dict],
) -> tuple[int, bool]:
    if context["dataset_type"].upper() != "OS CEDANT":
        return _select_legacy_mapping_version(db, context, table_id, mapping, catalog)

    _validate_required_mapping_catalog(context["dataset_type"].upper(), catalog)
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 0))"),
        {
            "lock_key": (
                f"claim-on-duty:mapping:{context['cedant_code']}:"
                f"{context['dataset_type'].upper()}"
            )
        },
    )
    column_mapping = _column_mapping_rules(mapping, catalog)

    history = db.execute(
        text(
            "SELECT t.table_id, t.mapping_version, t.applied_mapping "
            "FROM rekonsiliasi.upload_table t "
            "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
            "WHERE b.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type "
            "AND t.mapping_version IS NOT NULL "
            "AND t.table_id <> :table_id"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
            "table_id": table_id,
        },
    ).mappings()
    for row in history:
        previous = row.get("applied_mapping") or {}
        if isinstance(previous, str):
            try:
                previous = json.loads(previous)
            except json.JSONDecodeError:
                continue
        if isinstance(previous, dict) and isinstance(previous.get("mapping"), dict):
            previous = previous["mapping"]
        if isinstance(previous, dict):
            try:
                previous = _normalize_requested_mapping(
                    previous,
                    _table_headers(db, int(row["table_id"])),
                    catalog,
                    context["dataset_type"].upper(),
                )
            except HTTPException:
                pass
            identical = _find_identical_mapping_version(
                column_mapping,
                [(int(row["mapping_version"]), previous)],
                catalog,
            )
            if identical is not None:
                _add_mapping_sheet_scope(
                    db,
                    context["cedant_code"],
                    context["dataset_type"],
                    identical,
                    context["sheet_name"],
                )
                return identical, False

    db_history = db.execute(
        text(
            "SELECT m.mapping_version, f.field_name, m.header_name "
            "FROM rekonsiliasi.master_mapping_column m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type "
            "ORDER BY m.mapping_version DESC"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
        },
    ).mappings()
    db_versions: dict[int, dict[str, str]] = {}
    for row in db_history:
        field_name = row.get("field_name")
        header_name = row.get("header_name")
        if field_name and header_name:
            db_versions.setdefault(int(row["mapping_version"]), {})[field_name] = header_name
    identical = _find_identical_mapping_version(
        column_mapping,
        list(db_versions.items()),
        catalog,
    )
    if identical is not None:
        _add_mapping_sheet_scope(
            db,
            context["cedant_code"],
            context["dataset_type"],
            identical,
            context["sheet_name"],
        )
        return identical, False

    existing = db.execute(
        text(
            "SELECT MAX(mapping_version) FROM rekonsiliasi.master_mapping_column m "
            "JOIN rekonsiliasi.master_field f ON f.field_id = m.field_id "
            "WHERE m.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(f.dataset_type)) = :dataset_type"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
        },
    ).scalar()
    table_max = db.execute(
        text(
            "SELECT MAX(t.mapping_version) FROM rekonsiliasi.upload_table t "
            "JOIN rekonsiliasi.upload_batch b ON b.batch_id = t.batch_id "
            "WHERE b.cedant_code = :cedant_code "
            "AND UPPER(BTRIM(b.dataset_type)) = :dataset_type"
        ),
        {
            "cedant_code": context["cedant_code"],
            "dataset_type": context["dataset_type"].upper(),
        },
    ).scalar()
    version = max(int(existing or 0), int(table_max or 0)) + 1
    field_ids = _mapping_field_ids(catalog)
    headers = _table_headers(db, table_id)
    inserts = []
    for field_name, header in column_mapping.items():
        inserts.append({
            "cedant_code": context["cedant_code"],
            "field_id": field_ids[field_name],
            "mapping_version": version,
            "source_type": "column",
            "column_index": next(
                (index for index, value in enumerate(
                    headers, start=1
                ) if _normalize_mapping_value(value) == _normalize_mapping_value(header)),
                None,
            ),
            "header_name": header,
            "argument": json.dumps({"sheet_names": [context["sheet_name"]]}),
            "created_by": context["uploaded_by"],
        })
    if inserts:
        db.execute(
            text(
                "INSERT INTO rekonsiliasi.master_mapping_column "
                "(cedant_code, field_id, mapping_version, source_type, column_index, "
                "header_name, argument, is_active, created_by) "
                "VALUES (:cedant_code, :field_id, :mapping_version, :source_type, "
                ":column_index, :header_name, CAST(:argument AS jsonb), TRUE, :created_by)"
            ),
            inserts,
        )
    return version, True


def _normalize_cob(db: Session, value: str) -> tuple[Optional[str], Optional[str]]:
    cob = (value or "").strip()
    if not cob:
        return None, None
    match = db.execute(
        text(
            "SELECT class_code, class_name FROM rekonsiliasi.master_class_code "
            "WHERE UPPER(BTRIM(class_code)) = UPPER(:value) "
            "OR UPPER(BTRIM(class_mcode)) = UPPER(:value) "
            "OR UPPER(BTRIM(class_name)) = UPPER(:value) "
            "ORDER BY CASE "
            "WHEN UPPER(BTRIM(class_code)) = UPPER(:value) THEN 0 "
            "WHEN UPPER(BTRIM(class_mcode)) = UPPER(:value) THEN 1 ELSE 2 END "
            "LIMIT 1"
        ),
        {"value": cob},
    ).mappings().first()
    if match:
        return match["class_code"], (match["class_name"] or "").strip() or cob
    return (cob[:50] or None), cob[:100] or None


def _build_workflow_cedant_row(
    data: dict,
    mapping: dict[str, str],
    context: dict,
) -> dict:
    raw_dol = _raw_value(data, mapping, "dol") or _find(data, *DOL_PATTERNS)
    raw_outstanding = _raw_value(data, mapping, "outstanding")
    raw_currency = _raw_value(data, mapping, "currency")
    return {
        "cedant_code": context["cedant_code"],
        "doc_no": (
            _raw_value(data, mapping, "loss_ref", "doc_no")
            or _find_doc_no(data)
        )[:255] or None,
        "dol": _parse_dol(raw_dol) if raw_dol else None,
        "outstanding": _parse_decimal(raw_outstanding),
        "currency": raw_currency[:10] or None,
        "month": int(context["reporting_month"]),
        "year": int(context["reporting_year"]),
        "file_name": context["file_name"],
        "sheet_name": context["sheet_name"],
    }


def _has_cedant_result_values(row: dict) -> bool:
    return any(
        row.get(field) not in (None, "")
        for field in ("doc_no", "dol", "outstanding", "currency")
    )


def _cedant_result_table_name(short_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (short_name or "").lower()).strip("_")
    table_name = f"os_claim_cedant_{slug}"
    if not slug or len(table_name) > 63:
        raise HTTPException(
            status_code=422,
            detail=f"Nama cedant '{short_name}' tidak dapat digunakan untuk nama tabel hasil.",
        )
    return table_name


def _ensure_insured_result_column(
    db: Session,
    table_name: str,
    table_columns: set[str],
    field_name: str,
    header: str,
) -> None:
    if header in table_columns:
        return
    if (
        not table_name.startswith("os_claim_cedant_")
        or _mapping_key(field_name) != "insured"
        or not header.strip()
        or len(header) > 63
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Kolom mapping '{header}' belum tersedia di "
                f"hasil_rekonsiliasi.{table_name}; perbarui tabel hasil terlebih dahulu."
            ),
        )

    preparer = db.get_bind().dialect.identifier_preparer
    quoted_table = (
        f"{preparer.quote_schema('hasil_rekonsiliasi')}."
        f"{preparer.quote(table_name)}"
    )
    db.execute(
        text(
            f"ALTER TABLE {quoted_table} "
            f"ADD COLUMN IF NOT EXISTS {preparer.quote(header)} TEXT"
        )
    )
    table_columns.add(header)


def _write_cedant_result_rows(
    db: Session,
    *,
    cedant_code: str,
    table_id: int,
    month: int,
    year: int,
    file_name: str,
    sheet_name: str,
    mapping: dict[str, str],
    rows: list[tuple[dict, dict, int]],
) -> tuple[str, int]:
    short_name = db.execute(
        text(
            "SELECT cedant_short_name FROM rekonsiliasi.master_oscedant_code "
            "WHERE cedant_code = :cedant_code"
        ),
        {"cedant_code": cedant_code},
    ).scalar()
    if not short_name:
        raise HTTPException(
            status_code=422,
            detail=f"Short name cedant '{cedant_code}' belum tersedia di master cedant.",
        )

    table_name = _cedant_result_table_name(str(short_name))
    table_exists = db.execute(
        text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'hasil_rekonsiliasi' AND table_name = :table_name)"
        ),
        {"table_name": table_name},
    ).scalar_one()
    if not table_exists:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Tabel hasil_rekonsiliasi.{table_name} belum tersedia. "
                "Buat tabel berdasarkan Mapping Rules sebelum konfirmasi upload."
            ),
        )

    table_columns = {
        row[0]
        for row in db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'hasil_rekonsiliasi' AND table_name = :table_name"
            ),
            {"table_name": table_name},
        ).all()
    }
    mapped_columns: dict[str, str] = {}
    for field_name, header in mapping.items():
        if not header:
            continue
        if field_name == "class_code":
            continue
        if header in {
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
        }:
            raise HTTPException(
                status_code=422,
                detail=f"Header sumber '{header}' bentrok dengan metadata tabel hasil.",
            )
        _ensure_insured_result_column(
            db, table_name, table_columns, field_name, header
        )
        mapped_columns[header] = field_name

    metadata_values = {
        "cedant_code": cedant_code,
        "class_code": None,
        "upload_table_id": table_id,
        "reporting_month": month,
        "reporting_year": year,
        "file_name": file_name,
        "sheet_name": sheet_name,
    }
    missing_metadata = set(metadata_values) - table_columns
    if missing_metadata:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Kolom metadata {', '.join(sorted(missing_metadata))} belum tersedia di "
                f"hasil_rekonsiliasi.{table_name}."
            ),
        )
    if "excel_row_number" not in table_columns:
        raise HTTPException(
            status_code=422,
            detail=f"Kolom excel_row_number belum tersedia di hasil_rekonsiliasi.{table_name}.",
        )

    insert_columns = [
        "cedant_code",
        "class_code",
        "upload_table_id",
        "excel_row_number",
        *mapped_columns,
        "reporting_month",
        "reporting_year",
        "file_name",
        "sheet_name",
    ]
    preparer = db.get_bind().dialect.identifier_preparer
    quoted_table = preparer.quote(table_name)
    quoted_columns = ", ".join(preparer.quote(column) for column in insert_columns)
    value_names = [f"value_{index}" for index in range(len(insert_columns))]
    insert_sql = text(
        f"INSERT INTO hasil_rekonsiliasi.{quoted_table} ({quoted_columns}) "
        f"VALUES ({', '.join(':' + name for name in value_names)}) "
        "ON CONFLICT (upload_table_id, excel_row_number) DO NOTHING"
    )

    parameters = []
    for source_data, normalized, excel_row in rows:
        if not excel_row:
            raise HTTPException(
                status_code=422,
                detail="Nomor baris Excel tidak tersedia untuk penyimpanan hasil cedant.",
            )
        values = {
            **metadata_values,
            "excel_row_number": int(excel_row),
        }
        class_code_header = mapping.get("class_code")
        if class_code_header:
            values["class_code"] = source_data.get(class_code_header)
        for header, field_name in mapped_columns.items():
            if field_name == "outstanding":
                values[header] = normalized.get("outstanding")
            elif field_name == "dol":
                values[header] = normalized.get("dol")
            else:
                values[header] = source_data.get(header)
        parameters.append(
            {name: values.get(column) for name, column in zip(value_names, insert_columns)}
        )

    if not parameters:
        return table_name, 0

    result = db.execute(insert_sql, parameters)
    return table_name, max(result.rowcount or 0, 0)


def _build_workflow_infopack_row(
    db: Session,
    data: dict,
    mapping: dict[str, str],
    context: dict,
    excel_row: int,
) -> dict:
    cob_source = _raw_value(data, mapping, "cob", "class_code")
    normalized_class_code, normalized_cob = _normalize_cob(db, cob_source)
    raw_dol = _raw_value(data, mapping, "dol")
    raw_gross = _raw_value(data, mapping, "gross", "value")
    raw_tsi = _raw_value(data, mapping, "tsi")
    title = _raw_value(data, mapping, "insured", "title")
    raw_value = _raw_value(data, mapping, "value") or raw_gross
    return {
        "cedant_code": context["cedant_code"],
        "class_code": normalized_class_code,
        "title": title or None,
        "value": raw_value or None,
        "row_index": excel_row,
        "month": int(context["reporting_month"]),
        "year": int(context["reporting_year"]),
        "file_name": context["file_name"],
        "sheet_name": context["sheet_name"],
        "dol": _parse_dol(raw_dol) if raw_dol else None,
        "cob": normalized_cob,
        "gross": _parse_decimal(raw_gross),
        "tsi": _parse_decimal(raw_tsi),
    }


def _save_master_upload(
    db: Session,
    job: UploadJob,
    *,
    file_bytes: bytes,
    session_id: str,
    cedant_code: str,
    cedant_name: Optional[str],
    target_table: str,
    bulan: str,
    tahun: str,
    file_name: str,
    sheet_name: str,
    scanned_headers: list[str],
    effective_col_map: dict,
    raw_result: dict,
    rows_by_index: dict[int, dict],
) -> tuple[int, int, dict]:
    try:
        month = int(bulan)
        year = int(tahun)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Bulan dan tahun pelaporan harus berupa angka.")
    if (
        not 1 <= month <= 12
        or len(str(tahun).strip()) != 4
        or not 1900 <= year <= 9999
    ):
        raise HTTPException(
            status_code=422,
            detail="Bulan harus 1-12 dan tahun harus antara 1900-9999.",
        )
    if not cedant_code:
        raise HTTPException(status_code=422, detail="Cedant wajib dipilih atau berhasil dideteksi.")
    if len(cedant_code) > 10:
        raise HTTPException(status_code=422, detail="Kode cedant melebihi batas 10 karakter.")

    cedant_exists = db.execute(
        text("SELECT 1 FROM rekonsiliasi.master_oscedant_code WHERE cedant_code = :code"),
        {"code": cedant_code},
    ).scalar()
    if not cedant_exists:
        raise HTTPException(
            status_code=422,
            detail=f"Kode cedant '{cedant_code}' tidak terdaftar pada master_oscedant_code.",
        )

    available_sheets = get_sheet_names(file_bytes)
    try:
        sheet_index = available_sheets.index(sheet_name) + 1
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Sheet '{sheet_name}' tidak ditemukan pada workbook.",
        ) from exc

    dataset_type = "INFOPACK" if target_table == INFOPACK_TABLE else "OS CEDANT"
    display_type = "Infopack" if target_table == INFOPACK_TABLE else "OS Cedant"
    batch_id = db.execute(
        text(
            "INSERT INTO rekonsiliasi.upload_batch "
            "(cedant_code, dataset_type, file_name, reporting_month, reporting_year, "
            "file_hash, uploaded_by, status) "
            "VALUES (:cedant_code, :dataset_type, :file_name, :reporting_month, "
            ":reporting_year, :file_hash, :uploaded_by, 'processed') "
            "RETURNING batch_id"
        ),
        {
            "cedant_code": cedant_code,
            "dataset_type": dataset_type,
            "file_name": file_name,
            "reporting_month": month,
            "reporting_year": year,
            "file_hash": hashlib.sha256(file_bytes).hexdigest(),
            "uploaded_by": session_id,
        },
    ).scalar_one()
    table_id = db.execute(
        text(
            "INSERT INTO rekonsiliasi.upload_table "
            "(batch_id, sheet_name, sheet_index, applied_mapping, status) "
            "VALUES (:batch_id, :sheet_name, :sheet_index, "
            "CAST(:applied_mapping AS jsonb), 'processed') "
            "RETURNING table_id"
        ),
        {
            "batch_id": batch_id,
            "sheet_name": sheet_name,
            "sheet_index": sheet_index,
            "applied_mapping": json.dumps(effective_col_map, ensure_ascii=False),
        },
    ).scalar_one()

    if scanned_headers:
        _synchronize_header_library_identity(db)
        db.execute(
            text(
                "INSERT INTO rekonsiliasi.header_library "
                "(table_id, column_index, original_header, cedant_code, dataset_type) "
                "VALUES (:table_id, :column_index, :original_header, :cedant_code, :dataset_type)"
            ),
            [
                {
                    "table_id": table_id,
                    "column_index": index,
                    "original_header": header,
                    "cedant_code": cedant_code,
                    "dataset_type": dataset_type,
                }
                for index, header in enumerate(scanned_headers, start=1)
            ],
        )

    is_infopack = target_table == INFOPACK_TABLE
    stats = (
        _write_infopack_rows(
            db, list(rows_by_index.values()), upload_batch_id=batch_id
        )
        if is_infopack
        else _write_cedant_rows(
            db, list(rows_by_index.values()), upload_batch_id=batch_id
        )
    )
    month_value = month
    year_value = year
    source_rows = raw_result.get("rows") or []
    sample_row_data = source_rows[0]["data"] if source_rows else {}
    mapped_excel_cols = {
        part.strip()
        for value in effective_col_map.values()
        if value
        for part in str(value).split("|")
        if part.strip()
    }
    unmapped_headers = [header for header in scanned_headers if header not in mapped_excel_cols]

    db.add(
        ScannedSchema(
            job_id=job.id,
            session_id=session_id,
            cedant_code=cedant_code,
            cedant_name=cedant_name,
            tipe_data=display_type,
            bulan=str(bulan),
            tahun=str(tahun),
            file_name=file_name,
            sheet_name=sheet_name,
            scanned_headers=json.dumps(scanned_headers, ensure_ascii=False),
            column_mapping=json.dumps(effective_col_map, ensure_ascii=False),
            unmapped_headers=json.dumps(unmapped_headers, ensure_ascii=False),
            sample_row=json.dumps(sample_row_data, ensure_ascii=False),
            total_columns=len(scanned_headers),
            total_rows=raw_result["total_rows"],
        )
    )
    raw_objects = []
    for index, source_row in enumerate(source_rows):
        row_data = dict(source_row.get("data") or {})
        if not row_data:
            continue
        excel_row = source_row.get("excel_row")
        primary_key = _raw_value(
            row_data, effective_col_map, "loss_ref", "doc_no", "insured", "title"
        ) or (str(excel_row) if excel_row is not None else "")
        row_data[WORKFLOW_RAW_META_KEY] = {
            "batch_id": batch_id,
            "table_id": table_id,
            "job_id": job.id,
            "excel_row": excel_row,
        }
        raw_objects.append(
            MasterRawRow(
                job_id=job.id,
                session_id=session_id,
                target_table=target_table,
                cedant_code=cedant_code,
                primary_key_value=primary_key or None,
                month=month_value,
                year=year_value,
                file_name=file_name,
                sheet_name=sheet_name,
                full_row_data=json.dumps(row_data, ensure_ascii=False),
            )
        )
    if raw_objects:
        db.bulk_save_objects(raw_objects)

    result_table_name = None
    result_rows_appended = 0
    if not is_infopack:
        result_context = {
            "cedant_code": cedant_code,
            "reporting_month": month,
            "reporting_year": year,
            "file_name": file_name,
            "sheet_name": sheet_name,
        }
        result_rows = []
        for index, source_row in enumerate(source_rows):
            source_data = dict(source_row.get("data") or {})
            if not source_data:
                continue
            excel_row = source_row.get("excel_row", index + 2)
            normalized = _build_workflow_cedant_row(
                source_data, effective_col_map, result_context
            )
            if not _has_cedant_result_values(normalized):
                continue
            result_rows.append((source_data, normalized, int(excel_row)))
        result_table_name, result_rows_appended = _write_cedant_result_rows(
            db,
            cedant_code=cedant_code,
            table_id=table_id,
            month=month,
            year=year,
            file_name=file_name,
            sheet_name=sheet_name,
            mapping=effective_col_map,
            rows=result_rows,
        )
        stats["result_table"] = result_table_name
        stats["result_rows_appended"] = result_rows_appended

    job.sheet_name = sheet_name or job.sheet_name
    job.status = "done"
    job.total_rows = raw_result["total_rows"]
    job.rows_appended = stats["inserted"]
    job.rows_skipped = stats["skipped"]
    db.commit()
    return batch_id, table_id, stats


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
    1. Mapping aktif dari tabel `master_mapping_column` (`db_col_map`)
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
        for field_name, patterns in (
            ("dol", DOL_PATTERNS),
            ("cob", COB_PATTERNS),
            ("gross", GROSS_PATTERNS),
            ("tsi", TSI_PATTERNS),
        ):
            if not matched.get(field_name):
                m = _match_header_by_patterns(columns, patterns)
                if m:
                    matched[field_name] = m
    else:
        if not matched.get("doc_no"):
            m = _match_header_by_patterns(columns, DOC_NO_PATTERNS)
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
        resolved_cedant = _resolve_cedant_code(db, cedant) or ""
    detected_cedant_name = (cedant or "").strip()

    # Jika cedant belum dipilih, coba deteksi dari header sheet default atau nama file
    default_sheet = info.get("default_sheet") or ""
    default_cols = info.get("sheet_columns", {}).get(default_sheet, [])
    if not resolved_cedant and default_cols:
        dummy_rows = [{"pk": "", "data": {c: "1" for c in default_cols}}]
        det_code, det_name = _detect_cedant_from_mapping(db, dummy_rows, default_sheet)
        if det_code:
            resolved_cedant = det_code
            detected_cedant_name = det_name or detected_cedant_name

    auto_mappings: dict[str, dict] = {}
    for sh, cols in (info.get("sheet_columns") or {}).items():
        db_col_map = (
            _load_column_mapping(db, resolved_cedant, sh, is_infopack)
            if resolved_cedant
            else {}
        )
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


@router.post("/prepare", summary="Simpan batch, semua sheet, header, dan raw rows untuk konfirmasi mapping")
async def prepare_master_upload(
    bulan: str = Form(...),
    tahun: str = Form(...),
    tipe_data: str = Form(...),
    cedant: Optional[str] = Form(None),
    cedant_code: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx, .xls, .xlsm, atau .xlsb")
    try:
        month = int(bulan)
        year = int(tahun)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Bulan dan tahun harus berupa angka.") from exc
    if (
        not 1 <= month <= 12
        or len(str(tahun).strip()) != 4
        or not 1900 <= year <= 9999
    ):
        raise HTTPException(
            status_code=422,
            detail="Bulan harus 1-12 dan tahun harus antara 1900-9999.",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB")
    file_name = _detect_file_name(file.filename)
    if len(file_name) > 255:
        raise HTTPException(status_code=422, detail="Nama file melebihi batas 255 karakter.")
    if not (cedant_code or cedant):
        raise HTTPException(status_code=422, detail="Cedant wajib dipilih.")

    resolved_cedant = (cedant_code or "").strip()
    if not resolved_cedant:
        resolved_cedant = _resolve_cedant_code(db, cedant or "") or ""
    if not resolved_cedant:
        raise HTTPException(status_code=422, detail="Cedant tidak ditemukan pada master cedant.")
    if len(resolved_cedant) > 10:
        raise HTTPException(status_code=422, detail="Kode cedant melebihi batas 10 karakter.")

    dataset_type = _dataset_type(tipe_data)
    display_type = "Infopack" if dataset_type == "INFOPACK" else "OS Cedant"
    cedant_record = db.execute(
        text(
            "SELECT cedant_name FROM rekonsiliasi.master_oscedant_code "
            "WHERE cedant_code = :cedant_code"
        ),
        {"cedant_code": resolved_cedant},
    ).first()
    if not cedant_record:
        raise HTTPException(
            status_code=422,
            detail=f"Kode cedant '{resolved_cedant}' tidak terdaftar pada master cedant.",
        )
    cedant_name = (cedant or cedant_record[0] or resolved_cedant).strip()
    job = UploadJob(
        session_id=session_id,
        bulan=f"{month:02d}",
        tahun=str(year),
        tipe_data=display_type,
        primary_key_col="",
        file_name=file_name,
        cedant=cedant_name,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    batch_id = None
    try:
        source_bytes = raw_bytes
        is_kbins = "KB INS" in cedant_name.upper()
        if is_kbins:
            source_bytes = read_excel_with_password(raw_bytes).getvalue()
        available_sheets = get_sheet_names(source_bytes)
        if sheet_name:
            if sheet_name not in available_sheets:
                raise HTTPException(
                    status_code=422,
                    detail=f"Sheet '{sheet_name}' tidak ditemukan pada workbook.",
                )
            selected_sheets = [sheet_name]
        else:
            selected_sheets = available_sheets
        if not selected_sheets:
            raise HTTPException(status_code=422, detail="Workbook tidak memiliki sheet.")

        catalog = _load_field_catalog(db, dataset_type)
        if not catalog:
            raise HTTPException(
                status_code=500,
                detail=f"master_field tidak memiliki field untuk dataset {dataset_type}.",
            )
        if dataset_type == "OS CEDANT":
            _validate_required_mapping_catalog(dataset_type, catalog)
        workbook_sheets = []
        total_rows = 0
        batch_id = db.execute(
            text(
                "INSERT INTO rekonsiliasi.upload_batch "
                "(cedant_code, dataset_type, file_name, reporting_month, reporting_year, "
                "file_hash, uploaded_by, status) "
                "VALUES (:cedant_code, :dataset_type, :file_name, :month, :year, "
                ":file_hash, :uploaded_by, 'needs_review') RETURNING batch_id"
            ),
            {
                "cedant_code": resolved_cedant,
                "dataset_type": dataset_type,
                "file_name": file_name,
                "month": month,
                "year": year,
                "file_hash": hashlib.sha256(raw_bytes).hexdigest(),
                "uploaded_by": session_id,
            },
        ).scalar_one()
        db.commit()

        header_sequence_synchronized = False
        for selected_sheet in selected_sheets:
            sheet_index = available_sheets.index(selected_sheet) + 1
            parsed = ingest_excel_raw(source_bytes, selected_sheet)
            headers = parsed["columns"]
            if not headers:
                continue
            if not header_sequence_synchronized:
                _synchronize_header_library_identity(db)
                header_sequence_synchronized = True
            existing_version, existing_map = _suggest_existing_mapping(
                db,
                resolved_cedant,
                dataset_type,
                selected_sheet,
                headers,
                catalog,
            )
            auto_map = _auto_mapping_for_catalog(headers, dataset_type, catalog)
            proposed_mapping = {**auto_map, **existing_map}
            table_id = db.execute(
                text(
                    "INSERT INTO rekonsiliasi.upload_table "
                    "(batch_id, sheet_name, sheet_index, mapping_version, applied_mapping, status) "
                    "VALUES (:batch_id, :sheet_name, :sheet_index, NULL, "
                    "CAST(:applied_mapping AS jsonb), :status) RETURNING table_id"
                ),
                {
                    "batch_id": batch_id,
                    "sheet_name": selected_sheet,
                    "sheet_index": sheet_index,
                    "applied_mapping": json.dumps(
                        {"mapping": proposed_mapping, "__job_id": job.id},
                        ensure_ascii=False,
                    ),
                    "status": "needs_review" if parsed["total_rows"] else "ready",
                },
            ).scalar_one()
            db.execute(
                text(
                    "INSERT INTO rekonsiliasi.header_library "
                    "(table_id, column_index, original_header, cedant_code, dataset_type) "
                    "VALUES (:table_id, :column_index, :header, :cedant_code, :dataset_type)"
                ),
                [
                    {
                        "table_id": table_id,
                        "column_index": column_index,
                        "header": header,
                        "cedant_code": resolved_cedant,
                        "dataset_type": dataset_type,
                    }
                    for column_index, header in enumerate(headers, start=1)
                ],
            )
            sample = parsed["rows"][0]["data"] if parsed["rows"] else {}
            mapped_headers = set(proposed_mapping.values())
            db.add(
                ScannedSchema(
                    job_id=job.id,
                    session_id=session_id,
                    cedant_code=resolved_cedant,
                    cedant_name=cedant_name,
                    tipe_data=display_type,
                    bulan=f"{month:02d}",
                    tahun=str(year),
                    file_name=file_name,
                    sheet_name=selected_sheet,
                    scanned_headers=json.dumps(headers, ensure_ascii=False),
                    column_mapping=json.dumps(proposed_mapping, ensure_ascii=False),
                    unmapped_headers=json.dumps(
                        [header for header in headers if header not in mapped_headers],
                        ensure_ascii=False,
                    ),
                    sample_row=json.dumps(sample, ensure_ascii=False),
                    total_columns=len(headers),
                    total_rows=parsed["total_rows"],
                )
            )
            raw_row_mappings = []
            for source_row in parsed["rows"]:
                row_data = dict(source_row["data"])
                raw_primary_key = _raw_value(
                    row_data, proposed_mapping, "loss_ref", "doc_no", "insured", "title"
                )
                if not raw_primary_key:
                    raw_primary_key = str(source_row["excel_row"])
                row_data[WORKFLOW_RAW_META_KEY] = {
                    "batch_id": batch_id,
                    "table_id": table_id,
                    "job_id": job.id,
                    "excel_row": source_row["excel_row"],
                }
                raw_row_mappings.append(
                    {
                        "job_id": job.id,
                        "session_id": session_id,
                        "target_table": _target_table(display_type),
                        "cedant_code": resolved_cedant,
                        "primary_key_value": raw_primary_key[:500] or None,
                        "month": month,
                        "year": year,
                        "file_name": file_name,
                        "sheet_name": selected_sheet,
                        "full_row_data": json.dumps(row_data, ensure_ascii=False),
                    }
                )
            for start in range(0, len(raw_row_mappings), 1000):
                db.bulk_insert_mappings(
                    MasterRawRow,
                    raw_row_mappings[start : start + 1000],
                )
            total_rows += parsed["total_rows"]
            complete, missing = _workflow_mapping_status(proposed_mapping, dataset_type)
            workbook_sheets.append(
                {
                    "table_id": table_id,
                    "sheet_name": selected_sheet,
                    "sheet_index": sheet_index,
                    "total_rows": parsed["total_rows"],
                    "headers": headers,
                    "suggested_mapping": proposed_mapping,
                    "suggested_version": existing_version,
                    "mapping_complete": complete,
                    "missing_fields": list(missing),
                    "status": "needs_review" if parsed["total_rows"] else "empty",
                }
            )

        if not workbook_sheets:
            raise HTTPException(
                status_code=422,
                detail="Tidak ada sheet dengan header yang bisa diproses.",
            )
        job.total_rows = total_rows
        pending_tables = db.execute(
            text(
                "SELECT COUNT(*) FROM rekonsiliasi.upload_table "
                "WHERE batch_id = :batch_id AND status <> 'ready'"
            ),
            {"batch_id": batch_id},
        ).scalar_one()
        batch_status = "needs_review" if pending_tables else "ready"
        db.execute(
            text(
                "UPDATE rekonsiliasi.upload_batch SET status = :status "
                "WHERE batch_id = :batch_id"
            ),
            {"status": batch_status, "batch_id": batch_id},
        )
        job.status = "processing" if pending_tables else "done"
        job.rows_appended = job.rows_appended or 0
        job.rows_skipped = job.rows_skipped or 0
        db.commit()
        return {
            "job_id": job.id,
            "batch_id": batch_id,
            "cedant_code": resolved_cedant,
            "dataset_type": dataset_type,
            "file_name": file_name,
            "reporting_month": month,
            "reporting_year": year,
            "status": batch_status,
            "sheets": workbook_sheets,
        }
    except HTTPException as exc:
        db.rollback()
        if batch_id is not None:
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_batch SET status = 'error', "
                    "error_message = :error WHERE batch_id = :batch_id"
                ),
                {"error": str(exc.detail), "batch_id": batch_id},
            )
        failed_job = db.get(UploadJob, job.id)
        if failed_job:
            failed_job.status = "error"
            failed_job.error_message = str(exc.detail)
            db.commit()
        elif batch_id is not None:
            db.commit()
        raise
    except Exception as exc:
        logger.exception("Failed preparing upload batch")
        db.rollback()
        if batch_id is not None:
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_batch SET status = 'error', "
                    "error_message = :error WHERE batch_id = :batch_id"
                ),
                {"error": str(exc), "batch_id": batch_id},
            )
        failed_job = db.get(UploadJob, job.id)
        if failed_job:
            failed_job.status = "error"
            failed_job.error_message = str(exc)
            db.commit()
        elif batch_id is not None:
            db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menyiapkan batch upload: {exc}",
        ) from exc


@router.get("/tables/{table_id}/mapping", summary="Ambil katalog field, kandidat header, contoh nilai, dan mapping sheet")
def get_upload_table_mapping(
    table_id: int,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    context = _upload_table_context(db, table_id, session_id)
    headers = _table_headers(db, table_id)
    dataset_type = context["dataset_type"].upper()
    catalog = _load_field_catalog(db, dataset_type)
    raw_rows = _read_workflow_raw_rows(
        db,
        session_id=session_id,
        cedant_code=context["cedant_code"],
        file_name=context["file_name"],
        sheet_name=context["sheet_name"],
        month=int(context["reporting_month"]),
        year=int(context["reporting_year"]),
        table_id=table_id,
    )
    samples = [data for _, data, _ in raw_rows[:5]]
    field_details = []
    for field in catalog:
        field_details.append({
            **field,
            "required": field["field_name"] in _workflow_required_fields(dataset_type),
            "candidate_headers": [
                {
                    "header": header,
                    "sample_values": [
                        str(sample[header]).strip()
                        for sample in samples
                        if sample.get(header) not in (None, "")
                    ],
                }
                for header in headers
            ] if field.get("default_source") == "column" else [],
        })
    if dataset_type == "INFOPACK":
        field_details.extend([
            {
                "field_name": field_name,
                "field_id": None,
                "data_type": "text" if field_name == "cob" else "decimal",
                "default_source": "column",
                "required": True,
                "candidate_headers": [
                    {
                        "header": header,
                        "sample_values": [
                            str(sample[header]).strip()
                            for sample in samples
                            if sample.get(header) not in (None, "")
                        ],
                    }
                    for header in headers
                ],
            }
            for field_name in ("cob", "tsi")
        ])
    stored_mapping = context.get("applied_mapping") or {}
    if isinstance(stored_mapping, str):
        stored_mapping = json.loads(stored_mapping)
    workflow_metadata = {}
    if isinstance(stored_mapping, dict) and isinstance(stored_mapping.get("mapping"), dict):
        workflow_metadata = {
            key: value
            for key, value in stored_mapping.items()
            if key != "mapping"
        }
        stored_mapping = stored_mapping["mapping"]
    else:
        stored_mapping = stored_mapping if isinstance(stored_mapping, dict) else {}
    current_version, existing_map = _suggest_existing_mapping(
        db,
        context["cedant_code"],
        dataset_type,
        context["sheet_name"],
        headers,
        catalog,
    )
    return {
        "table_id": table_id,
        "batch_id": context["batch_id"],
        "cedant_code": context["cedant_code"],
        "dataset_type": dataset_type,
        "file_name": context["file_name"],
        "sheet_name": context["sheet_name"],
        "sheet_index": context["sheet_index"],
        "status": context["table_status"],
        "mapping_version": context["mapping_version"],
        "suggested_version": current_version,
        "suggested_mapping": stored_mapping or existing_map,
        "field_catalog": field_details,
        "headers": headers,
        "sample_rows": [
            {
                "excel_row": metadata.get("excel_row"),
                "values": data,
            }
            for _, data, metadata in raw_rows[:5]
        ],
        "total_rows": len(raw_rows),
    }


@router.post("/tables/{table_id}/confirm", summary="Konfirmasi mapping, versioning, validasi, dan simpan hasil Master")
def confirm_upload_table_mapping(
    table_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    try:
        context = _upload_table_context(db, table_id, session_id, for_update=True)
        if context["table_status"] == "ready":
            raise HTTPException(status_code=409, detail="Sheet ini sudah dikonfirmasi dan diproses.")
        stored_mapping = context.get("applied_mapping") or {}
        if isinstance(stored_mapping, str):
            stored_mapping = json.loads(stored_mapping)
        if isinstance(stored_mapping, dict) and isinstance(stored_mapping.get("mapping"), dict):
            workflow_metadata = {
                key: value
                for key, value in stored_mapping.items()
                if key != "mapping"
            }
            stored_mapping = stored_mapping["mapping"]
        else:
            workflow_metadata = {}
            stored_mapping = stored_mapping if isinstance(stored_mapping, dict) else {}
        catalog = _load_field_catalog(db, context["dataset_type"].upper())
        headers = _table_headers(db, table_id)
        requested = payload.get("mapping", stored_mapping)
        mapping = _normalize_requested_mapping(
            requested,
            headers,
            catalog,
            context["dataset_type"].upper(),
        )
        complete, missing = _workflow_mapping_status(mapping, context["dataset_type"].upper())
        if not complete:
            labels = {
                "loss_ref": "Loss Ref / Doc No",
                "outstanding": "Outstanding",
                "dol": "DOL",
                "gross": "Gross",
                "cob": "COB",
                "tsi": "TSI",
            }
            raise HTTPException(
                status_code=422,
                detail="Field wajib belum dipetakan: "
                + ", ".join(labels.get(field, field) for field in missing),
            )
        raw_rows = _read_workflow_raw_rows(
            db,
            session_id=session_id,
            cedant_code=context["cedant_code"],
            file_name=context["file_name"],
            sheet_name=context["sheet_name"],
            month=int(context["reporting_month"]),
            year=int(context["reporting_year"]),
            table_id=table_id,
        )
        if not raw_rows:
            raise HTTPException(status_code=422, detail="Sheet tidak memiliki raw row untuk diproses.")

        table = _target_table(context["dataset_type"])
        version, created_version = _select_mapping_version(
            db, context, table_id, mapping, catalog
        )
        normalized_rows = []
        for raw, data, metadata in raw_rows:
            if table == INFOPACK_TABLE:
                normalized = _build_workflow_infopack_row(
                    db,
                    data,
                    mapping,
                    context,
                    int(metadata["excel_row"]),
                )
                mapped_values = [
                    _raw_value(data, mapping, field)
                    for field in set(mapping)
                ]
                if not any(mapped_values):
                    continue
                normalized_rows.append((raw, normalized))
            else:
                normalized = _build_workflow_cedant_row(data, mapping, context)
                mapped_values = [
                    _raw_value(data, mapping, field)
                    for field in set(mapping)
                ]
                if not any(mapped_values):
                    continue
                if not _has_cedant_result_values(normalized):
                    continue
                normalized_rows.append((raw, normalized))

        if table == INFOPACK_TABLE:
            rows_by_index = {
                int(row["row_index"]): row for _, row in normalized_rows
            }
            _validate_infopack_rows(rows_by_index, row_numbers_are_excel=True)
            stats = _write_infopack_rows(
                db,
                list(rows_by_index.values()),
                upload_batch_id=int(context["batch_id"]),
            )
        else:
            stats = _write_cedant_rows(
                db,
                [row for _, row in normalized_rows],
                upload_batch_id=int(context["batch_id"]),
            )
            stats["skipped"] += len(raw_rows) - len(normalized_rows)
            result_rows = []
            for raw, normalized in normalized_rows:
                try:
                    source_data = json.loads(raw.full_row_data)
                except (TypeError, json.JSONDecodeError) as exc:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Arsip raw row {raw.id} tidak berisi JSON valid.",
                    ) from exc
                metadata = source_data.pop(WORKFLOW_RAW_META_KEY, {})
                excel_row = metadata.get("excel_row")
                if excel_row is None:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Nomor baris Excel tidak tersedia pada raw row {raw.id}.",
                    )
                result_rows.append((source_data, normalized, int(excel_row)))
            result_table_name, result_rows_appended = _write_cedant_result_rows(
                db,
                cedant_code=context["cedant_code"],
                table_id=table_id,
                month=int(context["reporting_month"]),
                year=int(context["reporting_year"]),
                file_name=context["file_name"],
                sheet_name=context["sheet_name"],
                mapping=mapping,
                rows=result_rows,
            )

        for raw, normalized in normalized_rows:
            if table == INFOPACK_TABLE:
                pk_value = normalized.get("title") or str(normalized.get("row_index") or "")
            else:
                pk_value = normalized.get("doc_no") or ""
            raw.primary_key_value = str(pk_value)[:500] or None

        db.execute(
            text(
                "UPDATE rekonsiliasi.upload_table "
                "SET mapping_version = :mapping_version, "
                "applied_mapping = CAST(:applied_mapping AS jsonb), "
                "confirmed_at = CURRENT_TIMESTAMP, confirmed_by = :confirmed_by, "
                "status = 'ready', error_message = NULL "
                "WHERE table_id = :table_id"
            ),
            {
                "mapping_version": version,
                "applied_mapping": json.dumps(
                    {"mapping": mapping, **workflow_metadata},
                    ensure_ascii=False,
                ),
                "confirmed_by": session_id,
                "table_id": table_id,
            },
        )
        remaining = db.execute(
            text(
                "SELECT COUNT(*) FROM rekonsiliasi.upload_table "
                "WHERE batch_id = :batch_id AND status <> 'ready'"
            ),
            {"batch_id": context["batch_id"]},
        ).scalar_one()
        batch_status = "needs_review" if remaining else "ready"
        db.execute(
            text(
                "UPDATE rekonsiliasi.upload_batch SET status = :status, error_message = NULL "
                "WHERE batch_id = :batch_id"
            ),
            {"status": batch_status, "batch_id": context["batch_id"]},
        )
        raw_job_id = next(
            (metadata.get("job_id") for _, _, metadata in raw_rows if metadata.get("job_id")),
            workflow_metadata.get("__job_id"),
        )
        if raw_job_id:
            job = db.get(UploadJob, int(raw_job_id))
            if job:
                job.rows_appended = (job.rows_appended or 0) + stats["inserted"]
                job.rows_skipped = (job.rows_skipped or 0) + stats["skipped"]
                if not remaining:
                    job.status = "done"
        db.commit()
        return {
            "batch_id": context["batch_id"],
            "table_id": table_id,
            "mapping_version": version,
            "mapping_version_created": created_version,
            "status": "ready",
            "batch_status": batch_status,
            "target_table": table,
            "rows_appended": stats["inserted"],
            "rows_updated": stats["updated"],
            "rows_skipped": stats["skipped"],
            "result_table": result_table_name if table != INFOPACK_TABLE else None,
            "result_rows_appended": result_rows_appended if table != INFOPACK_TABLE else 0,
        }
    except HTTPException as exc:
        db.rollback()
        if exc.status_code == 409:
            raise
        try:
            context_for_error = _upload_table_context(db, table_id, session_id)
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_table SET status = 'needs_review', "
                    "error_message = :error WHERE table_id = :table_id"
                ),
                {"error": str(exc.detail), "table_id": table_id},
            )
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_batch SET status = 'needs_review', "
                    "error_message = :error WHERE batch_id = :batch_id"
                ),
                {"error": str(exc.detail), "batch_id": context_for_error["batch_id"]},
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not record upload mapping validation error")
        raise
    except Exception as exc:
        logger.exception("Failed confirming upload mapping table_id=%s", table_id)
        db.rollback()
        try:
            context_for_error = _upload_table_context(db, table_id, session_id)
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_table SET status = 'needs_review', "
                    "error_message = :error WHERE table_id = :table_id"
                ),
                {"error": str(exc), "table_id": table_id},
            )
            db.execute(
                text(
                    "UPDATE rekonsiliasi.upload_batch SET status = 'needs_review', "
                    "error_message = :error WHERE batch_id = :batch_id"
                ),
                {"error": str(exc), "batch_id": context_for_error["batch_id"]},
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not record upload mapping processing error")
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengonfirmasi mapping upload: {exc}",
        ) from exc


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
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="custom_mapping harus berupa JSON object yang valid.") from exc
        if not isinstance(raw_cm, dict):
            raise HTTPException(status_code=422, detail="custom_mapping harus berupa JSON object.")
        parsed_custom_map = {
            _canonical_field_name(str(key)): str(value).strip()
            for key, value in raw_cm.items()
            if value and str(value).strip()
        }

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

    try:
        is_kbins = (cedant or "").strip().upper().startswith("KB INS")
        if is_kbins:
            from msoffcrypto.exceptions import InvalidKeyError
            try:
                result = ingest_kbins(file_bytes, cedant or "")
            except InvalidKeyError:
                raise HTTPException(status_code=400, detail="Password Excel salah.") from None
        else:
            result = ingest_excel(file_bytes, pk_col or "", sheet_name or None)
        sheet_val = result.get("sheet", "")
        raw_result = ingest_excel_raw(
            file_bytes,
            sheet_val,
            decrypt_password=is_kbins,
        )
        job.sheet_name = sheet_val or job.sheet_name
        detected_cedant_name = cedant
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

        detected_name = _detect_file_name(file.filename)
        scanned_headers = raw_result.get("columns") or result.get("columns") or (
            list(result["rows"][0]["data"].keys())
            if result.get("rows") and result["rows"][0].get("data")
            else []
        )
        db_col_map = (
            _load_column_mapping(db, resolved_cedant, sheet_val, is_infopack)
            if resolved_cedant
            else {}
        )
        auto_col_map = _auto_match_headers_for_sheet(scanned_headers, is_infopack, {})
        effective_col_map = {**auto_col_map, **db_col_map, **parsed_custom_map}

        if is_infopack:
            _validate_infopack_headers(scanned_headers, effective_col_map)
            rows_by_index = {}
            for idx, source_row in enumerate(raw_result.get("rows", [])):
                if not source_row.get("data"):
                    continue
                excel_row = source_row.get("excel_row", idx + 2)
                extracted = _extract_infopack_row(
                    source_row,
                    resolved_cedant,
                    bulan,
                    tahun,
                    detected_name,
                    sheet_val,
                    excel_row,
                    effective_col_map,
                )
                if any(
                    extracted.get(field) not in (None, "")
                    for field in (
                        "class_code", "title", "value", "dol", "cob", "gross", "tsi",
                    )
                ):
                    rows_by_index[excel_row] = extracted
            _validate_infopack_rows(rows_by_index, row_numbers_are_excel=True)
        else:
            if effective_col_map:
                logger.info(
                    "Using column mapping for %s sheet=%s: %s",
                    resolved_cedant,
                    sheet_val,
                    effective_col_map,
                )
                rows_to_write = [
                    _extract_cedant_row_with_mapping(
                        source_row,
                        resolved_cedant,
                        bulan,
                        tahun,
                        detected_name,
                        sheet_val,
                        effective_col_map,
                    )
                    for source_row in result["rows"]
                ]
            else:
                rows_to_write = [
                    _extract_cedant_row(
                        source_row, resolved_cedant, bulan, tahun, detected_name, sheet_val
                    )
                    for source_row in result["rows"]
                ]
            rows_by_index = dict(enumerate(rows_to_write))

        batch_id, table_id, stats = _save_master_upload(
            db,
            job,
            file_bytes=file_bytes,
            session_id=session_id,
            cedant_code=resolved_cedant or "",
            cedant_name=job.cedant or detected_cedant_name,
            target_table=target_table,
            bulan=bulan,
            tahun=tahun,
            file_name=detected_name,
            sheet_name=sheet_val,
            scanned_headers=scanned_headers,
            effective_col_map=effective_col_map,
            raw_result=raw_result,
            rows_by_index=rows_by_index,
        )
        mapped_excel_cols = {
            part.strip()
            for value in effective_col_map.values()
            if value
            for part in str(value).split("|")
            if part.strip()
        }
        unmapped_headers = [
            header for header in scanned_headers if header not in mapped_excel_cols
        ]
        return {
            "job_id": job.id,
            "batch_id": batch_id,
            "table_id": table_id,
            "sheet": sheet_val,
            "target_table": target_table,
            "cedant_code": resolved_cedant or None,
            "file_name": detected_name,
            "total_rows": raw_result["total_rows"],
            "rows_appended": stats["inserted"],
            "rows_skipped": stats["skipped"],
            "rows_updated": stats["updated"],
            "result_table": stats.get("result_table"),
            "result_rows_appended": stats.get("result_rows_appended", 0),
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
    except HTTPException as exc:
        db.rollback()
        job.status = "error"
        job.error_message = str(exc.detail)
        db.commit()
        raise
    except ValueError as exc:
        db.rollback()
        job.status = "error"
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to persist master upload")
        db.rollback()
        job.status = "error"
        job.error_message = str(exc)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menyimpan upload ke database: {exc}",
        ) from exc


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


@router.get("/header-library", summary="Ambil seluruh header upload beserta metadata sheet")
def get_header_library(
    tipe_data: Optional[str] = Query(None),
    cedant: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    source_sql = (
        " FROM rekonsiliasi.header_library hl "
        "JOIN rekonsiliasi.upload_table ut ON ut.table_id = hl.table_id "
        "JOIN rekonsiliasi.upload_batch ub ON ub.batch_id = ut.batch_id "
        "LEFT JOIN rekonsiliasi.master_oscedant_code c "
        "ON c.cedant_code = COALESCE(NULLIF(BTRIM(hl.cedant_code), ''), ub.cedant_code)"
    )
    where = ["ub.uploaded_by = :session_id"]
    params = {"session_id": session_id}

    if tipe_data:
        params["dataset_type"] = (
            "INFOPACK" if _target_table(tipe_data) == INFOPACK_TABLE else "OS CEDANT"
        )
        where.append(
            "UPPER(COALESCE(NULLIF(BTRIM(hl.dataset_type), ''), ub.dataset_type)) "
            "= :dataset_type"
        )
    if cedant:
        where.append(
            "COALESCE(NULLIF(BTRIM(hl.cedant_code), ''), ub.cedant_code) = :cedant"
        )
        params["cedant"] = cedant.strip()
    if search and search.strip():
        where.append(
            "(LOWER(COALESCE(hl.original_header, '')) LIKE LOWER(:search) "
            "OR LOWER(COALESCE(ub.file_name, '')) LIKE LOWER(:search) "
            "OR LOWER(COALESCE(ut.sheet_name, '')) LIKE LOWER(:search))"
        )
        params["search"] = f"%{search.strip()}%"

    where_sql = " WHERE " + " AND ".join(where)
    total = db.execute(
        text("SELECT COUNT(*)" + source_sql + where_sql), params
    ).scalar_one()
    rows = db.execute(
        text(
            "SELECT hl.header_id, "
            "COALESCE(NULLIF(BTRIM(hl.cedant_code), ''), ub.cedant_code) AS cedant_code, "
            "COALESCE(NULLIF(BTRIM(c.cedant_name), ''), ub.cedant_code) AS cedant_name, "
            "ub.file_name, ub.batch_id, ut.table_id, ut.sheet_name, "
            "hl.column_index, hl.original_header, ut.mapping_version, ub.uploaded_at"
            + source_sql
            + where_sql
            + " ORDER BY ub.uploaded_at DESC, hl.header_id DESC "
            "LIMIT :limit OFFSET :skip"
        ),
        {**params, "limit": limit, "skip": skip},
    ).mappings().all()
    return {"total": total, "headers": [dict(row) for row in rows]}


# ═══════════════════════════════════════════════════════════
# GET /api/master/data
# ═══════════════════════════════════════════════════════════

@router.get("/data", summary="Ambil data Master beserta seluruh kolom hasil scan (paginated)")
def get_master_data(
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
    loss_ref:   Optional[str] = Query(None),
    cedant_code: Optional[str] = Query(None),
    cedant_name: Optional[str] = Query(None),
    dol:        Optional[str] = Query(None),
    currency:   Optional[str] = Query(None),
    outstanding: Optional[str] = Query(None),
    class_code: Optional[str] = Query(None),
    title:      Optional[str] = Query(None),
    value:      Optional[str] = Query(None),
    sheet_name: Optional[str] = Query(None),
    period:     Optional[str] = Query(None),
    cob:        Optional[str] = Query(None),
    gross:      Optional[str] = Query(None),
    tsi:        Optional[str] = Query(None),
    skip:       int           = Query(0,  ge=0),
    limit:      int           = Query(50, ge=1, le=500),
    db:         Session       = Depends(get_db),
    session_id: str           = Depends(get_session_id),
):
    table = _target_table(tipe_data or "")
    is_infopack = table == INFOPACK_TABLE
    table_name = _qualified_master_table(table)

    where, params = [], {}
    if cedant:
        where.append("master_rows.cedant_code = :cedant")
        params["cedant"] = cedant
    if not is_infopack:
        where.append(
            "(NULLIF(TRIM(master_rows.doc_no), '') IS NOT NULL OR master_rows.dol IS NOT NULL "
            "OR master_rows.outstanding IS NOT NULL "
            "OR NULLIF(TRIM(master_rows.currency), '') IS NOT NULL)"
        )
    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        if is_infopack:
            where.append(
                "(LOWER(COALESCE(master_rows.cedant_code, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.class_code, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.title, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.value, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.cob, '')) LIKE LOWER(:q) "
                "OR LOWER(CAST(COALESCE(master_rows.gross, 0) AS TEXT)) LIKE LOWER(:q) "
                "OR LOWER(CAST(COALESCE(master_rows.tsi, 0) AS TEXT)) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.sheet_name, '')) LIKE LOWER(:q))"
            )
        else:
            where.append(
                "(LOWER(COALESCE(master_rows.cedant_code, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.doc_no, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.currency, '')) LIKE LOWER(:q) "
                "OR LOWER(COALESCE(master_rows.sheet_name, '')) LIKE LOWER(:q) "
                "OR LOWER(CAST(COALESCE(master_rows.outstanding, 0) AS TEXT)) LIKE LOWER(:q))"
            )
    filter_columns = (
        {
            "class_code": class_code,
            "title": title,
            "value": value,
            "sheet_name": sheet_name,
            "dol": dol,
            "cob": cob,
            "gross": gross,
            "tsi": tsi,
        }
        if is_infopack
        else {
            "doc_no": loss_ref,
            "cedant_code": cedant_code,
            "dol": dol,
            "currency": currency,
            "outstanding": outstanding,
        }
    )
    for column, value_filter in filter_columns.items():
        if value_filter and value_filter.strip():
            parameter = f"filter_{column}"
            where.append(
                f"LOWER(COALESCE(CAST(master_rows.{column} AS TEXT), '')) "
                f"LIKE LOWER(:{parameter})"
            )
            params[parameter] = f"%{value_filter.strip()}%"
    if is_infopack and period and period.strip():
        where.append(
            "LOWER(CONCAT(COALESCE(CAST(master_rows.month AS TEXT), ''), '/', "
            "COALESCE(CAST(master_rows.year AS TEXT), ''))) LIKE LOWER(:filter_period)"
        )
        params["filter_period"] = f"%{period.strip()}%"
    if cedant_name and cedant_name.strip():
        where.append(
            "EXISTS (SELECT 1 FROM rekonsiliasi.master_oscedant_code AS cedant_lookup "
            "WHERE cedant_lookup.cedant_code = master_rows.cedant_code "
            "AND LOWER(COALESCE(cedant_lookup.cedant_name, '')) "
            "LIKE LOWER(:filter_cedant_name))"
        )
        params["filter_cedant_name"] = f"%{cedant_name.strip()}%"

    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(
        text(f"SELECT COUNT(*) FROM {table_name} AS master_rows{where_sql}"),
        params,
    ).scalar() or 0
    rows  = db.execute(
        text(
            f"SELECT master_rows.*, "
            "COALESCE(NULLIF((SELECT BTRIM(cedant_lookup.cedant_name) "
            "FROM rekonsiliasi.master_oscedant_code AS cedant_lookup "
            "WHERE cedant_lookup.cedant_code = master_rows.cedant_code "
            "ORDER BY cedant_lookup.cedant_name LIMIT 1), ''), "
            "master_rows.cedant_code) AS cedant_name "
            f"FROM {table_name} AS master_rows{where_sql} "
            "ORDER BY master_rows.id DESC LIMIT :lim OFFSET :off"
        ),
        {**params, "lim": limit, "off": skip},
    ).mappings().all()

    # ── Perkaya dengan full_row_data (seluruh kolom Excel asli) dari master_raw_rows ──
    raw_lookup: dict[tuple, dict] = {}
    raw_lookup_by_excel_row: dict[tuple, dict] = {}
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
                    raw_metadata = parsed_full.pop(WORKFLOW_RAW_META_KEY, {})
                    for h in parsed_full.keys():
                        if h and h not in seen_hdrs:
                            seen_hdrs.add(h)
                            scanned_headers.append(h)
                    if key_specific not in raw_lookup:
                        raw_lookup[key_specific] = parsed_full
                    if key_fallback not in raw_lookup:
                        raw_lookup[key_fallback] = parsed_full
                    excel_row = raw_metadata.get("excel_row")
                    if excel_row is not None:
                        raw_lookup_by_excel_row.setdefault(
                            (rm.cedant_code or "", int(excel_row), rm.sheet_name or ""),
                            parsed_full,
                        )
    except Exception as e:
        logger.warning("Could not enrich rows from master_raw_rows: %s", e)

    result_rows = []
    for r in rows:
        dol_val = r.get("dol")
        dol_str = dol_val.strftime("%Y-%m-%d") if hasattr(dol_val, "strftime") else str(dol_val or "")
        cc_val = r.get("cedant_code") or ""
        sh_val = r.get("sheet_name") or ""
        if is_infopack:
            row_index = r.get("row_index")
            pk_val = r.get("title") or (
                str(row_index) if row_index is not None else str(r.get("id"))
            )
            full_cols = (
                raw_lookup_by_excel_row.get((cc_val, int(row_index), sh_val))
                if row_index is not None
                else None
            ) or (
                raw_lookup.get((cc_val, str(pk_val).strip(), sh_val))
                or raw_lookup.get((cc_val, str(pk_val).strip()))
                or {}
            )
            base_row_data = {
                **full_cols,
                "cedant_code": r.get("cedant_code"), "class_code": r.get("class_code"),
                "cedant_name": r.get("cedant_name"),
                "title": r.get("title"), "value": r.get("value"),
                "row_index": r.get("row_index"), "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "upload_batch_id": r.get("upload_batch_id"),
                "dol": dol_str, "cob": r.get("cob"),
                "gross": str(r.get("gross")) if r.get("gross") is not None else "",
                "tsi": str(r.get("tsi")) if r.get("tsi") is not None else "",
                "_cedant": r.get("cedant_code"),
            }
            result_rows.append({
                "id": r.get("id"), "tipe_data": "Infopack",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "cedant_name": r.get("cedant_name"),
                "primary_key_value": pk_val,
                "upload_batch_id": r.get("upload_batch_id"),
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
                "cedant_code": r.get("cedant_code"),
                "cedant_name": r.get("cedant_name"),
                "outstanding": str(outstanding) if outstanding is not None else "",
                "currency": r.get("currency"),
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "upload_batch_id": r.get("upload_batch_id"),
                "_cedant": r.get("cedant_code"),
            }
            result_rows.append({
                "id": r.get("id"), "tipe_data": "OS Cedant",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "cedant_name": r.get("cedant_name"),
                "primary_key_value": doc_no,
                "upload_batch_id": r.get("upload_batch_id"),
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
                text(
                    f"DELETE FROM {_qualified_master_table(table)} "
                    "WHERE file_name = :fn AND month = :m AND year = :y"
                ),
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
        text(
            f"SELECT id, {', '.join(cols)} FROM {_qualified_master_table(table)}"
            f"{where_sql} ORDER BY id ASC"
        ),
        params,
    ).mappings().all()

    if is_infopack:
        META_COLS = [
            "No", "Cedant", "Class Code", "DOL", "COB", "Gross", "TSI",
            "Title", "Value", "Row Index", "Month", "Year", "File Name", "Sheet Name",
        ]
        excel_rows = []
        for i, row in enumerate(rows, 1):
            dol_val = row.get("dol")
            excel_rows.append({
                "No": i,
                "Cedant": row.get("cedant_code") or "",
                "Class Code": row.get("class_code") or "",
                "DOL": dol_val.strftime("%d/%m/%Y") if dol_val else "",
                "COB": row.get("cob") or "",
                "Gross": row.get("gross"),
                "TSI": row.get("tsi"),
                "Title": row.get("title") or "",
                "Value": row.get("value") or "",
                "Row Index": row.get("row_index") if row.get("row_index") is not None else "",
                "Month": row.get("month") or "",
                "Year": row.get("year") or "",
                "File Name": row.get("file_name") or "",
                "Sheet Name": row.get("sheet_name") or "",
            })
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

    NUMERIC_COLS = {"Outstanding", "Value", "Gross", "TSI"}
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
