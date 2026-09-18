from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    database_url: str

    # Object storage: Aliyun OSS through its S3-compatible API.
    s3_endpoint: str
    s3_region: str = "cn-hongkong"
    s3_bucket: str = "oa-agent"
    s3_access_key_id: str
    s3_secret_access_key: str
    # OSS serves only virtual-hosted requests; path style is rejected.
    # Set to true only for a local MinIO-style endpoint.
    s3_force_path_style: bool = False
    # boto3's Signature V4 is bound to aws-chunked transfer encoding, which OSS
    # rejects, so OSS needs the legacy "s3" (V2) signer.
    s3_signature_version: str = "s3"

    # Aliyun IMM: Office/PDF conversion, replacing the in-image LibreOffice.
    aliyun_imm_project: str = ""
    aliyun_imm_region: str = ""
    aliyun_imm_endpoint: str = ""
    aliyun_imm_access_key_id: str = ""
    aliyun_imm_access_key_secret: str = ""
    aliyun_imm_poll_seconds: float = 2.0
    aliyun_imm_timeout_seconds: int = 300

    # Aliyun OCR: scanned-page recognition, replacing PaddleOCR.
    # Unlike IMM, the OCR API is not offered per region: only the central
    # ocr-api.cn-hangzhou.aliyuncs.com endpoint (and ocr-api.aliyuncs.com)
    # resolves, so it is independent of the bucket region.
    aliyun_ocr_endpoint: str = ""
    aliyun_ocr_region: str = "cn-hangzhou"
    aliyun_ocr_access_key_id: str = ""
    aliyun_ocr_access_key_secret: str = ""
    # "advanced" (高精版) or "general" (通用版)
    aliyun_ocr_mode: str = "advanced"

    worker_id: str = "worker-local-1"
    worker_poll_ms: int = 1500
    worker_stale_minutes: int = 20
    worker_temp_dir: Path = Path("/tmp/oa-agent")
    parser_version: str = "1.0.0"
    builder_version: str = "1.0.0"
    worker_concurrency: int = 1

    @property
    def imm_region_resolved(self) -> str:
        return self.aliyun_imm_region or self.s3_region

    @property
    def imm_endpoint_resolved(self) -> str:
        return self.aliyun_imm_endpoint or f"imm.{self.imm_region_resolved}.aliyuncs.com"

    @property
    def imm_key_id(self) -> str:
        return self.aliyun_imm_access_key_id or self.s3_access_key_id

    @property
    def imm_key_secret(self) -> str:
        return self.aliyun_imm_access_key_secret or self.s3_secret_access_key

    @property
    def ocr_endpoint_resolved(self) -> str:
        return self.aliyun_ocr_endpoint or "ocr-api.cn-hangzhou.aliyuncs.com"

    @property
    def ocr_key_id(self) -> str:
        return self.aliyun_ocr_access_key_id or self.s3_access_key_id

    @property
    def ocr_key_secret(self) -> str:
        return self.aliyun_ocr_access_key_secret or self.s3_secret_access_key


@lru_cache
def settings() -> Settings:
    value = Settings()  # type: ignore[call-arg]
    value.worker_temp_dir.mkdir(parents=True, exist_ok=True)
    return value
