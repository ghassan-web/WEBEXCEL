import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if not DATABASE_URL:
    host     = os.getenv("DB_HOST", "").strip()
    port     = os.getenv("DB_PORT", "5432").strip()
    database = os.getenv("DB_DATABASE", "").strip()
    username = os.getenv("DB_USERNAME", "").strip()
    password = os.getenv("DB_PASSWORD", "").strip()

    DATABASE_URL = URL.create(
        "postgresql+psycopg2",
        username=username or None,
        password=password or None,
        host=host or "localhost",
        port=int(port) if port.isdigit() else 5432,
        database=database or None,
    )

db_schema = os.getenv("DB_SCHEMA", "").strip()
if db_schema and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", db_schema):
    raise RuntimeError("DB_SCHEMA must be a valid PostgreSQL schema name.")

connect_args = {"connect_timeout": 5}
if db_schema:
    connect_args["options"] = f"-c search_path={db_schema},public"

DB_MODE = "postgresql"
DB_LAST_ERROR = None

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Secondary PostgreSQL connection: fsi_db (schema clickhouse -> oscln) ──────
FSI_DATABASE_URL = os.getenv("FSI_DATABASE_URL", "").strip()
FSI_DB_SCHEMA = os.getenv("FSI_DB_SCHEMA", "clickhouse").strip() or "clickhouse"
FSI_OSCLN_TABLE = os.getenv("FSI_OSCLN_TABLE", "oscln").strip() or "oscln"

if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", FSI_DB_SCHEMA):
    raise RuntimeError("FSI_DB_SCHEMA must be a valid PostgreSQL schema name.")
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", FSI_OSCLN_TABLE):
    raise RuntimeError("FSI_OSCLN_TABLE must be a valid PostgreSQL table name.")

if not FSI_DATABASE_URL:
    fsi_host = os.getenv("FSI_DB_HOST", "").strip()
    fsi_database = os.getenv("FSI_DB_DATABASE", "").strip()
    if fsi_host or fsi_database:
        fsi_port = os.getenv("FSI_DB_PORT", os.getenv("DB_PORT", "5432")).strip()
        fsi_username = os.getenv("FSI_DB_USERNAME", os.getenv("DB_USERNAME", "")).strip()
        fsi_password = os.getenv("FSI_DB_PASSWORD", os.getenv("DB_PASSWORD", "")).strip()
        FSI_DATABASE_URL = URL.create(
            "postgresql+psycopg2",
            username=fsi_username or None,
            password=fsi_password or None,
            host=fsi_host or os.getenv("DB_HOST", "").strip() or "localhost",
            port=int(fsi_port) if fsi_port.isdigit() else 5432,
            database=fsi_database or "fsi_db",
        )

fsi_engine = None
FsiSessionLocal = None
if FSI_DATABASE_URL:
    fsi_connect_args = {
        "connect_timeout": 5,
        "options": f"-c search_path={FSI_DB_SCHEMA},public",
    }
    fsi_engine = create_engine(
        FSI_DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        connect_args=fsi_connect_args,
    )
    FsiSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=fsi_engine)


def get_fsi_db():
    if FsiSessionLocal is None:
        yield None
        return
    db = FsiSessionLocal()
    try:
        yield db
    finally:
        db.close()
