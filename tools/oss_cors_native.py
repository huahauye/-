"""Shows and updates the OSS bucket CORS rule through the native Aliyun SDK.

The browser uploads straight to OSS with presigned PUTs, so the bucket must
allow the origins the app is served from.

    python oss_cors_native.py show
    python oss_cors_native.py set
"""

import pathlib
import sys

import oss2

ENV_FILE = pathlib.Path(__file__).with_name("worker.env")
ENV = {}
for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        ENV[key.strip()] = value.strip()

REGION = ENV["S3_REGION"]
ENDPOINT = f"https://oss-{REGION}.aliyuncs.com"
BUCKET = ENV["S3_BUCKET"]
ORIGINS = [
    "http://39.108.58.140",
    "http://localhost:3000",
]

auth = oss2.Auth(ENV["S3_ACCESS_KEY_ID"], ENV["S3_SECRET_ACCESS_KEY"])
bucket = oss2.Bucket(auth, ENDPOINT, BUCKET)


def show() -> None:
    rules = bucket.get_bucket_cors().cors_rule
    if not rules:
        print("no CORS rule configured")
    for rule in rules:
        print(f"allowed_origins={rule.allowed_origins}")
        print(f"allowed_methods={rule.allowed_methods}")
        print(f"allowed_headers={rule.allowed_headers}")
        print(f"expose_headers={rule.expose_headers}")
        print(f"max_age_seconds={rule.max_age_seconds}")


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else "show"
    if action == "show":
        show()
        return 0
    if action == "set":
        # Preserve every origin already allowed, then add the new host.
        existing = {origin for rule in bucket.get_bucket_cors().cors_rule for origin in (rule.allowed_origins or [])}
        origins = sorted(existing | set(ORIGINS))
        rule = oss2.models.CorsRule(
            allowed_origins=origins,
            allowed_methods=["GET", "PUT", "HEAD", "POST"],
            # The presigned PUT signs Content-Length and x-amz-meta-sha256.
            allowed_headers=["*"],
            expose_headers=["ETag"],
            max_age_seconds=3600,
        )
        bucket.put_bucket_cors(oss2.models.BucketCors([rule]))
        print(f"CORS written with origins: {origins}")
        show()
        return 0
    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    raise SystemExit(main())
