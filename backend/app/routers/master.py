"""
Router: /api/master
Handles single-file upload → append to Master, and Master data retrieval.
"""
import csv
import io
import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models import get_db, UploadJob, MasterData
from ..services.excel_service import ingest_excel

router = APIRouter(prefix="/api/master", tags=["master"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ─────────────────────────────────────────────
# POST /api/master/upload
# ─────────────────────────────────────────────
@router.post("/upload", summary="Unggah satu file Excel dan append ke Master")
async def upload_to_master(
    bulan:           str           = Form(..., description="Bulan periode 01-12"),
    tahun:           str           = Form(..., description="Tahun periode, misal 2026"),
    tipe_data:       str           = Form(..., description="OS Cedant atau Infopack"),
    primary_key_col: str           = Form(..., description="Nama kolom primary key"),
    cedant:          Optional[str] = Form(None, description="Nama cedant (opsional)"),
    sheet_name:      Optional[str] = Form(None, description="Nama sheet (opsional)"),
    file:            UploadFile    = File(..., description="File Excel"),
    db:              Session       = Depends(get_db),
):
    # ── Validasi format ──
    if not file.filename.endswith((".xlsx", ".xls", ".xlsb")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx atau .xls")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB")

    # ── Buat upload job ──
    # Normalise primary_key_col: strip unicode whitespace + collapse multiple spaces
    primary_key_col = ' '.join(primary_key_col.strip().replace('\xa0', ' ').replace('\u200b', '').split())

    job = UploadJob(
        bulan=bulan,
        tahun=tahun,
        tipe_data=tipe_data,
        primary_key_col=primary_key_col,
        file_name=file.filename,
        sheet_name=sheet_name or None,
        cedant=cedant or None,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # ── Ingest file ──
    try:
        result = ingest_excel(file_bytes, primary_key_col.strip(), sheet_name or None)
    except ValueError as e:
        job.status = "error"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during ingestion")
        job.status = "error"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan internal: {str(e)}")

    # ── Append ke master_data (skip duplicate PKs) ──
    appended = 0
    skipped  = 0
    batch    = []

    # Fetch all existing PKs for this tipe_data in one query for efficiency
    existing_pks = set(
        row[0] for row in db.query(MasterData.primary_key_value)
        .filter(MasterData.tipe_data == tipe_data)
        .all()
    )

    for r in result["rows"]:
        if r["pk"] in existing_pks:
            skipped += 1
            continue
        # Inject sheet_name into each row so it's available downstream (e.g. OSCLN reconcile)
        r["data"].setdefault("sheet", result["sheet"])
        batch.append(MasterData(
            tipe_data=tipe_data,
            bulan=bulan,
            tahun=tahun,
            cedant=cedant or None,
            primary_key_value=r["pk"],
            source_job_id=job.id,
            row_data=json.dumps(r["data"], ensure_ascii=False),
        ))
        existing_pks.add(r["pk"])  # prevent intra-batch dupes
        appended += 1

        if len(batch) >= 500:
            db.bulk_save_objects(batch)
            db.commit()
            batch = []

    if batch:
        db.bulk_save_objects(batch)
        db.commit()

    # ── Update job status ──
    job.status        = "done"
    job.total_rows    = result["total_rows"]
    job.rows_appended = appended
    job.rows_skipped  = skipped
    db.commit()

    return {
        "job_id":       job.id,
        "sheet":        result["sheet"],
        "total_rows":   result["total_rows"],
        "rows_appended": appended,
        "rows_skipped":  skipped,
        "message":      f"Upload berhasil. {appended} baris ditambahkan, {skipped} baris dilewati (duplikat).",
    }


# ─────────────────────────────────────────────
# GET /api/master/data
# ─────────────────────────────────────────────
@router.get("/data", summary="Ambil data Master (paginated)")
def get_master_data(
    tipe_data: Optional[str] = Query(None, description="Filter: OS Cedant atau Infopack"),
    cedant:    Optional[str] = Query(None, description="Filter by cedant"),
    skip:      int           = Query(0,    ge=0),
    limit:     int           = Query(50,   ge=1, le=500),
    db:        Session       = Depends(get_db),
):
    q = db.query(MasterData)
    if tipe_data:
        q = q.filter(MasterData.tipe_data == tipe_data)
    if cedant:
        q = q.filter(MasterData.cedant == cedant)

    total = q.count()
    rows  = q.order_by(MasterData.id.desc()).offset(skip).limit(limit).all()

    # ── Fetch sheet_name from upload_jobs for this batch ──
    job_ids = list({r.source_job_id for r in rows if r.source_job_id})
    job_sheet_map: dict = {}
    if job_ids:
        jobs = db.query(UploadJob.id, UploadJob.sheet_name).filter(UploadJob.id.in_(job_ids)).all()
        job_sheet_map = {j.id: j.sheet_name for j in jobs}

    return {
        "total": total,
        "rows": [_master_row_to_dict(r, job_sheet_map.get(r.source_job_id)) for r in rows],
    }


# ─────────────────────────────────────────────
# GET /api/master/jobs
# ─────────────────────────────────────────────
@router.get("/jobs", summary="Riwayat upload jobs")
def list_upload_jobs(
    skip:  int = Query(0,  ge=0),
    limit: int = Query(20, ge=1, le=100),
    db:    Session = Depends(get_db),
):
    total = db.query(UploadJob).count()
    jobs  = (
        db.query(UploadJob)
        .order_by(UploadJob.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "jobs": [_upload_job_to_dict(j) for j in jobs],
    }



# ─────────────────────────────────────────────
# GET /api/master/export
# Stream all master_data rows as CSV
# ─────────────────────────────────────────────
@router.get("/export", summary="Export Master data sebagai CSV")
def export_master_csv(
    tipe_data: Optional[str] = Query(None, description="Filter: OS Cedant atau Infopack"),
    cedant:    Optional[str] = Query(None, description="Filter by cedant"),
    db:        Session       = Depends(get_db),
):
    """
    Streams all rows matching the filter as a UTF-8 CSV file.
    No pagination — all rows are exported in a single response.
    """
    q = db.query(MasterData)
    if tipe_data:
        q = q.filter(MasterData.tipe_data == tipe_data)
    if cedant:
        q = q.filter(MasterData.cedant == cedant)

    rows = q.order_by(MasterData.id.asc()).all()

    # ── Gather all dynamic column names from row_data ──
    dynamic_cols: list[str] = []
    parsed_rows: list[dict] = []
    for r in rows:
        try:
            data = json.loads(r.row_data) if r.row_data else {}
        except Exception:
            data = {}
        parsed_rows.append(data)
        for k in data.keys():
            if k not in dynamic_cols:
                dynamic_cols.append(k)

    # ── Fixed meta columns first, then dynamic data columns ──
    meta_cols = ["id", "tipe_data", "bulan", "tahun", "cedant", "primary_key_value", "source_job_id", "created_at"]
    fieldnames = meta_cols + dynamic_cols

    def generate():
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        yield buf.getvalue()

        for r, data in zip(rows, parsed_rows):
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
            row_dict = {
                "id":                r.id,
                "tipe_data":         r.tipe_data,
                "bulan":             r.bulan,
                "tahun":             r.tahun,
                "cedant":            r.cedant or "",
                "primary_key_value": r.primary_key_value,
                "source_job_id":     r.source_job_id,
                "created_at":        r.created_at.isoformat() if r.created_at else "",
                **data,
            }
            writer.writerow(row_dict)
            yield buf.getvalue()

    # Build filename
    safe_tipe = (tipe_data or "all").replace(" ", "_")
    safe_cedant = f"_{cedant.replace(' ', '_')}" if cedant else ""
    filename = f"master_{safe_tipe}{safe_cedant}.csv"

    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


# ─────────────────────────────────────────────
# Helper serialisers
# ─────────────────────────────────────────────
def _master_row_to_dict(r: MasterData, sheet_name: str = None) -> dict:
    try:
        data = json.loads(r.row_data) if r.row_data else {}
    except Exception:
        data = {}
    return {
        "id":                r.id,
        "tipe_data":         r.tipe_data,
        "bulan":             r.bulan,
        "tahun":             r.tahun,
        "cedant":            r.cedant,
        "primary_key_value": r.primary_key_value,
        "source_job_id":     r.source_job_id,
        "sheet_name":        sheet_name or None,
        "row_data":          data,
        "created_at":        r.created_at.isoformat() if r.created_at else None,
    }


def _upload_job_to_dict(j: UploadJob) -> dict:
    return {
        "id":              j.id,
        "bulan":           j.bulan,
        "tahun":           j.tahun,
        "tipe_data":       j.tipe_data,
        "cedant":          j.cedant,
        "primary_key_col": j.primary_key_col,
        "file_name":       j.file_name,
        "sheet_name":      j.sheet_name,
        "status":          j.status,
        "total_rows":      j.total_rows,
        "rows_appended":   j.rows_appended,
        "rows_skipped":    j.rows_skipped,
        "error_message":   j.error_message,
        "created_at":      j.created_at.isoformat() if j.created_at else None,
    }


# ─────────────────────────────────────────────
# GET /api/master/library
# Returns per-file upload summary grouped by tipe_data
# ─────────────────────────────────────────────
@router.get("/library", summary="Library file per tipe data")
def get_library(
    tipe_data: Optional[str] = Query(None, description="Filter: OS Cedant atau Infopack"),
    skip:      int           = Query(0,  ge=0),
    limit:     int           = Query(50, ge=1, le=200),
    db:        Session       = Depends(get_db),
):
    """
    Returns paginated upload jobs enriched with row counts,
    grouped so the UI can show a per-file library view.
    """
    q = db.query(UploadJob)
    if tipe_data:
        q = q.filter(UploadJob.tipe_data == tipe_data)

    total = q.count()
    jobs  = q.order_by(UploadJob.id.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "files": [_library_entry(j) for j in jobs],
    }


# ─────────────────────────────────────────────
# DELETE /api/master/library/{job_id}
# Removes upload job + its master_data rows
# ─────────────────────────────────────────────
@router.delete("/library/{job_id}", summary="Hapus file dari Library")
def delete_library_entry(
    job_id: int,
    db:     Session = Depends(get_db),
):
    job = db.query(UploadJob).filter(UploadJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")

    # Remove associated master rows
    deleted = (
        db.query(MasterData)
        .filter(MasterData.source_job_id == job_id)
        .delete(synchronize_session=False)
    )
    db.delete(job)
    db.commit()

    return {
        "message":       f"File '{job.file_name}' dihapus dari Library.",
        "rows_deleted":  deleted,
    }


# ─────────────────────────────────────────────
# DELETE /api/master/library  (bulk)
# Body: { "job_ids": [1, 2, 3] }
# ─────────────────────────────────────────────
class BulkDeleteRequest(BaseModel):
    job_ids: List[int]

@router.delete("/library", summary="Hapus beberapa file dari Library sekaligus")
def bulk_delete_library(
    body: BulkDeleteRequest,
    db:   Session = Depends(get_db),
):
    if not body.job_ids:
        raise HTTPException(status_code=400, detail="job_ids tidak boleh kosong")

    jobs = db.query(UploadJob).filter(UploadJob.id.in_(body.job_ids)).all()
    if not jobs:
        raise HTTPException(status_code=404, detail="Tidak ada job yang ditemukan")

    found_ids = [j.id for j in jobs]

    # Remove associated master rows
    rows_deleted = (
        db.query(MasterData)
        .filter(MasterData.source_job_id.in_(found_ids))
        .delete(synchronize_session=False)
    )

    for job in jobs:
        db.delete(job)
    db.commit()

    return {
        "message":      f"{len(jobs)} file berhasil dihapus dari Library.",
        "jobs_deleted": len(jobs),
        "rows_deleted": rows_deleted,
    }


def _library_entry(j: UploadJob) -> dict:
    return {
        "id":            j.id,
        "file_name":     j.file_name,
        "tipe_data":     j.tipe_data,
        "cedant":        j.cedant,
        "bulan":         j.bulan,
        "tahun":         j.tahun,
        "sheet_name":    j.sheet_name,
        "primary_key_col": j.primary_key_col,
        "status":        j.status,
        "total_rows":    j.total_rows    or 0,
        "rows_appended": j.rows_appended or 0,
        "rows_skipped":  j.rows_skipped  or 0,
        "error_message": j.error_message,
        "created_at":    j.created_at.isoformat() if j.created_at else None,
    }
