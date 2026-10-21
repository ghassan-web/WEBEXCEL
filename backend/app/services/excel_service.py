"""
Excel comparison service.
Reads two Excel files, performs an outer-join diff based on a Primary Key column,
and returns structured results ready for storage and download.
"""
import json
import math
import pandas as pd
import numpy as np
from io import BytesIO
from typing import Optional, Tuple
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils.dataframe import dataframe_to_rows


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _sanitize(val):
    """Convert NaN / inf to None so JSON serialization never fails."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def _row_to_dict(series: pd.Series) -> dict:
    return {k: _sanitize(v) for k, v in series.items()}


def _read_excel(file_bytes: bytes, sheet_name: Optional[str] = None) -> Tuple[pd.DataFrame, str]:
    """
    Read an Excel file into a DataFrame.
    If sheet_name is None, the first sheet is used.
    Returns (df, actual_sheet_name).
    """
    xls = pd.ExcelFile(BytesIO(file_bytes))
    target = sheet_name if sheet_name and sheet_name in xls.sheet_names else xls.sheet_names[0]
    df = pd.read_excel(BytesIO(file_bytes), sheet_name=target, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    # Drop completely empty rows
    df.dropna(how="all", inplace=True)
    df.fillna("", inplace=True)
    return df, target


def get_sheet_names(file_bytes: bytes) -> list[str]:
    """Return all sheet names of an Excel workbook."""
    xls = pd.ExcelFile(BytesIO(file_bytes))
    return xls.sheet_names


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

def ingest_excel(
    file_bytes: bytes,
    primary_key_col: str,
    sheet_name: Optional[str] = None,
) -> dict:
    """
    Read one Excel file and return its rows ready for Master append.

    Returns:
    {
        "sheet": str,
        "total_rows": int,
        "rows": [{"pk": str, "data": {col: val, ...}}, ...]
    }
    """
    df, actual_sheet = _read_excel(file_bytes, sheet_name)

    if primary_key_col not in df.columns:
        raise ValueError(
            f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di file. "
            f"Kolom tersedia: {list(df.columns)}"
        )

    # Deduplicate within this file by PK (keep first)
    df = df.drop_duplicates(subset=[primary_key_col], keep="first")

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "pk":   str(row[primary_key_col]),
            "data": _row_to_dict(row),
        })

    return {
        "sheet":      actual_sheet,
        "total_rows": len(df),
        "rows":       rows,
    }


# ─────────────────────────────────────────────
# CSV ingestion (for OSCLN snapshots)
# ─────────────────────────────────────────────

def ingest_csv(
    file_bytes: bytes,
    primary_key_col: str,
) -> dict:
    """
    Read one CSV file and return its rows ready for OsclnRow storage.

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

    if primary_key_col not in df.columns:
        raise ValueError(
            f"Kolom Primary Key '{primary_key_col}' tidak ditemukan di file CSV. "
            f"Kolom tersedia: {list(df.columns)}"
        )

    df = df.drop_duplicates(subset=[primary_key_col], keep="first")

    rows = []
    for _, row in df.iterrows():
        rows.append({
            "pk":   str(row[primary_key_col]),
            "data": _row_to_dict(row),
        })

    return {
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
    Both DataFrames must already have primary_key_col as a regular column (not index).

    Returns the same structure as compare_excel() so existing storage / report
    code can be reused without modification.
    """
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

    df_a = df_a.drop_duplicates(subset=[primary_key_col], keep="first")
    df_b = df_b.drop_duplicates(subset=[primary_key_col], keep="first")

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
