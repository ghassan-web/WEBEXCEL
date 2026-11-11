"""
Router: /api/master
Handles single-file upload → append to Master, and Master data retrieval.
All endpoints are scoped to the caller's session_id (X-Session-ID header).
export endpoint accepts session_id as a query param (window.location.href workaround).
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..models import get_db, get_session_id, UploadJob, MasterData
from ..services.excel_service import ingest_excel, ingest_kbins, KBINS_TIPE_DATA

router = APIRouter(prefix="/api/master", tags=["master"])
logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ─────────────────────────────────────────────
# POST /api/master/upload
# ─────────────────────────────────────────────
@router.post("/upload", summary="Unggah satu file Excel dan append ke Master")
async def upload_to_master(
    bulan:           str           = Form(...),
    tahun:           str           = Form(...),
    tipe_data:       str           = Form(...),
    primary_key_col: Optional[str] = Form(None),
    cedant:          Optional[str] = Form(None),
    sheet_name:      Optional[str] = Form(None),
    file:            UploadFile    = File(...),
    db:              Session       = Depends(get_db),
    session_id:      str           = Depends(get_session_id),
):
    if not file.filename.lower().endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        raise HTTPException(status_code=400, detail="File harus berformat .xlsx, .xls, .xlsm, atau .xlsb")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File melebihi batas 50 MB")

    # Normalisasi primary_key_col — None / kosong berarti auto-detect
    pk_col = (primary_key_col or "").strip() or None

    # ── Buat upload job ──
    job = UploadJob(
        session_id=session_id,
        bulan=bulan,
        tahun=tahun,
        tipe_data=tipe_data,
        primary_key_col=pk_col or "",
        file_name=file.filename,
        sheet_name=sheet_name or None,
        cedant=cedant or None,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # ── Ingest file ──
    is_kbins = (cedant or "").strip().upper().startswith("KB INS")
    try:
        if is_kbins:
            from msoffcrypto.exceptions import InvalidKeyError
            try:
                result = ingest_kbins(file_bytes, cedant or "")
            except InvalidKeyError:
                job.status = "error"
                job.error_message = "Password Excel salah. Pastikan EXCEL_PASSWORD di .env sudah benar."
                db.commit()
                raise HTTPException(
                    status_code=400,
                    detail="Password Excel salah. Pastikan EXCEL_PASSWORD di .env sudah benar.",
                )
        else:
            result = ingest_excel(file_bytes, pk_col or "", sheet_name or None)
    except HTTPException:
        raise
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

    # ── Update sheet_name di job sesuai sheet yang benar-benar dibaca ──
    job.sheet_name = result.get("sheet") or job.sheet_name
    db.commit()

    # ── Append ke master_data — dedup hanya dalam session yang sama ──
    appended = 0
    skipped  = 0

    # Ambil semua PK yang sudah ada dalam satu query
    existing_pks = set(
        row[0] for row in
        db.query(MasterData.primary_key_value)
          .filter(MasterData.tipe_data == tipe_data,
                  MasterData.session_id == session_id)
          .all()
    )

    sheet_val = result.get("sheet", "")
    mappings  = []

    for r in result["rows"]:
        if r["pk"] in existing_pks:
            skipped += 1
            continue
        existing_pks.add(r["pk"])
        appended += 1

        r["data"].setdefault("sheet", sheet_val)
        if cedant:
            r["data"].setdefault("_cedant", cedant)

        mappings.append({
            "session_id":         session_id,
            "tipe_data":          tipe_data,
            "bulan":              bulan,
            "tahun":              tahun,
            "cedant":             cedant or None,
            "primary_key_value":  r["pk"],
            "source_job_id":      job.id,
            "row_data":           json.dumps(r["data"], ensure_ascii=False),
        })

    # Satu kali bulk insert — jauh lebih cepat dari loop per-baris
    BATCH = 2000
    for i in range(0, len(mappings), BATCH):
        db.bulk_insert_mappings(MasterData, mappings[i : i + BATCH])
        db.commit()

    job.status        = "done"
    job.total_rows    = result["total_rows"]
    job.rows_appended = appended
    job.rows_skipped  = skipped
    db.commit()

    return {
        "job_id":        job.id,
        "sheet":         result["sheet"],
        "total_rows":    result["total_rows"],
        "rows_appended": appended,
        "rows_skipped":  skipped,
        "message":       f"Upload berhasil. {appended} baris ditambahkan, {skipped} baris dilewati (duplikat).",
    }


# ─────────────────────────────────────────────
# GET /api/master/data
# ─────────────────────────────────────────────
@router.get("/data", summary="Ambil data Master (paginated)")
def get_master_data(
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
    skip:       int           = Query(0,   ge=0),
    limit:      int           = Query(50,  ge=1, le=500),
    db:         Session       = Depends(get_db),
    session_id: str           = Depends(get_session_id),
):
    q = db.query(MasterData).filter(MasterData.session_id == session_id)
    if tipe_data:
        q = q.filter(MasterData.tipe_data == tipe_data)
    if cedant:
        q = q.filter(MasterData.cedant == cedant)

    total = q.count()
    rows  = q.order_by(MasterData.id.desc()).offset(skip).limit(limit).all()

    job_ids = list({r.source_job_id for r in rows if r.source_job_id})
    job_sheet_map: dict = {}
    if job_ids:
        jobs = (
            db.query(UploadJob.id, UploadJob.sheet_name)
              .filter(UploadJob.id.in_(job_ids))
              .all()
        )
        job_sheet_map = {j.id: j.sheet_name for j in jobs}

    return {
        "total": total,
        "rows":  [_master_row_to_dict(r, job_sheet_map.get(r.source_job_id)) for r in rows],
    }


# ─────────────────────────────────────────────
# GET /api/master/jobs
# ─────────────────────────────────────────────
@router.get("/jobs", summary="Riwayat upload jobs")
def list_upload_jobs(
    skip:       int     = Query(0,  ge=0),
    limit:      int     = Query(20, ge=1, le=100),
    db:         Session = Depends(get_db),
    session_id: str     = Depends(get_session_id),
):
    q     = db.query(UploadJob).filter(UploadJob.session_id == session_id)
    total = q.count()
    jobs  = q.order_by(UploadJob.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "jobs": [_upload_job_to_dict(j) for j in jobs]}


# ─────────────────────────────────────────────
# GET /api/master/export  (session_id via query param — browser nav)
# ─────────────────────────────────────────────
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
    from io import BytesIO

    q = db.query(MasterData).filter(MasterData.session_id == session_id)
    if tipe_data:
        q = q.filter(MasterData.tipe_data == tipe_data)
    if cedant:
        q = q.filter(MasterData.cedant == cedant)

    rows = q.order_by(MasterData.id.asc()).all()

    # ── Kolom tetap (meta) yang selalu muncul di depan ──────────────────
    META_COLS = ["No", "Cedant", "Sheet", "Loss Ref", "Outstanding",
                 "Date of Loss", "Tipe Data", "Bulan", "Tahun", "Upload ID"]

    # ── Regex helper untuk cari nilai dari row_data ──────────────────────
    import re

    def _find(data: dict, *patterns):
        for pat in patterns:
            for k, v in data.items():
                if re.search(pat, k, re.IGNORECASE):
                    val = str(v).strip() if v is not None else ""
                    if val and val.lower() not in ("", "nan", "none"):
                        return val
        return ""

    # ── Build rows ───────────────────────────────────────────────────────
    excel_rows = []
    for i, r in enumerate(rows, start=1):
        try:
            data = json.loads(r.row_data) if r.row_data else {}
        except Exception:
            data = {}

        sheet = data.get("sheet") or data.get("Sheet") or ""

        outstanding = _find(
            data,
            r"^Orig Currency Amt$",
            r"^Amount_Net_OS$",
            r"^outstanding$",
            r"^net_outstanding$",
            r"^OS$",
            r"^net_os$",
            r"^R/I Share Amount$",
            r"^Remain OS",
            r"^Outstanding Claim$",
            r"^Sum of Outstanding$",
            r"^RENDO SHARE$",
            r"^NET BALANCE$",
            r"^NET_AMT$",
            r"^Saldo Akhir Tagih$",
            r"^AMOUNT$",
            r"outstanding|balance",
        )

        dol = _find(
            data,
            r"^Trans Desc/DOL$",
            r"^DOL$",
            r"^DOL \(Date of Loss\)$",
            r"^DATE OF LOSS$",
            r"^Date of Loss$",
            r"^date_of_loss$",
            r"^loss_date$",
            r"^Tgl\. DOL$",
            r"^DOCL$",
            r"^Loss Date$",
            r"^D\.O\.L$",
            r"^LossClaim$",
            r"^tg_kejadian$",
            r"date.*loss|loss.*date|\bdol\b",
        )

        excel_rows.append({
            "No":          i,
            "Cedant":      r.cedant or data.get("_cedant") or "",
            "Sheet":       sheet,
            "Loss Ref":    r.primary_key_value or "",
            "Outstanding": outstanding,
            "Date of Loss":dol,
            "Tipe Data":   r.tipe_data or "",
            "Bulan":       r.bulan or "",
            "Tahun":       r.tahun or "",
            "Upload ID":   r.source_job_id or "",
        })

    # ── Build workbook ───────────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Master Data"

    # Style constants
    TEAL        = "1E6E6E"
    TEAL_LIGHT  = "E6F4F4"
    GRAY_BORDER = Side(style="thin", color="D1D5DB")
    THIN_BORDER = Border(left=GRAY_BORDER, right=GRAY_BORDER,
                         top=GRAY_BORDER,  bottom=GRAY_BORDER)

    HEADER_FILL = PatternFill("solid", fgColor=TEAL)
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=10)
    HEADER_ALIGN= Alignment(horizontal="center", vertical="center", wrap_text=True)

    ALT_FILL    = PatternFill("solid", fgColor=TEAL_LIGHT)
    NORMAL_FILL = PatternFill("solid", fgColor="FFFFFF")
    DATA_ALIGN  = Alignment(vertical="center")
    NUM_ALIGN   = Alignment(horizontal="right", vertical="center")

    # ── Title row ────────────────────────────────────────────────────────
    ws.merge_cells(f"A1:{get_column_letter(len(META_COLS))}1")
    title_cell = ws["A1"]
    label = f"Master {tipe_data or 'Data'}" + (f" — {cedant}" if cedant else "")
    title_cell.value = label
    title_cell.font  = Font(bold=True, size=13, color=TEAL)
    title_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 28

    # ── Header row ───────────────────────────────────────────────────────
    for ci, col in enumerate(META_COLS, start=1):
        cell = ws.cell(row=2, column=ci, value=col)
        cell.fill      = HEADER_FILL
        cell.font      = HEADER_FONT
        cell.alignment = HEADER_ALIGN
        cell.border    = THIN_BORDER
    ws.row_dimensions[2].height = 22

    # ── Data rows ────────────────────────────────────────────────────────
    for ri, row_dict in enumerate(excel_rows, start=3):
        fill = ALT_FILL if ri % 2 == 0 else NORMAL_FILL
        for ci, col in enumerate(META_COLS, start=1):
            val  = row_dict.get(col, "")
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.fill   = fill
            cell.border = THIN_BORDER

            # Number alignment for numeric columns
            if col in ("No", "Upload ID"):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col == "Outstanding":
                # Try to store as number for Excel formatting
                try:
                    num = float(str(val).replace(",", "").replace(" ", ""))
                    cell.value     = num
                    cell.number_format = '#,##0.00'
                    cell.alignment = NUM_ALIGN
                except (ValueError, TypeError):
                    cell.alignment = DATA_ALIGN
            else:
                cell.alignment = DATA_ALIGN

    # ── Column widths ─────────────────────────────────────────────────────
    COL_WIDTHS = {
        "No":          6,
        "Cedant":      28,
        "Sheet":       22,
        "Loss Ref":    30,
        "Outstanding": 18,
        "Date of Loss":16,
        "Tipe Data":   16,
        "Bulan":        8,
        "Tahun":        8,
        "Upload ID":    10,
    }
    for ci, col in enumerate(META_COLS, start=1):
        ws.column_dimensions[get_column_letter(ci)].width = COL_WIDTHS.get(col, 15)

    # ── Freeze panes at header ────────────────────────────────────────────
    ws.freeze_panes = "A3"

    # ── Auto-filter ───────────────────────────────────────────────────────
    ws.auto_filter.ref = f"A2:{get_column_letter(len(META_COLS))}2"

    # ── Sheet info ────────────────────────────────────────────────────────
    ws_info = wb.create_sheet("Info")
    ws_info["A1"] = "Export Info"
    ws_info["A1"].font = Font(bold=True, size=12)
    info_data = [
        ("Tipe Data",   tipe_data or "Semua"),
        ("Cedant",      cedant    or "Semua"),
        ("Total Baris", len(excel_rows)),
        ("Diekspor",    __import__("datetime").datetime.now().strftime("%d/%m/%Y %H:%M:%S")),
    ]
    for i, (k, v) in enumerate(info_data, start=2):
        ws_info.cell(row=i, column=1, value=k).font = Font(bold=True)
        ws_info.cell(row=i, column=2, value=v)
    ws_info.column_dimensions["A"].width = 18
    ws_info.column_dimensions["B"].width = 30

    # ── Serialize ─────────────────────────────────────────────────────────
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_tipe   = (tipe_data or "all").replace(" ", "_")
    safe_cedant = f"_{cedant.replace(' ', '_')}" if cedant else ""
    filename    = f"master_{safe_tipe}{safe_cedant}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ─────────────────────────────────────────────
# GET /api/master/library
# ─────────────────────────────────────────────
@router.get("/library", summary="Library file per tipe data")
def get_library(
    tipe_data:  Optional[str] = Query(None),
    skip:       int           = Query(0,  ge=0),
    limit:      int           = Query(50, ge=1, le=200),
    db:         Session       = Depends(get_db),
    session_id: str           = Depends(get_session_id),
):
    q = db.query(UploadJob).filter(UploadJob.session_id == session_id)
    if tipe_data:
        q = q.filter(UploadJob.tipe_data == tipe_data)

    total = q.count()
    jobs  = q.order_by(UploadJob.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "files": [_library_entry(j) for j in jobs]}


# ─────────────────────────────────────────────
# DELETE /api/master/library/{job_id}
# ─────────────────────────────────────────────
@router.delete("/library/{job_id}", summary="Hapus file dari Library")
def delete_library_entry(
    job_id:     int,
    db:         Session = Depends(get_db),
    session_id: str     = Depends(get_session_id),
):
    # Ownership check — only the session that uploaded may delete
    job = (
        db.query(UploadJob)
          .filter(UploadJob.id == job_id, UploadJob.session_id == session_id)
          .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")

    deleted = (
        db.query(MasterData)
          .filter(MasterData.source_job_id == job_id)
          .delete(synchronize_session=False)
    )
    db.delete(job)
    db.commit()

    return {
        "message":      f"File '{job.file_name}' dihapus dari Library.",
        "rows_deleted": deleted,
    }


# ─────────────────────────────────────────────
# Helpers
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


def _library_entry(j: UploadJob) -> dict:
    return {
        "id":              j.id,
        "file_name":       j.file_name,
        "tipe_data":       j.tipe_data,
        "cedant":          j.cedant,
        "bulan":           j.bulan,
        "tahun":           j.tahun,
        "sheet_name":      j.sheet_name,
        "primary_key_col": j.primary_key_col,
        "status":          j.status,
        "total_rows":      j.total_rows    or 0,
        "rows_appended":   j.rows_appended or 0,
        "rows_skipped":    j.rows_skipped  or 0,
        "error_message":   j.error_message,
        "created_at":      j.created_at.isoformat() if j.created_at else None,
    }
