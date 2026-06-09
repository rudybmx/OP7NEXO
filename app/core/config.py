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
    EVOLUTION_API_URL: str = "https://evo.op7franquia.com.br"
    EVOLUTION_API_KEY: str = ""
    SERVER_URL: str = "https://api.op7franquia.com.br"
    MINIO_ENDPOINT: str = "minio.op7franquia.com.br"
    MINIO_PORT: int = 443
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_USE_SSL: bool = True
    MINIO_BUCKET_CRIATIVOS: str = "criativos-meta"
    MINIO_PUBLIC_BASE_URL: str = "https://minio.op7franquia.com.br"
    META_APP_SECRET: str = ""  # para verificar assinatura de webhooks da Meta Cloud API
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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
