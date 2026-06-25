"""Testes do núcleo do serviço de Notificações (lógica de decisão).

Usa fakes inline (padrão do projeto — sem conftest). Cobre audiência (default vs
override), dedupe/agregação, anti-spam Redis, e parsing de leitura. O SQL real
(JSONB @>, SAVEPOINT) é validado no boot da migration + verificação ao vivo.
"""
import json
import uuid

import pytest

from app.services import notificacoes as N


# ─────────────────────────────── fakes ──────────────────────────────────────
class _Nested:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeResult:
    def __init__(self, *, first=None, scalar=None, rows=None, rowcount=0):
        self._first, self._scalar, self._rows, self.rowcount = first, scalar, rows or [], rowcount

    def first(self):
        return self._first

    def scalar(self):
        return self._scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows


class FakeDb:
    def __init__(self, *, config_row=None, dedupe_row=None, count=0, rows=None, mark_rows=0):
        self.config_row = config_row
        self.dedupe_row = dedupe_row
        self.count = count
        self.rows = rows or []
        self.mark_rows = mark_rows
        self.executed: list[tuple[str, dict]] = []
        self.committed = 0
        self.inserted = False

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.executed.append((sql, params or {}))
        if "FROM notificacao_config" in sql:
            return FakeResult(first=self.config_row)
        if "n.dedupe_key = :dk" in sql:
            return FakeResult(first=self.dedupe_row)
        if "INSERT INTO notificacoes" in sql:
            self.inserted = True
            return FakeResult(scalar=uuid.uuid4())
        if "SELECT COUNT(*) FROM notificacoes" in sql:
            return FakeResult(scalar=self.count)
        if "INSERT INTO notificacao_leituras" in sql:
            return FakeResult(rowcount=self.mark_rows)
        if "LEFT JOIN notificacao_leituras" in sql:
            return FakeResult(rows=self.rows)
        return FakeResult()

    def begin_nested(self):
        return _Nested()

    def commit(self):
        self.committed += 1

    def insert_params(self):
        for sql, params in self.executed:
            if "INSERT INTO notificacoes" in sql:
                return params
        return None


class _User:
    def __init__(self, role_value="company_agent"):
        self.id = uuid.uuid4()
        self.role = type("R", (), {"value": role_value})()


WS = uuid.uuid4()


# ─────────────────────────── resolver_audiencia ─────────────────────────────
def test_audiencia_default_quando_sem_config():
    db = FakeDb(config_row=None)
    ativo, papeis = N.resolver_audiencia(db, WS, "canal_offline")
    assert ativo is True
    assert papeis == ["platform_admin", "company_admin"]


def test_audiencia_override_da_config():
    db = FakeDb(config_row=(False, ["company_agent"]))
    ativo, papeis = N.resolver_audiencia(db, WS, "mensagem_nova")
    assert ativo is False
    assert papeis == ["company_agent"]


# ─────────────────────────── criar_notificacao ──────────────────────────────
def test_criar_nao_insere_se_tipo_desativado(monkeypatch):
    pub = []
    monkeypatch.setattr(N, "publish_notificacao_event", lambda e: pub.append(e))
    db = FakeDb(config_row=(False, []))  # ativo=False
    out = N.criar_notificacao(db, WS, "mensagem_nova", "t", "m")
    assert out is None
    assert db.inserted is False
    assert pub == []


def test_criar_deduplica_quando_existe_viva(monkeypatch):
    monkeypatch.setattr(N, "publish_notificacao_event", lambda e: None)
    existente = uuid.uuid4()
    db = FakeDb(config_row=None, dedupe_row=(existente,))
    out = N.criar_notificacao(db, WS, "mensagem_nova", "t", "m", dedupe_key="mensagem_nova:abc")
    assert out == existente
    assert db.inserted is False  # agregou — não criou outra


def test_criar_insere_e_publica_com_audiencia_snapshot(monkeypatch):
    pub = []
    monkeypatch.setattr(N, "publish_notificacao_event", lambda e: pub.append(e))
    db = FakeDb(config_row=None)  # usa default
    out = N.criar_notificacao(
        db, WS, "canal_offline", "Canal caiu", "msg",
        severidade="critico", link="/x", entidade=("canal", uuid.uuid4()),
        dedupe_key="canal_offline:1",
    )
    assert out is not None
    assert db.inserted is True
    params = db.insert_params()
    assert json.loads(params["aud"]) == ["platform_admin", "company_admin"]
    assert params["sev"] == "critico"
    assert params["et"] == "canal"
    assert len(pub) == 1 and pub[0]["tipo"] == "canal_offline"


def test_criar_nunca_propaga_excecao(monkeypatch):
    monkeypatch.setattr(N, "publish_notificacao_event", lambda e: None)

    class Boom(FakeDb):
        def execute(self, *a, **k):
            raise RuntimeError("db down")

    out = N.criar_notificacao(Boom(), WS, "mensagem_nova", "t", "m")
    assert out is None  # engoliu a exceção


# ─────────────────────────── anti-spam Redis ────────────────────────────────
def test_marca_unica_primeira_vez_true_depois_false(monkeypatch):
    estado = {}

    class FakeRedis:
        def set(self, k, v, nx=False, ex=None):
            if nx and k in estado:
                return None
            estado[k] = v
            return True

    monkeypatch.setattr(N, "_get_redis", lambda: FakeRedis())
    assert N.marca_unica_redis("k1", 60) is True
    assert N.marca_unica_redis("k1", 60) is False


def test_marca_unica_redis_indisponivel_nao_bloqueia(monkeypatch):
    def boom():
        raise RuntimeError("no redis")

    monkeypatch.setattr(N, "_get_redis", boom)
    assert N.marca_unica_redis("k", 60) is True  # degrada p/ notificar


# ─────────────────────────── leitura / listagem ─────────────────────────────
def test_contar_nao_lidas_usa_papel_do_usuario():
    db = FakeDb(count=7)
    total = N.contar_nao_lidas(db, _User("company_agent"), WS)
    assert total == 7
    sql, params = db.executed[-1]
    assert json.loads(params["role"]) == ["company_agent"]


def test_listar_parseia_lida_e_ids():
    nid = uuid.uuid4()
    eid = uuid.uuid4()
    row = {
        "id": nid, "tipo": "mensagem_nova", "severidade": "info", "titulo": "Fulano",
        "mensagem": "oi", "link": "/atendimento", "entidade_tipo": "conversa",
        "entidade_id": eid, "payload": {"contato": "Fulano"},
        "criado_em": None, "lida": True,
    }
    db = FakeDb(rows=[row])
    out = N.listar(db, _User(), WS)
    assert len(out) == 1
    assert out[0]["id"] == str(nid)
    assert out[0]["entidade_id"] == str(eid)
    assert out[0]["lida"] is True


def test_marcar_todas_comita_e_retorna_rowcount():
    db = FakeDb(mark_rows=3)
    n = N.marcar_todas(db, _User(), WS)
    assert n == 3
    assert db.committed == 1


def test_marcar_lida_por_entidade_filtra_entidade():
    db = FakeDb(mark_rows=1)
    n = N.marcar_lida_por_entidade(db, _User(), WS, "conversa", uuid.uuid4())
    assert n == 1
    sql, params = db.executed[-1]
    assert params["et"] == "conversa"
