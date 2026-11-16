import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    host     = os.getenv("DB_HOST",     "10.10.125.91")
    port     = os.getenv("DB_PORT",     "5432")
    database = os.getenv("DB_DATABASE", "fsi_db")
    username = os.getenv("DB_USERNAME", "viy4user")
    password = os.getenv("DB_PASSWORD", "")
    DATABASE_URL = URL.create(
        "postgresql+psycopg2",
        username=username,
        password=password,
        host=host,
        port=int(port),
        database=database,
    )

db_schema = os.getenv("DB_SCHEMA", "").strip()
if db_schema and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", db_schema):
    raise RuntimeError("DB_SCHEMA must be a valid PostgreSQL schema name.")

connect_args = {}
if db_schema:
    connect_args["options"] = f"-c search_path={db_schema},public"

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
