import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import assets, dirsearch, git_dump, imports, jobs, terminal, tools, whatweb, workspaces
from app.services.job_engine import reconcile_interrupted_jobs
from app.services.job_handlers import load_all_handlers

CORS_ALLOW_ORIGINS = os.environ.get("CORS_ALLOW_ORIGINS", "http://127.0.0.1:5173")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    load_all_handlers()
    reconcile_interrupted_jobs()
    yield


app = FastAPI(title="Fast Web Testing Tools", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ALLOW_ORIGINS],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workspaces.router)
app.include_router(imports.router)
app.include_router(assets.router)
app.include_router(jobs.router)
app.include_router(dirsearch.router)
app.include_router(git_dump.router)
app.include_router(whatweb.router)
app.include_router(tools.router)
app.include_router(terminal.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
