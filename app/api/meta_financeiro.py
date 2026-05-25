import re
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual
from app.models.ads_account import AdsAccount
from app.models.user import User
from app.services.ads_account_access import listar_ads_accounts_acessiveis

router = APIRouter(prefix="/meta", tags=["meta_financeiro"])


def _safe_float(valor) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _safe_bool(valor) -> bool | None:
    if valor is None:
        return None
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str):
        normalizado = valor.strip().lower()
        if normalizado in {"true", "1", "yes", "sim"}:
            return True
        if normalizado in {"false", "0", "no", "nao", "não"}:
            return False
    return bool(valor)


def _parse_conta_ids(conta_ids: str | None) -> list[str]:
    if not conta_ids:
        return []
    return [item.strip() for item in conta_ids.split(",") if item.strip()]


def _config_financeira(conta: AdsAccount) -> dict:
    config = conta.config or {}
    if not isinstance(config, dict):
        return {}
    return dict(config)


def _config_optional_float(config: dict, *keys: str) -> float | None:
    for key in keys:
        if key not in config:
            continue
        valor = config.get(key)
        if valor in (None, ""):
            continue
        try:
            return float(valor)
        except (TypeError, ValueError):
            continue
    return None


def _parse_display_amount(valor: str | None) -> float | None:
    if not isinstance(valor, str):
        return None
    match = re.search(r"[-+]?\d[\d\.,]*", valor)
    if not match:
        return None
    numero = match.group(0)
    if "," in numero:
        numero = numero.replace(".", "").replace(",", ".")
    else:
        numero = numero.replace(",", "")
    try:
        return float(numero)
    except (TypeError, ValueError):
        return None


def _extrair_funding(config: dict) -> tuple[str | None, str | None, str | None, str | None, bool | None, str | None]:
    funding_details = config.get("funding_source_details")
    if not isinstance(funding_details, dict):
        funding_details = {}

    funding_source_display = (
        config.get("funding_source_display")
        or funding_details.get("display_string")
        or config.get("funding_source_details_display")
    )
    funding_source_type = config.get("funding_source_type")
    funding_source_id = config.get("funding_source_id") or funding_details.get("id")
    funding_brand = config.get("funding_source_brand")

    if not funding_brand and isinstance(funding_source_display, str):
        display_upper = funding_source_display.upper()
        if "VISA" in display_upper:
            funding_brand = "visa"
        elif "MASTER" in display_upper:
            funding_brand = "mastercard"
        elif "PIX" in display_upper:
            funding_brand = "pix"
        elif "AMEX" in display_upper or "AMERICAN EXPRESS" in display_upper:
            funding_brand = "amex"

    is_prepay = _safe_bool(config.get("is_prepay_account"))
    currency = config.get("currency")

    return (
        str(funding_source_type) if funding_source_type not in (None, "") else None,
        funding_source_display if isinstance(funding_source_display, str) and funding_source_display.strip() else None,
        str(funding_source_id) if funding_source_id not in (None, "") else None,
        funding_brand if isinstance(funding_brand, str) and funding_brand.strip() else None,
        is_prepay,
        str(currency) if currency not in (None, "") else None,
    )


def _reference_amount(balance: float, amount_spent: float, spend_cap: float, is_prepay: bool | None) -> tuple[float | None, str, str]:
    if spend_cap > 0:
        return spend_cap, "spend_cap", "Limite de gastos"

    if is_prepay:
        if balance > 0 and amount_spent > 0:
            return balance + amount_spent, "prepay_balance", "Saldo base"
        if balance > 0:
            return balance, "prepay_balance", "Saldo de recarga"

    if balance > 0 and amount_spent > 0:
        return balance + amount_spent, "balance_plus_spent", "Valor de referência"

    if balance > 0:
        return balance, "balance", "Saldo atual"

    return None, "unknown", "Sem referência"


def _display_balance(
    balance: float,
    amount_spent: float,
    spend_cap: float,
    is_prepay: bool | None,
    funding_display: str | None,
    config: dict,
) -> tuple[float | None, str, str, float | None, float | None, float | None]:
    if is_prepay is True:
        display_amount = _parse_display_amount(funding_display)
        if display_amount is None and balance > 0:
            display_amount = balance
        return display_amount, "Saldo disponível", "prepay_display", None, None, None

    if spend_cap > 0:
        remaining = max(spend_cap - amount_spent, 0.0)
        debt_amount = balance if balance > 0 else None
        estimated_tax_amount = _config_optional_float(
            config,
            "estimated_tax_amount",
            "estimated_tax",
            "imposto_estimado",
            "tax_amount",
            "fee_amount",
            "tarifas_aplicaveis",
        )
        due_amount = None
        if debt_amount is not None:
            due_amount = debt_amount + (estimated_tax_amount or 0.0)
        return remaining, "Valor restante", "card_remaining", debt_amount, estimated_tax_amount, due_amount

    if balance > 0:
        return balance, "Saldo disponível", "raw_balance", None, None, None

    return None, "Saldo disponível", "unknown", None, None, None


