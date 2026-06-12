"""Carteira de tokens do Estúdio AI — saldo e lançamentos (serviço).

Fonte única da lógica de saldo: usado pelo router `/estudio` (recarga/confirmação)
e pelo débito por geração em `/design/gerar`. 1 token = R$1.
"""
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.estudio import EstudioTokenSaldo, EstudioTokenTransacao

TOKEN_VALOR_REAIS = 1  # 1 token = R$1


def saldo(db: Session, workspace_id: uuid.UUID) -> int:
    row = (
        db.query(EstudioTokenSaldo)
        .filter(EstudioTokenSaldo.workspace_id == workspace_id)
        .first()
    )
    return row.saldo_tokens if row else 0


def tem_saldo(db: Session, workspace_id: uuid.UUID, n: int) -> bool:
    return saldo(db, workspace_id) >= n


def buckets(db: Session, workspace_id: uuid.UUID) -> dict:
    """Decompõe o saldo em concedido (grátis) vs comprado (consumo grátis-primeiro).

    `comprado_restante` é o piso protegido: créditos comprados menos transferências
    enviadas. O que estiver no saldo acima desse piso é concedido → removível.
    """
    s = saldo(db, workspace_id)

    def _soma(tipo: str, origem: str, somente_confirmado: bool) -> int:
        q = db.query(func.coalesce(func.sum(EstudioTokenTransacao.tokens), 0)).filter(
            EstudioTokenTransacao.workspace_id == workspace_id,
            EstudioTokenTransacao.tipo == tipo,
            EstudioTokenTransacao.origem == origem,
        )
        if somente_confirmado:
            q = q.filter(EstudioTokenTransacao.status == "confirmado")
        return int(q.scalar() or 0)

    comprado_restante = max(0, _soma("credito", "comprado", True) - _soma("debito", "transferencia", False))
    return {
        "saldo": s,
        "comprado_restante": min(comprado_restante, s),
        "removivel": max(0, s - comprado_restante),
        "transferivel": min(comprado_restante, s),
    }


def _ajustar(db: Session, workspace_id: uuid.UUID, delta: int) -> None:
    row = (
        db.query(EstudioTokenSaldo)
        .filter(EstudioTokenSaldo.workspace_id == workspace_id)
        .first()
    )
    if not row:
        row = EstudioTokenSaldo(workspace_id=workspace_id, saldo_tokens=0)
        db.add(row)
        db.flush()
    row.saldo_tokens = (row.saldo_tokens or 0) + delta


def registrar(
    db: Session,
    workspace_id: uuid.UUID,
    tipo: str,
    tokens: int,
    motivo: str,
    *,
    status: str = "confirmado",
    valor=None,
    referencia: str | None = None,
    origem: str | None = None,
    por: uuid.UUID | None = None,
) -> EstudioTokenTransacao:
    """Cria a transação; se `status='confirmado'`, ajusta o saldo (não dá commit)."""
    t = EstudioTokenTransacao(
        workspace_id=workspace_id,
        tipo=tipo,
        tokens=tokens,
        valor_reais=valor,
        motivo=motivo,
        status=status,
        referencia=referencia,
        origem=origem,
        criado_por=por,
    )
    db.add(t)
    if status == "confirmado":
        _ajustar(db, workspace_id, tokens if tipo == "credito" else -tokens)
    return t


def confirmar(db: Session, t: EstudioTokenTransacao) -> EstudioTokenTransacao:
    """Confirma uma transação pendente (recarga) e credita/debita o saldo."""
    t.status = "confirmado"
    _ajustar(db, t.workspace_id, t.tokens if t.tipo == "credito" else -t.tokens)
    db.commit()
    db.refresh(t)
    return t


def creditar(
    db: Session, workspace_id: uuid.UUID, tokens: int, motivo: str,
    *, valor=None, referencia: str | None = None, origem: str | None = None,
    por: uuid.UUID | None = None,
) -> EstudioTokenTransacao:
    t = registrar(
        db, workspace_id, "credito", tokens, motivo,
        valor=valor if valor is not None else tokens * TOKEN_VALOR_REAIS,
        referencia=referencia, origem=origem, por=por,
    )
    db.commit()
    db.refresh(t)
    return t


def debitar(
    db: Session, workspace_id: uuid.UUID, tokens: int, motivo: str,
    *, referencia: str | None = None, origem: str | None = None,
    por: uuid.UUID | None = None,
) -> EstudioTokenTransacao:
    t = registrar(db, workspace_id, "debito", tokens, motivo, referencia=referencia, origem=origem, por=por)
    db.commit()
    db.refresh(t)
    return t
