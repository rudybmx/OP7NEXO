"""Router SFTP — file manager remoto via paramiko.

Endpoints expostos a platform_admin para gerenciar arquivos em servidores
remotos via SSH/SFTP. Sessões mantidas em memória via app.services.sftp_pool.
"""
from __future__ import annotations

import logging
import os
import stat as stat_module
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.deps import exigir_platform_admin
from app.models.user import User
from app.services import sftp_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sftp", tags=["sftp"])


# ---------- Schemas ----------


class ConnectIn(BaseModel):
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: str = Field(..., min_length=1, max_length=255)
    password: Optional[str] = None
    private_key: Optional[str] = None
    private_key_passphrase: Optional[str] = None


class ConnectOut(BaseModel):
    session_id: str
    host: str
    port: int
    username: str
    home: str


class DisconnectIn(BaseModel):
    session_id: str


class OkOut(BaseModel):
    ok: bool


class FileEntry(BaseModel):
    name: str
    path: str
    type: str  # "file" | "dir" | "link" | "other"
    size: int
    mtime: float
    perms: str


class MkdirIn(BaseModel):
    session_id: str
    path: str


class RenameIn(BaseModel):
    session_id: str
    old_path: str
    new_path: str


class StatOut(BaseModel):
    type: str
    size: int
    mtime: float
    perms: str


# ---------- Helpers ----------


def _resolve_session(session_id: str, user: User) -> sftp_pool.SftpSession:
    try:
        return sftp_pool.get_session(session_id, str(user.id))
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


def _validate_path(path: str) -> str:
    if not path:
        raise HTTPException(status_code=400, detail="path obrigatório")
    if "\x00" in path:
        raise HTTPException(status_code=400, detail="path inválido")
    return path


def _entry_type(mode: int) -> str:
    if stat_module.S_ISDIR(mode):
        return "dir"
    if stat_module.S_ISLNK(mode):
        return "link"
    if stat_module.S_ISREG(mode):
        return "file"
    return "other"


def _format_perms(mode: int) -> str:
    return stat_module.filemode(mode)


def _join_path(base: str, name: str) -> str:
    if base.endswith("/"):
        return base + name
    return base + "/" + name


# ---------- Endpoints ----------


@router.post("/connect", response_model=ConnectOut)
def connect(payload: ConnectIn, user: User = Depends(exigir_platform_admin)):
    if not payload.password and not payload.private_key:
        raise HTTPException(status_code=400, detail="Forneça password ou private_key")
    try:
        session = sftp_pool.create_session(
            user_id=str(user.id),
            host=payload.host,
            port=payload.port,
            username=payload.username,
            password=payload.password,
            private_key=payload.private_key,
            private_key_passphrase=payload.private_key_passphrase,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.warning("SFTP connect falhou host=%s user=%s: %s", payload.host, payload.username, exc)
        raise HTTPException(status_code=502, detail=f"Falha ao conectar: {exc}")

    return ConnectOut(
        session_id=session.session_id,
        host=session.host,
        port=session.port,
        username=session.username,
        home=session.home,
    )


@router.post("/disconnect", response_model=OkOut)
def disconnect(payload: DisconnectIn, user: User = Depends(exigir_platform_admin)):
    try:
        ok = sftp_pool.close_session(payload.session_id, str(user.id))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return OkOut(ok=ok)


@router.get("/ls", response_model=list[FileEntry])
def ls(
    session_id: str = Query(...),
    path: str = Query("."),
    user: User = Depends(exigir_platform_admin),
):
    session = _resolve_session(session_id, user)
    _validate_path(path)
    sftp = session.sftp

    try:
        abs_path = sftp.normalize(path)
        entries = sftp.listdir_attr(abs_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Caminho não existe")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Sem permissão no caminho remoto")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")

    result: list[FileEntry] = []
    for e in entries:
        mode = e.st_mode or 0
        result.append(
            FileEntry(
                name=e.filename,
                path=_join_path(abs_path, e.filename),
                type=_entry_type(mode),
                size=e.st_size or 0,
                mtime=float(e.st_mtime or 0),
                perms=_format_perms(mode),
            )
        )
    result.sort(key=lambda x: (x.type != "dir", x.name.lower()))
    return result


@router.get("/stat", response_model=StatOut)
def stat(
    session_id: str = Query(...),
    path: str = Query(...),
    user: User = Depends(exigir_platform_admin),
):
    session = _resolve_session(session_id, user)
    _validate_path(path)
    try:
        attr = session.sftp.stat(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Caminho não existe")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")
    mode = attr.st_mode or 0
    return StatOut(
        type=_entry_type(mode),
        size=attr.st_size or 0,
        mtime=float(attr.st_mtime or 0),
        perms=_format_perms(mode),
    )


@router.get("/download")
def download(
    session_id: str = Query(...),
    path: str = Query(...),
    user: User = Depends(exigir_platform_admin),
):
    session = _resolve_session(session_id, user)
    _validate_path(path)
    sftp = session.sftp

    try:
        attr = sftp.stat(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Arquivo não existe")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")

    mode = attr.st_mode or 0
    if not stat_module.S_ISREG(mode):
        raise HTTPException(status_code=400, detail="Caminho não é arquivo regular")

    size = attr.st_size or 0
    filename = os.path.basename(path) or "download.bin"

    def iterator():
        chunk = 64 * 1024
        try:
            with sftp.open(path, "rb") as f:
                f.prefetch()
                while True:
                    data = f.read(chunk)
                    if not data:
                        break
                    yield data
        except Exception as exc:
            logger.exception("SFTP download stream falhou: %s", exc)
            raise

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Length": str(size),
    }
    return StreamingResponse(iterator(), media_type="application/octet-stream", headers=headers)