def _alerta_financeiro(balance: float, reference_amount: float | None) -> dict:
    if not reference_amount or reference_amount <= 0:
        return {
            "state": "indisponivel",
            "ratio": None,
            "threshold": 0.10,
            "message": "Sem limite ou recarga suficiente para calcular o alerta.",
        }

    ratio = balance / reference_amount if reference_amount else None
    if ratio is None:
        return {
            "state": "indisponivel",
            "ratio": None,
            "threshold": 0.10,
            "message": "Sem limite ou recarga suficiente para calcular o alerta.",
        }

    if ratio <= 0.10:
        return {
            "state": "critical",
            "ratio": round(ratio, 4),
            "threshold": 0.10,
            "message": "Saldo crítico - abaixo de 10% da referência.",
        }
    if ratio <= 0.25:
        return {
            "state": "warning",
            "ratio": round(ratio, 4),
            "threshold": 0.10,
            "message": "Saldo em atenção - abaixo de 25% da referência.",
        }
    return {
        "state": "ok",
        "ratio": round(ratio, 4),
        "threshold": 0.10,
        "message": "Saldo saudável para a conta selecionada.",
    }


def _conta_item(conta: AdsAccount) -> dict:
    config = _config_financeira(conta)
    funding_type, funding_display, funding_source_id, funding_brand, is_prepay, currency = _extrair_funding(config)
    balance = _safe_float(conta.balance)
    amount_spent = _safe_float(conta.amount_spent)
    spend_cap = _safe_float(conta.spend_cap)
    display_balance_amount, display_balance_label, display_balance_kind, debt_amount, estimated_tax_amount, due_amount = _display_balance(
        balance,
        amount_spent,
        spend_cap,
        is_prepay,
        funding_display,
        config,
    )
    reference_amount, reference_kind, reference_label = _reference_amount(
        balance,
        amount_spent,
        spend_cap,
        is_prepay,
    )

    principal_for_alert = display_balance_amount if display_balance_amount is not None else balance
    alerta = _alerta_financeiro(principal_for_alert, reference_amount)
    nome = conta.account_name or conta.account_id

    return {
        "id": str(conta.id),
        "account_id": conta.account_id,
        "account_name": conta.account_name,
        "label": nome,
        "available_balance": balance,
        "display_balance_amount": display_balance_amount,
        "display_balance_label": display_balance_label,
        "display_balance_kind": display_balance_kind,
        "amount_spent": amount_spent,
        "spend_cap": spend_cap,
        "debt_amount": debt_amount,
        "estimated_tax_amount": estimated_tax_amount,
        "due_amount": due_amount,
        "reference_amount": reference_amount,
        "reference_kind": reference_kind,
        "reference_label": reference_label,
        "alert_state": alerta["state"],
        "alert_ratio": alerta["ratio"],
        "alert_threshold": alerta["threshold"],
        "alert_message": alerta["message"],
        "funding_type": funding_type,
        "funding_type_label": (
            funding_display
            or (
                "Pré-pago"
                if is_prepay is True
                else "Pós-pago"
                if spend_cap > 0
                else "Não informado"
            )
        ),
        "funding_source_display": funding_display,
        "funding_source_id": funding_source_id,
        "funding_source_brand": funding_brand,
        "is_prepay_account": is_prepay,
        "currency": currency,
        "account_status": conta.account_status,
        "ativo": conta.ativo,
        "bm_id": config.get("bm_id"),
        "bm_name": config.get("bm_name"),
        "synced_at": conta.sincronizado_em.isoformat() if conta.sincronizado_em else None,
        "updated_at": conta.atualizado_em.isoformat() if conta.atualizado_em else None,
    }


def _selection_state(total_contas: int, conta_ids_filtro: list[str], selected: dict | None) -> tuple[str, str]:
    if total_contas == 0:
        return "empty", "Não há contas Meta ativas neste workspace."
    if selected:
        return "ready", "Financeiro da conta selecionada."
    if len(conta_ids_filtro) > 1:
        return "multiple", "O financeiro é individual por conta. Selecione uma conta única."
    if len(conta_ids_filtro) == 1:
        return "invalid", "A conta selecionada não pertence a este workspace."
    if total_contas == 1:
        return "ready", "Uma única conta ativa encontrada e selecionada automaticamente."
    return "multiple", "Selecione uma conta Meta para exibir saldo e faturamento."


