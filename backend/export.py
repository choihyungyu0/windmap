"""
파이프라인 상태·스냅샷 내보내기 — 프론트(public/data/)가 소비.

pipeline-status.json: 관제 대시보드의 "자동화 상태" 배지 데이터 소스.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from .config import PUBLIC_DATA_DIR, STATUS_PATH


def write_status(
    con: sqlite3.Connection,
    ts_iso: str,
    mode: str,
    results: dict[str, dict],
    issues: list[dict],
    predictions: list[dict] | None = None,
) -> dict:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    counts: dict[str, Any] = {}
    for name, r in results.items():
        counts[name] = {
            "mode": r["mode"],
            "rows": len(r["rows"]),
            "message": r["message"],
        }

    totals = {
        t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        for t in ("emission_ts", "weather_ts", "station_ts", "quality_log")
    }
    runs = con.execute("SELECT COUNT(*) FROM pipeline_run").fetchone()[0]

    status = {
        "lastRun": ts_iso,
        "mode": mode,
        "cycles": runs + 1,  # 이번 사이클 포함
        "collectors": counts,
        "issues": issues,
        "dbTotals": totals,
        # 수용지점별 최신 예측 (B1a 플룸 / B1b 퍼프 / 도달 분)
        "predictions": predictions or [],
        "note": "AUTO-01 골격 — live 전환은 서비스 키 발급 후(P2b)",
    }
    STATUS_PATH.write_text(
        json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return status
