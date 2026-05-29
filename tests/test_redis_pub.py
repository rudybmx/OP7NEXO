import pytest

from app.services import redis_pub


def test_resolve_redis_url_prefers_explicit_url(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://custom:6379/1")
    monkeypatch.setenv("REDIS_PASSWORD", "ignored")

    assert redis_pub._resolve_redis_url() == "redis://custom:6379/1"


def test_resolve_redis_url_builds_from_password(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("REDIS_PASSWORD", "p@ss:word")

    assert redis_pub._resolve_redis_url() == "redis://:p%40ss%3Aword@redis:6379/0"


def test_resolve_redis_url_requires_configuration(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("REDIS_PASSWORD", raising=False)

    with pytest.raises(RuntimeError, match="REDIS_URL ou REDIS_PASSWORD"):
        redis_pub._resolve_redis_url()
