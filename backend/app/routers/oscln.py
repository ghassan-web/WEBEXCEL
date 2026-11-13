"""
Router: /api/oscln
Handles OSCLN CSV snapshot upload and Master-vs-OSCLN reconciliation.
All endpoints are scoped to the caller's session_id (X-Session-ID header).
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..models import (
    get_db, get_session_id,
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
    from ..routers.master import _target_table as _tt
    master_table = _tt(tipe_data)
    is_infopack  = "infopack" in master_table

    where  = ["1=1"]
    params: dict = {}
    if cedant:
        where.append("cedant_code = :cedant")
        params["cedant"] = cedant

    master_raw = db.execute(
        text(f"SELECT * FROM {master_table} WHERE {' AND '.join(where)}"),
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
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                "cedant": r.get("cedant_code"),
            }
        else:
            pk_val = r.get("doc_no") or str(r.get("id"))
            data   = {
                "doc_no": r.get("doc_no"), "dol": dol_str,
                "outstanding": str(r.get("outstanding") or ""), "currency": r.get("currency"),
                "month": r.get("month"), "year": r.get("year"),
                "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
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
