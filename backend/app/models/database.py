from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Bisa pakai DATABASE_URL langsung, atau variabel terpisah gaya Laravel
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    host     = os.getenv("DB_HOST",     "127.0.0.1")
    port     = os.getenv("DB_PORT",     "3308")
    database = os.getenv("DB_DATABASE", "excel_compare")
    username = os.getenv("DB_USERNAME", "root")
    password = os.getenv("DB_PASSWORD", "")
    DATABASE_URL = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
