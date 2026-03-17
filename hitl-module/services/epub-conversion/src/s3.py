"""S3 helpers for the epub-conversion service (synchronous, uses boto3)."""

import os

import boto3

S3_BUCKET = os.environ.get("S3_BUCKET", "hitl-documents")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL", "http://minio:9000")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "minioadmin")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")


def _client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )


def download_to_bytes(s3_key: str) -> bytes:
    response = _client().get_object(Bucket=S3_BUCKET, Key=s3_key)
    return response["Body"].read()


def upload_bytes(s3_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    _client().put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=data,
        ContentType=content_type,
    )


def epub_key(tenant_id: str, document_id: str, version_number: int) -> str:
    return f"{tenant_id}/{document_id}/epub/v{version_number}/document.epub"


def manifest_key(tenant_id: str, document_id: str, version_number: int) -> str:
    return f"{tenant_id}/{document_id}/manifest/v{version_number}.json"
