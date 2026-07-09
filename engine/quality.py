"""
AUTO-03 데이터 품질 감시 — 결측·이상치·수집 장애 감지 → quality_log.

원칙(NFR-5): 저신뢰 데이터는 버리지 않고 플래그와 함께 남긴다.
경보 보류 판단은 소비 측(경보 로직)이 플래그를 보고 한다.
"""

from __future__ import annotations

import sqlite3

from .config import QUALITY_BOUNDS
from .db import log_quality


def check_bounds(name: str, val: float | None) -> str | None:
    """물리 범위 밖이면 메시지 반환."""
    if val is None:
        return f"{name} 결측"
    lo, hi = QUALITY_BOUNDS.get(name, (float("-inf"), float("inf")))
    if not (lo <= val <= hi):
        return f"{name}={val} 물리 범위({lo}~{hi}) 밖"
    return None


def audit_cycle(
    con: sqlite3.Connection,
    ts_iso: str,
    results: dict[str, dict],
) -> list[dict]:
    """수집 결과를 감사하고 quality_log 에 기록. 반환: 이슈 목록."""
    issues: list[dict] = []

    for name, r in results.items():
        if r["mode"] == "error":
            issues.append({"collector": name, "level": "error", "message": r["message"]})
        elif r["mode"] == "mock" and "폴백" in r["message"]:
            issues.append({"collector": name, "level": "warn", "message": r["message"]})
        elif not r["rows"]:
            issues.append({"collector": name, "level": "warn", "message": "0행 수집 — 스테일 유지"})

    # 기상 이상치 검사 (풍속·풍향·기온)
    wrows = results.get("weather", {}).get("rows", [])
    for _, wd, ws, temp, _stab, _ts in wrows:
        for key, val in (("wd", wd), ("ws", ws), ("temp", temp)):
            msg = check_bounds(key, val)
            if msg:
                issues.append({"collector": "weather", "level": "warn", "message": msg})

    for i in issues:
        log_quality(con, ts_iso, i["collector"], i["level"], i["message"])
    return issues
