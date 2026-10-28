"""
Router: /api/compare
Handles file upload, comparison, result retrieval, and report download.
"""
import json
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from io import BytesIO

from ..models import get_db, ComparisonJob, ComparisonResult
from ..services.excel_service import compare_excel, get_sheet_names, generate_report_excel

router = APIRouter(prefix="/api/compare", tags=["compare"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ─────────────────────────────────────────────
# POST /api/compare/upload
# ─────────────────────────────────────────────
@router.post("/upload", summary="Unggah dan bandingkan dua file Excel")
async def upload_and_compare(
    bulan: str = Form(..., description="Bulan periode 01-12"),
    tahun: str = Form(..., description="Tahun periode, misal 2026"),
    tipe_data: str = Form(..., description="OS Cedant atau Infopack"),
    primary_key_col: str = Form(..., description="Nama kolom primary key"),
    sheet_a: Optional[str] = Form(None, description="Nama sheet dari File A (opsional)"),
    sheet_b: Optional[str] = Form(None, description="Nama sheet dari File B (opsional)"),
    file_a: UploadFile = File(..., description="File Excel Utama"),
    file_b: UploadFile = File(..., description="File Excel Pembanding"),
    db: Session = Depends(get_db),
):
    # ── Validasi format file ──
    for f, label in [(file_a, "File A"), (file_b, "File B")]:
        if not f.filename.endswith((".xlsx", ".xls", ".xlsb")):
            raise HTTPException(
                status_code=400,
                detail=f"{label} harus berformat .xlsx atau .xls"
            )

    # ── Baca bytes ──
    bytes_a = await file_a.read()
    bytes_b = await file_b.read()

    if len(bytes_a) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File A melebihi batas 50 MB")
    if len(bytes_b) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File B melebihi batas 50 MB")

    # ── Simpan job metadata ke DB ──
    job = ComparisonJob(
        bulan=bulan,
        tahun=tahun,
        tipe_data=tipe_data,
        primary_key_col=primary_key_col.strip(),
        file_a_name=file_a.filename,
        file_b_name=file_b.filename,
        sheet_a=sheet_a,
        sheet_b=sheet_b,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # ── Proses komparasi ──
    try:
        result = compare_excel(
            file_a_bytes=bytes_a,
            file_b_bytes=bytes_b,
            primary_key_col=primary_key_col.strip(),
            sheet_a=sheet_a or None,
            sheet_b=sheet_b or None,
        )
    except ValueError as e:
        job.status = "error"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during comparison")
        job.status = "error"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan internal: {str(e)}")

    # ── Update job dengan summary ──
    s = result["summary"]
    job.status = "done"
    job.sheet_a = result["sheet_a"]
    job.sheet_b = result["sheet_b"]
    job.total_rows_a = result["total_rows_a"]
    job.total_rows_b = result["total_rows_b"]
    job.total_matched = s["matched"]
    job.total_only_in_a = s["only_in_a"]
    job.total_only_in_b = s["only_in_b"]
    job.total_changed = s["changed"]
    db.commit()

    # ── Simpan baris hasil ke comparison_results ──
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
        "job_id": job.id,
        "sheet_a": result["sheet_a"],
        "sheet_b": result["sheet_b"],
        "total_rows_a": result["total_rows_a"],
        "total_rows_b": result["total_rows_b"],
        "summary": s,
        "message": "Komparasi berhasil",
    }


# ─────────────────────────────────────────────
# GET /api/compare/jobs
# ─────────────────────────────────────────────
@router.get("/jobs", summary="Daftar semua job komparasi")
def list_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    total = db.query(ComparisonJob).count()
    jobs = (
        db.query(ComparisonJob)
        .order_by(ComparisonJob.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "jobs": [_job_to_dict(j) for j in jobs],
    }


# ─────────────────────────────────────────────
# GET /api/compare/jobs/{job_id}
# ─────────────────────────────────────────────
@router.get("/jobs/{job_id}", summary="Detail satu job komparasi")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ComparisonJob).filter(ComparisonJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    return _job_to_dict(job)


# ─────────────────────────────────────────────
# GET /api/compare/jobs/{job_id}/results
# ─────────────────────────────────────────────
@router.get("/jobs/{job_id}/results", summary="Hasil komparasi per baris (paginated)")
def get_results(
    job_id: int,
    diff_type: Optional[str] = Query(None, description="Filter: matched|changed|only_in_a|only_in_b"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    job = db.query(ComparisonJob).filter(ComparisonJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")

    q = db.query(ComparisonResult).filter(ComparisonResult.job_id == job_id)
    if diff_type:
        q = q.filter(ComparisonResult.diff_type == diff_type)

    total = q.count()
    rows = q.order_by(ComparisonResult.id).offset(skip).limit(limit).all()

    return {
        "job_id": job_id,
        "total": total,
        "results": [_result_to_dict(r) for r in rows],
    }


# ─────────────────────────────────────────────
# GET /api/compare/jobs/{job_id}/download
# ─────────────────────────────────────────────
@router.get("/jobs/{job_id}/download", summary="Download laporan Excel hasil komparasi")
def download_report(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ComparisonJob).filter(ComparisonJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    if job.status != "done":
        raise HTTPException(status_code=400, detail="Job belum selesai diproses")

    rows = (
        db.query(ComparisonResult)
        .filter(ComparisonResult.job_id == job_id)
        .order_by(ComparisonResult.id)
        .all()
    )

    comparison_result = {
        "sheet_a": job.sheet_a,
        "sheet_b": job.sheet_b,
        "total_rows_a": job.total_rows_a,
        "total_rows_b": job.total_rows_b,
        "summary": {
            "matched":   job.total_matched,
            "changed":   job.total_changed,
            "only_in_a": job.total_only_in_a,
            "only_in_b": job.total_only_in_b,
        },
        "results": [_result_to_dict(r) for r in rows],
    }

    job_meta = {
        "bulan": job.bulan,
        "tahun": job.tahun,
        "tipe_data": job.tipe_data,
        "primary_key_col": job.primary_key_col,
        "file_a_name": job.file_a_name,
        "file_b_name": job.file_b_name,
    }

    excel_bytes = generate_report_excel(comparison_result, job_meta)
    filename = f"laporan_komparasi_{job.tahun}{job.bulan}_job{job.id}.xlsx"

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────
# POST /api/compare/sheets  — get sheet list
# ─────────────────────────────────────────────
@router.post("/sheets", summary="Ambil daftar sheet dari file Excel")
async def get_sheets(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File harus .xlsx atau .xls")
    data = await file.read()
    try:
        sheets = get_sheet_names(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Tidak bisa membaca file: {e}")
    return {"sheets": sheets}


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _job_to_dict(job: ComparisonJob) -> dict:
    return {
        "id": job.id,
        "bulan": job.bulan,
        "tahun": job.tahun,
        "tipe_data": job.tipe_data,
        "primary_key_col": job.primary_key_col,
        "file_a_name": job.file_a_name,
        "file_b_name": job.file_b_name,
        "sheet_a": job.sheet_a,
        "sheet_b": job.sheet_b,
        "status": job.status,
        "total_rows_a": job.total_rows_a,
        "total_rows_b": job.total_rows_b,
        "total_matched": job.total_matched,
        "total_only_in_a": job.total_only_in_a,
        "total_only_in_b": job.total_only_in_b,
        "total_changed": job.total_changed,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


def _result_to_dict(r: ComparisonResult) -> dict:
    return {
        "id": r.id,
        "job_id": r.job_id,
        "primary_key_value": r.primary_key_value,
        "diff_type": r.diff_type,
        "row_data_a": json.loads(r.row_data_a) if r.row_data_a else None,
        "row_data_b": json.loads(r.row_data_b) if r.row_data_b else None,
        "changed_columns": json.loads(r.changed_columns) if r.changed_columns else [],
    }
