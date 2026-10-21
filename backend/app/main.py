"""
FastAPI entry point – Excel Comparison App
Run: uvicorn app.main:app --reload --port 8000
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models.database import engine, Base
from .routers import compare_router, master_router, oscln_router

# ── Auto-create tables on startup ──
Base.metadata.create_all(bind=engine)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

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
