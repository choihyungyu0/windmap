"""
예측 단계 오케스트레이션 — 수집 직후 실행 (AUTO-01 파이프라인의 F-DSP 단계).

최근 기상·배출 데이터로 B1a(플룸)·B1b(퍼프) 수용지점 예측을 계산해
plume_conc / puff_conc 에 적재하고, 상태 파일용 요약을 반환한다.
운영상태(op_status)=0 이면 배출 0 — 가동/정지 자연실험이 예측에도 반영된다.
validation-report.json 에 학습된 B2 릿지 계수가 있으면 B1b 를 곱셈형으로 보정해 summary 에 실는다.
"""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime

from ..config import PUBLIC_DATA_DIR, RECEPTORS, STACK_H
from . import plume, puff

# ponytail: features 순서/스케일은 validate/ablation.py features() 와 완전 일치해야 함.
# 편집 시 양쪽 동시 수정 + `python -m backend.validate.ablation --combined` 로 계수 재학습.
_STAB_IDX = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}


def _load_b2_weights() -> list[float] | None:
    """실입력 학습 계수 로드 — 리포트 없거나 스키마 불일치면 None → B2 스킵."""
    path = PUBLIC_DATA_DIR / "validation-report.json"
    if not path.exists():
        return None
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    coef = (report.get("realInput") or {}).get("b2Coef") or report.get("b2Coef")
    if not coef or len(coef.get("weights", [])) != 6:
        return None
    return coef["weights"]


def _apply_b2(b1a: float, b1b: float, wd: float, ws: float, stab: str, w: list[float]) -> float:
    """릿지 보정 — ablation.features() 와 동일 피처 순서. 배출원 기여는 음수 불가 → 0 절단."""
    wr = math.radians(wd)
    x = [
        b1b,
        b1a,
        b1b * math.sin(wr),
        b1b * math.cos(wr),
        b1b * ws / 10.0,
        b1b * _STAB_IDX.get(stab, 3) / 5.0,
    ]
    return max(0.0, sum(wi * xi for wi, xi in zip(w, x)))


def _load_recent_weather(con: sqlite3.Connection, hours: int = 4) -> list[dict]:
    rows = con.execute(
        "SELECT ts, wd, ws, stab FROM weather_ts ORDER BY ts DESC LIMIT ?", (hours,)
    ).fetchall()
    out = []
    for ts, wd, ws, stab in reversed(rows):
        out.append(
            {
                "epoch": datetime.fromisoformat(ts).timestamp(),
                "wd": wd,
                "ws": ws,
                "stab": stab or "D",
            }
        )
    return out


def _load_emission(con: sqlite3.Connection) -> float:
    """최신 NOx 배출률 (g/s 프록시 — TMS 농도값을 데모 스케일로 사용, P2b에서 환산 확정)."""
    row = con.execute(
        "SELECT val, op_status FROM emission_ts WHERE item='nox' ORDER BY ts DESC LIMIT 1"
    ).fetchone()
    if not row:
        return 0.0
    val, op = row
    return 0.0 if not op else float(val or 0.0)


def predict_all(con: sqlite3.Connection, ts_iso: str) -> list[dict]:
    hours = _load_recent_weather(con)
    if not hours:
        return []

    now = hours[-1]
    q = _load_emission(con)
    puffs = puff.advect_puffs(hours, datetime.fromisoformat(ts_iso).timestamp())
    b2_w = _load_b2_weights()

    plume_rows: list[tuple] = []
    puff_rows: list[tuple] = []
    summary: list[dict] = []
    for r in RECEPTORS:
        b1a = plume.concentration_at(r["ex"], r["ny"], q, now["ws"], STACK_H, now["wd"], now["stab"])
        b1b = puff.concentration_at(r["ex"], r["ny"], puffs, q, STACK_H)
        arr = puff.arrival_minutes(r["ex"], r["ny"], now["wd"], now["ws"])
        plume_rows.append((r["id"], "nox", round(b1a, 2), ts_iso))
        puff_rows.append((r["id"], "nox", round(b1b, 2), arr, ts_iso))
        entry = {
            "id": r["id"],
            "name": r["name"],
            "b1a": round(b1a, 1),
            "b1b": round(b1b, 1),
            "arrivalMin": arr,
        }
        if b2_w is not None:
            entry["b2"] = round(_apply_b2(b1a, b1b, now["wd"], now["ws"], now["stab"], b2_w), 1)
        summary.append(entry)

    con.executemany(
        "INSERT OR REPLACE INTO plume_conc (receptor_id, item, val, ts) VALUES (?,?,?,?)",
        plume_rows,
    )
    con.executemany(
        "INSERT OR REPLACE INTO puff_conc (receptor_id, item, val, arrival, ts) VALUES (?,?,?,?,?)",
        puff_rows,
    )
    return summary
