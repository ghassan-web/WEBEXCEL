"""
Router: /api/oscln
Handles:
  1. Legacy OSCLN CSV snapshot upload & reconciliation
  2. Live Customize Matching between PostgreSQL fsi_db (clickhouse.oscln)
     and per-cedant result tables in hasil_rekonsiliasi.*
All endpoints are scoped to the caller's session_id (X-Session-ID header).
"""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import json
import logging
import re
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..models import (
    get_db, get_fsi_db, get_session_id,
    FSI_DB_SCHEMA, FSI_OSCLN_TABLE,
    MasterOsCedant, MasterOsInfopack,
    ComparisonJob, ComparisonResult,
    OsclnSnapshot, OsclnRow,
)
from ..services.excel_service import ingest_csv

router = APIRouter(prefix="/api/oscln", tags=["oscln"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB


# ─────────────────────────────────────────────
# GET /api/oscln/snapshots
# ─────────────────────────────────────────────
@router.get("/snapshots", summary="Daftar snapshot OSCLN CSV")
def list_snapshots(
    skip:       int     = Query(0,  ge=0),
    limit:      int     = Query(20, ge=1, le=100),
    db:         Session = Depends(get_db),
    session_id: str     = Depends(get_session_id),
):
    q     = db.query(OsclnSnapshot).filter(OsclnSnapshot.session_id == session_id)
    total = q.count()
    snaps = q.order_by(OsclnSnapshot.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "snapshots": [_snap_to_dict(s) for s in snaps]}


# ─────────────────────────────────────────────
# POST /api/oscln/upload
# ─────────────────────────────────────────────
@router.post("/upload", summary="Upload OSCLN CSV snapshot")
async def upload_oscln_csv(
    bulan:           str        = Form(...),
    tahun:           str        = Form(...),
    primary_key_col: str        = Form(...),
    file:            UploadFile = File(...),
    db:              Session    = Depends(get_db),
    session_id:      str        = Depends(get_session_id),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File harus berformat .csv")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 15 MB")

    try:
        result = ingest_csv(file_bytes, primary_key_col.strip())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Error ingesting OSCLN CSV")
        raise HTTPException(status_code=500, detail=f"Gagal membaca CSV: {e}")

    snapshot = OsclnSnapshot(
        session_id=session_id,
        bulan=bulan,
        tahun=tahun,
        file_name=file.filename,
        primary_key_col=primary_key_col.strip(),
        total_rows=result["total_rows"],
        status="active",
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    batch = []
    for r in result["rows"]:
        batch.append(OsclnRow(
            snapshot_id=snapshot.id,
            primary_key_value=r["pk"],
            row_data=json.dumps(r["data"], ensure_ascii=False),
        ))
        if len(batch) >= 500:
            db.bulk_save_objects(batch)
            db.commit()
            batch = []
    if batch:
        db.bulk_save_objects(batch)
        db.commit()

    return {
        "snapshot_id": snapshot.id,
        "file_name":   snapshot.file_name,
        "bulan":       snapshot.bulan,
        "tahun":       snapshot.tahun,
        "total_rows":  snapshot.total_rows,
        "message":     f"CSV berhasil diimport. {snapshot.total_rows} baris tersimpan.",
    }


# ─────────────────────────────────────────────
# POST /api/oscln/reconcile
# ─────────────────────────────────────────────
@router.post("/reconcile", summary="Jalankan rekonsiliasi Master vs OSCLN")
def run_reconciliation(
    snapshot_id:     int           = Form(...),
    tipe_data:       str           = Form(...),
    primary_key_col: str           = Form(...),
    cedant:          Optional[str] = Form(None),
    db:              Session       = Depends(get_db),
    session_id:      str           = Depends(get_session_id),
):
    # ── Validate snapshot ownership ──
    snapshot = (
        db.query(OsclnSnapshot)
          .filter(OsclnSnapshot.id == snapshot_id,
                  OsclnSnapshot.session_id == session_id)
          .first()
    )
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"Snapshot #{snapshot_id} tidak ditemukan")

    pk = primary_key_col.strip()

    # ── Load Master rows dari tabel kolumnar ──────────────────────────
    from ..routers.master import (
        _qualified_master_table,
        _target_table as _tt,
    )
    master_table = _tt(tipe_data)
    is_infopack  = "infopack" in master_table

    where  = ["1=1"]
    params: dict = {}
    if cedant:
        where.append("cedant_code = :cedant")
        params["cedant"] = cedant

    master_raw = db.execute(
        text(
            f"SELECT * FROM {_qualified_master_table(master_table)} "
            f"WHERE {' AND '.join(where)}"
        ),
        params,
    ).mappings().all()

    if not master_raw:
        raise HTTPException(
            status_code=422,
            detail=f"Tidak ada data Master untuk tipe_data='{tipe_data}'" +
                   (f" cedant='{cedant}'" if cedant else ""),
        )

    master_records = []
    for r in master_raw:
        dol_val = r.get("dol")
        dol_str = dol_val.strftime("%Y-%m-%d") if dol_val else ""

        if is_infopack:
            pk_val = r.get("title") or str(r.get("id"))
            data   = {
                "cedant_code": r.get("cedant_code"), "class_code": r.get("class_code"),
                "title": r.get("title"), "value": r.get("value"),
                "dol": dol_str, "cob": r.get("cob"),
                "gross": str(r.get("gross")) if r.get("gross") is not None else "",
                "tsi": str(r.get("tsi")) if r.get("tsi") is not None else "",
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "upload_batch_id": r.get("upload_batch_id"),
                "cedant": r.get("cedant_code"),
            }
        else:
            pk_val = r.get("doc_no") or str(r.get("id"))
            data   = {
                "doc_no": r.get("doc_no"), "dol": dol_str,
                "outstanding": str(r.get("outstanding") or ""), "currency": r.get("currency"),
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "upload_batch_id": r.get("upload_batch_id"),
                "cedant": r.get("cedant_code"),
            }

        if pk not in data:
            data[pk] = pk_val

        master_records.append((str(pk_val).strip(), data))

    # ── Load OSCLN rows ──
    oscln_rows = (
        db.query(OsclnRow)
          .filter(OsclnRow.snapshot_id == snapshot_id)
          .all()
    )
    if not oscln_rows:
        raise HTTPException(
            status_code=422,
            detail=f"Snapshot #{snapshot_id} tidak memiliki baris data.",
        )

    oscln_map: dict = {}
    for r in oscln_rows:
        try:
            data = json.loads(r.row_data) if r.row_data else {}
        except Exception:
            data = {}
        if pk not in data:
            data[pk] = r.primary_key_value
        oscln_map[str(r.primary_key_value).strip()] = data

    # ── Key-only matching (OSCLN reconciliation) ──────────────────────────
    # Untuk OSCLN, "matched" = key ada di kedua sumber (tidak peduli nilai kolom).
    # "changed" dari compare_dataframes tidak relevan di sini karena kolom Master
    # dan OSCLN berbeda — semua key-match dianggap MATCHED_1_TO_1.
    results_list = []
    summary = {"matched": 0, "only_in_a": 0, "only_in_b": 0, "changed": 0}

    master_keys_seen = set()
    for pk_val, master_data in master_records:
        key = str(pk_val).strip()
        master_keys_seen.add(key)
        if key in oscln_map:
            summary["matched"] += 1
            results_list.append({
                "primary_key_value": key,
                "diff_type":         "matched",
                "row_data_a":        master_data,
                "row_data_b":        oscln_map[key],
                "changed_columns":   [],
            })
        else:
            summary["only_in_a"] += 1
            results_list.append({
                "primary_key_value": key,
                "diff_type":         "only_in_a",
                "row_data_a":        master_data,
                "row_data_b":        None,
                "changed_columns":   [],
            })

    for key, oscln_data in oscln_map.items():
        if key not in master_keys_seen:
            summary["only_in_b"] += 1
            results_list.append({
                "primary_key_value": key,
                "diff_type":         "only_in_b",
                "row_data_a":        None,
                "row_data_b":        oscln_data,
                "changed_columns":   [],
            })

    result = {
        "summary":      summary,
        "total_rows_a": len(master_records),
        "total_rows_b": len(oscln_map),
        "results":      results_list,
    }

    # ── Persist ComparisonJob — tagged with session ──
    s = result["summary"]
    job = ComparisonJob(
        session_id=session_id,
        bulan=snapshot.bulan,
        tahun=snapshot.tahun,
        tipe_data=tipe_data,
        primary_key_col=pk,
        file_a_name=f"Master_{tipe_data}",
        file_b_name=snapshot.file_name,
        sheet_a="Master",
        sheet_b=f"OSCLN-{snapshot.file_name}",
        status="done",
        total_rows_a=result["total_rows_a"],
        total_rows_b=result["total_rows_b"],
        total_matched=s["matched"],
        total_only_in_a=s["only_in_a"],
        total_only_in_b=s["only_in_b"],
        total_changed=s["changed"],
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    batch = []
    for row in result["results"]:
        batch.append(ComparisonResult(
            job_id=job.id,
            primary_key_value=row["primary_key_value"],
            diff_type=row["diff_type"],
            row_data_a=json.dumps(row["row_data_a"], ensure_ascii=False) if row["row_data_a"] else None,
            row_data_b=json.dumps(row["row_data_b"], ensure_ascii=False) if row["row_data_b"] else None,
            changed_columns=json.dumps(row["changed_columns"], ensure_ascii=False),
        ))
        if len(batch) >= 500:
            db.bulk_save_objects(batch)
            db.commit()
            batch = []
    if batch:
        db.bulk_save_objects(batch)
        db.commit()

    return {
        "job_id":       job.id,
        "snapshot_id":  snapshot_id,
        "total_rows_a": result["total_rows_a"],
        "total_rows_b": result["total_rows_b"],
        "summary":      s,
        "message":      "Rekonsiliasi berhasil.",
    }


# ─────────────────────────────────────────────
# DELETE /api/oscln/snapshots/{snapshot_id}
# ─────────────────────────────────────────────
@router.delete("/snapshots/{snapshot_id}", summary="Hapus snapshot OSCLN")
def delete_snapshot(
    snapshot_id: int,
    db:          Session = Depends(get_db),
    session_id:  str     = Depends(get_session_id),
):
    snap = (
        db.query(OsclnSnapshot)
          .filter(OsclnSnapshot.id == snapshot_id,
                  OsclnSnapshot.session_id == session_id)
          .first()
    )
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot tidak ditemukan")

    deleted = (
        db.query(OsclnRow)
          .filter(OsclnRow.snapshot_id == snapshot_id)
          .delete(synchronize_session=False)
    )
    db.delete(snap)
    db.commit()
    return {"message": f"Snapshot '{snap.file_name}' dihapus.", "rows_deleted": deleted}


# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────
def _snap_to_dict(s: OsclnSnapshot) -> dict:
    return {
        "id":              s.id,
        "bulan":           s.bulan,
        "tahun":           s.tahun,
        "file_name":       s.file_name,
        "primary_key_col": s.primary_key_col,
        "total_rows":      s.total_rows,
        "status":          s.status,
        "created_at":      s.created_at.isoformat() if s.created_at else None,
    }


# ═════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE MATCHING: fsi_db (clickhouse.oscln) <-> hasil_rekonsiliasi.*
# ═════════════════════════════════════════════════════════════════════════════

POV_CONFIG = {
    "internal_vs_cedant": {
        "label": "OS Claim Indore - Cedant",
        "base": "internal",
        "dataset_type": "OS Cedant",
    },
    "cedant_vs_internal": {
        "label": "OS Claim Cedant - Indore",
        "base": "external",
        "dataset_type": "OS Cedant",
    },
    "internal_vs_infopack": {
        "label": "OS Claim Indore - Infopack",
        "base": "internal",
        "dataset_type": "Infopack",
    },
    "infopack_vs_internal": {
        "label": "OS Claim Infopack - Indore",
        "base": "external",
        "dataset_type": "Infopack",
    },
}

NUMERIC_DATA_TYPES = {
    "smallint", "integer", "bigint", "decimal", "numeric",
    "real", "double precision", "int2", "int4", "int8", "float4", "float8",
}


def _friendly_sql_type(data_type: str, udt_name: str = "") -> str:
    dt = (data_type or udt_name or "").lower()
    if "character" in dt or dt in ("varchar", "text", "bpchar", "name"):
        return "Varchar"
    if dt in ("numeric", "decimal"):
        return "Numeric"
    if dt in ("integer", "int4", "bigint", "int8", "smallint", "int2"):
        return "Integer"
    if dt in ("double precision", "real", "float4", "float8"):
        return "Float"
    if "timestamp" in dt:
        return "Timestamp"
    if dt == "date":
        return "Date"
    if dt == "boolean" or dt == "bool":
        return "Boolean"
    return (data_type or udt_name or "Text").title()


def _serialize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _normalize_match_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        text_val = format(value.normalize(), "f")
        return text_val.rstrip("0").rstrip(".") if "." in text_val else text_val
    text_val = str(value).strip()
    if not text_val or text_val.lower() in ("none", "nan", "null", "-"):
        return ""
    # Bersihkan suffix ".0" berulang pada ID numerik dari Excel/ClickHouse (mis. "2401091900282.0.0")
    cleaned = re.sub(r"(\.0)+$", "", text_val)
    return cleaned.strip().casefold()


def _parse_amount(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        try:
            return Decimal(str(value))
        except InvalidOperation:
            return None
    raw = str(value).strip()
    if not raw or raw.lower() in ("none", "nan", "null", "-"):
        return None
    negative = raw.startswith("(") and raw.endswith(")")
    cleaned = re.sub(r"[^0-9,.\-]", "", raw)
    if not cleaned or cleaned in ("-", ".", ","):
        return None
    # Deteksi format ribuan/desimal Indonesia vs US
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    try:
        dec = Decimal(cleaned)
        return -abs(dec) if negative else dec
    except InvalidOperation:
        return None


def _list_table_columns(db: Session, schema: str, table_name: str) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT column_name, data_type, udt_name "
            "FROM information_schema.columns "
            "WHERE table_schema = :schema AND table_name = :table_name "
            "ORDER BY ordinal_position"
        ),
        {"schema": schema, "table_name": table_name},
    ).mappings().all()
    return [
        {
            "name": row["column_name"],
            "data_type": _friendly_sql_type(row["data_type"], row["udt_name"]),
            "raw_type": row["data_type"],
            "is_numeric": (row["data_type"] or "").lower() in NUMERIC_DATA_TYPES
            or (row["udt_name"] or "").lower() in NUMERIC_DATA_TYPES,
        }
        for row in rows
    ]


def _list_hasil_rekonsiliasi_tables(db: Session) -> list[dict]:
    table_names = db.execute(
        text(
            "SELECT table_name "
            "FROM information_schema.tables "
            "WHERE table_schema = 'hasil_rekonsiliasi' "
            "AND table_type = 'BASE TABLE' "
            "ORDER BY table_name"
        )
    ).scalars().all()

    preparer = db.get_bind().dialect.identifier_preparer
    tables = []
    for tname in table_names:
        cols = _list_table_columns(db, "hasil_rekonsiliasi", tname)
        col_names = {c["name"] for c in cols}
        if tname.startswith("os_claim_infopack_"):
            dataset_type = "Infopack"
            label = tname.removeprefix("os_claim_infopack_").replace("_", " ").upper()
        elif tname.startswith("os_infopack_"):
            dataset_type = "Infopack"
            label = tname.removeprefix("os_infopack_").replace("_", " ").upper()
        elif tname.startswith("os_claim_cedant_"):
            dataset_type = "OS Cedant"
            label = tname.removeprefix("os_claim_cedant_").replace("_", " ").upper()
        else:
            dataset_type = "OS Cedant"
            label = tname.replace("_", " ").upper()

        periods = []
        total_rows = 0
        quoted = f"{preparer.quote_schema('hasil_rekonsiliasi')}.{preparer.quote(tname)}"
        try:
            total_rows = db.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0
            if {"reporting_month", "reporting_year"} <= col_names:
                period_rows = db.execute(
                    text(
                        f"SELECT DISTINCT reporting_year, reporting_month "
                        f"FROM {quoted} "
                        "WHERE reporting_year IS NOT NULL AND reporting_month IS NOT NULL "
                        "ORDER BY reporting_year DESC, reporting_month DESC"
                    )
                ).mappings().all()
                periods = [
                    {"year": int(r["reporting_year"]), "month": int(r["reporting_month"])}
                    for r in period_rows
                ]
        except SQLAlchemyError:
            logger.warning("Failed reading stats for hasil_rekonsiliasi.%s", tname)

        tables.append(
            {
                "table_name": tname,
                "dataset_type": dataset_type,
                "cedant_label": label,
                "total_rows": int(total_rows),
                "periods": periods,
                "columns": cols,
            }
        )
    return tables


@router.get("/sources", summary="Daftar kolom fsi_db (clickhouse.oscln) dan tabel hasil_rekonsiliasi")
def get_matching_sources(
    db: Session = Depends(get_db),
    fsi_db: Optional[Session] = Depends(get_fsi_db),
    session_id: str = Depends(get_session_id),
):
    fsi_connected = False
    fsi_error = None
    fsi_columns: list[dict] = []
    fsi_total_rows = 0

    if fsi_db is None:
        fsi_error = (
            "Koneksi fsi_db belum dikonfigurasi. "
            "Tambahkan FSI_DB_HOST / FSI_DB_DATABASE (atau FSI_DATABASE_URL) pada .env backend."
        )
    else:
        try:
            fsi_columns = _list_table_columns(fsi_db, FSI_DB_SCHEMA, FSI_OSCLN_TABLE)
            if not fsi_columns:
                fsi_error = f"Tabel {FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE} tidak ditemukan di fsi_db."
            else:
                preparer = fsi_db.get_bind().dialect.identifier_preparer
                quoted_fsi = (
                    f"{preparer.quote_schema(FSI_DB_SCHEMA)}."
                    f"{preparer.quote(FSI_OSCLN_TABLE)}"
                )
                fsi_total_rows = int(
                    fsi_db.execute(text(f"SELECT COUNT(*) FROM {quoted_fsi}")).scalar() or 0
                )
                fsi_connected = True
        except SQLAlchemyError as exc:
            logger.warning("Could not introspect fsi_db.%s.%s: %s", FSI_DB_SCHEMA, FSI_OSCLN_TABLE, exc)
            fsi_error = f"Gagal terhubung ke fsi_db ({FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}): {exc}"

    result_tables = _list_hasil_rekonsiliasi_tables(db)
    return {
        "fsi_connected": fsi_connected,
        "fsi_source": f"{FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}",
        "fsi_error": fsi_error,
        "fsi_total_rows": fsi_total_rows,
        "fsi_columns": fsi_columns,
        "result_tables": result_tables,
        "pov_options": [
            {"value": key, **meta} for key, meta in POV_CONFIG.items()
        ],
    }


def _execute_custom_matching(
    db: Session,
    fsi_db: Optional[Session],
    payload: dict,
    *,
    preview_limit: Optional[int] = 500,
) -> dict:
    if fsi_db is None:
        raise HTTPException(
            status_code=503,
            detail="Koneksi database fsi_db belum dikonfigurasi pada backend (.env).",
        )

    pov = str(payload.get("pov") or "internal_vs_cedant").strip()
    if pov not in POV_CONFIG:
        raise HTTPException(
            status_code=422,
            detail=f"POV tidak dikenal: {pov}. Pilih salah satu: {', '.join(POV_CONFIG)}.",
        )
    pov_meta = POV_CONFIG[pov]

    result_table = str(payload.get("result_table") or "").strip()
    if not result_table:
        raise HTTPException(status_code=422, detail="Tabel database cedant wajib dipilih.")

    available_tables = {
        row[0]
        for row in db.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'hasil_rekonsiliasi' AND table_type = 'BASE TABLE'"
            )
        ).all()
    }
    if result_table not in available_tables:
        raise HTTPException(
            status_code=404,
            detail=f"Tabel hasil_rekonsiliasi.{result_table} tidak ditemukan.",
        )

    fsi_cols = _list_table_columns(fsi_db, FSI_DB_SCHEMA, FSI_OSCLN_TABLE)
    fsi_col_names = {c["name"] for c in fsi_cols}
    if not fsi_col_names:
        raise HTTPException(
            status_code=404,
            detail=f"Tabel {FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE} tidak ditemukan di fsi_db.",
        )

    ext_cols = _list_table_columns(db, "hasil_rekonsiliasi", result_table)
    ext_col_names = {c["name"] for c in ext_cols}

    raw_pairs = payload.get("match_pairs") or []
    if not isinstance(raw_pairs, list) or not raw_pairs:
        raise HTTPException(
            status_code=422,
            detail="Minimal satu pasangan kolom pencocokkan (match_pairs) wajib dipilih.",
        )

    match_pairs: list[dict[str, str]] = []
    for pair in raw_pairs:
        m_col = str((pair or {}).get("master_col") or "").strip()
        c_col = str((pair or {}).get("cedant_col") or "").strip()
        if not m_col or not c_col:
            raise HTTPException(
                status_code=422,
                detail="Setiap pasangan pencocokkan harus memilih kolom Master dan kolom Cedant.",
            )
        if m_col not in fsi_col_names:
            raise HTTPException(
                status_code=422,
                detail=f"Kolom Master '{m_col}' tidak ditemukan di {FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}.",
            )
        if c_col not in ext_col_names:
            raise HTTPException(
                status_code=422,
                detail=f"Kolom Cedant '{c_col}' tidak ditemukan di hasil_rekonsiliasi.{result_table}.",
            )
        match_pairs.append({"master_col": m_col, "cedant_col": c_col})

    master_out_col = str(payload.get("master_outstanding_col") or "").strip() or None
    cedant_out_col = str(payload.get("cedant_outstanding_col") or "").strip() or None
    if master_out_col and master_out_col not in fsi_col_names:
        raise HTTPException(
            status_code=422,
            detail=f"Kolom Master Outstanding '{master_out_col}' tidak ditemukan di {FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}.",
        )
    if cedant_out_col and cedant_out_col not in ext_col_names:
        raise HTTPException(
            status_code=422,
            detail=f"Kolom Cedant Outstanding '{cedant_out_col}' tidak ditemukan di hasil_rekonsiliasi.{result_table}.",
        )

    aggregate_internal = bool(payload.get("aggregate_internal", True))
    reporting_month = payload.get("reporting_month")
    reporting_year = payload.get("reporting_year")
    cedant_filter = str(payload.get("cedant_filter") or "").strip() or None

    # ── 1. Baca data Internal dari fsi_db (clickhouse.oscln) ──
    fsi_preparer = fsi_db.get_bind().dialect.identifier_preparer
    quoted_fsi = (
        f"{fsi_preparer.quote_schema(FSI_DB_SCHEMA)}."
        f"{fsi_preparer.quote(FSI_OSCLN_TABLE)}"
    )
    fsi_where = []
    fsi_params: dict[str, Any] = {}
    if cedant_filter:
        cedant_candidate = next(
            (c["name"] for c in fsi_cols if c["name"].lower() in ("cedant", "cedant_name", "cedant_code")),
            None,
        )
        if cedant_candidate:
            fsi_where.append(
                f"LOWER(CAST({fsi_preparer.quote(cedant_candidate)} AS TEXT)) LIKE LOWER(:cedant_filter)"
            )
            fsi_params["cedant_filter"] = f"%{cedant_filter}%"
    fsi_where_sql = f" WHERE {' AND '.join(fsi_where)}" if fsi_where else ""
    try:
        internal_raw = fsi_db.execute(
            text(f"SELECT * FROM {quoted_fsi}{fsi_where_sql}"),
            fsi_params,
        ).mappings().all()
    except SQLAlchemyError as exc:
        logger.exception("Error querying fsi_db.%s.%s", FSI_DB_SCHEMA, FSI_OSCLN_TABLE)
        raise HTTPException(
            status_code=500,
            detail=f"Gagal membaca data {FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}: {exc}",
        ) from exc

    # ── 2. Baca data Cedant / Infopack dari hasil_rekonsiliasi.<result_table> ──
    ext_preparer = db.get_bind().dialect.identifier_preparer
    quoted_ext = (
        f"{ext_preparer.quote_schema('hasil_rekonsiliasi')}."
        f"{ext_preparer.quote(result_table)}"
    )
    ext_where = []
    ext_params: dict[str, Any] = {}
    if reporting_month not in (None, "") and "reporting_month" in ext_col_names:
        ext_where.append("reporting_month = :reporting_month")
        ext_params["reporting_month"] = int(reporting_month)
    if reporting_year not in (None, "") and "reporting_year" in ext_col_names:
        ext_where.append("reporting_year = :reporting_year")
        ext_params["reporting_year"] = int(reporting_year)
    ext_where_sql = f" WHERE {' AND '.join(ext_where)}" if ext_where else ""
    ext_raw = db.execute(
        text(f"SELECT * FROM {quoted_ext}{ext_where_sql}"),
        ext_params,
    ).mappings().all()

    # ── 3. Index baris berdasarkan composite key ──
    def build_key(row_map: dict, side: str) -> tuple[str, str]:
        col_key = "master_col" if side == "internal" else "cedant_col"
        norm_parts = []
        disp_parts = []
        for p in match_pairs:
            raw_v = row_map.get(p[col_key])
            norm_parts.append(_normalize_match_value(raw_v))
            disp_parts.append("" if raw_v is None else str(raw_v).strip())
        if not any(norm_parts):
            return "", ""
        return " | ".join(norm_parts), " | ".join(disp_parts)

    internal_groups: dict[str, list[dict]] = {}
    internal_display_key: dict[str, str] = {}
    for row in internal_raw:
        row_dict = {k: _serialize_cell(v) for k, v in row.items()}
        norm_k, disp_k = build_key(row_dict, "internal")
        if not norm_k:
            continue
        internal_groups.setdefault(norm_k, []).append(row_dict)
        internal_display_key.setdefault(norm_k, disp_k)

    ext_groups: dict[str, list[dict]] = {}
    ext_display_key: dict[str, str] = {}
    for row in ext_raw:
        row_dict = {k: _serialize_cell(v) for k, v in row.items()}
        norm_k, disp_k = build_key(row_dict, "external")
        if not norm_k:
            continue
        ext_groups.setdefault(norm_k, []).append(row_dict)
        ext_display_key.setdefault(norm_k, disp_k)

    def sum_group(rows_list: list[dict], col_name: Optional[str]) -> Decimal:
        if not col_name or not rows_list:
            return Decimal("0")
        total = Decimal("0")
        for r in rows_list:
            amt = _parse_amount(r.get(col_name))
            if amt is not None:
                total += amt
        return total

    # ── 4. Bandingkan sesuai arah POV ──
    base_is_internal = pov_meta["base"] == "internal"
    base_groups = internal_groups if base_is_internal else ext_groups
    other_groups = ext_groups if base_is_internal else internal_groups

    results = []
    matched_exact = 0
    matched_diff = 0
    not_matched = 0
    only_in_internal = 0
    only_in_cedant = 0
    total_master_os = Decimal("0")
    total_cedant_os = Decimal("0")

    def make_result_entry(
        norm_k: str,
        int_rows: list[dict],
        ext_rows: list[dict],
        single_row: Optional[dict] = None,
    ) -> dict:
        nonlocal matched_exact, matched_diff, not_matched, only_in_internal, only_in_cedant
        nonlocal total_master_os, total_cedant_os

        has_int = bool(int_rows)
        has_ext = bool(ext_rows)
        is_match = has_int and has_ext

        if aggregate_internal or single_row is None:
            m_amt = sum_group(int_rows, master_out_col)
        else:
            m_amt = _parse_amount(single_row.get(master_out_col)) or Decimal("0")
        c_amt = sum_group(ext_rows, cedant_out_col)
        variance = m_amt - c_amt

        total_master_os += m_amt
        total_cedant_os += c_amt

        if is_match:
            if master_out_col and cedant_out_col and variance != Decimal("0"):
                match_status = "matched_diff"
                diff_type = "changed"
                matched_diff += 1
            else:
                match_status = "matched_exact"
                diff_type = "matched"
                matched_exact += 1
            ketersediaan = "ADA"
        else:
            not_matched += 1
            ketersediaan = "TIDAK ADA"
            if has_int and not has_ext:
                match_status = "only_in_internal"
                diff_type = "only_in_a"
                only_in_internal += 1
            else:
                match_status = "only_in_cedant"
                diff_type = "only_in_b"
                only_in_cedant += 1

        disp_key = (
            internal_display_key.get(norm_k)
            or ext_display_key.get(norm_k)
            or norm_k
        )
        base_row = single_row if single_row is not None else (
            int_rows[0] if (base_is_internal and int_rows) else (ext_rows[0] if ext_rows else {})
        )
        compare_row = (
            ext_rows[0] if (base_is_internal and ext_rows) else (int_rows[0] if int_rows else None)
        )

        return {
            "match_key": disp_key,
            "ketersediaan": ketersediaan,
            "match_status": match_status,
            "diff_type": diff_type,
            "master_outstanding": float(m_amt),
            "cedant_outstanding": float(c_amt),
            "variance": float(variance),
            "internal_row_count": len(int_rows),
            "cedant_row_count": len(ext_rows),
            "base_row": base_row,
            "compare_row": compare_row,
        }

    # Iterasi seluruh key di base POV (jika aggregate_internal=False dan base=internal, pecah per baris)
    for norm_k, b_rows in base_groups.items():
        int_rows = internal_groups.get(norm_k, [])
        ext_rows = ext_groups.get(norm_k, [])
        if base_is_internal and not aggregate_internal:
            for row_item in b_rows:
                results.append(make_result_entry(norm_k, [row_item], ext_rows, single_row=row_item))
        else:
            results.append(make_result_entry(norm_k, int_rows, ext_rows))

    # Hitung juga key yang hanya ada di sisi pembanding (untuk ringkasan lengkap)
    other_only_count = sum(1 for k in other_groups if k not in base_groups)
    if base_is_internal:
        only_in_cedant = other_only_count
    else:
        only_in_internal = other_only_count

    total_matched = matched_exact + matched_diff
    total_base = len(results)
    match_rate_pct = round((total_matched / total_base) * 100, 2) if total_base else 0.0

    base_columns = [c["name"] for c in (fsi_cols if base_is_internal else ext_cols)]
    summary = {
        "pov": pov,
        "pov_label": pov_meta["label"],
        "dataset_type": pov_meta["dataset_type"],
        "result_table": result_table,
        "total_internal_rows": len(internal_raw),
        "total_cedant_rows": len(ext_raw),
        "total_base_keys": total_base,
        "matched_exact": matched_exact,
        "matched_diff": matched_diff,
        "total_matched": total_matched,
        "not_matched": not_matched,
        "only_in_internal": only_in_internal,
        "only_in_cedant": only_in_cedant,
        "match_rate_pct": match_rate_pct,
        "total_master_outstanding": float(total_master_os),
        "total_cedant_outstanding": float(total_cedant_os),
        "total_variance": float(total_master_os - total_cedant_os),
        "aggregate_internal": aggregate_internal,
        "match_pairs": match_pairs,
        "master_outstanding_col": master_out_col,
        "cedant_outstanding_col": cedant_out_col,
    }

    sliced_rows = results[:preview_limit] if preview_limit is not None else results
    return {
        "summary": summary,
        "base_columns": base_columns,
        "total_rows": total_base,
        "rows": sliced_rows,
        "all_rows": results if preview_limit is None else None,
    }


