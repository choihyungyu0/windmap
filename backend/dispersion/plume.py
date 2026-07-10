"""
F-DSP-01 가우시안 플룸 (B1a) — 정상상태. lib/plume.ts 와 동일 수식(Briggs 개활지).
프론트 TS 구현과 상호 대조해 정합을 확인하는 기준 구현이기도 하다.
"""

from __future__ import annotations

import math

_SY = {"A": 0.22, "B": 0.16, "C": 0.11, "D": 0.08, "E": 0.06, "F": 0.04}


def sigma_y(x: float, s: str) -> float:
    return (_SY[s] * x) / math.sqrt(1 + 0.0001 * x)


def sigma_z(x: float, s: str) -> float:
    if s == "A":
        return 0.2 * x
    if s == "B":
        return 0.12 * x
    if s == "C":
        return (0.08 * x) / math.sqrt(1 + 0.0002 * x)
    if s == "D":
        return (0.06 * x) / math.sqrt(1 + 0.0015 * x)
    if s == "E":
        return (0.03 * x) / (1 + 0.0003 * x)
    return (0.016 * x) / (1 + 0.0003 * x)  # F


def ground_concentration(x: float, y: float, q: float, u: float, h: float, s: str) -> float:
    """지표 농도 (μg/m³). x 풍하거리, y 횡풍거리 (m). q g/s."""
    if x <= 1 or q <= 0:
        return 0.0
    u = max(u, 0.5)
    sy = sigma_y(x, s)
    sz = sigma_z(x, s)
    base = (q * 1e6) / (2 * math.pi * u * sy * sz)
    return base * math.exp(-(y * y) / (2 * sy * sy)) * 2 * math.exp(-(h * h) / (2 * sz * sz))


def concentration_at(ex: float, ny: float, q: float, u: float, h: float, wd: float, s: str) -> float:
    """배출원 원점 미터 좌표(동 ex, 북 ny) 지점의 지표 농도."""
    b = math.radians((wd + 180) % 360)
    x = ex * math.sin(b) + ny * math.cos(b)
    y = ex * math.cos(b) - ny * math.sin(b)
    return ground_concentration(x, y, q, u, h, s)
