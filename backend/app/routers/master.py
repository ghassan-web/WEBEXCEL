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

from ..models import get_db, get_session_id, UploadJob, MasterOsCedant, MasterOsInfopack
from ..services.excel_service import ingest_excel, ingest_kbins, KBINS_TIPE_DATA

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


def _resolve_cedant_code(db: Session, cedant_name: str) -> Optional[str]:
    if not cedant_name:
        return None
    try:
        row = db.execute(
            text("SELECT cedant_code FROM master_oscedant_code WHERE LOWER(cedant_name) = LOWER(:name) LIMIT 1"),
            {"name": cedant_name.strip()},
        ).first()
        return row[0] if row else None
    except Exception:
        return None


def _extract_cedant_row(r, cedant_code, bulan, tahun, file_name, sheet_name):
    data = r.get("data", {})
    doc_no = r.get("pk") or _find(data, *DOC_NO_PATTERNS) or None
    raw_dol = _find(data, *DOL_PATTERNS)
    dol = _parse_dol(raw_dol) if raw_dol else None
    raw_os = _find(data, *OUTSTANDING_PATTERNS)
    outstanding = _parse_number(raw_os) if raw_os else None
    currency = _find(data, *CURRENCY_PATTERNS) or None
    if currency and len(currency) > 10:
        currency = currency[:10]
    return {
        "cedant_code": (cedant_code or "")[:50] or None,
        "doc_no":      (doc_no or "")[:255] or None,
        "dol":         dol,
        "outstanding": outstanding,
        "currency":    currency,
        "month":       int(bulan) if bulan and str(bulan).isdigit() else None,
        "year":        int(tahun) if tahun and str(tahun).isdigit() else None,
        "file_name":   file_name or None,
        "sheet_name":  sheet_name or None,
    }


def _extract_infopack_row(r, cedant_code, bulan, tahun, file_name, sheet_name, row_index):
    data = r.get("data", {})
    class_code = _find(data, *CLASS_CODE_PATTERNS) or None
    if class_code and len(class_code) > 50:
        class_code = class_code[:50]
    title = _find(data, *INSURED_PATTERNS) or None
    value = _find(data, *VALUE_PATTERNS) or None
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
    doc_nos = [r["doc_no"] for r in rows if r.get("doc_no")]
    existing: set = set()
    if doc_nos:
        for row in db.execute(
            text("SELECT cedant_code, doc_no FROM master_os_cedant_web WHERE doc_no = ANY(:dns)"),
            {"dns": doc_nos},
        ):
            existing.add((row[0] or "", row[1] or ""))
    to_insert, skipped = [], 0
    for r in rows:
        key = (r.get("cedant_code") or "", r.get("doc_no") or "")
        if key in existing:
            skipped += 1
        else:
            existing.add(key)
            to_insert.append(r)
    BATCH = 1000
    for i in range(0, len(to_insert), BATCH):
        db.execute(
            text("INSERT INTO master_os_cedant_web "
                 "(cedant_code, doc_no, dol, outstanding, currency, month, year, file_name, sheet_name) "
                 "VALUES (:cedant_code, :doc_no, :dol, :outstanding, :currency, :month, :year, :file_name, :sheet_name)"),
            to_insert[i:i + BATCH],
        )
        db.commit()
    return {"inserted": len(to_insert), "skipped": skipped, "updated": 0}


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


# ═══════════════════════════════════════════════════════════
# POST /api/master/upload
# ═══════════════════════════════════════════════════════════

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

    pk_col = (primary_key_col or "").strip() or None
    resolved_cedant = _resolve_cedant_code(db, cedant or "") or (cedant or "")
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
    db.commit()

    detected_name = _detect_file_name(file.filename)

    if is_infopack:
        rows_to_write = [
            _extract_infopack_row(r, resolved_cedant, bulan, tahun, detected_name, sheet_val, idx)
            for idx, r in enumerate(result["rows"])
            if r.get("data")
        ]
        rows_to_write = [row for row in rows_to_write
                         if row.get("class_code") or row.get("title") or row.get("value")]
        stats = _write_infopack_rows(db, rows_to_write)
    else:
        rows_to_write = [
            _extract_cedant_row(r, resolved_cedant, bulan, tahun, detected_name, sheet_val)
            for r in result["rows"]
        ]
        rows_to_write = [row for row in rows_to_write if row.get("doc_no")]
        stats = _write_cedant_rows(db, rows_to_write)

    job.status = "done"
    job.total_rows    = result["total_rows"]
    job.rows_appended = stats["inserted"]
    job.rows_skipped  = stats["skipped"]
    db.commit()

    return {
        "job_id": job.id, "sheet": sheet_val, "target_table": target_table,
        "file_name": detected_name, "total_rows": result["total_rows"],
        "rows_appended": stats["inserted"], "rows_skipped": stats["skipped"],
        "message": f"Upload berhasil. {stats['inserted']} baris ditambahkan, {stats['skipped']} dilewati.",
    }


# ═══════════════════════════════════════════════════════════
# GET /api/master/data
# ═══════════════════════════════════════════════════════════

@router.get("/data", summary="Ambil data Master (paginated)")
def get_master_data(
    tipe_data:  Optional[str] = Query(None),
    cedant:     Optional[str] = Query(None),
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
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(text(f"SELECT COUNT(*) FROM {table}{where_sql}"), params).scalar() or 0
    rows  = db.execute(
        text(f"SELECT * FROM {table}{where_sql} ORDER BY id DESC LIMIT :lim OFFSET :off"),
        {**params, "lim": limit, "off": skip},
    ).mappings().all()

    result_rows = []
    for r in rows:
        dol_val = r.get("dol")
        dol_str = dol_val.strftime("%Y-%m-%d") if dol_val else ""
        if is_infopack:
            result_rows.append({
                "id": r.get("id"), "tipe_data": "Infopack",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "primary_key_value": r.get("title") or str(r.get("id")),
                "source_job_id": None, "sheet_name": r.get("sheet_name"),
                "row_data": {
                    "cedant_code": r.get("cedant_code"), "class_code": r.get("class_code"),
                    "title": r.get("title"), "value": r.get("value"),
                    "row_index": r.get("row_index"), "month": r.get("month"), "year": r.get("year"),
                    "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                    "_cedant": r.get("cedant_code"),
                },
                "created_at": None,
            })
        else:
            result_rows.append({
                "id": r.get("id"), "tipe_data": "OS Cedant",
                "bulan": str(r.get("month") or ""), "tahun": str(r.get("year") or ""),
                "cedant": r.get("cedant_code"),
                "primary_key_value": r.get("doc_no") or str(r.get("id")),
                "source_job_id": None, "sheet_name": r.get("sheet_name"),
                "row_data": {
                    "doc_no": r.get("doc_no"), "dol": dol_str,
                    "outstanding": str(r.get("outstanding") or ""), "currency": r.get("currency"),
                    "month": r.get("month"), "year": r.get("year"),
                    "file_name": r.get("file_name"), "sheet": r.get("sheet_name"),
                    "_cedant": r.get("cedant_code"),
                },
                "created_at": None,
            })
    return {"total": total, "rows": result_rows}


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
