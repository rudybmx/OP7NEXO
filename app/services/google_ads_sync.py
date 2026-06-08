"""Serviço de sincronização Google Ads → tabelas google_*_insights."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Callable

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.ads_account import AdsAccount
from app.models.google_ads_credential import GoogleAdsCredential


def sincronizar_conta_google(
    ads_account_id: str,
    db: Session,
    on_progress: Callable[[str, int], None] | None = None,
) -> dict:
    """Sincroniza uma conta Google Ads e persiste nas tabelas de insights.

    Usa Janela Dinâmica: descobre automaticamente o período de atividade
    real da conta antes de sincronizar. Retorna totais para o sync_job.
    """
    def _prog(etapa: str, pct: int) -> None:
        if on_progress:
            on_progress(etapa, pct)

    # ── Carregar conta e credencial ──────────────────────────────────────
    _prog("carregando_conta", 2)
    conta = db.get(AdsAccount, uuid.UUID(ads_account_id))
    if not conta or conta.plataforma != "google":
        raise ValueError(f"Conta {ads_account_id} não é do Google Ads")

    cred_id = conta.config.get("credential_id")
    if not cred_id:
        raise ValueError("Conta sem credential_id no campo config")

    cred = db.get(GoogleAdsCredential, uuid.UUID(cred_id))
    if not cred or not cred.ativo:
        raise ValueError("Credencial Google Ads não encontrada ou inativa")

    cred_dict = {
        "developer_token": cred.developer_token,
        "client_id": cred.client_id,
        "client_secret": cred.client_secret,
        "refresh_token": cred.refresh_token,
        "manager_customer_id": cred.manager_customer_id,
    }
    customer_id = conta.account_id
    workspace_id = str(conta.workspace_id)

    # ── Descobrir janela de sync (âncora dinâmica) ────────────────────────
    _prog("descobrindo_janela", 6)
    from app.services.google_ads_client import buscar_dados_conta, descobrir_janela_sync
    start_str, end_str = descobrir_janela_sync(cred_dict, customer_id)

    # ── Buscar dados da API ───────────────────────────────────────────────
    _prog("consultando_google_api", 10)
    dados = buscar_dados_conta(cred_dict, customer_id, start=start_str, end=end_str)

    periodo_inicio = date.fromisoformat(dados["periodo"]["start"])
    periodo_fim = date.fromisoformat(dados["periodo"]["end"])

    # ── Limpar dados anteriores (janela dinâmica — wipe + reinserção) ─────
    _prog("limpando_dados_anteriores", 25)
    _limpar_janela(db, ads_account_id, start_str, end_str)

    _prog("persistindo_campanhas", 30)
    _upsert_campanhas(db, dados["campanhas"], ads_account_id, workspace_id, periodo_inicio, periodo_fim)

    _prog("persistindo_grupos", 45)
    _upsert_grupos(db, dados["grupos"], ads_account_id, workspace_id, periodo_inicio, periodo_fim)

    _prog("persistindo_keywords", 58)
    _upsert_keywords(db, dados["keywords"], ads_account_id, workspace_id, periodo_inicio, periodo_fim)

    _prog("persistindo_anuncios", 70)
    _upsert_anuncios(db, dados["anuncios"], ads_account_id, workspace_id, periodo_inicio, periodo_fim)

    _prog("persistindo_publicos", 80)
    _upsert_publicos(db, dados["publicos"], ads_account_id, workspace_id, periodo_inicio, periodo_fim)

    _prog("persistindo_diarios", 88)
    _upsert_diarios(db, dados["dados_diarios"], ads_account_id, workspace_id)
    _upsert_grupos_diarios(db, dados.get("grupos_diarios", []), ads_account_id, workspace_id)
    _upsert_keywords_diarios(db, dados.get("keywords_diarios", []), ads_account_id, workspace_id)
    _upsert_anuncios_diarios(db, dados.get("anuncios_diarios", []), ads_account_id, workspace_id)
    _upsert_publicos_diarios(db, dados.get("publicos_diarios", []), ads_account_id, workspace_id)

    # ── Atualiza timestamp da conta ───────────────────────────────────────
    _prog("finalizando", 95)
    db.execute(
        text("UPDATE ads_accounts SET sincronizado_em = NOW() WHERE id = :id"),
        {"id": ads_account_id},
    )
    db.commit()

    totais = {
        "campanhas": len(dados["campanhas"]),
        "grupos": len(dados["grupos"]),
        "keywords": len(dados["keywords"]),
        "anuncios": len(dados["anuncios"]),
        "publicos": len(dados["publicos"]),
        "dados_diarios": len(dados["dados_diarios"]),
    }
    _prog("concluido", 100)
    return totais


def _limpar_janela(db, ads_account_id: str, start_str: str, end_str: str) -> None:
    """Limpa dados anteriores antes de reinserir.

    Tabelas agregadas: wipe completo por conta (fonte única de verdade).
    Tabela diária: DELETE por range de datas (preserva dados fora da janela).
    """
    for tabela in (
        "google_campanhas_insights",
        "google_grupos_insights",
        "google_keywords_insights",
        "google_anuncios_insights",
        "google_publicos_insights",
    ):
        db.execute(text(f"DELETE FROM {tabela} WHERE ads_account_id = :aid"), {"aid": ads_account_id})

    # Tabelas diárias por entidade: DELETE por range (preserva fora da janela)
    for tabela in (
        "google_dados_diarios",
        "google_grupos_diarios",
        "google_keywords_diarios",
        "google_anuncios_diarios",
        "google_publicos_diarios",
    ):
        db.execute(text(f"""
            DELETE FROM {tabela}
            WHERE ads_account_id = :aid AND data BETWEEN :start AND :end
        """), {"aid": ads_account_id, "start": start_str, "end": end_str})

    db.commit()


def _upsert_campanhas(db, campanhas, ads_account_id, workspace_id, p_ini, p_fim):
    for c in campanhas:
        db.execute(text("""
            INSERT INTO google_campanhas_insights
                (workspace_id, ads_account_id, customer_id, campaign_id, campaign_name,
                 tipo_campanha, status, orcamento_diario,
                 investimento, cliques, impressoes, conversoes, valor_conversoes,
                 ctr, cpc_medio, cpm, roas, taxa_conversao, custo_conversao,
                 impression_share, is_perdido_budget, is_perdido_rank, absolute_top_is,
                 quality_score_medio, periodo_inicio, periodo_fim, sincronizado_em)
            VALUES
                (:wid, :aid, :customer_id, :campaign_id, :campaign_name,
                 :tipo_campanha, :status, :orcamento_diario,
                 :investimento, :cliques, :impressoes, :conversoes, :valor_conversoes,
                 :ctr, :cpc_medio, :cpm, :roas, :taxa_conversao, :custo_conversao,
                 :impression_share, :is_perdido_budget, :is_perdido_rank, :absolute_top_is,
                 :quality_score_medio, :periodo_inicio, :periodo_fim, NOW())
            ON CONFLICT (ads_account_id, campaign_id, periodo_inicio, periodo_fim)
            DO UPDATE SET
                campaign_name = EXCLUDED.campaign_name,
                status = EXCLUDED.status,
                orcamento_diario = EXCLUDED.orcamento_diario,
                investimento = EXCLUDED.investimento,
                cliques = EXCLUDED.cliques,
                impressoes = EXCLUDED.impressoes,
                conversoes = EXCLUDED.conversoes,
                valor_conversoes = EXCLUDED.valor_conversoes,
                ctr = EXCLUDED.ctr, cpc_medio = EXCLUDED.cpc_medio,
                cpm = EXCLUDED.cpm, roas = EXCLUDED.roas,
                taxa_conversao = EXCLUDED.taxa_conversao,
                custo_conversao = EXCLUDED.custo_conversao,
                impression_share = EXCLUDED.impression_share,
                is_perdido_budget = EXCLUDED.is_perdido_budget,
                is_perdido_rank = EXCLUDED.is_perdido_rank,
                absolute_top_is = EXCLUDED.absolute_top_is,
                quality_score_medio = EXCLUDED.quality_score_medio,
                sincronizado_em = NOW()
        """), {
            "wid": workspace_id, "aid": ads_account_id,
            "customer_id": c.get("customer_id", ""),
            "campaign_id": c["campaign_id"], "campaign_name": c.get("campaign_name"),
            "tipo_campanha": c.get("tipo_campanha"), "status": c.get("status"),
            "orcamento_diario": c.get("orcamento_diario", 0),
            "investimento": c.get("investimento", 0),
            "cliques": c.get("cliques", 0), "impressoes": c.get("impressoes", 0),
            "conversoes": c.get("conversoes", 0), "valor_conversoes": c.get("valor_conversoes", 0),
            "ctr": c.get("ctr", 0), "cpc_medio": c.get("cpc_medio", 0),
            "cpm": c.get("cpm", 0), "roas": c.get("roas", 0),
            "taxa_conversao": c.get("taxa_conversao", 0),
            "custo_conversao": c.get("custo_conversao", 0),
            "impression_share": c.get("impression_share", 0),
            "is_perdido_budget": c.get("is_perdido_budget", 0),
            "is_perdido_rank": c.get("is_perdido_rank", 0),
            "absolute_top_is": c.get("absolute_top_is", 0),
            "quality_score_medio": c.get("quality_score_medio", 0),
            "periodo_inicio": p_ini, "periodo_fim": p_fim,
        })
    db.commit()


def _upsert_grupos(db, grupos, ads_account_id, workspace_id, p_ini, p_fim):
    for g in grupos:
        db.execute(text("""
            INSERT INTO google_grupos_insights
                (workspace_id, ads_account_id, campaign_id, grupo_id, grupo_nome,
                 status, is_pmax, tipo_grupo, estrategia_lance,
                 target_cpa, target_roas,
                 investimento, cliques, impressoes, conversoes, valor_conversoes,
                 ctr, cpc_medio, cpm, roas, taxa_conversao, custo_conversao,
                 periodo_inicio, periodo_fim, sincronizado_em)
            VALUES
                (:wid, :aid, :campaign_id, :grupo_id, :grupo_nome,
                 :status, :is_pmax, :tipo_grupo, :estrategia_lance,
                 :target_cpa, :target_roas,
                 :investimento, :cliques, :impressoes, :conversoes, :valor_conversoes,
                 :ctr, :cpc_medio, :cpm, :roas, :taxa_conversao, :custo_conversao,
                 :periodo_inicio, :periodo_fim, NOW())
            ON CONFLICT (ads_account_id, grupo_id, tipo_grupo, periodo_inicio, periodo_fim)
            DO UPDATE SET
                grupo_nome = EXCLUDED.grupo_nome, status = EXCLUDED.status,
                investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
                impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
                valor_conversoes = EXCLUDED.valor_conversoes,
                ctr = EXCLUDED.ctr, cpc_medio = EXCLUDED.cpc_medio,
                cpm = EXCLUDED.cpm, roas = EXCLUDED.roas,
                taxa_conversao = EXCLUDED.taxa_conversao,
                custo_conversao = EXCLUDED.custo_conversao,
                sincronizado_em = NOW()
        """), {
            "wid": workspace_id, "aid": ads_account_id,
            "campaign_id": g["campaign_id"], "grupo_id": g["grupo_id"],
            "grupo_nome": g.get("grupo_nome"), "status": g.get("status"),
            "is_pmax": g.get("is_pmax", False), "tipo_grupo": g.get("tipo_grupo"),
            "estrategia_lance": g.get("estrategia_lance"),
            "target_cpa": g.get("target_cpa"), "target_roas": g.get("target_roas"),
            "investimento": g.get("investimento", 0), "cliques": g.get("cliques", 0),
            "impressoes": g.get("impressoes", 0), "conversoes": g.get("conversoes", 0),
            "valor_conversoes": g.get("valor_conversoes", 0),
            "ctr": g.get("ctr", 0), "cpc_medio": g.get("cpc_medio", 0),
            "cpm": g.get("cpm", 0), "roas": g.get("roas", 0),
            "taxa_conversao": g.get("taxa_conversao", 0),
            "custo_conversao": g.get("custo_conversao", 0),
            "periodo_inicio": p_ini, "periodo_fim": p_fim,
        })
    db.commit()


def _upsert_keywords(db, keywords, ads_account_id, workspace_id, p_ini, p_fim):
    for k in keywords:
        db.execute(text("""
            INSERT INTO google_keywords_insights
                (workspace_id, ads_account_id, campaign_id, ad_group_id, criterion_id,
                 keyword_text, match_type, quality_score,
                 investimento, cliques, impressoes, conversoes,
                 ctr, cpc_medio, custo_conversao,
                 periodo_inicio, periodo_fim, sincronizado_em)
            VALUES
                (:wid, :aid, :campaign_id, :ad_group_id, :criterion_id,
                 :keyword_text, :match_type, :quality_score,
                 :investimento, :cliques, :impressoes, :conversoes,
                 :ctr, :cpc_medio, :custo_conversao,
                 :periodo_inicio, :periodo_fim, NOW())
            ON CONFLICT (ads_account_id, criterion_id, periodo_inicio, periodo_fim)
            DO UPDATE SET
                quality_score = EXCLUDED.quality_score,
                investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
                impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
                ctr = EXCLUDED.ctr, cpc_medio = EXCLUDED.cpc_medio,
                custo_conversao = EXCLUDED.custo_conversao,
                sincronizado_em = NOW()
        """), {
            "wid": workspace_id, "aid": ads_account_id,
            "campaign_id": k["campaign_id"], "ad_group_id": k["ad_group_id"],
            "criterion_id": k["criterion_id"], "keyword_text": k.get("keyword_text"),
            "match_type": k.get("match_type"), "quality_score": k.get("quality_score", 0),
            "investimento": k.get("investimento", 0), "cliques": k.get("cliques", 0),
            "impressoes": k.get("impressoes", 0), "conversoes": k.get("conversoes", 0),
            "ctr": k.get("ctr", 0), "cpc_medio": k.get("cpc_medio", 0),
            "custo_conversao": k.get("custo_conversao", 0),
            "periodo_inicio": p_ini, "periodo_fim": p_fim,
        })
    db.commit()


def _upsert_anuncios(db, anuncios, ads_account_id, workspace_id, p_ini, p_fim):
    for a in anuncios:
        db.execute(text("""
            INSERT INTO google_anuncios_insights
                (workspace_id, ads_account_id, campaign_id, ad_group_id, ad_id,
                 titulo, tipo_anuncio, ad_strength, status,
                 investimento, cliques, impressoes, conversoes,
                 ctr, cpc_medio, custo_conversao,
                 periodo_inicio, periodo_fim, sincronizado_em)
            VALUES
                (:wid, :aid, :campaign_id, :ad_group_id, :ad_id,
                 :titulo, :tipo_anuncio, :ad_strength, :status,
                 :investimento, :cliques, :impressoes, :conversoes,
                 :ctr, :cpc_medio, :custo_conversao,
                 :periodo_inicio, :periodo_fim, NOW())
            ON CONFLICT (ads_account_id, ad_id, periodo_inicio, periodo_fim)
            DO UPDATE SET
                ad_strength = EXCLUDED.ad_strength, status = EXCLUDED.status,
                investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
                impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
                ctr = EXCLUDED.ctr, cpc_medio = EXCLUDED.cpc_medio,
                custo_conversao = EXCLUDED.custo_conversao,
                sincronizado_em = NOW()
        """), {
            "wid": workspace_id, "aid": ads_account_id,
            "campaign_id": a["campaign_id"], "ad_group_id": a["ad_group_id"],
            "ad_id": a["ad_id"], "titulo": a.get("titulo"),
            "tipo_anuncio": a.get("tipo_anuncio"), "ad_strength": a.get("ad_strength"),
            "status": a.get("status"),
            "investimento": a.get("investimento", 0), "cliques": a.get("cliques", 0),
            "impressoes": a.get("impressoes", 0), "conversoes": a.get("conversoes", 0),
            "ctr": a.get("ctr", 0), "cpc_medio": a.get("cpc_medio", 0),
            "custo_conversao": a.get("custo_conversao", 0),
            "periodo_inicio": p_ini, "periodo_fim": p_fim,
        })
    db.commit()


def _upsert_publicos(db, publicos, ads_account_id, workspace_id, p_ini, p_fim):
    for p in publicos:
        db.execute(text("""
            INSERT INTO google_publicos_insights
                (workspace_id, ads_account_id, campaign_id, criterion_id, audience_name,
                 leads, investimento, cpl, ctr, percentual,
                 periodo_inicio, periodo_fim, sincronizado_em)
            VALUES
                (:wid, :aid, :campaign_id, :criterion_id, :audience_name,
                 :leads, :investimento, :cpl, :ctr, :percentual,
                 :periodo_inicio, :periodo_fim, NOW())
            ON CONFLICT (ads_account_id, criterion_id, periodo_inicio, periodo_fim)
            DO UPDATE SET
                leads = EXCLUDED.leads, investimento = EXCLUDED.investimento,
                cpl = EXCLUDED.cpl, ctr = EXCLUDED.ctr, percentual = EXCLUDED.percentual,
                sincronizado_em = NOW()
        """), {
            "wid": workspace_id, "aid": ads_account_id,
            "campaign_id": p["campaign_id"], "criterion_id": p["criterion_id"],
            "audience_name": p.get("audience_name"),
            "leads": p.get("leads", 0), "investimento": p.get("investimento", 0),
            "cpl": p.get("cpl", 0), "ctr": p.get("ctr", 0), "percentual": p.get("percentual", 0),
            "periodo_inicio": p_ini, "periodo_fim": p_fim,
        })
    db.commit()


def _upsert_diarios(db, diarios, ads_account_id, workspace_id):
    if not diarios:
        return
    params = [{
        "wid": workspace_id, "aid": ads_account_id,
        "campaign_id": d["campaign_id"], "data": d["data"],
        "cliques": d.get("cliques", 0), "impressoes": d.get("impressoes", 0),
        "conversoes": d.get("conversoes", 0),
        "valor_conversoes": d.get("valor_conversoes", 0),
        "custo": d.get("custo", 0), "ctr": d.get("ctr", 0),
    } for d in diarios]
    db.execute(text("""
        INSERT INTO google_dados_diarios
            (workspace_id, ads_account_id, campaign_id, data,
             cliques, impressoes, conversoes, valor_conversoes, custo, ctr, sincronizado_em)
        VALUES
            (:wid, :aid, :campaign_id, :data,
             :cliques, :impressoes, :conversoes, :valor_conversoes, :custo, :ctr, NOW())
        ON CONFLICT (ads_account_id, campaign_id, data)
        DO UPDATE SET
            cliques = EXCLUDED.cliques, impressoes = EXCLUDED.impressoes,
            conversoes = EXCLUDED.conversoes, valor_conversoes = EXCLUDED.valor_conversoes,
            custo = EXCLUDED.custo, ctr = EXCLUDED.ctr, sincronizado_em = NOW()
    """), params)
    db.commit()


def _upsert_grupos_diarios(db, diarios, ads_account_id, workspace_id):
    if not diarios:
        return
    params = [{
        "wid": workspace_id, "aid": ads_account_id,
        "campaign_id": d["campaign_id"], "grupo_id": d["grupo_id"],
        "tipo_grupo": d.get("tipo_grupo", "AD_GROUP"), "data": d["data"],
        "investimento": d.get("investimento", 0), "cliques": d.get("cliques", 0),
        "impressoes": d.get("impressoes", 0), "conversoes": d.get("conversoes", 0),
        "valor_conversoes": d.get("valor_conversoes", 0),
    } for d in diarios]
    db.execute(text("""
        INSERT INTO google_grupos_diarios
            (workspace_id, ads_account_id, campaign_id, grupo_id, tipo_grupo, data,
             investimento, cliques, impressoes, conversoes, valor_conversoes, sincronizado_em)
        VALUES
            (:wid, :aid, :campaign_id, :grupo_id, :tipo_grupo, :data,
             :investimento, :cliques, :impressoes, :conversoes, :valor_conversoes, NOW())
        ON CONFLICT (ads_account_id, grupo_id, tipo_grupo, data)
        DO UPDATE SET
            campaign_id = EXCLUDED.campaign_id,
            investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
            impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
            valor_conversoes = EXCLUDED.valor_conversoes, sincronizado_em = NOW()
    """), params)
    db.commit()


def _upsert_keywords_diarios(db, diarios, ads_account_id, workspace_id):
    if not diarios:
        return
    params = [{
        "wid": workspace_id, "aid": ads_account_id,
        "campaign_id": d["campaign_id"], "ad_group_id": d["ad_group_id"],
        "criterion_id": d["criterion_id"], "data": d["data"],
        "investimento": d.get("investimento", 0), "cliques": d.get("cliques", 0),
        "impressoes": d.get("impressoes", 0), "conversoes": d.get("conversoes", 0),
        "valor_conversoes": d.get("valor_conversoes", 0),
    } for d in diarios]
    db.execute(text("""
        INSERT INTO google_keywords_diarios
            (workspace_id, ads_account_id, campaign_id, ad_group_id, criterion_id, data,
             investimento, cliques, impressoes, conversoes, valor_conversoes, sincronizado_em)
        VALUES
            (:wid, :aid, :campaign_id, :ad_group_id, :criterion_id, :data,
             :investimento, :cliques, :impressoes, :conversoes, :valor_conversoes, NOW())
        ON CONFLICT (ads_account_id, criterion_id, data)
        DO UPDATE SET
            campaign_id = EXCLUDED.campaign_id, ad_group_id = EXCLUDED.ad_group_id,
            investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
            impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
            valor_conversoes = EXCLUDED.valor_conversoes, sincronizado_em = NOW()
    """), params)
    db.commit()


def _upsert_anuncios_diarios(db, diarios, ads_account_id, workspace_id):
    if not diarios:
        return
    params = [{
        "wid": workspace_id, "aid": ads_account_id,
        "campaign_id": d["campaign_id"], "ad_group_id": d["ad_group_id"],
        "ad_id": d["ad_id"], "data": d["data"],
        "investimento": d.get("investimento", 0), "cliques": d.get("cliques", 0),
        "impressoes": d.get("impressoes", 0), "conversoes": d.get("conversoes", 0),
        "valor_conversoes": d.get("valor_conversoes", 0),
    } for d in diarios]
    db.execute(text("""
        INSERT INTO google_anuncios_diarios
            (workspace_id, ads_account_id, campaign_id, ad_group_id, ad_id, data,
             investimento, cliques, impressoes, conversoes, valor_conversoes, sincronizado_em)
        VALUES
            (:wid, :aid, :campaign_id, :ad_group_id, :ad_id, :data,
             :investimento, :cliques, :impressoes, :conversoes, :valor_conversoes, NOW())
        ON CONFLICT (ads_account_id, ad_id, data)
        DO UPDATE SET
            campaign_id = EXCLUDED.campaign_id, ad_group_id = EXCLUDED.ad_group_id,
            investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
            impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
            valor_conversoes = EXCLUDED.valor_conversoes, sincronizado_em = NOW()
    """), params)
    db.commit()


def _upsert_publicos_diarios(db, diarios, ads_account_id, workspace_id):
    if not diarios:
        return
    params = [{
        "wid": workspace_id, "aid": ads_account_id,
        "campaign_id": d["campaign_id"], "criterion_id": d["criterion_id"], "data": d["data"],
        "investimento": d.get("investimento", 0), "cliques": d.get("cliques", 0),
        "impressoes": d.get("impressoes", 0), "conversoes": d.get("conversoes", 0),
    } for d in diarios]
    db.execute(text("""
        INSERT INTO google_publicos_diarios
            (workspace_id, ads_account_id, campaign_id, criterion_id, data,
             investimento, cliques, impressoes, conversoes, sincronizado_em)
        VALUES
            (:wid, :aid, :campaign_id, :criterion_id, :data,
             :investimento, :cliques, :impressoes, :conversoes, NOW())
        ON CONFLICT (ads_account_id, criterion_id, data)
        DO UPDATE SET
            campaign_id = EXCLUDED.campaign_id,
            investimento = EXCLUDED.investimento, cliques = EXCLUDED.cliques,
            impressoes = EXCLUDED.impressoes, conversoes = EXCLUDED.conversoes,
            sincronizado_em = NOW()
    """), params)
    db.commit()
