from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, JSON
from sqlalchemy.sql import func
from .database import Base


class ComparisonJob(Base):
    """Stores metadata for each comparison job submitted by users."""
    __tablename__ = "comparison_jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(36), nullable=True, index=True, comment="Browser session UUID")
    bulan = Column(String(2), nullable=False, comment="Bulan periode (01-12)")
    tahun = Column(String(4), nullable=False, comment="Tahun periode")
    tipe_data = Column(
        Enum("OS Cedant", "Infopack", name="tipe_data_enum"),
        nullable=False,
        comment="Kategori / tipe data"
    )
    primary_key_col = Column(String(255), nullable=False, comment="Nama kolom primary key")
    file_a_name = Column(String(255), nullable=False, comment="Nama file utama (File A)")
    file_b_name = Column(String(255), nullable=False, comment="Nama file pembanding (File B)")
    sheet_a = Column(String(255), nullable=True, comment="Nama sheet yang dipakai dari File A")
    sheet_b = Column(String(255), nullable=True, comment="Nama sheet yang dipakai dari File B")
    status = Column(
        Enum("pending", "processing", "done", "error", name="job_status_enum"),
        default="pending",
        nullable=False
    )
    total_rows_a = Column(Integer, nullable=True)
    total_rows_b = Column(Integer, nullable=True)
    total_matched = Column(Integer, nullable=True)
    total_only_in_a = Column(Integer, nullable=True)
    total_only_in_b = Column(Integer, nullable=True)
    total_changed = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<ComparisonJob id={self.id} bulan={self.bulan} tahun={self.tahun}>"


class ComparisonResult(Base):
    """Stores per-row diff results for a comparison job."""
    __tablename__ = "comparison_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_id = Column(Integer, nullable=False, index=True, comment="FK ke comparison_jobs.id")
    primary_key_value = Column(String(500), nullable=False, comment="Nilai primary key baris ini")
    diff_type = Column(
        Enum("matched", "only_in_a", "only_in_b", "changed", name="diff_type_enum"),
        nullable=False,
        comment="Tipe perbedaan"
    )
    row_data_a = Column(Text, nullable=True, comment="Data baris dari File A (JSON)")
    row_data_b = Column(Text, nullable=True, comment="Data baris dari File B (JSON)")
    changed_columns = Column(Text, nullable=True, comment="Kolom yang berubah (JSON list)")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ComparisonResult job_id={self.job_id} pk={self.primary_key_value} type={self.diff_type}>"


# ─────────────────────────────────────────────────────────────
# Single-file Master ingestion models
# ─────────────────────────────────────────────────────────────

class UploadJob(Base):
    """Metadata for each single-file upload (append to Master)."""
    __tablename__ = "upload_jobs"

    id              = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id      = Column(String(36), nullable=True, index=True, comment="Browser session UUID")
    bulan           = Column(String(2),   nullable=False)
    tahun           = Column(String(4),   nullable=False)
    tipe_data       = Column(String(50),  nullable=False)
    primary_key_col = Column(String(255), nullable=False)
    file_name       = Column(String(255), nullable=False)
    sheet_name      = Column(String(255), nullable=True)
    cedant          = Column(String(255), nullable=True)
    status          = Column(String(20),  nullable=False, default="pending")
    total_rows      = Column(Integer, nullable=True)
    rows_appended   = Column(Integer, nullable=True)
    rows_skipped    = Column(Integer, nullable=True)
    error_message   = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<UploadJob id={self.id} file={self.file_name} status={self.status}>"


class MasterData(Base):
    """Accumulated rows from all single-file uploads (Master table)."""
    __tablename__ = "master_data"

    id                = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id        = Column(String(36), nullable=True, index=True, comment="Browser session UUID")
    tipe_data         = Column(String(50),   nullable=False, index=True)
    bulan             = Column(String(2),    nullable=False)
    tahun             = Column(String(4),    nullable=False)
    cedant            = Column(String(255),  nullable=True,  index=True)
    primary_key_value = Column(String(500),  nullable=False)
    source_job_id     = Column(Integer,      nullable=False)
    row_data          = Column(Text,         nullable=False, comment="Full row as JSON")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<MasterData id={self.id} pk={self.primary_key_value}>"


# ─────────────────────────────────────────────────────────────
# OSCLN Reconciliation models
# ─────────────────────────────────────────────────────────────

class OsclnSnapshot(Base):
    """
    Metadata for one OSCLN CSV import.
    Each import creates a new snapshot; previous snapshots are kept for history.
    """
    __tablename__ = "oscln_snapshots"

    id              = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id      = Column(String(36), nullable=True, index=True, comment="Browser session UUID")
    bulan           = Column(String(2),   nullable=False)
    tahun           = Column(String(4),   nullable=False)
    file_name       = Column(String(255), nullable=False)
    primary_key_col = Column(String(255), nullable=False)
    total_rows      = Column(Integer,     nullable=True)
    status          = Column(String(20),  nullable=False, default="active")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<OsclnSnapshot id={self.id} file={self.file_name}>"


class OsclnRow(Base):
    """Per-row data belonging to one OsclnSnapshot."""
    __tablename__ = "oscln_rows"

    id                = Column(Integer, primary_key=True, index=True, autoincrement=True)
    snapshot_id       = Column(Integer, nullable=False, index=True)
    primary_key_value = Column(String(500), nullable=False)
    row_data          = Column(Text, nullable=False, comment="Full row as JSON")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<OsclnRow snapshot={self.snapshot_id} pk={self.primary_key_value}>"
