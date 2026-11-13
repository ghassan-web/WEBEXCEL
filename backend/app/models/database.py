from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Bisa pakai DATABASE_URL langsung, atau variabel terpisah
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    host     = os.getenv("DB_HOST",     "10.10.125.91")
    port     = os.getenv("DB_PORT",     "5432")
    database = os.getenv("DB_DATABASE", "fsi_db")
    username = os.getenv("DB_USERNAME", "viy4user")
    password = os.getenv("DB_PASSWORD", "")
    DATABASE_URL = f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
