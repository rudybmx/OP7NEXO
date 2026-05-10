import subprocess
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ads_accounts import router as ads_accounts_router
from app.api.auth import router as auth_router
from app.api.canais import router as canais_router
from app.api.companies import router as companies_router
from app.api.meta import router as meta_router
from app.api.meta_insights import router as meta_insights_router
from app.api.networks import router as networks_router
from app.api.users import router as users_router
from app.api.workspaces import router as workspaces_router
from app.core.config import settings
from app.services.scheduler import iniciar_scheduler, parar_scheduler


def _rodar_migracoes() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Falha nas migrações Alembic:\n{result.stderr}")
    print(result.stdout)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _rodar_migracoes()
    iniciar_scheduler()
    yield
    parar_scheduler()


app = FastAPI(
    title="op7nexo-api",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://op-7-nexo-mcpq.vercel.app",
        "https://nexo.op7franquia.com.br",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(networks_router)
app.include_router(companies_router)
app.include_router(users_router)
app.include_router(workspaces_router)
app.include_router(ads_accounts_router)
app.include_router(meta_router)
app.include_router(meta_insights_router)
app.include_router(canais_router)


@app.get("/health")
def health():
    return {"status": "ok"}
