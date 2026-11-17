"""
FastAPI entry point – Excel Comparison App
Run: uvicorn app.main:app --reload --port 8000
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models.database import engine, Base
from .routers import compare_router, master_router, oscln_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── Auto-create tables on startup (non-blocking if DB is unreachable) ──
try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    logger.warning("Database auto-create skipped at startup (DB unreachable or pg_hba restricted): %s", exc)

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
def health():
    return {"status": "healthy"}
