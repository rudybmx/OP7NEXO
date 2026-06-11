"""F5 — Modelos curados + Meus modelos (galeria do Estúdio de Criativos)

Cria a tabela `criativo_modelos`:
- workspace_id NULL  → modelo CURADO global (fonte='curado'), com estrutura lógica
  vencedora (estrutura_json) + "porquê" da IA; botão "Usar estrutura" pré-preenche
  o gerador.
- workspace_id preenchido → "Meus modelos" (fonte='manual'): referência que o
  usuário carrega e salva pra reusar (imagem como Modelo de exemplo no Gerar).

Faseamento (ver docs/specs/gerador-criativos-modelos/): F5.1 curados+meus modelos;
F5.2 ingestão da Ad Library pública (fonte='ad_library'); F5.3 mira por conta do cliente.

Revision ID: 065
Revises: 064
Create Date: 2026-06-11
"""
import json

from alembic import op
import sqlalchemy as sa

revision = "065"
down_revision = "064"
branch_labels = None
depends_on = None

_TS = (
    "criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()"
)

# Modelos curados globais (seed). estrutura_json é consumida pelo gerador
# ("Usar estrutura"): objetivo/densidade + scaffold de copy (lógica, não texto
# exato de concorrente). objetivo casa com os ids do front (OBJETIVOS).
_SEED = [
    {
        "nome": "Oferta Relâmpago", "nicho": "E-commerce", "objetivo": "divulgar oferta",
        "nivel": "direto", "gancho": "Escassez + preço", "fmt": "feed_1x1", "badge": "Vencedor",
        "ai_porque": "Direto ao ponto: junta escassez (tempo) e benefício claro. Funciona para público quente, de baixo ticket, que já conhece o produto.",
        "estrutura": {"objetivo": "divulgar oferta", "densidade": "rico", "framework": "AIDA",
            "headline": "Só hoje: oferta especial", "subheadline": "Aproveite antes que o estoque acabe.",
            "cta": "Comprar agora", "bullets": ["Frete grátis", "Garantia de 7 dias", "Estoque limitado"]},
    },
    {
        "nome": "Autoridade que Educa", "nicho": "Serviços de saúde", "objetivo": "geração de leads",
        "nivel": "educativo", "gancho": "Pergunta sobre a dor", "fmt": "feed_4x5", "badge": "Vencedor",
        "ai_porque": "Usa autoridade e alívio da dor. Ideal para público frio que ainda não conhece a marca: educa antes de vender.",
        "estrutura": {"objetivo": "geração de leads", "densidade": "rico", "framework": "PAS",
            "headline": "Cansado de conviver com o problema?", "subheadline": "Existe uma solução moderna, segura e sem sofrimento.",
            "cta": "Quero saber mais", "bullets": ["Técnica avançada", "Equipe especializada", "Atendimento humanizado"]},
    },
    {
        "nome": "Conversa no Zap", "nicho": "Serviço local", "objetivo": "agendamento no WhatsApp",
        "nivel": "direto", "gancho": "Convite de baixa fricção", "fmt": "feed_1x1", "badge": "Vencedor",
        "ai_porque": "Baixa fricção: o foco é iniciar a conversa. Bom para serviços locais com atendimento por WhatsApp.",
        "estrutura": {"objetivo": "agendamento no WhatsApp", "densidade": "simples", "framework": "Direto",
            "headline": "Agende em 1 minuto", "subheadline": "Fale com a gente agora mesmo pelo WhatsApp.",
            "cta": "Chamar no WhatsApp", "bullets": []},
    },
    {
        "nome": "Depoimento UGC", "nicho": "Infoproduto", "objetivo": "geração de leads",
        "nivel": "ugc", "gancho": "Prova social real", "fmt": "story", "badge": "Vencedor",
        "ai_porque": "Parece gravado por um cliente real, com alta retenção em Reels/Stories. Gera confiança via prova social.",
        "estrutura": {"objetivo": "geração de leads", "densidade": "rico", "framework": "Antes-Depois-Ponte",
            "headline": "Eu não acreditava, até testar", "subheadline": "Veja como foi a minha transformação.",
            "cta": "Quero testar", "bullets": ["História real", "Antes parecia impossível", "Resultado em poucos dias"]},
    },
    {
        "nome": "Institucional Memorável", "nicho": "Institucional", "objetivo": "institucional / marca",
        "nivel": "educativo", "gancho": "Propósito da marca", "fmt": "feed_1x1", "badge": None,
        "ai_porque": "Tom de autoridade e confiança, menos promocional. Fortalece marca e reconhecimento para público que já te segue.",
        "estrutura": {"objetivo": "institucional / marca", "densidade": "simples", "framework": "Storytelling",
            "headline": "Cuidando de quem importa", "subheadline": "Há anos transformando a vida de quem confia na gente.",
            "cta": "Conheça a marca", "bullets": []},
    },
    {
        "nome": "Lançamento / Novidade", "nicho": "E-commerce", "objetivo": "divulgar oferta",
        "nivel": "direto", "gancho": "Novidade + exclusividade", "fmt": "feed_4x5", "badge": "Vencedor",
        "ai_porque": "Gatilho de novidade e exclusividade. Bom para lançamento e público já engajado com a marca.",
        "estrutura": {"objetivo": "divulgar oferta", "densidade": "rico", "framework": "AIDA",
            "headline": "Chegou a novidade que você esperava", "subheadline": "Seja um dos primeiros a ter o seu.",
            "cta": "Garantir o meu", "bullets": ["Lançamento exclusivo", "Primeiros levam brinde", "Por tempo limitado"]},
    },
    {
        "nome": "Isca de Valor", "nicho": "Infoproduto / Serviço", "objetivo": "geração de leads",
        "nivel": "educativo", "gancho": "Reciprocidade", "fmt": "feed_4x5", "badge": None,
        "ai_porque": "Oferece valor antes de pedir algo (reciprocidade). Captura leads frios com baixo compromisso.",
        "estrutura": {"objetivo": "geração de leads", "densidade": "rico", "framework": "PAS",
            "headline": "Baixe grátis o nosso guia", "subheadline": "O passo a passo que resolve o seu problema.",
            "cta": "Receber grátis", "bullets": ["100% gratuito", "Direto no seu WhatsApp", "Sem complicação"]},
    },
    {
        "nome": "Promoção Sazonal", "nicho": "Varejo", "objetivo": "divulgar oferta",
        "nivel": "direto", "gancho": "Urgência sazonal", "fmt": "feed_1x1", "badge": "Vencedor",
        "ai_porque": "Urgência sazonal com oferta clara. Converte público quente em datas comerciais.",
        "estrutura": {"objetivo": "divulgar oferta", "densidade": "rico", "framework": "AIDA",
            "headline": "A semana mais esperada do ano", "subheadline": "Descontos de verdade, só nesta data.",
            "cta": "Aproveitar agora", "bullets": ["Descontos em tudo", "Parcele sem juros", "Só até o fim da semana"]},
    },
]


