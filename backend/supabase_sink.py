"""
Supabase 동기화 싱크 — 배포용 공유 저장소 (표준 라이브러리 REST).

로컬 SQLite가 원본(source of truth)이고, Supabase는 배포된 프론트가 읽는
사본이다. 키 미설정·네트워크 실패 시 조용히 건너뛰고 사유를 반환한다
(AUTO-03 원칙: 부가 경로 장애가 파이프라인을 죽이지 않는다).

선행 조건: supabase/schema.sql 을 Supabase SQL Editor에서 1회 실행.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from .config import _ENV  # .env.local 파서 재사용

SUPABASE_URL = os.environ.get("SUPABASE_URL", _ENV.get("SUPABASE_URL", ""))
SERVICE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY", _ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
)


def enabled() -> bool:
    return bool(SUPABASE_URL and SERVICE_KEY)


def _post(path: str, body: object, prefer: str) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        res.read()


def push_status(payload: dict) -> str | None:
    """pipeline_status 단일 행 upsert. 성공 시 None, 실패 시 사유 문자열."""
    if not enabled():
        return "Supabase 키 미설정 — 동기화 생략"
    try:
        _post(
            "pipeline_status?on_conflict=id",
            {"id": 1, "payload": payload},
            "resolution=merge-duplicates,return=minimal",
        )
        return None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:120]
        if e.code == 404:
            return "Supabase 테이블 없음 — supabase/schema.sql 을 SQL Editor에서 실행 필요"
        return f"Supabase HTTP {e.code}: {detail}"
    except Exception as e:  # 네트워크 등
        return f"Supabase 동기화 실패: {type(e).__name__}"


def push_alerts(rows: list[dict]) -> str | None:
    """경보 이력 적재 (level != good 만 호출측에서 필터)."""
    if not enabled():
        return "Supabase 키 미설정 — 동기화 생략"
    if not rows:
        return None
    try:
        _post("alert_history", rows, "return=minimal")
        return None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "Supabase 테이블 없음 — supabase/schema.sql 실행 필요"
        return f"Supabase HTTP {e.code}"
    except Exception as e:
        return f"Supabase 동기화 실패: {type(e).__name__}"
