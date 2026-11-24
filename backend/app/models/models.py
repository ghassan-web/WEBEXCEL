from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, DateTime,
    Text, Enum, Numeric, Date
)
from sqlalchemy.sql import func
from .database import Base


# ─────────────────────────────────────────────────────────────
# Tabel utama OS Cedant — sudah ada di PostgreSQL
# ─────────────────────────────────────────────────────────────

_PK_BIGINT = BigInteger().with_variant(Integer, "sqlite")


class MasterOsCedant(Base):
    """Tabel utama OS Claim Cedant — master_os_cedant_web."""
    __tablename__ = "master_os_cedant_web"
    __table_args__ = {"schema": "rekonsiliasi"}

    id          = Column(_PK_BIGINT, primary_key=True, autoincrement=True)
    cedant_code = Column(String(50),  nullable=True,  index=True)
    doc_no      = Column(String(255), nullable=True,  index=True, comment="Loss Ref / Doc No")
    dol         = Column(Date,        nullable=True,  comment="Date of Loss")
    outstanding = Column(Numeric(30, 2), nullable=True)
    currency    = Column(String(10),  nullable=True)
    month       = Column(Integer,     nullable=True)
    year        = Column(Integer,     nullable=True)
    file_name   = Column(String,      nullable=True)
    sheet_name  = Column(String,      nullable=True)
    upload_batch_id = Column(BigInteger, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<MasterOsCedant id={self.id} cedant={self.cedant_code} doc={self.doc_no}>"


# ─────────────────────────────────────────────────────────────
# Tabel utama Infopack — sudah ada di PostgreSQL
# ─────────────────────────────────────────────────────────────

class MasterOsInfopack(Base):
    """Tabel utama Infopack — master_os_infopack_web."""
    __tablename__ = "master_os_infopack_web"
    __table_args__ = {"schema": "rekonsiliasi"}

    id          = Column(_PK_BIGINT, primary_key=True, autoincrement=True)
    cedant_code = Column(String(50),  nullable=True, index=True)
    class_code  = Column(String(50),  nullable=True)
    title       = Column(String,      nullable=True)
    value       = Column(String,      nullable=True)
    row_index   = Column(Integer,     nullable=True)
    month       = Column(Integer,     nullable=True)
    year        = Column(Integer,     nullable=True)
    file_name   = Column(String,      nullable=True)
    sheet_name  = Column(String,      nullable=True)
    dol         = Column(Date,        nullable=True)
    cob         = Column(String(100),  nullable=True)
    gross       = Column(Numeric(30, 2), nullable=True)
    tsi         = Column(Numeric(30, 2), nullable=True)
    upload_batch_id = Column(BigInteger, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<MasterOsInfopack id={self.id} cedant={self.cedant_code}>"


# ─────────────────────────────────────────────────────────────
# Upload job log — tabel sudah tersedia di database
# ─────────────────────────────────────────────────────────────

class UploadJob(Base):
    """Log setiap file yang diupload ke Master."""
    __tablename__ = "upload_jobs"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    session_id      = Column(String(36),  nullable=True,  index=True)
    bulan           = Column(String(2),   nullable=False)
    tahun           = Column(String(4),   nullable=False)
    tipe_data       = Column(String(50),  nullable=False)
    primary_key_col = Column(String(255), nullable=False)
    file_name       = Column(String(255), nullable=False)
    sheet_name      = Column(String(255), nullable=True)
    cedant          = Column(String(255), nullable=True)
    status          = Column(String(20),  nullable=False, default="pending")
    total_rows      = Column(Integer,     nullable=True)
    rows_appended   = Column(Integer,     nullable=True)
    rows_skipped    = Column(Integer,     nullable=True)
    error_message   = Column(Text,        nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────
# Comparison / Reconciliation jobs
# ─────────────────────────────────────────────────────────────

class ComparisonJob(Base):
    """Metadata untuk setiap job komparasi dua file."""
    __tablename__ = "comparison_jobs"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    session_id      = Column(String(36),  nullable=True, index=True)
    bulan           = Column(String(2),   nullable=False)
    tahun           = Column(String(4),   nullable=False)
    tipe_data       = Column(String(50),  nullable=False)
    primary_key_col = Column(String(255), nullable=False)
    file_a_name     = Column(String(255), nullable=False)
    file_b_name     = Column(String(255), nullable=False)
    sheet_a         = Column(String(255), nullable=True)
    sheet_b         = Column(String(255), nullable=True)
    status          = Column(String(20),  nullable=False, default="pending")
    total_rows_a    = Column(Integer,     nullable=True)
    total_rows_b    = Column(Integer,     nullable=True)
    total_matched   = Column(Integer,     nullable=True)
    total_only_in_a = Column(Integer,     nullable=True)
    total_only_in_b = Column(Integer,     nullable=True)
    total_changed   = Column(Integer,     nullable=True)
    error_message   = Column(Text,        nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class ComparisonResult(Base):
    """Hasil diff per baris untuk satu job komparasi."""
    __tablename__ = "comparison_results"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    job_id            = Column(Integer, nullable=False, index=True)
    primary_key_value = Column(String(500), nullable=False)
    diff_type         = Column(String(20),  nullable=False)
    row_data_a        = Column(Text, nullable=True)
    row_data_b        = Column(Text, nullable=True)
    changed_columns   = Column(Text, nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────
# OSCLN Reconciliation
# ─────────────────────────────────────────────────────────────

class OsclnSnapshot(Base):
    """Metadata snapshot CSV OSCLN yang diimport."""
    __tablename__ = "oscln_snapshots"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    session_id      = Column(String(36),  nullable=True, index=True)
    bulan           = Column(String(2),   nullable=False)
    tahun           = Column(String(4),   nullable=False)
    file_name       = Column(String(255), nullable=False)
    primary_key_col = Column(String(255), nullable=False)
    total_rows      = Column(Integer,     nullable=True)
    status          = Column(String(20),  nullable=False, default="active")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


class OsclnRow(Base):
    """Baris data dari satu OsclnSnapshot."""
    __tablename__ = "oscln_rows"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id       = Column(Integer, nullable=False, index=True)
    primary_key_value = Column(String(500), nullable=False)
    row_data          = Column(Text,        nullable=False)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────
# Scanned Excel Header Catalog & Full Raw Row Store
# ─────────────────────────────────────────────────────────────

class ScannedSchema(Base):
    """Menyimpan seluruh header kolom hasil scan dari file Excel yang diupload."""
    __tablename__ = "master_scanned_schemas"
    __table_args__ = {"schema": "rekonsiliasi"}

    id               = Column(Integer, primary_key=True, autoincrement=True)
    job_id           = Column(Integer, nullable=True, index=True)
    session_id       = Column(String(36), nullable=True, index=True)
    cedant_code      = Column(String(50), nullable=True, index=True)
    cedant_name      = Column(String(255), nullable=True)
    tipe_data        = Column(String(50), nullable=False)
    bulan            = Column(String(2), nullable=True)
    tahun            = Column(String(4), nullable=True)
    file_name        = Column(String(255), nullable=False)
    sheet_name       = Column(String(255), nullable=True)
    scanned_headers  = Column(Text, nullable=False, comment="JSON array seluruh kolom di file Excel")
    column_mapping   = Column(Text, nullable=True, comment="JSON dict mapping ke kolom inti DB")
    unmapped_headers = Column(Text, nullable=True, comment="JSON array kolom tambahan di luar kolom inti DB")
    sample_row       = Column(Text, nullable=True, comment="JSON dict contoh baris pertama")
    total_columns    = Column(Integer, nullable=True)
    total_rows       = Column(Integer, nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())


class MasterRawRow(Base):
    """Menyimpan seluruh kolom asli per baris dari file Excel agar semua kolom tetap bisa di-GET."""
    __tablename__ = "master_raw_rows"
    __table_args__ = {"schema": "rekonsiliasi"}

    id                = Column(_PK_BIGINT, primary_key=True, autoincrement=True)
    job_id            = Column(Integer, nullable=True, index=True)
    session_id        = Column(String(36), nullable=True, index=True)
    target_table      = Column(String(50), nullable=False, index=True)
    cedant_code       = Column(String(50), nullable=True, index=True)
    primary_key_value = Column(String(500), nullable=True, index=True)
    month             = Column(Integer, nullable=True)
    year              = Column(Integer, nullable=True)
    file_name         = Column(Text, nullable=True)
    sheet_name        = Column(Text, nullable=True)
    full_row_data     = Column(Text, nullable=False, comment="JSON dict seluruh kolom asli dari baris Excel")
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

