"""
Excel comparison service.
Reads two Excel files, performs an outer-join diff based on a Primary Key column,
and returns structured results ready for storage and download.
"""
import json
import math
import os
import re
import pandas as pd
import numpy as np
from io import BytesIO
from itertools import chain, islice
from typing import Optional, Tuple
from zipfile import BadZipFile, ZipFile
import msoffcrypto
from msoffcrypto.exceptions import InvalidKeyError
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils.cell import column_index_from_string, get_column_letter
from openpyxl.utils.dataframe import dataframe_to_rows


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

_WORKSHEET_XML_RE = re.compile(r"xl/worksheets/sheet\d+\.xml")
_EMPTY_CELL_XML_RE = re.compile(
    rb'<c\b[^>]*?(?:/>|>\s*(?:<v>\s*</v>\s*)?</c>)',
    re.DOTALL,
)
_CELL_REF_XML_RE = re.compile(rb'<c\b[^>]*?\br="([A-Z]+)(\d+)"')
_WORKSHEET_DIMENSION_XML_RE = re.compile(
    rb'<dimension\b[^>]*?\bref="([^"]*)"[^>]*/?>'
)


def _sanitize(val):
    """Convert NaN / inf to None so JSON serialization never fails."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def _row_to_dict(series: pd.Series) -> dict:
    return {k: _sanitize(v) for k, v in series.items()}


def _trim_empty_excel_cells(file_bytes: bytes) -> bytes:
    """Remove style-only cells that inflate XLSX worksheet dimensions."""
    with ZipFile(BytesIO(file_bytes)) as source:
        worksheet_infos = [
            info
            for info in source.infolist()
            if _WORKSHEET_XML_RE.fullmatch(info.filename)
        ]
        inflated_sheets = []
        for info in worksheet_infos:
            with source.open(info) as sheet_xml:
                prefix = sheet_xml.read(8192)
            dimension = _WORKSHEET_DIMENSION_XML_RE.search(prefix)
            if not dimension:
                continue
            end_cell = dimension.group(1).split(b":")[-1]
            match = re.fullmatch(rb"([A-Z]+)(\d+)", end_cell)
            if not match:
                continue
            max_column = column_index_from_string(match.group(1).decode("ascii"))
            max_row = int(match.group(2))
            if max_column > 256 or max_row > 10000:
                inflated_sheets.append(info.filename)

        if not inflated_sheets:
            return file_bytes

        inflated_sheets = set(inflated_sheets)
        output = BytesIO()
        with ZipFile(output, "w") as target:
            for info in source.infolist():
                content = source.read(info.filename)
                if info.filename in inflated_sheets:
                    content, removed = _EMPTY_CELL_XML_RE.subn(b"", content)
                    if removed:
                        cell_refs = _CELL_REF_XML_RE.findall(content)
                        max_column = max(
                            (
                                column_index_from_string(column.decode("ascii"))
                                for column, _ in cell_refs
                            ),
                            default=0,
                        )
                        max_row = max(
                            (int(row) for _, row in cell_refs),
                            default=0,
                        )
                        dimension = (
                            f"A1:{get_column_letter(max_column)}{max_row}"
                            if max_column and max_row
                            else "A1"
                        ).encode("ascii")
                        content = _WORKSHEET_DIMENSION_XML_RE.sub(
                            lambda match: re.sub(
                                rb'(\bref=")[^"]*(")',
                                lambda ref: ref.group(1) + dimension + ref.group(2),
                                match.group(0),
                                count=1,
                            ),
                            content,
                            count=1,
                        )
                target.writestr(info, content)
        return output.getvalue()


# ─────────────────────────────────────────────
# KB INS: password-protected XLS reader
# ─────────────────────────────────────────────

# Nama tipe_data yang memicu pembacaan khusus KB INS
KBINS_TIPE_DATA = "KB INS"
# Nama sheet yang wajib dibaca dari workbook KB INS
KBINS_SHEET_NAME = "2.11"


def read_excel_with_password(file_bytes: bytes, password: str | None = None) -> BytesIO:
    """
    Membuka file Excel yang dienkripsi dengan password (format OLE2 / XLS).
    Password diambil dari env var EXCEL_PASSWORD jika tidak diberikan secara eksplisit.
    Mengembalikan BytesIO berisi bytes workbook yang sudah didekripsi.
    Jika file tidak terenkripsi, langsung kembalikan BytesIO dari file_bytes asli.

    Raises:
        ValueError       – jika password belum dikonfigurasi
        InvalidKeyError  – jika password salah
    """
    password = password or os.getenv("EXCEL_PASSWORD")
    if not password:
        raise ValueError(
            "Password Excel belum dikonfigurasi. "
            "Tambahkan EXCEL_PASSWORD ke file .env."
        )

    source = BytesIO(file_bytes)
    office_file = msoffcrypto.OfficeFile(source)

    if office_file.is_encrypted():
        office_file.load_key(password=password)
        decrypted = BytesIO()
        office_file.decrypt(decrypted)
        decrypted.seek(0)
        return decrypted

    # File tidak terenkripsi — kembalikan bytes asli
    return BytesIO(file_bytes)


def read_kbins_sheet(file_bytes: bytes) -> pd.DataFrame:
    """
    Baca sheet '2.11' dari file KB INS (XLS terenkripsi password).
    Password diambil otomatis dari env var EXCEL_PASSWORD.
    Mengembalikan DataFrame dengan kolom asli dari sheet tersebut.

    Raises:
        ValueError       – password belum dikonfigurasi
        InvalidKeyError  – password salah
        ValueError       – sheet '2.11' tidak ditemukan di workbook
    """
    excel_file = read_excel_with_password(file_bytes)

    # Cek ketersediaan sheet sebelum baca
    xls = pd.ExcelFile(excel_file, engine="xlrd")
    if KBINS_SHEET_NAME not in xls.sheet_names:
        raise ValueError(
            f"Sheet '{KBINS_SHEET_NAME}' tidak ditemukan di workbook KB INS. "
            f"Sheet tersedia: {xls.sheet_names}"
        )

    # Deteksi baris header secara otomatis
    excel_file.seek(0)
    header_row = _find_header_row(excel_file.read(), KBINS_SHEET_NAME)

    excel_file.seek(0)
    df = pd.read_excel(
        excel_file,
        sheet_name=KBINS_SHEET_NAME,
        engine="xlrd",
        header=header_row,
        dtype=str,
    )
    df.columns = [" ".join(str(c).split()) for c in df.columns]
    df.dropna(how="all", inplace=True)
    df.fillna("", inplace=True)
    return df


def _get_engine(file_bytes: bytes) -> Optional[str]:
    """
    Detect the correct pandas engine by inspecting magic bytes, then trying
    each engine in order. Returns the first engine that opens the file
    successfully, or raises ValueError if none work.

    Priority:
      1. pyxlsb  — .xlsb Binary Workbook  (magic: D0 CF … or special XLSB)
      2. xlrd    — legacy .xls (OLE2, magic: D0 CF 11 E0 A1 B1 1A E1)
      3. openpyxl — .xlsx / .xlsm (ZIP magic: PK)
      4. None    — let pandas auto-detect as last resort (should rarely reach here)
    """
    # Magic-byte based fast path
    header = file_bytes[:8]

    OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    ZIP_MAGIC  = b"PK"

    if header[:8] == OLE2_MAGIC:
        # OLE2 container — could be .xls or encrypted .xlsb/.xlsx
        # Try xlrd first (handles plain .xls), then pyxlsb
        for engine in ("xlrd", "pyxlsb"):
            try:
                pd.ExcelFile(BytesIO(file_bytes), engine=engine)
                return engine
            except Exception:
                pass
        # Give up — caller will handle the error
        return None

    if header[:2] == ZIP_MAGIC:
        # ZIP-based (.xlsx / .xlsm / .xlsb)
        try:
            with ZipFile(BytesIO(file_bytes)) as workbook:
                names = set(workbook.namelist())
            if "xl/workbook.bin" in names:
                return "pyxlsb"
            if "xl/workbook.xml" in names:
                return "openpyxl"
        except BadZipFile:
            pass
        for engine in ("pyxlsb", "openpyxl"):
            try:
                workbook = pd.ExcelFile(BytesIO(file_bytes), engine=engine)
                workbook.close()
                return engine
            except Exception:
                pass
        return None

    # Unknown magic — try all engines in order
    for engine in ("openpyxl", "xlrd", "pyxlsb"):
        try:
            pd.ExcelFile(BytesIO(file_bytes), engine=engine)
            return engine
        except Exception:
            pass

    return None


def _open_excel_file(file_bytes: bytes) -> Tuple[pd.ExcelFile, Optional[str]]:
    """
    Open an Excel file with the correct engine, returning (ExcelFile, engine).
    Raises ValueError with a clear message if no engine can read the file.
    """
    engine = _get_engine(file_bytes)

    if engine:
        if engine == "openpyxl":
            file_bytes = _trim_empty_excel_cells(file_bytes)
        return pd.ExcelFile(BytesIO(file_bytes), engine=engine), engine

    # Last resort: let pandas auto-detect (very old or unusual format)
    try:
        xls = pd.ExcelFile(BytesIO(file_bytes))
        return xls, None
    except Exception as exc:
        raise ValueError(
            "Format file Excel tidak dapat dideteksi secara otomatis. "
            "Pastikan file adalah .xlsx, .xls, atau .xlsb yang valid dan tidak corrupt. "
            f"Detail teknis: {exc}"
        ) from exc


def _excel_header_names(values) -> list[str]:
    raw_names = [
        f"Unnamed: {index}" if pd.isna(value) or str(value).strip() == "" else str(value)
        for index, value in enumerate(values)
    ]
    original_names = set(raw_names)
    used_names = set()
    next_suffix: dict[str, int] = {}
    headers = []
    for raw_name in raw_names:
        name = raw_name
        if name in used_names:
            suffix = next_suffix.get(raw_name, 1)
            name = f"{raw_name}.{suffix}"
            while name in used_names or name in original_names:
                suffix += 1
                name = f"{raw_name}.{suffix}"
            next_suffix[raw_name] = suffix + 1
        else:
            next_suffix.setdefault(raw_name, 1)
        used_names.add(name)
        headers.append(" ".join(name.split()))
    return headers


def _extract_sheet_metadata(rows, header_row: int) -> dict[str, str]:
    metadata = {}
    for row in rows[:header_row]:
        for index, value in enumerate(row):
            if value is None:
                continue
            text_value = str(value).strip()
            label = re.sub(r"[^a-z]", "", text_value.casefold())
            if label not in {"classofbusiness", "classofbusniess"}:
                continue

            inline_value = text_value.partition(":")[2].strip()
            if inline_value:
                metadata["cob"] = inline_value
                break
            for candidate in row[index + 1 :]:
                if candidate is None:
                    continue
                candidate_value = str(candidate).strip().strip(":").strip()
                if candidate_value:
                    metadata["cob"] = candidate_value
                    break
            if metadata.get("cob"):
                break
        if metadata.get("cob"):
            break
    return metadata


def _select_header_row(raw: pd.DataFrame, max_scan: int = 40) -> int:
    raw = raw.head(max_scan).fillna("")
    best_row = 0
    best_score = -1
    num_pattern = re.compile(r"^\s*-?\d[\d,.\s]*$")
    date_pattern = re.compile(r"\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}")
    scores: dict[int, float] = {}

    for index, row in enumerate(raw.itertuples(index=False, name=None)):
        values = [
            str(value).strip()
            for value in row
            if str(value).strip() not in ("", "nan", "None")
        ]
        if not values:
            continue
        distinct = len(set(values))
        if (distinct <= 1 and len(values) >= 3) or (
            len(values) == 1 and len(values[0]) > 40
        ):
            continue

        score = len(values) + distinct
        score += sum(1 for value in values if len(value) <= 40)
        if (
            all(
                not num_pattern.match(value) and not date_pattern.search(value)
                for value in values
            )
            and len(values) >= 3
        ):
            score += len(values) * 2
        if len(row) > 0 and len(values) / len(row) < 0.2:
            score = max(0, score - 5)

        scores[index] = score
        if score > best_score:
            best_score = score
            best_row = index
            if score >= len(values) * 3 and distinct >= 4:
                break

    def unnamed_ratio(header_row: int) -> float:
        if header_row >= len(raw):
            return 1.0
        names = _excel_header_names(raw.iloc[header_row].tolist())
        unnamed = sum(name.startswith("Unnamed:") for name in names)
        return unnamed / len(names) if names else 1.0

    if unnamed_ratio(best_row) > 0.5:
        ranked_rows = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        for row_index, _ in ranked_rows[1:4]:
            if unnamed_ratio(row_index) <= 0.5:
                best_row = row_index
                break
    return int(best_row)


def _find_header_row(file_bytes: bytes, sheet_name: str, max_scan: int = 40) -> int:
    """
    Scan the first `max_scan` rows to find the best header row.
    Works for .xlsx, .xls, and .xlsb files.

    Strategy:
    1. Score each row based on how much it looks like a header (text labels, distinct values).
    2. After picking the best candidate, verify it doesn't produce mostly Unnamed columns.
       If it does, keep scanning for a better row up to max_scan.
    """
    import re as _re
    engine = _get_engine(file_bytes)
    kwargs = {"engine": engine} if engine else {}

    try:
        raw = pd.read_excel(BytesIO(file_bytes), sheet_name=sheet_name,
                            header=None, dtype=str, nrows=max_scan, **kwargs)
    except Exception:
        # If auto-detect failed, try each engine explicitly
        raw = None
        for eng in ("openpyxl", "xlrd", "pyxlsb"):
            if eng == engine:
                continue
            try:
                raw = pd.read_excel(BytesIO(file_bytes), sheet_name=sheet_name,
                                    header=None, dtype=str, nrows=max_scan, engine=eng)
                kwargs = {"engine": eng}
                break
            except Exception:
                pass
        if raw is None:
            return 0  # fallback: assume header is on row 0
    raw = raw.fillna("")

    best_row   = 0
    best_score = -1

    # Patterns that indicate a value is data (not a column label)
    _num_pat  = _re.compile(r"^\s*-?\d[\d,.\s]*$")           # pure number
    _date_pat = _re.compile(r"\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}")  # date

    scores: dict[int, float] = {}

    for i, row in raw.iterrows():
        values = [str(v).strip() for v in row if str(v).strip() not in ("", "nan", "None")]
        if not values:
            continue

        distinct = len(set(values))

        # Hard skip: single merged-cell title spanning most of the row
        if distinct <= 1 and len(values) >= 3:
            continue

        # Hard skip: row looks like a single long sentence / title
        if len(values) == 1 and len(values[0]) > 40:
            continue

        # Score = number of non-empty distinct-ish cells
        score = len(values)

        # Boost: row has many distinct values (good column header signal)
        score += distinct

        # Boost: most values are short (≤ 40 chars) — typical for headers
        short = sum(1 for v in values if len(v) <= 40)
        score += short

        # Strong boost: all values look like plain text labels (no numbers/dates)
        # This strongly distinguishes header rows from data rows
        all_text = all(
            not _num_pat.match(v) and not _date_pat.search(v)
            for v in values
        )
        if all_text and len(values) >= 3:
            score += len(values) * 2  # heavy boost — very likely a header row

        # Penalise: row has very few non-empty cells relative to total columns
        total_cols = len(row)
        if total_cols > 0 and len(values) / total_cols < 0.2:
            score = max(0, score - 5)

        scores[int(i)] = score
        if score > best_score:
            best_score = score
            best_row   = i
            # Early-exit: baris dengan banyak kolom text label yang distinct
            # hampir pasti header — tidak perlu scan lebih jauh
            if score >= len(values) * 3 and distinct >= 4:
                break

    # ── Post-validation: verify chosen row doesn't produce mostly Unnamed columns ──
    # If > 50% of columns are Unnamed after using best_row as header, try next best.
    def _unnamed_ratio(header_row: int) -> float:
        try:
            df_check = pd.read_excel(
                BytesIO(file_bytes), sheet_name=sheet_name,
                header=header_row, dtype=str, nrows=5, **kwargs
            )
            cols = [str(c) for c in df_check.columns]
            unnamed = sum(1 for c in cols if c.startswith("Unnamed:"))
            return unnamed / len(cols) if cols else 1.0
        except Exception:
            return 1.0

    # Allow up to 3 retries with next-best scoring rows
    if _unnamed_ratio(int(best_row)) > 0.5:
        sorted_rows = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        for row_idx, _ in sorted_rows[1:4]:
            if _unnamed_ratio(row_idx) <= 0.5:
                best_row = row_idx
                break

    return int(best_row)


def _read_excel_with_header_row(
    file_bytes: bytes,
    sheet_name: Optional[str] = None,
    excel_file: Optional[pd.ExcelFile] = None,
) -> Tuple[pd.DataFrame, str, int]:
    """
    Read an Excel file into a DataFrame.
    Supports .xlsx, .xls, and .xlsb (via pyxlsb engine).
    If sheet_name is None, the first sheet is used.
    """
    owns_workbook = excel_file is None
    if owns_workbook:
        workbook, _ = _open_excel_file(file_bytes)
    else:
        workbook = excel_file
    target = (
        sheet_name
        if sheet_name and sheet_name in workbook.sheet_names
        else workbook.sheet_names[0]
    )
    try:
        raw = pd.read_excel(workbook, sheet_name=target, header=None, dtype=str)
        if raw.empty:
            return pd.DataFrame(), target, 0
        header_row = _select_header_row(raw)
        df = raw.iloc[header_row + 1 :].copy()
        df.columns = _excel_header_names(raw.iloc[header_row].tolist())
        df.index = df.index - header_row - 1
        df.dropna(how="all", inplace=True)
        df.fillna("", inplace=True)
        return df, target, header_row
    finally:
        if owns_workbook:
            workbook.close()


def _read_excel(file_bytes: bytes, sheet_name: Optional[str] = None) -> Tuple[pd.DataFrame, str]:
    df, target, _ = _read_excel_with_header_row(file_bytes, sheet_name)
    return df, target


def get_sheet_names(file_bytes: bytes) -> list[str]:
    """Return all sheet names of an Excel workbook. Supports .xlsx, .xls, .xlsb."""
    if _get_engine(file_bytes) == "openpyxl":
        workbook = openpyxl.load_workbook(
            BytesIO(file_bytes),
            read_only=True,
            data_only=True,
        )
        try:
            return list(workbook.sheetnames)
        finally:
            workbook.close()

    xls, _ = _open_excel_file(file_bytes)
    try:
        return list(xls.sheet_names)
    finally:
        xls.close()


# ─────────────────────────────────────────────
# Core comparison logic
# ─────────────────────────────────────────────

def compare_excel(
    file_a_bytes: bytes,
    file_b_bytes: bytes,
    primary_key_col: str,
    sheet_a: Optional[str] = None,
    sheet_b: Optional[str] = None,
) -> dict:
    """
    Compare two Excel files row-by-row based on primary_key_col.

    Returns a dict:
    {
        "sheet_a": str,
        "sheet_b": str,
        "total_rows_a": int,
        "total_rows_b": int,
        "summary": { matched, only_in_a, only_in_b, changed },
        "results": [
            {
                "primary_key_value": str,
                "diff_type": "matched" | "only_in_a" | "only_in_b" | "changed",
                "row_data_a": dict | None,
                "row_data_b": dict | None,
                "changed_columns": list[str],
            },
            ...
        ]
    }
    """
    df_a, actual_sheet_a = _read_excel(file_a_bytes, sheet_a)
    df_b, actual_sheet_b = _read_excel(file_b_bytes, sheet_b)

    # Validate primary key exists in both files
    if primary_key_col not in df_a.columns:
        raise ValueError(
            f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di File A. "
            f"Kolom tersedia: {list(df_a.columns)}"
        )
    if primary_key_col not in df_b.columns:
        raise ValueError(
            f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di File B. "
            f"Kolom tersedia: {list(df_b.columns)}"
        )

    # Deduplicate on primary key (keep first occurrence)
    df_a = df_a.drop_duplicates(subset=[primary_key_col], keep="first")
    df_b = df_b.drop_duplicates(subset=[primary_key_col], keep="first")

    # Index by primary key for fast lookup
    df_a_idx = df_a.set_index(primary_key_col)
    df_b_idx = df_b.set_index(primary_key_col)

    keys_a = set(df_a_idx.index)
    keys_b = set(df_b_idx.index)

    all_keys = keys_a | keys_b

    results = []
    summary = {"matched": 0, "only_in_a": 0, "only_in_b": 0, "changed": 0}

    for key in sorted(all_keys, key=str):
        in_a = key in keys_a
        in_b = key in keys_b

        if in_a and not in_b:
            diff_type = "only_in_a"
            summary["only_in_a"] += 1
            results.append({
                "primary_key_value": str(key),
                "diff_type": diff_type,
                "row_data_a": _row_to_dict(df_a_idx.loc[key]),
                "row_data_b": None,
                "changed_columns": [],
            })

        elif in_b and not in_a:
            diff_type = "only_in_b"
            summary["only_in_b"] += 1
            results.append({
                "primary_key_value": str(key),
                "diff_type": diff_type,
                "row_data_a": None,
                "row_data_b": _row_to_dict(df_b_idx.loc[key]),
                "changed_columns": [],
            })

        else:
            row_a = df_a_idx.loc[key]
            row_b = df_b_idx.loc[key]

            # Compare on common columns
            common_cols = [c for c in df_a_idx.columns if c in df_b_idx.columns]
            changed_cols = [
                col for col in common_cols
                if str(row_a.get(col, "")).strip() != str(row_b.get(col, "")).strip()
            ]

            if changed_cols:
                diff_type = "changed"
                summary["changed"] += 1
            else:
                diff_type = "matched"
                summary["matched"] += 1

            results.append({
                "primary_key_value": str(key),
                "diff_type": diff_type,
                "row_data_a": _row_to_dict(row_a),
                "row_data_b": _row_to_dict(row_b),
                "changed_columns": changed_cols,
            })

    return {
        "sheet_a": actual_sheet_a,
        "sheet_b": actual_sheet_b,
        "total_rows_a": len(df_a),
        "total_rows_b": len(df_b),
        "summary": summary,
        "results": results,
    }


# ─────────────────────────────────────────────
# Excel report generation
# ─────────────────────────────────────────────

FILL_GREEN  = PatternFill("solid", fgColor="C6EFCE")   # matched
FILL_YELLOW = PatternFill("solid", fgColor="FFEB9C")   # changed
FILL_RED    = PatternFill("solid", fgColor="FFC7CE")   # only in A (missing in B)
FILL_BLUE   = PatternFill("solid", fgColor="BDD7EE")   # only in B (new)
FILL_HEADER = PatternFill("solid", fgColor="2F5496")

FONT_WHITE  = Font(color="FFFFFF", bold=True)
FONT_BOLD   = Font(bold=True)

THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"),  bottom=Side(style="thin"),
)


def generate_report_excel(comparison_result: dict, job_meta: dict) -> bytes:
    """
    Build a multi-sheet Excel report from comparison results.
    Returns raw bytes of the .xlsx file.
    """
    wb = openpyxl.Workbook()

    # ── Sheet 1: Summary ──────────────────────────────
    ws_sum = wb.active
    ws_sum.title = "Summary"
    _write_summary_sheet(ws_sum, comparison_result, job_meta)

    # ── Sheet 2: All Results ──────────────────────────
    ws_all = wb.create_sheet("Semua Data")
    _write_results_sheet(ws_all, comparison_result["results"], filter_types=None)

    # ── Sheet 3-5: Filtered sheets ────────────────────
    for label, types in [
        ("Berubah",       ["changed"]),
        ("Hanya di File A", ["only_in_a"]),
        ("Hanya di File B", ["only_in_b"]),
    ]:
        ws = wb.create_sheet(label)
        filtered = [r for r in comparison_result["results"] if r["diff_type"] in types]
        _write_results_sheet(ws, filtered, filter_types=types)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _write_summary_sheet(ws, result: dict, job_meta: dict):
    s = result["summary"]

    # Title
    ws.merge_cells("A1:D1")
    c = ws["A1"]
    c.value = "LAPORAN KOMPARASI DATA EXCEL"
    c.font = Font(size=14, bold=True, color="FFFFFF")
    c.fill = FILL_HEADER
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    # Meta info
    meta_rows = [
        ("Bulan / Tahun",   f"{job_meta.get('bulan','')}/{job_meta.get('tahun','')}"),
        ("Tipe Data",       job_meta.get("tipe_data", "")),
        ("Primary Key",     job_meta.get("primary_key_col", "")),
        ("File Utama (A)",  job_meta.get("file_a_name", "")),
        ("File Pembanding (B)", job_meta.get("file_b_name", "")),
        ("Sheet A",         result.get("sheet_a", "")),
        ("Sheet B",         result.get("sheet_b", "")),
    ]
    for i, (k, v) in enumerate(meta_rows, start=2):
        ws.cell(row=i, column=1, value=k).font = FONT_BOLD
        ws.cell(row=i, column=2, value=v)

    # Summary table
    start = 2 + len(meta_rows) + 2
    headers = ["Kategori", "Jumlah Baris", "Keterangan"]
    summary_data = [
        ("Total Baris File A",   result["total_rows_a"],   ""),
        ("Total Baris File B",   result["total_rows_b"],   ""),
        ("Sama / Matched",        s["matched"],            "Data identik di kedua file"),
        ("Berubah / Changed",     s["changed"],            "Data ada di keduanya namun ada perbedaan nilai"),
        ("Hanya di File A",       s["only_in_a"],          "Baris ada di File A, tidak ada di File B"),
        ("Hanya di File B",       s["only_in_b"],          "Baris ada di File B, tidak ada di File A"),
    ]
    fills = [None, None, FILL_GREEN, FILL_YELLOW, FILL_RED, FILL_BLUE]

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=start, column=ci, value=h)
        cell.fill = FILL_HEADER
        cell.font = FONT_WHITE
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center")

    for ri, ((label, count, note), fill) in enumerate(zip(summary_data, fills), start=start + 1):
        row_vals = [label, count, note]
        for ci, val in enumerate(row_vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = THIN_BORDER
            if fill:
                cell.fill = fill

    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 48


def _write_results_sheet(ws, rows: list, filter_types):
    if not rows:
        ws.cell(row=1, column=1, value="Tidak ada data.")
        return

    # Gather all column names from the data
    all_cols: list[str] = []
    for r in rows:
        data = r.get("row_data_a") or r.get("row_data_b") or {}
        for k in data.keys():
            if k not in all_cols:
                all_cols.append(k)

    base_headers = ["Diff Type", "Primary Key Value"]
    # For changed rows we write columns twice (A vs B)
    # For simplicity we write: diff_type | pk | [col_A ... col_Z] | [col_A_B ... col_Z_B] | changed_columns
    headers = base_headers + [f"A: {c}" for c in all_cols] + [f"B: {c}" for c in all_cols] + ["Kolom Berubah"]

    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=ci, value=h)
        cell.fill = FILL_HEADER
        cell.font = FONT_WHITE
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal="center", wrap_text=True)

    ws.row_dimensions[1].height = 32

    DIFF_FILL = {
        "matched":   FILL_GREEN,
        "changed":   FILL_YELLOW,
        "only_in_a": FILL_RED,
        "only_in_b": FILL_BLUE,
    }

    for ri, row in enumerate(rows, start=2):
        diff_type = row["diff_type"]
        row_fill = DIFF_FILL.get(diff_type)

        row_vals = [
            diff_type,
            row["primary_key_value"],
        ]
        data_a = row.get("row_data_a") or {}
        data_b = row.get("row_data_b") or {}

        for c in all_cols:
            row_vals.append(data_a.get(c, ""))
        for c in all_cols:
            row_vals.append(data_b.get(c, ""))
        row_vals.append(", ".join(row.get("changed_columns", [])))

        for ci, val in enumerate(row_vals, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.border = THIN_BORDER
            if row_fill:
                cell.fill = row_fill
            # Highlight changed individual B cells
            if diff_type == "changed" and ci > 2 + len(all_cols):
                col_idx = ci - 2 - len(all_cols) - 1
                if 0 <= col_idx < len(all_cols):
                    col_name = all_cols[col_idx]
                    if col_name in row.get("changed_columns", []):
                        cell.fill = PatternFill("solid", fgColor="FF0000")
                        cell.font = Font(color="FFFFFF", bold=True)

    # Auto-width for first few columns
    for ci in range(1, min(10, len(headers) + 1)):
        ws.column_dimensions[ws.cell(row=1, column=ci).column_letter].width = 22


# ─────────────────────────────────────────────
# Single-file ingestion (append to Master)
# ─────────────────────────────────────────────

_COMPOSITE_SEP = "|"   # separator di primary_key_col spec:  "DOL|COB"
_PK_JOIN       = "__"  # separator di nilai PK yang dihasilkan: "2024-01-01__Fire"
_VIRTUAL_PK    = "__pk__"   # nama kolom virtual yang dibuat di DataFrame


def _is_composite(pk_col: str) -> bool:
    """Return True jika primary_key_col mengandung '|' (format composite)."""
    return _COMPOSITE_SEP in pk_col


def _composite_parts(pk_col: str) -> list[str]:
    """Split 'DOL|COB' → ['DOL', 'COB']."""
    return [c.strip() for c in pk_col.split(_COMPOSITE_SEP) if c.strip()]


def _resolve_col(col_spec: str, df_cols: list[str]) -> str:
    """
    Find the actual column name in df_cols that matches col_spec.
    Tries exact match first, then case-insensitive.
    Raises ValueError with available columns if not found.
    """
    if col_spec in df_cols:
        return col_spec
    lower_map = {c.lower(): c for c in df_cols}
    found = lower_map.get(col_spec.lower())
    if found:
        return found
    raise ValueError(
        f"Kolom '{col_spec}' tidak ditemukan. "
        f"Kolom tersedia: {df_cols}"
    )


def _inject_composite_pk(df: pd.DataFrame, pk_col: str) -> pd.DataFrame:
    """
    Jika pk_col adalah composite (misal 'DOL|COB'), buat kolom virtual
    '__pk__' yang berisi gabungan nilai kedua kolom dipisah '__'.
    Mengembalikan DataFrame dengan kolom '__pk__' tambahan.
    """
    parts  = _composite_parts(pk_col)
    actual = [_resolve_col(p, list(df.columns)) for p in parts]
    df = df.copy()
    df[_VIRTUAL_PK] = df[actual[0]].astype(str).str.strip()
    for col in actual[1:]:
        df[_VIRTUAL_PK] = df[_VIRTUAL_PK] + _PK_JOIN + df[col].astype(str).str.strip()
    return df


def ingest_excel(
    file_bytes: bytes,
    primary_key_col: str,
    sheet_name: Optional[str] = None,
) -> dict:
    """
    Read one Excel file and return its rows ready for Master append.

    primary_key_col supports composite format: "DOL|COB"
    — both column names are looked up (case-insensitive), their values are
      joined with '__' and stored as the primary_key_value.

    Jika primary_key_col kosong (""), kolom pertama dari file dipakai sebagai
    primary key (auto-detect mode).

    Returns:
    {
        "sheet": str,
        "total_rows": int,
        "rows": [{"pk": str, "data": {col: val, ...}}, ...]
    }
    """
    df, actual_sheet = _read_excel(file_bytes, sheet_name)

    # ── Auto-detect: gunakan kolom pertama jika pk kosong ───────────────
    if not primary_key_col or not primary_key_col.strip():
        if df.empty or len(df.columns) == 0:
            raise ValueError("File tidak memiliki kolom — tidak bisa auto-detect primary key.")
        primary_key_col = str(df.columns[0])

    if _is_composite(primary_key_col):
        # ── Composite key (e.g. "DOL|COB") ──────────────────────────────
        try:
            df = _inject_composite_pk(df, primary_key_col)
        except ValueError as e:
            raise ValueError(str(e))
        pk_col_used = _VIRTUAL_PK

    else:
        # ── Single key ───────────────────────────────────────────────────
        if primary_key_col not in df.columns:
            lower_map = {str(c).strip().lower(): c for c in df.columns}
            hint = lower_map.get(primary_key_col.strip().lower())
            if hint:
                primary_key_col = hint
            else:
                raise ValueError(
                    f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di file. "
                    f"Kolom tersedia: {list(df.columns)}"
                )
        pk_col_used = primary_key_col

    # Deduplicate within this file by PK (keep first)
    df = df.drop_duplicates(subset=[pk_col_used], keep="first")

    clean_columns = [
        str(c) for c in df.columns
        if c != _VIRTUAL_PK and not str(c).strip().lower().startswith("unnamed")
    ]

    column_positions = {
        column: index
        for index, column in enumerate(df.columns)
        if column in clean_columns
    }
    pk_position = list(df.columns).index(pk_col_used)
    rows = []
    for row in df.itertuples(index=False, name=None):
        filtered_dict = {
            column: _sanitize(row[position])
            for column, position in column_positions.items()
        }
        rows.append({
            "pk":   str(row[pk_position]),
            "data": filtered_dict,
        })

    return {
        "sheet":      actual_sheet,
        "columns":    clean_columns,
        "total_rows": len(df),
        "rows":       rows,
    }


def _ingest_excel_raw_openpyxl(workbook, sheet_name: Optional[str]) -> dict:
    target = (
        sheet_name
        if sheet_name and sheet_name in workbook.sheetnames
        else workbook.sheetnames[0]
    )
    worksheet = workbook[target]
    row_iterator = worksheet.iter_rows(values_only=True)
    preview_rows = list(islice(row_iterator, 40))
    if not preview_rows:
        return {
            "sheet": target,
            "columns": [],
            "total_rows": 0,
            "rows": [],
            "sheet_metadata": {},
        }
    preview_width = max(
        (
            next(
                (
                    index + 1
                    for index in range(len(row) - 1, -1, -1)
                    if row[index] is not None and str(row[index]).strip()
                ),
                0,
            )
            for row in preview_rows
        ),
        default=0,
    )
    if not preview_width:
        return {
            "sheet": target,
            "columns": [],
            "total_rows": 0,
            "rows": [],
            "sheet_metadata": {},
        }
    preview_rows = [row[:preview_width] for row in preview_rows]
    header_row = _select_header_row(pd.DataFrame(preview_rows))
    sheet_metadata = _extract_sheet_metadata(preview_rows, header_row)
    header_values = list(preview_rows[header_row])
    max_data_width = preview_width
    rows = []

    for source_index, values in enumerate(
        chain(
            preview_rows[header_row + 1 :],
            worksheet.iter_rows(
                min_row=len(preview_rows) + 1,
                values_only=True,
            ),
        )
    ):
        row_width = next(
            (
                index + 1
                for index in range(len(values) - 1, -1, -1)
                if values[index] is not None and str(values[index]).strip()
            ),
            0,
        )
        max_data_width = max(max_data_width, row_width)
        if row_width:
            rows.append(
                (header_row + source_index + 2, values[:max_data_width])
            )

    header_values.extend([None] * (max_data_width - len(header_values)))
    headers = _excel_header_names(header_values)
    parsed_rows = []
    for excel_row, values in rows:
        row_data = {}
        for index, header in enumerate(headers):
            value = _sanitize(values[index] if index < len(values) else None)
            row_data[header] = str(value) if value is not None else ""
        parsed_rows.append({"excel_row": excel_row, "data": row_data})
    return {
        "sheet": target,
        "columns": headers,
        "total_rows": len(parsed_rows),
        "rows": parsed_rows,
        "sheet_metadata": sheet_metadata,
    }


def ingest_excel_raw(
    file_bytes: bytes,
    sheet_name: Optional[str] = None,
    decrypt_password: bool = False,
) -> dict:
    """Read one sheet without deduplicating rows and retain their Excel row numbers."""
    source_bytes = (
        read_excel_with_password(file_bytes).getvalue()
        if decrypt_password
        else file_bytes
    )
    if _get_engine(source_bytes) == "openpyxl":
        source_bytes = _trim_empty_excel_cells(source_bytes)
        workbook = openpyxl.load_workbook(
            BytesIO(source_bytes),
            read_only=True,
            data_only=True,
        )
        try:
            return _ingest_excel_raw_openpyxl(workbook, sheet_name)
        finally:
            workbook.close()
    df, actual_sheet, header_row = _read_excel_with_header_row(source_bytes, sheet_name)
    headers = [str(column) for column in df.columns]
    rows = []
    for source_index, values in zip(
        df.index,
        df.itertuples(index=False, name=None),
    ):
        row_data = {
            header: _sanitize(value)
            for header, value in zip(headers, values)
        }
        rows.append({
            "excel_row": header_row + int(source_index) + 2,
            "data": row_data,
        })
    return {
        "sheet": actual_sheet,
        "columns": headers,
        "total_rows": len(rows),
        "rows": rows,
    }


def iter_ingest_excel_raw_sheets(file_bytes: bytes, sheet_names: list[str]):
    """Read multiple raw sheets while opening an openpyxl workbook only once."""
    if _get_engine(file_bytes) != "openpyxl":
        for sheet_name in sheet_names:
            yield sheet_name, ingest_excel_raw(file_bytes, sheet_name)
        return

    file_bytes = _trim_empty_excel_cells(file_bytes)
    workbook = openpyxl.load_workbook(
        BytesIO(file_bytes),
        read_only=True,
        data_only=True,
    )
    try:
        for sheet_name in sheet_names:
            yield sheet_name, _ingest_excel_raw_openpyxl(workbook, sheet_name)
    finally:
        workbook.close()


# ─────────────────────────────────────────────
# CSV ingestion (for OSCLN snapshots)
# ─────────────────────────────────────────────

def ingest_csv(
    file_bytes: bytes,
    primary_key_col: str,
) -> dict:
    """
    Read one CSV file and return its rows ready for OsclnRow storage.
    Supports composite primary_key_col format: "DOL|COB".

    Accepts comma-separated or semicolon-separated files; auto-detects separator.
    Returns:
    {
        "total_rows": int,
        "rows": [{"pk": str, "data": {col: val, ...}}, ...]
    }
    """
    # Auto-detect separator by sniffing the first 4 KB
    sample = file_bytes[:4096].decode("utf-8", errors="replace")
    sep = ";" if sample.count(";") > sample.count(",") else ","

    df = pd.read_csv(BytesIO(file_bytes), sep=sep, dtype=str, encoding="utf-8-sig")
    df.columns = [str(c).strip() for c in df.columns]
    df.dropna(how="all", inplace=True)
    df.fillna("", inplace=True)

    if _is_composite(primary_key_col):
        try:
            df = _inject_composite_pk(df, primary_key_col)
        except ValueError as e:
            raise ValueError(str(e))
        pk_col_used = _VIRTUAL_PK
    else:
        if primary_key_col not in df.columns:
            raise ValueError(
                f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di file CSV. "
                f"Kolom tersedia: {list(df.columns)}"
            )
        pk_col_used = primary_key_col

    df = df.drop_duplicates(subset=[pk_col_used], keep="first")

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "pk":   str(row[pk_col_used]),
            "data": _row_to_dict(row),
        })

    return {
        "total_rows": len(df),
        "rows":       rows,
    }


# ─────────────────────────────────────────────
# KB INS ingestion (password-protected XLS)
# ─────────────────────────────────────────────

def ingest_kbins(file_bytes: bytes, cedant: str = "") -> dict:
    """
    Baca sheet '2.11' dari file KB INS (XLS terenkripsi password).
    Password diambil otomatis dari env var EXCEL_PASSWORD.

    Mendukung dua varian KB INS berdasarkan nilai `cedant`:
      - "KB INS (Proportional)"     → outstanding kolom "Sum of ANR"
      - "KB INS (Non-Proportional)" → outstanding kolom "Sum of XOL"
      - lainnya / kosong            → default ke Proportional

    Primary key untuk kedua varian = "Claim No" (case-insensitive fallback).

    Returns:
    {
        "sheet":      str,       # selalu "2.11"
        "variant":    str,       # "proportional" atau "non_proportional"
        "total_rows": int,
        "rows":       [{"pk": str, "data": {col: val, ...}}, ...]
    }

    Raises:
        ValueError       – password belum dikonfigurasi atau sheet/kolom tidak ditemukan
        InvalidKeyError  – password salah
    """
    from msoffcrypto.exceptions import InvalidKeyError  # noqa: F401 – re-raised by caller

    df = read_kbins_sheet(file_bytes)

    lower_map = {c.lower(): c for c in df.columns}

    # ── Deteksi varian dari nama cedant ─────────────────────────────────
    is_nonprop = "non-proportional" in cedant.lower() or "nonprop" in cedant.lower()
    variant    = "non_proportional" if is_nonprop else "proportional"

    # Kolom outstanding yang diharapkan per varian (untuk validasi/logging)
    expected_outstanding = "Sum of XOL" if is_nonprop else "Sum of ANR"

    # ── Resolve Primary Key ──────────────────────────────────────────────
    pk_col = "Claim No"
    if pk_col not in df.columns:
        found = lower_map.get(pk_col.lower())
        if found:
            pk_col = found
        else:
            raise ValueError(
                f"Kolom Primary Key '{pk_col}' tidak ditemukan di sheet '{KBINS_SHEET_NAME}'. "
                f"Kolom tersedia: {list(df.columns)}"
            )

    # ── Validasi kolom outstanding tersedia (warning via ValueError jika tidak ada) ──
    outstanding_col = expected_outstanding
    if outstanding_col not in df.columns:
        found_os = lower_map.get(outstanding_col.lower())
        if found_os:
            outstanding_col = found_os
        else:
            # Tidak raise — kolom mungkin bernama berbeda, ingest tetap berjalan
            outstanding_col = None

    df = df.drop_duplicates(subset=[pk_col], keep="first")

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "pk":   str(row[pk_col]),
            "data": _row_to_dict(row),
        })

    return {
        "sheet":      KBINS_SHEET_NAME,
        "variant":    variant,
        "outstanding_col": outstanding_col,   # None jika kolom tidak ditemukan
        "total_rows": len(df),
        "rows":       rows,
    }


# ─────────────────────────────────────────────
# DataFrame-level comparison (reusable core)
# ─────────────────────────────────────────────

def compare_dataframes(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    primary_key_col: str,
    label_a: str = "Master",
    label_b: str = "OSCLN",
) -> dict:
    """
    Compare two DataFrames row-by-row based on primary_key_col.
    Supports composite key format: "DOL|COB".
    Both DataFrames must already have primary_key_col as a regular column (not index).

    For composite keys, each DataFrame must already contain a '__pk__' column
    (injected by ingest_excel / ingest_csv), OR the component columns exist
    so we can inject them here.
    """
    # ── Resolve composite key in both DataFrames ─────────────────────────
    if _is_composite(primary_key_col):
        # df_a (Master rows) — component cols came from ingest_excel via row_data,
        # so __pk__ might already exist; if not, build it.
        if _VIRTUAL_PK not in df_a.columns:
            try:
                df_a = _inject_composite_pk(df_a, primary_key_col)
            except ValueError as e:
                raise ValueError(f"{label_a}: {e}")
        if _VIRTUAL_PK not in df_b.columns:
            try:
                df_b = _inject_composite_pk(df_b, primary_key_col)
            except ValueError as e:
                raise ValueError(f"{label_b}: {e}")
        pk_col_used = _VIRTUAL_PK
    else:
        if primary_key_col not in df_a.columns:
            raise ValueError(
                f"Kolom '{primary_key_col}' tidak ditemukan di {label_a}. "
                f"Kolom tersedia: {list(df_a.columns)}"
            )
        if primary_key_col not in df_b.columns:
            raise ValueError(
                f"Kolom '{primary_key_col}' tidak ditemukan di {label_b}. "
                f"Kolom tersedia: {list(df_b.columns)}"
            )
        pk_col_used = primary_key_col

    df_a = df_a.drop_duplicates(subset=[pk_col_used], keep="first")
    df_b = df_b.drop_duplicates(subset=[pk_col_used], keep="first")

    df_a_idx = df_a.set_index(pk_col_used)
    df_b_idx = df_b.set_index(pk_col_used)

    keys_a = set(df_a_idx.index)
    keys_b = set(df_b_idx.index)
    all_keys = keys_a | keys_b

    results = []
    summary = {"matched": 0, "only_in_a": 0, "only_in_b": 0, "changed": 0}

    for key in sorted(all_keys, key=str):
        in_a = key in keys_a
        in_b = key in keys_b

        if in_a and not in_b:
            summary["only_in_a"] += 1
            results.append({
                "primary_key_value": str(key),
                "diff_type":         "only_in_a",
                "row_data_a":        _row_to_dict(df_a_idx.loc[key]),
                "row_data_b":        None,
                "changed_columns":   [],
            })
        elif in_b and not in_a:
            summary["only_in_b"] += 1
            results.append({
                "primary_key_value": str(key),
                "diff_type":         "only_in_b",
                "row_data_a":        None,
                "row_data_b":        _row_to_dict(df_b_idx.loc[key]),
                "changed_columns":   [],
            })
        else:
            row_a = df_a_idx.loc[key]
            row_b = df_b_idx.loc[key]
            common_cols = [c for c in df_a_idx.columns if c in df_b_idx.columns]
            changed_cols = [
                col for col in common_cols
                if str(row_a.get(col, "")).strip() != str(row_b.get(col, "")).strip()
            ]
            if changed_cols:
                summary["changed"] += 1
                diff_type = "changed"
            else:
                summary["matched"] += 1
                diff_type = "matched"

            results.append({
                "primary_key_value": str(key),
                "diff_type":         diff_type,
                "row_data_a":        _row_to_dict(row_a),
                "row_data_b":        _row_to_dict(row_b),
                "changed_columns":   changed_cols,
            })

    return {
        "sheet_a":      label_a,
        "sheet_b":      label_b,
        "total_rows_a": len(df_a),
        "total_rows_b": len(df_b),
        "summary":      summary,
        "results":      results,
    }


def inspect_excel_workbook(file_bytes: bytes) -> dict:
    """
    Scan seluruh sheet pada file Excel untuk mengekstrak:
    - daftar sheet yang tersedia (`available_sheets`)
    - daftar kolom/header per sheet (`sheet_columns`)
    - contoh nilai per kolom dari baris pertama (`sheet_samples`)
    - jumlah baris per sheet (`sheet_row_counts`)
    - `default_sheet` terbaik yang memiliki kolom bermakna
    """
    workbook, _ = _open_excel_file(file_bytes)
    sheets = list(workbook.sheet_names)
    sheet_columns: dict[str, list[str]] = {}
    sheet_samples: dict[str, dict[str, str]] = {}
    sheet_row_counts: dict[str, int] = {}

    for s in sheets:
        try:
            df, _, _ = _read_excel_with_header_row(file_bytes, s, workbook)
            clean_cols = [
                str(c) for c in df.columns
                if not str(c).strip().lower().startswith("unnamed")
            ]
            sheet_columns[s] = clean_cols
            sheet_row_counts[s] = len(df)

            sample_dict: dict[str, str] = {}
            if len(df) > 0:
                for col in clean_cols:
                    # Cari nilai pertama yang tidak kosong pada 5 baris teratas
                    val_found = ""
                    for idx in range(min(5, len(df))):
                        v = _sanitize(df.iloc[idx][col])
                        if v and v.lower() not in ("nan", "none", "-"):
                            val_found = v
                            break
                    sample_dict[col] = val_found
            sheet_samples[s] = sample_dict
        except Exception:
            sheet_columns[s] = []
            sheet_samples[s] = {}
            sheet_row_counts[s] = 0
    workbook.close()

    nonempty_sheets = [
        s for s in sheets
        if any(not col.lower().startswith("unnamed:") for col in sheet_columns.get(s, []))
    ]
    default_sheet = nonempty_sheets[0] if nonempty_sheets else (sheets[0] if sheets else "")

    return {
        "available_sheets": sheets,
        "default_sheet":    default_sheet,
        "sheet_columns":    sheet_columns,
        "sheet_samples":    sheet_samples,
        "sheet_row_counts": sheet_row_counts,
    }

