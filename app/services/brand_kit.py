"""Brand Kit do workspace — identidade de marca aplicada às gerações.

Um kit por workspace (`criativo_brand_kits`): cores, fonte, tom de voz, regras
visuais e logo. Carregado pelo `/design/gerar` para injetar a marca
automaticamente em toda geração — sem reenviar logo/cores a cada criativo.
"""
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.criativo import CriativoBrandKit, CriativoLogo
from app.services.object_storage import get_object

_BUCKET = settings.MINIO_BUCKET_CRIATIVOS

# Campos editáveis do kit (texto/cores) — fonte única para serialização/PUT.
CAMPOS = (
    "primary_color",
    "secondary_color",
    "font_family",
    "tone_of_voice",
    "visual_rules",
    "forbidden_rules",
)


def logo_object_name(workspace_id: uuid.UUID, logo_id: uuid.UUID) -> str:
    return f"workspaces/{workspace_id}/criativos/logos/{logo_id}.png"


def obter_modelo(db: Session, workspace_id: uuid.UUID) -> CriativoBrandKit | None:
    return (
        db.query(CriativoBrandKit)
        .filter(
            CriativoBrandKit.workspace_id == workspace_id,
            CriativoBrandKit.ativo.is_(True),
        )
        .first()
    )


def serializar(db: Session, bk: CriativoBrandKit | None) -> dict:
    """Dict do kit para a API (inclui `logo_url`). Vazio se não há kit."""
    out = {c: (getattr(bk, c) if bk else None) for c in CAMPOS}
    logo_url = None
    if bk and bk.logo_id:
        logo = (
            db.query(CriativoLogo)
            .filter(CriativoLogo.id == bk.logo_id, CriativoLogo.ativo.is_(True))
            .first()
        )
        logo_url = logo.arquivo_url if logo else None
    out["logo_url"] = logo_url
    return out


def carregar(db: Session, workspace_id: uuid.UUID) -> dict | None:
    """Dict do kit (ou None se o workspace não tem kit) — para aplicar no spec."""
    bk = obter_modelo(db, workspace_id)
    return serializar(db, bk) if bk else None


def _faltando(spec: dict, k: str) -> bool:
    v = spec.get(k)
    return v is None or (isinstance(v, str) and not v.strip())


def aplicar_no_spec(spec: dict, bk: dict | None) -> None:
    """Preenche o spec com a marca SÓ onde o usuário não setou (não sobrescreve)."""
    if not bk:
        return
    primaria, secundaria = bk.get("primary_color"), bk.get("secondary_color")
    defaults = {
        "primary_color": primaria,
        "secondary_color": secundaria,
        "cor_60": primaria,
        "cor_30": secundaria,
        "tone": bk.get("tone_of_voice"),
        "visual_rules": bk.get("visual_rules"),
        "forbidden_rules": bk.get("forbidden_rules"),
    }
    for k, v in defaults.items():
        if v and _faltando(spec, k):
            spec[k] = v


def logo_bytes(db: Session, workspace_id: uuid.UUID) -> bytes | None:
    """Bytes (PNG) da logo salva do workspace, ou None."""
    bk = obter_modelo(db, workspace_id)
    if not bk or not bk.logo_id:
        return None
    obj = None
    try:
        obj = get_object(_BUCKET, logo_object_name(workspace_id, bk.logo_id))
        return obj.read()
    except Exception:
        return None
    finally:
        if obj is not None:
            try:
                obj.close()
                obj.release_conn()
            except Exception:
                pass
