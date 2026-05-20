from __future__ import annotations

from io import BytesIO
from functools import lru_cache

try:
    from minio import Minio
except ModuleNotFoundError:  # pragma: no cover - dependência opcional no ambiente de teste local
    class Minio:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs):
            raise ModuleNotFoundError(
                "minio is required for object storage operations"
            )

from app.core.config import settings


@lru_cache(maxsize=1)
def get_minio_client() -> Minio:
    endpoint = settings.MINIO_ENDPOINT
    if settings.MINIO_PORT not in (80, 443) and ":" not in endpoint:
        endpoint = f"{endpoint}:{settings.MINIO_PORT}"
    return Minio(
        endpoint=endpoint,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_USE_SSL,
        region="us-east-1",
    )


@lru_cache(maxsize=1)
def ensure_bucket(bucket: str) -> None:
    client = get_minio_client()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket, location="us-east-1")


def put_bytes(bucket: str, object_name: str, content: bytes, content_type: str) -> None:
    ensure_bucket(bucket)
    client = get_minio_client()
    client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=BytesIO(content),
        length=len(content),
        content_type=content_type,
    )


def public_url(bucket: str, object_name: str) -> str:
    base = settings.SERVER_URL.rstrip("/")
    return f"{base}/meta/storage/{bucket}/{object_name}"


def get_object(bucket: str, object_name: str):
    client = get_minio_client()
    return client.get_object(bucket, object_name)


def stat_object(bucket: str, object_name: str):
    client = get_minio_client()
    return client.stat_object(bucket, object_name)


def download_and_put(bucket: str, object_name: str, source_url: str, content_type: str = "application/octet-stream") -> str | None:
    """Baixa um arquivo de uma URL e faz upload para o MinIO.
    Retorna a public_url em caso de sucesso, ou None em caso de falha."""
    import httpx
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.get(source_url)
            if resp.status_code >= 400:
                return None
            content = resp.content
            if not content:
                return None
            put_bytes(bucket, object_name, content, content_type)
            return public_url(bucket, object_name)
    except Exception:
        return None
