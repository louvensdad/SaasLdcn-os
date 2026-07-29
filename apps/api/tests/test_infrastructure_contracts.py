from __future__ import annotations

import os
from uuid import uuid4

import pytest

pytestmark = [pytest.mark.integration, pytest.mark.contract]


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.skip(f"{name} is required for infrastructure contract tests")
    return value


def test_postgresql_round_trip() -> None:
    database_url = _required_env("LDCN_TEST_POSTGRES_URL")
    from sqlalchemy import create_engine, text

    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
    finally:
        engine.dispose()


def test_redis_namespaced_round_trip() -> None:
    redis_url = _required_env("LDCN_TEST_REDIS_URL")
    import redis

    client = redis.Redis.from_url(redis_url, decode_responses=True)
    key = f"ldcn:contract:{uuid4().hex}"
    try:
        assert client.set(key, "ok", ex=30)
        assert client.get(key) == "ok"
    finally:
        client.delete(key)
        client.close()


def test_minio_object_round_trip() -> None:
    endpoint = _required_env("LDCN_TEST_S3_ENDPOINT")
    access_key = _required_env("LDCN_TEST_S3_ACCESS_KEY")
    secret_key = _required_env("LDCN_TEST_S3_SECRET_KEY")
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4"),
    )
    bucket = f"ldcn-contract-{uuid4().hex}"
    key = "probe.txt"
    try:
        client.create_bucket(Bucket=bucket)
        client.put_object(Bucket=bucket, Key=key, Body=b"ok")
        assert client.get_object(Bucket=bucket, Key=key)["Body"].read() == b"ok"
    finally:
        try:
            client.delete_object(Bucket=bucket, Key=key)
            client.delete_bucket(Bucket=bucket)
        except client.exceptions.NoSuchBucket:
            pass