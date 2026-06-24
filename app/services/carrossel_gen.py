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
import time
import uuid

from sqlalchemy.orm import Session

from app.models.criativo import CriativoCarrossel, CriativoCarrosselSlide, CriativoGeracao
from app.services import image_gen
from app.services import estudio_wallet
from app.services.redis_pub import _get_redis

log = logging.getLogger(__name__)

# Erros que valem retry (transitórios do provedor); o resto é determinístico.
_TRANSITORIOS = {"provider_error", "timeout", "rate_limited"}

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


def _montar_prompt_slide(
    car: CriativoCarrossel, slide: CriativoCarrosselSlide,
    pers_items: list[dict] | None = None, obj_items: list[dict] | None = None,
    tem_modelo_img: bool = False,
) -> str:
    """Prompt newsjacking INTEGRADO (texto queimado) a partir da copy + direção.

    Reconstrói o prompt a cada geração para refletir edições do usuário na copy.
    `pers_items`/`obj_items`: refs RESOLVIDAS deste slide (cada item tem `descricao`
    e `foto`='personagem_N'/'objeto_N' alinhado à imagem enviada ao modelo, ou None
    quando é só descrição) — ver `_resolver_refs_slide`.
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
        L.append(f"Direcao visual (SIGA EXATAMENTE — ela manda na composicao da imagem): {slide.image_prompt}.")
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
    # estilo_referencia POR SLIDE (modo "1 modelo por slide") tem prioridade sobre o global.
    _sd = next((s for s in (dj0.get("slides") or [])
                if int((s or {}).get("index", -1)) == slide.slide_index), {}) or {}
    estilo_ref = (_sd.get("estilo_referencia") or dj0.get("estilo_referencia") or "").strip()
    if estilo_ref:
        L.append(
            "Siga FIELMENTE o estilo desta referencia (cores, composicao, clima, iluminacao): "
            + estilo_ref[:600]
            + ". Integre de forma artistica, com profundidade e textura, evitando aparencia chapada."
        )
    if tem_modelo_img:
        L.append(
            "MODELO DE REFERENCIA: ha uma imagem-modelo ANEXADA (referencia.png). Siga-a FIELMENTE "
            "como guia de estilo, composicao, cores, clima e tipografia; adapte o conteudo deste "
            "slide a esse modelo, mantendo a mesma linha visual."
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
        L.append("Renderize EXATAMENTE estes textos, palavra por palavra (NAO troque, traduza, abrevie nem parafraseie; grafia identica), integrados na arte:")
        L.extend(textos)

    # Personagens/objetos: cada FOTO é uma pessoa/objeto DISTINTO (mapeamento foto->item).
    pers_items = pers_items or []
    obj_items = obj_items or []
    pers_com = [p for p in pers_items if p.get("foto")]
    pers_sem = [p for p in pers_items if not p.get("foto") and (p.get("descricao") or "").strip()]
    if pers_com:
        mapa = "; ".join(f'{p["foto"]} = {(p.get("descricao") or "").strip() or "a pessoa da foto"}'
                         for p in pers_com)
        L.append(
            "PESSOAS REAIS: cada foto anexada e uma PESSOA DISTINTA. Mapeamento -> " + mapa + ". "
            "Para CADA pessoa, preserve o ROSTO FIEL da sua respectiva foto (formato do rosto, olhos, "
            "nariz, boca, tom de pele, cabelo, idade); cada uma deve ser CLARAMENTE reconhecivel. "
            "NAO funda as pessoas, NAO troque rostos entre as fotos, NAO duplique a mesma pessoa, "
            "NAO rejuvenesca, NAO embeleze, NAO mude etnia/genero."
        )
    if pers_sem:
        L.append("Personagens adicionais (sem foto, crie coerentes): "
                 + "; ".join((p.get("descricao") or "").strip() for p in pers_sem) + ".")
    obj_com = [o for o in obj_items if o.get("foto")]
    obj_sem = [o for o in obj_items if not o.get("foto") and (o.get("descricao") or "").strip()]
    if obj_com:
        mapa = "; ".join(f'{o["foto"]} = {(o.get("descricao") or "").strip() or "o objeto da foto"}'
                         for o in obj_com)
        L.append("OBJETOS/PRODUTOS REAIS (imagens anexadas): " + mapa + ". Integre cada objeto na arte "
                 "com FIDELIDADE ao formato/cor/marca da sua foto, sem inventar variacoes.")
    if obj_sem:
        L.append("Objetos adicionais (sem foto): "
                 + "; ".join((o.get("descricao") or "").strip() for o in obj_sem) + ".")
    tem_pessoa = bool(pers_com or pers_sem)
    L.append(
        "Hierarquia clara (o olho cai na palavra-bomba primeiro), recorte limpo, sem poluicao. "
        "Sem marcas registradas." + ("" if tem_pessoa else " Sem pessoas reais reconheciveis.")
    )
    return "\n".join(L)


def _resolver_refs_slide(
    car: CriativoCarrossel, slide: CriativoCarrosselSlide,
    personagens_bytes: dict[int, bytes] | None = None,
    objetos_bytes: dict[int, bytes] | None = None,
) -> tuple[list[dict], list[bytes], list[dict], list[bytes]]:
    """Resolve as refs DESTE slide a partir do pool (director_json) + seleção por slide.

    Seleção em `director_json.slides[i].personagens_idx/objetos_idx` (índices no pool);
    ausente => usa TODO o pool (compat. Fase 1, front ainda global). Devolve, alinhados:
    (pers_items, pers_blist, obj_items, obj_blist) — o rótulo `foto` de cada item casa
    com a posição em `*_blist` (que vai, na mesma ordem, para `images.edit`).
    """
    dj = car.director_json or {}
    sd = next((s for s in (dj.get("slides") or [])
               if int((s or {}).get("index", -1)) == slide.slide_index), {}) or {}

    def _resolve(pool_key: str, sel_key: str, bmap: dict | None, prefix: str):
        pool = dj.get(pool_key) or []
        sel = sd.get(sel_key)
        idxs = sel if isinstance(sel, list) else list(range(len(pool)))
        items: list[dict] = []
        blist: list[bytes] = []
        k = 0
        for i in idxs:
            if not isinstance(i, int) or i < 0 or i >= len(pool):
                continue
            desc = ((pool[i] or {}).get("descricao") or "").strip()
            b = (bmap or {}).get(i)
            if b is not None:
                k += 1
                items.append({"descricao": desc, "foto": f"{prefix}_{k}"})
                blist.append(b)
            elif desc:
                items.append({"descricao": desc, "foto": None})
        return items, blist

    pers_items, pers_blist = _resolve("personagens", "personagens_idx", personagens_bytes, "personagem")
    obj_items, obj_blist = _resolve("objetos", "objetos_idx", objetos_bytes, "objeto")
    return pers_items, pers_blist, obj_items, obj_blist


def gerar_slide(
    db: Session, car: CriativoCarrossel, slide: CriativoCarrosselSlide, quality: str,
    personagens_bytes: dict[int, bytes] | None = None,
    objetos_bytes: dict[int, bytes] | None = None,
    modelo_geral_bytes: bytes | None = None,
    modelos_slide_bytes: dict[int, bytes] | None = None,
) -> CriativoGeracao:
    """Gera UM slide: cria a criativo_geracoes (prompt newsjacking), gera e linka.

    Cada slide manda ao modelo SÓ as fotos dos personagens/objetos que ele referencia
    (resolvidas do pool), com rótulo foto->item para preservar cada rosto fiel.
    """
    pers_items, pers_blist, obj_items, obj_blist = _resolver_refs_slide(
        car, slide, personagens_bytes, objetos_bytes)
    modelo_img = (modelos_slide_bytes or {}).get(slide.slide_index) or modelo_geral_bytes
    prompt = _montar_prompt_slide(car, slide, pers_items, obj_items, tem_modelo_img=bool(modelo_img))
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

    # Geração com retry curto SÓ p/ erros transitórios (502/timeout/rate-limit);
    # NUNCA re-tenta blocked_by_policy/invalid_prompt (determinísticos).
    for tentativa in range(1, 4):
        image_gen.executar_geracao_integrada(
            db, ger, personagem_bytes=pers_blist or None, objeto_bytes=obj_blist or None,
            referencia_bytes=modelo_img,
        )  # ger.prompt_final + fotos + modelo (referencia.png)
        if ger.status == "done" or ger.error_code not in _TRANSITORIOS or tentativa == 3:
            break
        log.info("[carrossel_gen] slide %s retry %s (transitório: %s)",
                 slide.slide_index, tentativa, ger.error_code)
        time.sleep(min(2 * tentativa, 5))

    slide.geracao_id = ger.id
    slide.base_image_url = ger.imagem_base_url
    slide.formatos_json = {**(slide.formatos_json or {}), _norm_format(car.master_format): ger.imagem_base_url} \
        if ger.imagem_base_url else (slide.formatos_json or {})
    slide.status = ger.status  # done | error
    db.commit()
    return ger


def gerar_carrossel(db: Session, car: CriativoCarrossel, quality: str = "medium",
                    personagens_bytes: dict[int, bytes] | None = None,
                    objetos_bytes: dict[int, bytes] | None = None,
                    modelo_geral_bytes: bytes | None = None,
                    modelos_slide_bytes: dict[int, bytes] | None = None) -> None:
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

        ger = gerar_slide(db, car, slide, quality, personagens_bytes, objetos_bytes,
                          modelo_geral_bytes, modelos_slide_bytes)

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
                    personagens_bytes: dict[int, bytes] | None = None,
                    objetos_bytes: dict[int, bytes] | None = None,
                    modelo_geral_bytes: bytes | None = None,
                    modelos_slide_bytes: dict[int, bytes] | None = None) -> CriativoGeracao:
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

    # Re-sincroniza copy/direção/intensidade deste slide a partir do roteiro editado
    # (director_json) — o front salva o roteiro antes de regenerar, então a regeneração
    # reflete a edição (inclusive remoção da palavra-bomba, que sai do prompt).
    dj = car.director_json or {}
    sd = next((s for s in (dj.get("slides") or [])
               if int((s or {}).get("index", -1)) == slide_index), None)
    if sd is not None:
        slide.copy_json = sd.get("copy") or {}
        slide.image_prompt = sd.get("direcao_imagem")
        slide.intensidade = sd.get("intensidade")

    custo = _fator(quality)
    if not estudio_wallet.tem_saldo(db, car.workspace_id, custo):
        raise PermissionError("saldo_insuficiente")

    slide.status = "running"
    db.commit()
    ger = gerar_slide(db, car, slide, quality, personagens_bytes, objetos_bytes,
                      modelo_geral_bytes, modelos_slide_bytes)
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
