"""
FastAPI entry point – Excel Comparison App
Run: uvicorn app.main:app --reload --port 8000
"""
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .models.database import engine, fsi_engine, FSI_DB_SCHEMA, FSI_OSCLN_TABLE
from .routers import compare_router, master_router, oscln_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Excel Comparison API",
    description="API untuk membandingkan dua file Excel berdasarkan Primary Key",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS – allow React dev server ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──
app.include_router(compare_router)
app.include_router(master_router)
app.include_router(oscln_router)


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "message": "Excel Comparison API is running"}


@app.get("/health", tags=["health"])
def health(response: Response):
    fsi_status = "not_configured"
    if fsi_engine is not None:
        try:
            with fsi_engine.connect() as fsi_conn:
                fsi_conn.execute(text("SELECT 1")).scalar_one()
            fsi_status = "connected"
        except SQLAlchemyError:
            logger.warning("FSI DB health check failed")
            fsi_status = "disconnected"

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        response.status_code = 503
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "fsi_database": fsi_status,
        }
    return {
        "status": "healthy",
        "database": "connected",
        "fsi_database": fsi_status,
        "fsi_source": f"{FSI_DB_SCHEMA}.{FSI_OSCLN_TABLE}",
    }
