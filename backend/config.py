from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "sqlite:///./nutrilog.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    usda_api_key: str | None = None
    nlp_timeout_seconds: float = 5.0


settings = Settings()
