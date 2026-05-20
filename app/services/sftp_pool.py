"""Pool de sessões SFTP em memória.

Mantém conexões paramiko ativas indexadas por session_id (UUID).
Cada sessão é vinculada ao user_id que a criou. Sessões expiram após
SESSION_TTL_SECONDS de inatividade — task de cleanup roda no lifespan.
"""
from __future__ import annotations

import asyncio
import io
import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import paramiko

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 30 * 60
CLEANUP_INTERVAL_SECONDS = 5 * 60


@dataclass
class SftpSession:
    session_id: str
    ssh: paramiko.SSHClient
    sftp: paramiko.SFTPClient
    user_id: str
    host: str
    port: int
    username: str
    home: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_sessions: dict[str, SftpSession] = {}
_lock = threading.Lock()


def create_session(
    *,
    user_id: str,
    host: str,
    port: int,
    username: str,
    password: Optional[str] = None,
    private_key: Optional[str] = None,
    private_key_passphrase: Optional[str] = None,
    timeout: int = 15,
) -> SftpSession:
    """Abre conexão SSH/SFTP, retorna sessão registrada."""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": timeout,
        "banner_timeout": timeout,
        "auth_timeout": timeout,
        "look_for_keys": False,
        "allow_agent": False,
    }

    if private_key:
        pkey = _parse_private_key(private_key, private_key_passphrase)
        connect_kwargs["pkey"] = pkey
    elif password:
        connect_kwargs["password"] = password
    else:
        raise ValueError("É necessário fornecer password ou private_key")

    ssh.connect(**connect_kwargs)
    sftp = ssh.open_sftp()

    try:
        home = sftp.normalize(".")
    except Exception:
        home = "/"

    sid = str(uuid.uuid4())
    session = SftpSession(
        session_id=sid,
        ssh=ssh,
        sftp=sftp,
        user_id=str(user_id),
        host=host,
        port=port,
        username=username,
        home=home,
    )

    with _lock:
        _sessions[sid] = session

    logger.info("SFTP sessão criada sid=%s user=%s host=%s@%s:%s", sid, user_id, username, host, port)
    return session


def get_session(session_id: str, user_id: str) -> SftpSession:
    """Recupera sessão, valida ownership, atualiza last_used_at.

    Levanta KeyError se não existir, PermissionError se user_id não bater.
    """
    with _lock:
        session = _sessions.get(session_id)
        if not session:
            raise KeyError("Sessão SFTP não encontrada ou expirada")
        if session.user_id != str(user_id):
            raise PermissionError("Sessão SFTP pertence a outro usuário")
        session.last_used_at = datetime.now(timezone.utc)
        return session


def close_session(session_id: str, user_id: str) -> bool:
    with _lock:
        session = _sessions.get(session_id)
        if not session:
            return False
        if session.user_id != str(user_id):
            raise PermissionError("Sessão SFTP pertence a outro usuário")
        _close_session_obj(session)
        del _sessions[session_id]
        return True


def cleanup_expired() -> int:
    now = datetime.now(timezone.utc)
    expired_ids: list[str] = []
    with _lock:
        for sid, session in list(_sessions.items()):
            age = (now - session.last_used_at).total_seconds()
            if age > SESSION_TTL_SECONDS:
                expired_ids.append(sid)
                _close_session_obj(session)
                del _sessions[sid]
    if expired_ids:
        logger.info("SFTP cleanup removeu %d sessões expiradas", len(expired_ids))
    return len(expired_ids)


def close_all() -> None:
    with _lock:
        for session in _sessions.values():
            _close_session_obj(session)
        _sessions.clear()


def _close_session_obj(session: SftpSession) -> None:
    try:
        session.sftp.close()
    except Exception:
        pass
    try:
        session.ssh.close()
    except Exception:
        pass


def _parse_private_key(key_str: str, passphrase: Optional[str]) -> paramiko.PKey:
    """Tenta carregar como RSA, Ed25519, ECDSA ou DSS."""
    errors = []
    for cls in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey, paramiko.DSSKey):
        try:
            return cls.from_private_key(io.StringIO(key_str), password=passphrase)
        except paramiko.SSHException as exc:
            errors.append(f"{cls.__name__}: {exc}")
        except Exception as exc:
            errors.append(f"{cls.__name__}: {exc}")
    raise ValueError("Chave privada inválida ou formato não suportado: " + "; ".join(errors))


async def cleanup_loop() -> None:
    """Loop async para rodar no lifespan da aplicação."""
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            cleanup_expired()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Erro no cleanup loop SFTP")
