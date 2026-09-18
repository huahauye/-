from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config

from .config import settings


@lru_cache
def client():
    cfg = settings()
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        region_name=cfg.s3_region,
        aws_access_key_id=cfg.s3_access_key_id,
        aws_secret_access_key=cfg.s3_secret_access_key,
        config=Config(
            signature_version=cfg.s3_signature_version,
            s3={"addressing_style": "path" if cfg.s3_force_path_style else "virtual"},
            retries={"max_attempts": 5, "mode": "standard"},
        ),
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


def list_keys(prefix: str) -> list[str]:
    """List object keys under a prefix (used to find IMM conversion output)."""
    bucket = settings().s3_bucket
    keys: list[str] = []
    paginator = client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            keys.append(item["Key"])
    return keys


def delete(key: str) -> None:
    client().delete_object(Bucket=settings().s3_bucket, Key=key)