def upgrade() -> None:
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_modelos (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id       UUID REFERENCES workspaces(id) ON DELETE CASCADE,
            nome               VARCHAR(120) NOT NULL,
            nicho              VARCHAR(80),
            objetivo           VARCHAR(60),
            nivel_consciencia  VARCHAR(20),
            gancho             VARCHAR(120),
            creative_format    VARCHAR(40),
            thumb_url          TEXT,
            fonte              VARCHAR(20) NOT NULL DEFAULT 'curado',
            ad_snapshot_url    TEXT,
            longevidade_dias   INTEGER,
            badge              VARCHAR(40),
            ai_porque          TEXT,
            estrutura_json     JSONB,
            ativo              BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_modelos_ws "
        "ON criativo_modelos (workspace_id, ativo)"
    ))

    conn = op.get_bind()
    # Seed idempotente: só insere curados se ainda não houver nenhum.
    ja_tem = conn.execute(sa.text(
        "SELECT count(*) FROM criativo_modelos WHERE fonte='curado'"
    )).scalar()
    if not ja_tem:
        for m in _SEED:
            conn.execute(
                sa.text("""
                    INSERT INTO criativo_modelos
                      (nome, nicho, objetivo, nivel_consciencia, gancho,
                       creative_format, fonte, badge, ai_porque, estrutura_json)
                    VALUES
                      (:nome, :nicho, :objetivo, :nivel, :gancho,
                       :fmt, 'curado', :badge, :ai_porque, CAST(:estrutura AS JSONB))
                """),
                {
                    "nome": m["nome"], "nicho": m["nicho"], "objetivo": m["objetivo"],
                    "nivel": m["nivel"], "gancho": m["gancho"], "fmt": m["fmt"],
                    "badge": m["badge"], "ai_porque": m["ai_porque"],
                    "estrutura": json.dumps(m["estrutura"], ensure_ascii=False),
                },
            )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS criativo_modelos CASCADE"))
