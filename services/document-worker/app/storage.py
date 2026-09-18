from pathlib import Path
import boto3
from .config import settings


def client():
    cfg = settings()
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        region_name=cfg.s3_region,
        aws_access_key_id=cfg.s3_access_key_id,
        aws_secret_access_key=cfg.s3_secret_access_key,
    )


def download(key: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    client().download_file(settings().s3_bucket, key, str(destination))


def upload(path: Path, key: str, content_type: str) -> None:
    client().upload_file(str(path), settings().s3_bucket, key, ExtraArgs={"ContentType": content_type})


def upload_bytes(data: bytes, key: str, content_type: str) -> None:
    client().put_object(Bucket=settings().s3_bucket, Key=key, Body=data, ContentType=content_type)


def read_bytes(key: str) -> bytes:
    result = client().get_object(Bucket=settings().s3_bucket, Key=key)
    return result["Body"].read()
