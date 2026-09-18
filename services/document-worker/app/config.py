from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    database_url: str
    s3_endpoint: str
    s3_region: str = "auto"
    s3_bucket: str = "oa-agent"
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_force_path_style: bool = True
    worker_id: str = "worker-local-1"
    worker_poll_ms: int = 1500
    worker_stale_minutes: int = 20
    worker_temp_dir: Path = Path("/tmp/oa-agent")
    parser_version: str = "1.0.0"
    builder_version: str = "1.0.0"
    worker_concurrency: int = 1


@lru_cache
def settings() -> Settings:
    value = Settings()  # type: ignore[call-arg]
    value.worker_temp_dir.mkdir(parents=True, exist_ok=True)
    return value
