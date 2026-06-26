from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/op7nexo"
    JWT_SECRET: str = "changeme"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o-mini"
    # Geração de imagem — chave OpenAI DEDICADA (api.openai.com, acesso a gpt-image-2).
    # NÃO reusar openai_api_key/openai_base_url: esses apontam para o gateway de texto
    # (opencode zen), que não tem modelos de imagem.
    openai_image_api_key: str = ""
    openai_image_base_url: str = "https://api.openai.com/v1"
    openai_image_model: str = "gpt-image-2"
    # Modelo de VISÃO (prompt-reverso: referência → creative_spec JSON). Mesma chave/base_url dedicada.
    openai_vision_model: str = "gpt-4.1"
    # Modelo de TEXTO para o assistente de copy (gera/melhora textos com gatilhos mentais).
    openai_copy_model: str = "gpt-4.1-mini"
    # Modelo de TEXTO do Carrossel 2.0 (diretor/ajuste/análise) — mais inteligente, escopado só ao carrossel.
    # gpt-5-mini: família GPT-5 (raciocínio) viável em endpoint síncrono (~18s); gpt-5 full = 80-200s (timeout).
    openai_carrossel_model: str = "gpt-5-mini"
    # TRANSCRIÇÃO de áudio (speech-to-text, endpoint audio.transcriptions). OpenAI-only —
    # herda a chave/base_url DEDICADA de imagem (o gateway de texto/opencode não tem STT).
    openai_audio_model: str = "gpt-4o-transcribe"
    # Firecrawl — busca de notícias para o buscador de pautas (Origin A do Criativos 2.0).
    firecrawl_api_key: str = ""
    firecrawl_api_url: str = "https://api.firecrawl.dev"
    EVOLUTION_API_URL: str = "https://evo.op7franquia.com.br"
    EVOLUTION_API_KEY: str = ""
    # Health-check de canais (worker): alerta WhatsApp de canal caído.
    HEALTH_ALERT_TO: str = ""            # número admin que recebe o alerta (vazio = desabilitado)
    HEALTH_ALERT_FROM_CANAL: str = ""    # id do canal CONNECTED que envia o alerta (explícito, sem auto-pick)
    HEALTH_CHECK_INTERVAL_MIN: int = 15
    SERVER_URL: str = "https://api.op7franquia.com.br"
    MINIO_ENDPOINT: str = "minio.op7franquia.com.br"
    MINIO_PORT: int = 443
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_USE_SSL: bool = True
    MINIO_BUCKET_CRIATIVOS: str = "criativos-meta"
    MINIO_PUBLIC_BASE_URL: str = "https://minio.op7franquia.com.br"
    META_APP_SECRET: str = ""  # para verificar assinatura de webhooks da Meta Cloud API
    # Versão da Graph API usada por WhatsApp Cloud / Instagram. Centralizada para
    # facilitar bumps (Meta deprecia versões a cada ~2 anos). Verificar a corrente
    # em https://developers.facebook.com/docs/graph-api/changelog antes de subir.
    META_GRAPH_API_VERSION: str = "v23.0"
    # Embedded Signup (fase 2) — login na Meta via Facebook Login for Business.
    # Quando META_EMBEDDED_SIGNUP_ENABLED=False o front esconde o botão e só o
    # fluxo de token manual fica disponível.
    META_APP_ID: str = ""
    META_CONFIG_ID: str = ""  # config_id da Login configuration do Embedded Signup
    META_EMBEDDED_SIGNUP_ENABLED: bool = False
    META_SYNC_REQUEST_DELAY_SECONDS: float = 0.5
    META_SYNC_ACCOUNT_DELAY_SECONDS: float = 5.0
    META_SYNC_RATE_LIMIT_MAX_RETRIES: int = 5
    META_SYNC_RATE_LIMIT_BASE_DELAY_SECONDS: float = 30.0
    META_SYNC_RATE_LIMIT_MAX_DELAY_SECONDS: float = 900.0
    META_SYNC_PUBLICOS_CAMPANHA_LIMIT: int = 50
    META_SYNC_PUBLICOS_CAMPANHA_BACKFILL: bool = False
    META_SYNC_USAGE_SOFT_THRESHOLD_PERCENT: int = 80
    META_SYNC_USAGE_HARD_THRESHOLD_PERCENT: int = 95
    META_SYNC_MAX_PARALLEL_ACCOUNTS: int = 4
    META_SYNC_WORKER_POLL_INTERVAL: int = 2
    META_SYNC_WORKER_POLL_BATCH: int = 10
    # Sync inteligente (spec 002): pausa preventiva e re-agendamento "nunca desistir".
    META_USAGE_PAUSE_PCT: int = 90  # acima disto pausa preventiva pelo estimated_regain
    META_RETRY_BASE_INTERVAL: float = 60.0  # piso do backoff de re-enfileiramento (s)
    META_RETRY_MAX_INTERVAL: float = 3600.0  # teto de qualquer espera/re-agendamento (s)
    META_SYNC_PESADO_HOUR_BRT: int = 3  # hora BRT do cron pesado
    META_SWEEPER_INTERVAL_MINUTES: int = 15  # intervalo do sweeper de cobertura

    # Pagamento (Stripe) — fase 3b. Chaves SÓ no .env (gitignored). O webhook
    # verifica a assinatura com stripe_webhook_secret. Test mode no início.
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    frontend_url: str = "https://nexo.op7franquia.com.br"

    # Central de Agentes — chave Fernet (base64 url-safe de 32 bytes) que cifra os
    # tokens de provider de LLM em repouso (llm_provider_tokens.token_encrypted).
    # Gerar: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    LLM_TOKEN_ENC_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
