"""Orquestração da geração do carrossel (Criativos 2.0).

A partir do roteiro do Diretor (slides já persistidos), monta um prompt
newsjacking INTEGRADO por slide (texto QUEIMADO pelo modelo — PoC 2026-06-23) e
gera cada slide reusando a maquinaria provada (`executar_geracao_integrada`:
gpt-image-2 + MinIO + auditoria em criativo_geracoes). Débito por slide concluído
(estudio_wallet). Progresso publicado no Redis (best-effort) + persistido no DB
(fonte de verdade p/ reconexão via GET /{id}).

Fase 1 (núcleo): formato MESTRE, sem personagem (consistência cross-slide e
multiformato ficam como evolução — ver docs/specs/criativos-2/tasks.md).
"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy.orm import Session

from app.models.criativo import CriativoCarrossel, CriativoCarrosselSlide, CriativoGeracao
from app.services import image_gen
from app.services import estudio_wallet
from app.services.redis_pub import _get_redis

log = logging.getLogger(__name__)

# Tamanhos nativos do gpt-image-2 confirmados no PoC (multiplos de 16, ratio <=3:1).
_MASTER_SIZE = {
    "9x16": "1152x2048",
    "4x3": "2048x1536",
    "1x1": "1024x1024",
    "4x5": "1024x1280",
}


def _norm_format(fmt: str | None) -> str:
    return (fmt or "9x16").strip().lower().replace(":", "x")


def size_for(master_format: str | None) -> str:
    return _MASTER_SIZE.get(_norm_format(master_format), "1152x2048")


def _fator(quality: str | None) -> int:
    return 2 if (quality or "medium").strip().lower() == "high" else 1


def custo_carrossel(n_slides: int, quality: str | None, n_formatos: int = 1) -> int:
    """Custo em tokens do carrossel inteiro (slides x formatos x fator de qualidade)."""
    return max(0, int(n_slides)) * max(1, int(n_formatos)) * _fator(quality)


def _publish(carrossel_id, event: str, data: dict) -> None:
    """Publica progresso no Redis (best-effort; nunca quebra a geração)."""
    try:
        _get_redis().publish(
            f"carrossel:{carrossel_id}",
            json.dumps({"event": event, **data}),
        )
    except Exception as e:  # noqa: BLE001
        log.debug("[carrossel_gen] publish falhou: %s", e)


def _montar_prompt_slide(car: CriativoCarrossel, slide: CriativoCarrosselSlide) -> str:
    """Prompt newsjacking INTEGRADO (texto queimado) a partir da copy + direção.

    Reconstrói o prompt a cada geração para refletir edições do usuário na copy.
    """
    copy = slide.copy_json or {}
    paleta = (car.director_json or {}).get("paleta") or {}
    orient = "retrato 9:16" if _norm_format(car.master_format) == "9x16" else "paisagem 4:3" \
        if _norm_format(car.master_format) == "4x3" else "quadrado"

    L = [
        f"Slide de carrossel editorial de negocios (newsjacking), estilo revista, "
        f"alto contraste, proporcao {orient}.",
    ]
    if slide.image_prompt:
        L.append(f"Direcao visual: {slide.image_prompt}.")
    pal = []
    if paleta.get("tensao"):
        pal.append(f"fundo {paleta['tensao']} como cor dominante")
    if paleta.get("resolucao"):
        pal.append(f"{paleta['resolucao']} para resolucao/listas")
    if paleta.get("pivo"):
        pal.append(f"{paleta['pivo']} como cor-pivo de destaque")
    if pal:
        L.append("Paleta: " + "; ".join(pal) + ".")
    L.append("Tipografia: sans condensada black, ALL CAPS na palavra-bomba.")

    dj0 = car.director_json or {}
    _ESTILOS = {
        "integrado": "estilo artistico e INTEGRADO, com profundidade, textura e iluminacao rica (NAO chapado/flat)",
        "chapado": "estilo flat/chapado, cores solidas, vetorial e minimalista",
        "ilustracao": "ilustracao estilizada, com tracos e texturas autorais",
        "foto": "fotorrealista, editorial de alto contraste",
    }
    estilo = (dj0.get("estilo") or "").strip()
    if estilo:
        L.append("Estilo visual: " + _ESTILOS.get(estilo, estilo) + ".")
    estilo_ref = (dj0.get("estilo_referencia") or "").strip()
    if estilo_ref:
        L.append(
            "Siga FIELMENTE o estilo desta referencia (cores, composicao, clima, iluminacao): "
            + estilo_ref[:600]
            + ". Integre de forma artistica, com profundidade e textura, evitando aparencia chapada."
        )

    textos = []
    if copy.get("palavra_bomba"):
        textos.append(f'- palavra-bomba GIGANTE (domina >=40% do frame): "{copy["palavra_bomba"]}"')
    if copy.get("contexto"):
        textos.append(f'- contexto pequeno no topo: "{copy["contexto"]}"')
    if copy.get("selo"):
        textos.append(f'- selo de reforco (caixa): "{copy["selo"]}"')
    if copy.get("texto"):
        textos.append(f'- texto de apoio curto: "{copy["texto"]}"')
    if copy.get("cta_continuacao"):
        textos.append(f'- seta/CTA de continuacao no rodape: "{copy["cta_continuacao"]}"')
    if textos:
        L.append("Renderize, em portugues, integrados na arte e com GRAFIA CORRETA:")
        L.extend(textos)

    dj = car.director_json or {}
    personagens = [p for p in (dj.get("personagens") or []) if (p or {}).get("descricao")]
    objetos = [o for o in (dj.get("objetos") or []) if (o or {}).get("descricao")]
    if personagens:
        L.append(
            "PESSOA(S) REAL(IS): as fotos anexadas sao a MESMA pessoa de cada personagem. PRESERVE o "
            "rosto FIEL (formato, olhos, nariz, boca, tom de pele, cabelo, idade); a pessoa deve ser "
            "CLARAMENTE reconhecivel. NAO rejuvenesca, NAO embeleze, NAO troque etnia/genero. "
            "Personagens: " + "; ".join(p["descricao"] for p in personagens) + "."
        )
    if objetos:
        L.append("Inclua estes objetos/produtos integrados na arte: " + "; ".join(o["descricao"] for o in objetos) + ".")
    L.append(
        "Hierarquia clara (o olho cai na palavra-bomba primeiro), recorte limpo, sem poluicao. "
        "Sem marcas registradas." + ("" if personagens else " Sem pessoas reais reconheciveis.")
    )
    return "\n".join(L)


def gerar_slide(
    db: Session, car: CriativoCarrossel, slide: CriativoCarrosselSlide, quality: str,
    personagem_bytes: list[bytes] | None = None,
) -> CriativoGeracao:
    """Gera UM slide: cria a criativo_geracoes (prompt newsjacking), gera e linka."""
    prompt = _montar_prompt_slide(car, slide)
    ger = CriativoGeracao(
        workspace_id=car.workspace_id,
        user_id=car.user_id,
        briefing=car.tema,
        creative_format=car.master_format,
        generation_size=size_for(car.master_format),
        model=image_gen._image_model(),
        prompt_final=prompt,
        params_json={
            "modo": "carrossel",
            "carrossel_id": str(car.id),
            "slide_index": slide.slide_index,
            "quality": (quality or "medium"),
            "logo_mode": "compor",
        },
        status="pending",
    )
    db.add(ger)
    db.commit()
    db.refresh(ger)

    image_gen.executar_geracao_integrada(db, ger, personagem_bytes=personagem_bytes)  # ger.prompt_final + fotos

    slide.geracao_id = ger.id
    slide.base_image_url = ger.imagem_base_url
    slide.formatos_json = {**(slide.formatos_json or {}), _norm_format(car.master_format): ger.imagem_base_url} \
        if ger.imagem_base_url else (slide.formatos_json or {})
    slide.status = ger.status  # done | error
    db.commit()
    return ger


def gerar_carrossel(db: Session, car: CriativoCarrossel, quality: str = "medium",
                    personagem_bytes: list[bytes] | None = None) -> None:
    """Gera todos os slides do carrossel (formato mestre). Idempotente por status.

    Pré-cheque de saldo do carrossel inteiro; débito SÓ por slide concluído.
    Persiste status no DB e publica progresso por-slide no Redis. Pode ser chamada
    pelo worker (poll de status='queued') ou por uma thread do endpoint.
    """
    slides = (
        db.query(CriativoCarrosselSlide)
        .filter(CriativoCarrosselSlide.carrossel_id == car.id)
        .order_by(CriativoCarrosselSlide.slide_index.asc())
        .all()
    )
    custo = custo_carrossel(len(slides), quality)
    if not estudio_wallet.tem_saldo(db, car.workspace_id, custo):
        car.status = "error"
        car.error_code = "saldo_insuficiente"
        car.error_message = (
            f"Saldo insuficiente: o carrossel custa {custo} token(s) e o saldo e "
            f"{estudio_wallet.saldo(db, car.workspace_id)}."
        )
        db.commit()
        _publish(car.id, "carrossel.failed", {"error_code": car.error_code, "error_message": car.error_message})
        return

    car.status = "running"
    car.error_code = None
    car.error_message = None
    db.commit()
    total = len(slides)
    _publish(car.id, "carrossel.created", {"carrossel_id": str(car.id), "total": total})

    concluidos = 0
    for slide in slides:
        if slide.status == "done":  # já gerado (regeneração parcial)
            concluidos += 1
            continue
        slide.status = "running"
        db.commit()
        _publish(car.id, "carrossel.slide.start", {"index": slide.slide_index, "total": total})

        ger = gerar_slide(db, car, slide, quality, personagem_bytes)

        if ger.status == "done":
            estudio_wallet.debitar(
                db, car.workspace_id, _fator(quality),
                "Geracao de slide (carrossel)", referencia=str(ger.id), origem="consumo",
            )
            concluidos += 1
            _publish(car.id, "carrossel.slide.done", {
                "index": slide.slide_index, "total": total, "url": ger.imagem_base_url,
            })
        else:
            _publish(car.id, "carrossel.slide.error", {
                "index": slide.slide_index, "total": total,
                "error_code": ger.error_code, "error_message": ger.error_message,
            })

    car.status = "done" if concluidos == total else ("error" if concluidos == 0 else "parcial")
    db.commit()
    _publish(car.id, "carrossel.completed", {
        "carrossel_id": str(car.id), "status": car.status, "concluidos": concluidos, "total": total,
    })


def regenerar_slide(db: Session, car: CriativoCarrossel, slide_index: int, quality: str = "medium",
                    personagem_bytes: list[bytes] | None = None) -> CriativoGeracao:
    """Regenera UM slide isolado (não refaz o carrossel). Débito só no sucesso."""
    slide = (
        db.query(CriativoCarrosselSlide)
        .filter(
            CriativoCarrosselSlide.carrossel_id == car.id,
            CriativoCarrosselSlide.slide_index == slide_index,
        )
        .first()
    )
    if slide is None:
        raise ValueError(f"slide {slide_index} não encontrado no carrossel {car.id}")

    custo = _fator(quality)
    if not estudio_wallet.tem_saldo(db, car.workspace_id, custo):
        raise PermissionError("saldo_insuficiente")

    slide.status = "running"
    db.commit()
    ger = gerar_slide(db, car, slide, quality, personagem_bytes)
    if ger.status == "done":
        estudio_wallet.debitar(
            db, car.workspace_id, custo, "Regeneracao de slide (carrossel)",
            referencia=str(ger.id), origem="consumo",
        )
        _publish(car.id, "carrossel.slide.done", {"index": slide_index, "url": ger.imagem_base_url})
    else:
        _publish(car.id, "carrossel.slide.error", {
            "index": slide_index, "error_code": ger.error_code, "error_message": ger.error_message,
        })
    return ger
