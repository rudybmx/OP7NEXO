import logging
import asyncio
import subprocess
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ads_accounts import router as ads_accounts_router
from app.api.auth import router as auth_router
from app.api.canais import router as canais_router
from app.api.conversas import router as conversas_router
from app.api.contatos import router as contatos_router
from app.api.followups import router as followups_router
from app.api.mensagens import router as mensagens_router
from app.api.pmp import router as pmp_router
from app.api.companies import router as companies_router
from app.api.meta import router as meta_router
from app.api.meta_catalog import router as meta_catalog_router
from app.api.meta_financeiro import router as meta_financeiro_router
from app.api.meta_insights import router as meta_insights_router
from app.api.meta_tokens import router as meta_tokens_router
from app.api.networks import router as networks_router
from app.api.sftp import router as sftp_router
from app.api.users import router as users_router
from app.api.workspaces import router as workspaces_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.services import sftp_pool
from app.services.meta_sync import marcar_sync_jobs_ativos_como_interrompidos
from app.services.scheduler import iniciar_scheduler, parar_scheduler

log = logging.getLogger(__name__)


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
    setup_logging()
    _rodar_migracoes()
    interrompidos = marcar_sync_jobs_ativos_como_interrompidos()
    if interrompidos:
        log.warning("Jobs Meta Ads ativos interrompidos no startup: %s", interrompidos)
    iniciar_scheduler()
    sftp_cleanup_task = asyncio.create_task(sftp_pool.cleanup_loop())
    try:
        yield
    finally:
        sftp_cleanup_task.cancel()
        try:
            await sftp_cleanup_task
        except (asyncio.CancelledError, Exception):
            pass
        sftp_pool.close_all()
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
app.include_router(meta_catalog_router)
app.include_router(meta_financeiro_router)
app.include_router(meta_insights_router)
app.include_router(meta_tokens_router)
app.include_router(canais_router)
app.include_router(conversas_router)
app.include_router(contatos_router)
app.include_router(followups_router)
app.include_router(mensagens_router)
app.include_router(pmp_router)
app.include_router(sftp_router)


@app.get("/health")
def health():
    return {"status": "ok"}