@router.post("/matching/preview", summary="Bandingkan Data (preview customize matching tanpa simpan)")
def preview_custom_matching(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    fsi_db: Optional[Session] = Depends(get_fsi_db),
    session_id: str = Depends(get_session_id),
):
    limit = int(payload.get("limit") or 500)
    limit = max(1, min(limit, 5000))
    outcome = _execute_custom_matching(db, fsi_db, payload, preview_limit=limit)
    return {
        "summary": outcome["summary"],
        "base_columns": outcome["base_columns"],
        "total_rows": outcome["total_rows"],
        "rows": outcome["rows"],
    }


@router.post("/matching/save", summary="Update Data Matching (simpan hasil customize matching ke database)")
def save_custom_matching(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    fsi_db: Optional[Session] = Depends(get_fsi_db),
    session_id: str = Depends(get_session_id),
):
    outcome = _execute_custom_matching(db, fsi_db, payload, preview_limit=None)
    s = outcome["summary"]
    all_rows = outcome["all_rows"] or []

    pair_desc = ", ".join(f"{p['master_col']}={p['cedant_col']}" for p in s["match_pairs"])
    now = datetime.utcnow()
    bulan = str(payload.get("reporting_month") or f"{now.month:02d}").zfill(2)
    tahun = str(payload.get("reporting_year") or now.year)

    job = ComparisonJob(
        session_id=session_id,
        bulan=bulan,
        tahun=tahun,
        tipe_data=f"{s['pov']}|{s['result_table']}",
        primary_key_col=pair_desc[:100],
        file_a_name=f"{FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}",
        file_b_name=f"hasil_rekonsiliasi.{s['result_table']}",
        sheet_a=s["pov_label"],
        sheet_b=s["result_table"],
        status="done",
        total_rows_a=s["total_internal_rows"],
        total_rows_b=s["total_cedant_rows"],
        total_matched=s["matched_exact"],
        total_changed=s["matched_diff"],
        total_only_in_a=s["only_in_internal"],
        total_only_in_b=s["only_in_cedant"],
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    batch = []
    for item in all_rows:
        enriched_a = {
            **(item["base_row"] or {}),
            "__ketersediaan": item["ketersediaan"],
            "__match_status": item["match_status"],
            "__master_outstanding": item["master_outstanding"],
            "__cedant_outstanding": item["cedant_outstanding"],
            "__variance": item["variance"],
            "__internal_row_count": item["internal_row_count"],
            "__cedant_row_count": item["cedant_row_count"],
        }
        changed_cols = ["variance"] if item["match_status"] == "matched_diff" else []
        batch.append(
            ComparisonResult(
                job_id=job.id,
                primary_key_value=str(item["match_key"])[:255],
                diff_type=item["diff_type"],
                row_data_a=json.dumps(enriched_a, ensure_ascii=False),
                row_data_b=json.dumps(item["compare_row"], ensure_ascii=False)
                if item["compare_row"]
                else None,
                changed_columns=json.dumps(changed_cols, ensure_ascii=False),
            )
        )
        if len(batch) >= 500:
            db.bulk_save_objects(batch)
            db.commit()
            batch = []
    if batch:
        db.bulk_save_objects(batch)
        db.commit()

    return {
        "job_id": job.id,
        "summary": s,
        "message": (
            f"Data matching berhasil disimpan ({s['total_matched']} matched, "
            f"{s['not_matched']} tidak cocok, selisih total {s['total_variance']:,.2f})."
        ),
    }


@router.get("/matching/history", summary="Daftar hasil matching tersimpan per POV")
def list_custom_matching_history(
    pov: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
):
    q = db.query(ComparisonJob).filter(
        ComparisonJob.session_id == session_id,
        ComparisonJob.file_b_name.like("hasil_rekonsiliasi.%"),
    )
    if pov and pov in POV_CONFIG:
        q = q.filter(ComparisonJob.tipe_data.like(f"{pov}|%"))
    jobs = q.order_by(ComparisonJob.id.desc()).limit(limit).all()

    items = []
    for j in jobs:
        parts = (j.tipe_data or "").split("|", 1)
        job_pov = parts[0] if parts else "internal_vs_cedant"
        res_table = parts[1] if len(parts) > 1 else (j.sheet_b or "")
        total_matched = (j.total_matched or 0) + (j.total_changed or 0)
        items.append(
            {
                "job_id": j.id,
                "pov": job_pov,
                "pov_label": POV_CONFIG.get(job_pov, {}).get("label", j.sheet_a or job_pov),
                "result_table": res_table,
                "match_expression": j.primary_key_col,
                "bulan": j.bulan,
                "tahun": j.tahun,
                "total_rows_a": j.total_rows_a,
                "total_rows_b": j.total_rows_b,
                "matched_exact": j.total_matched or 0,
                "matched_diff": j.total_changed or 0,
                "total_matched": total_matched,
                "only_in_internal": j.total_only_in_a or 0,
                "only_in_cedant": j.total_only_in_b or 0,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
        )
    return {"total": len(items), "items": items}