@router.get("/financeiro")
def financeiro_meta(
    workspace_id: str = Query(...),
    conta_ids: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_usuario_atual),
):
    try:
        workspace_uuid = uuid.UUID(workspace_id)
    except ValueError:
        return {
            "workspace_id": workspace_id,
            "selection_state": "invalid",
            "selection_required": True,
            "selection_message": "workspace_id inválido.",
            "accounts": [],
            "selected_account": None,
            "summary": {
                "available_balance": 0.0,
                "display_balance_amount": None,
                "display_balance_label": "Saldo disponível",
                "display_balance_kind": "unknown",
                "amount_spent": 0.0,
                "spend_cap": 0.0,
                "debt_amount": None,
                "estimated_tax_amount": None,
                "due_amount": None,
                "reference_amount": None,
                "reference_kind": "unknown",
                "reference_label": "Sem referência",
                "alert": {
                    "state": "indisponivel",
                    "ratio": None,
                    "threshold": 0.10,
                    "message": "workspace_id inválido.",
                },
                "funding_type": None,
                "funding_type_label": None,
                "funding_source_display": None,
                "funding_source_id": None,
                "funding_source_brand": None,
                "is_prepay_account": None,
                "currency": None,
                "account_status": None,
                "ativo": None,
                "bm_id": None,
                "bm_name": None,
                "synced_at": None,
                "updated_at": None,
            },
            "transactions": [],
            "notes": [],
            "transactions_state": "empty",
            "notes_state": "empty",
            "updated_at": None,
        }

    conta_ids_filtro = _parse_conta_ids(conta_ids)

    contas_disponiveis = sorted(
        listar_ads_accounts_acessiveis(
            db,
            workspace_uuid,
            plataforma="meta",
            include_inactive=False,
        ),
        key=lambda conta: (
            (conta.account_name or conta.account_id or "").lower(),
            conta.account_id.lower(),
        ),
    )

    contas_serializadas = [_conta_item(conta) for conta in contas_disponiveis]

    contas_filtradas = contas_disponiveis
    if conta_ids_filtro:
        contas_filtradas = [
            conta
            for conta in contas_disponiveis
            if conta.account_id in conta_ids_filtro
        ]

    selected_conta: AdsAccount | None = None
    if len(contas_filtradas) == 1 and (
        not conta_ids_filtro or len(conta_ids_filtro) == 1
    ):
        selected_conta = contas_filtradas[0]
    elif not conta_ids_filtro and len(contas_disponiveis) == 1:
        selected_conta = contas_disponiveis[0]

    selected_serialized = _conta_item(selected_conta) if selected_conta else None
    selection_state, selection_message = _selection_state(
        len(contas_disponiveis),
        conta_ids_filtro,
        selected_serialized,
    )

    if selected_serialized:
        alerta = selected_serialized["alert_state"]
        summary = {
            "available_balance": selected_serialized["available_balance"],
            "display_balance_amount": selected_serialized["display_balance_amount"],
            "display_balance_label": selected_serialized["display_balance_label"],
            "display_balance_kind": selected_serialized["display_balance_kind"],
            "amount_spent": selected_serialized["amount_spent"],
            "spend_cap": selected_serialized["spend_cap"],
            "debt_amount": selected_serialized["debt_amount"],
            "estimated_tax_amount": selected_serialized["estimated_tax_amount"],
            "due_amount": selected_serialized["due_amount"],
            "reference_amount": selected_serialized["reference_amount"],
            "reference_kind": selected_serialized["reference_kind"],
            "reference_label": selected_serialized["reference_label"],
            "alert": {
                "state": alerta,
                "ratio": selected_serialized["alert_ratio"],
                "threshold": selected_serialized["alert_threshold"],
                "message": selected_serialized["alert_message"],
            },
            "funding_type": selected_serialized["funding_type"],
            "funding_type_label": selected_serialized["funding_type_label"],
            "funding_source_display": selected_serialized["funding_source_display"],
            "funding_source_id": selected_serialized["funding_source_id"],
            "funding_source_brand": selected_serialized["funding_source_brand"],
            "is_prepay_account": selected_serialized["is_prepay_account"],
            "currency": selected_serialized["currency"],
            "account_status": selected_serialized["account_status"],
            "ativo": selected_serialized["ativo"],
            "bm_id": selected_serialized["bm_id"],
            "bm_name": selected_serialized["bm_name"],
            "synced_at": selected_serialized["synced_at"],
            "updated_at": selected_serialized["updated_at"],
        }
        updated_at = selected_serialized["updated_at"]
    else:
        summary = {
            "available_balance": 0.0,
            "display_balance_amount": None,
            "display_balance_label": "Saldo disponível",
            "display_balance_kind": "unknown",
            "amount_spent": 0.0,
            "spend_cap": 0.0,
            "debt_amount": None,
            "estimated_tax_amount": None,
            "due_amount": None,
            "reference_amount": None,
            "reference_kind": "unknown",
            "reference_label": "Sem referência",
            "alert": {
                "state": "indisponivel",
                "ratio": None,
                "threshold": 0.10,
                "message": selection_message,
            },
            "funding_type": None,
            "funding_type_label": None,
            "funding_source_display": None,
            "funding_source_id": None,
            "funding_source_brand": None,
            "is_prepay_account": None,
            "currency": None,
            "account_status": None,
            "ativo": None,
            "bm_id": None,
            "bm_name": None,
            "synced_at": None,
            "updated_at": None,
        }
        updated_at = None

    return {
        "workspace_id": workspace_id,
        "selection_state": selection_state,
        "selection_required": selection_state != "ready",
        "selection_message": selection_message,
        "accounts": contas_serializadas,
        "selected_account": selected_serialized,
        "summary": summary,
        "transactions": [],
        "notes": [],
        "transactions_state": "empty" if selected_serialized else "unavailable",
        "notes_state": "empty" if selected_serialized else "unavailable",
        "updated_at": updated_at,
    }
