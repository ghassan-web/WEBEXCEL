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
