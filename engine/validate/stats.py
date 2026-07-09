"""
검증용 통계 유틸 — 표준 라이브러리만 사용.

- 릿지 회귀(닫힌 형식, 가우스 소거) : 보정 모델 골격 (P6b에서 XGBoost 교체)
- RMSE·MAE·피어슨 r
- 윌콕슨 부호순위 검정(정규 근사) : B1b vs B2 대응 비교 (검증 프로토콜 §4)
"""

from __future__ import annotations

import math


def solve_linear(a: list[list[float]], b: list[float]) -> list[float]:
    """부분 피벗 가우스 소거로 Ax=b 풀기 (소규모 정방행렬)."""
    n = len(a)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[pivot][col]) < 1e-12:
            m[pivot][col] = 1e-12
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(col + 1, n):
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (m[r][n] - sum(m[r][c] * x[c] for c in range(r + 1, n))) / m[r][r]
    return x


class Ridge:
    """릿지 회귀 w = (XᵀX + λI)⁻¹ Xᵀy — 절편은 피처에 1 포함해서 처리."""

    def __init__(self, lam: float = 1.0):
        self.lam = lam
        self.w: list[float] = []

    def fit(self, xs: list[list[float]], ys: list[float]) -> "Ridge":
        d = len(xs[0])
        xtx = [[sum(x[i] * x[j] for x in xs) for j in range(d)] for i in range(d)]
        for i in range(d):
            xtx[i][i] += self.lam
        xty = [sum(x[i] * y for x, y in zip(xs, ys)) for i in range(d)]
        self.w = solve_linear(xtx, xty)
        return self

    def predict(self, x: list[float]) -> float:
        return sum(wi * xi for wi, xi in zip(self.w, x))


def rmse(pred: list[float], obs: list[float]) -> float:
    return math.sqrt(sum((p - o) ** 2 for p, o in zip(pred, obs)) / len(obs))


def mae(pred: list[float], obs: list[float]) -> float:
    return sum(abs(p - o) for p, o in zip(pred, obs)) / len(obs)


def pearson(a: list[float], b: list[float]) -> float:
    n = len(a)
    ma = sum(a) / n
    mb = sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((y - mb) ** 2 for y in b))
    if va < 1e-12 or vb < 1e-12:
        return 0.0
    return cov / (va * vb)


def wilcoxon_signed_rank_p(err_a: list[float], err_b: list[float]) -> tuple[float, float]:
    """
    대응표본 윌콕슨 부호순위 검정 (양측, 정규 근사 — n≥20 권장).
    입력: 두 모델의 |오차| 시퀀스. 반환: (z, p).
    """
    diffs = [a - b for a, b in zip(err_a, err_b) if abs(a - b) > 1e-12]
    n = len(diffs)
    if n < 10:
        return 0.0, 1.0
    ranked = sorted((abs(d), d > 0) for d in diffs)
    # 동순위 평균 랭크
    ranks: list[tuple[float, bool]] = []
    i = 0
    while i < len(ranked):
        j = i
        while j < len(ranked) and abs(ranked[j][0] - ranked[i][0]) < 1e-12:
            j += 1
        avg_rank = (i + 1 + j) / 2
        for k in range(i, j):
            ranks.append((avg_rank, ranked[k][1]))
        i = j
    w_plus = sum(r for r, pos in ranks if pos)
    mean = n * (n + 1) / 4
    sd = math.sqrt(n * (n + 1) * (2 * n + 1) / 24)
    z = (w_plus - mean) / sd
    p = math.erfc(abs(z) / math.sqrt(2))  # 양측
    return z, p
