"""
F-DSP-02 가우시안 퍼프 (B1b) — 시변 바람 아래 시간 전파.

연속 배출을 DT_S 간격의 이산 퍼프로 근사하고, 각 퍼프를 시간별 바람으로
구간 적분 이류시킨다(경로가 바람 변화를 따라 휜다 — 플룸과의 본질적 차이).
수평 확산은 등방 근사(σh = σy(이동거리)) — 검증 배치(P6)에서 정밀화.
FastGaussianPuff 는 Linux 전용(NFR-9)이라 자체 구현을 기본으로 한다.
"""

from __future__ import annotations

import math

from .plume import sigma_y, sigma_z

DT_S = 300  # 퍼프 방출 간격 (초)
WINDOW_S = 3 * 3600  # 과거 몇 초 치 방출을 추적할지

_SQRT_2PI_CUBED = (2 * math.pi) ** 1.5


def _wind_vec(wd: float, ws: float) -> tuple[float, float]:
    """풍향(불어오는 방향) → 이류 속도 벡터 (동, 북) m/s."""
    b = math.radians((wd + 180) % 360)
    return ws * math.sin(b), ws * math.cos(b)


def advect_puffs(
    hours: list[dict],  # 시간 오름차순: {"epoch", "wd", "ws", "stab"} (1시간 간격)
    now_epoch: float,
) -> list[dict]:
    """방출창 내 각 퍼프의 현재 위치·이동거리·안정도를 구간 적분으로 계산."""
    if not hours:
        return []

    def hour_at(t: float) -> dict:
        for h in reversed(hours):
            if t >= h["epoch"]:
                return h
        return hours[0]

    puffs = []
    rel = now_epoch - WINDOW_S
    while rel < now_epoch:
        px = py = travel = 0.0
        t = rel
        stab = hour_at(rel)["stab"]
        while t < now_epoch:
            h = hour_at(t)
            stab = h["stab"]
            seg_end = min(h["epoch"] + 3600, now_epoch)
            step = max(0.0, seg_end - t)
            if step == 0:
                break
            vx, vy = _wind_vec(h["wd"], h["ws"])
            px += vx * step
            py += vy * step
            travel += max(h["ws"], 0.5) * step
            t = seg_end
        puffs.append({"px": px, "py": py, "travel": travel, "stab": stab, "rel": rel})
        rel += DT_S
    return puffs


def concentration_at(
    ex: float,
    ny: float,
    puffs: list[dict],
    q_gs: float,
    stack_h: float,
) -> float:
    """수용지점(동 ex, 북 ny)의 현재 지표 농도 (μg/m³)."""
    if q_gs <= 0:
        return 0.0
    mass = q_gs * 1e6 * DT_S
    c = 0.0
    for p in puffs:
        s = max(p["travel"], 1.0)
        sh = sigma_y(s, p["stab"])
        sz = sigma_z(s, p["stab"])
        dx = ex - p["px"]
        dy = ny - p["py"]
        r2 = dx * dx + dy * dy
        if r2 > (4 * sh) ** 2:
            continue
        vertical = 2 * math.exp(-(stack_h * stack_h) / (2 * sz * sz))
        c += (mass / (_SQRT_2PI_CUBED * sh * sh * sz)) * math.exp(-r2 / (2 * sh * sh)) * vertical
    return c


def arrival_minutes(ex: float, ny: float, wd: float, ws: float) -> float | None:
    """도달 예상(분) — 현재 바람 기준 퍼프 중심 통과 시각. 풍상측이면 None."""
    b = math.radians((wd + 180) % 360)
    downwind = ex * math.sin(b) + ny * math.cos(b)
    if downwind <= 0:
        return None
    return round(downwind / max(ws, 0.5) / 60, 1)