@router.post("/upload")
async def upload(
    session_id: str = Query(...),
    path: str = Query(..., description="Caminho destino completo (incluindo nome)"),
    file: UploadFile = File(...),
    user: User = Depends(exigir_platform_admin),
):
    session = _resolve_session(session_id, user)
    _validate_path(path)
    sftp = session.sftp

    max_bytes = 500 * 1024 * 1024
    total = 0
    try:
        with sftp.open(path, "wb") as remote:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="Arquivo excede limite de 500MB")
                remote.write(chunk)
    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail="Sem permissão para gravar")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP no upload: {exc}")
    return {"ok": True, "size": total, "path": path}


@router.delete("/rm", response_model=OkOut)
def rm(
    session_id: str = Query(...),
    path: str = Query(...),
    recursive: bool = Query(False),
    user: User = Depends(exigir_platform_admin),
):
    session = _resolve_session(session_id, user)
    _validate_path(path)
    sftp = session.sftp
    try:
        attr = sftp.stat(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Caminho não existe")

    mode = attr.st_mode or 0
    try:
        if stat_module.S_ISDIR(mode):
            if recursive:
                _rmtree(sftp, path)
            else:
                sftp.rmdir(path)
        else:
            sftp.remove(path)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao remover: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")
    return OkOut(ok=True)


@router.post("/mkdir", response_model=OkOut)
def mkdir(payload: MkdirIn, user: User = Depends(exigir_platform_admin)):
    session = _resolve_session(payload.session_id, user)
    _validate_path(payload.path)
    try:
        session.sftp.mkdir(payload.path)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao criar pasta: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")
    return OkOut(ok=True)


@router.post("/rename", response_model=OkOut)
def rename(payload: RenameIn, user: User = Depends(exigir_platform_admin)):
    session = _resolve_session(payload.session_id, user)
    _validate_path(payload.old_path)
    _validate_path(payload.new_path)
    try:
        session.sftp.posix_rename(payload.old_path, payload.new_path)
    except AttributeError:
        try:
            session.sftp.rename(payload.old_path, payload.new_path)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro SFTP: {exc}")
    return OkOut(ok=True)


def _rmtree(sftp, path: str) -> None:
    for entry in sftp.listdir_attr(path):
        child = _join_path(path, entry.filename)
        mode = entry.st_mode or 0
        if stat_module.S_ISDIR(mode):
            _rmtree(sftp, child)
        else:
            sftp.remove(child)
    sftp.rmdir(path)
