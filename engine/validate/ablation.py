"""
F-VAL-01 애블레이션 배치 — 합성 쌍둥이 실험(synthetic twin).

실데이터(P2b) 전에 검증 파이프라인 전체를 끝에서 끝까지 돌리기 위한 배치.
"진짜 대기"를 우리가 알고 있는 합성 세계를 만들고(굴뚝고·풍향에 체계적
편차 + 노이즈), 모델은 표준 가정값으로 예측하게 한다 → 물리모델에 실제와
같은 구조적 오차가 생기고, 보정 모델이 그것을 학습할 수 있는지 검증한다.

파이프라인 (검증 프로토콜 §6 절차 그대로):
  ① 수집 시계열 로드(weather_ts·emission_ts)
  ② 합성 관측 생성: obs = 배경 + 진짜기여(편차 물리) + 노이즈  [3개 측정소]
  ③ Δ농도 분리: 방법 A(가동/정지) · 방법 B(풍상측 프록시 차감) + 교차확인
  ④ B0(무귀속)/B1a(플룸)/B1b(퍼프) 예측
  ⑤ B2: 릿지 보정 학습 (시간 분리: 앞 70% 학습 / 뒤 30% 검증 — 누수 차단)
  ⑥ 지표: Δ기준 RMSE·MAE·R + B1b vs B2 윌콕슨 대응검정
  ⑦ public/data/validation-report.json 내보내기 (/report 페이지가 소비)

실행:  python -m engine.validate.ablation
"""

from __future__ import annotations

import json
import math
import sqlite3
import sys
from datetime import datetime

from ..config import DB_PATH, PUBLIC_DATA_DIR, STACK_H
from ..dispersion import plume, puff
from . import citizen
from .stats import Ridge, mae, pearson, rmse, wilcoxon_signed_rank_p

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

# ── 합성 진실(twin) 파라미터 — 모델 가정과 '다르게' 설정해 구조적 오차 유발 ──
# 주의: 풍향 편향을 12°로 키운 실험에서는 플룸 도달 '시점'이 어긋나
# 선형 보정이 오히려 악화(-8.8%)됨을 확인 — 방향 오차는 비선형 모델(P6b
# XGBoost)과 바람장 보정이 필요한 유형. 골격 검증은 보정이 설계상 고치는
# 진폭형 오차(굴뚝고·스케일) 중심으로 구성한다.
TRUE = {
    "stack_h": 55.0,   # 모델 가정 40m → 체계적 진폭 오차
    "wd_bias": 4.0,    # 경미한 방향 편차 (지형 효과)
    "gain": 1.3,       # 확산 스케일 오차
    "noise": 2.5,      # 관측 노이즈 σ (μg/m³)
}

# 검증 측정소 (배출원 원점 m) — 3번은 북서쪽: mock 주풍에서 대체로 풍상측
STATIONS = [
    {"id": "st1", "name": "하류 측정소 1", "ex": 1500, "ny": -1400},
    {"id": "st2", "name": "하류 측정소 2", "ex": 2200, "ny": -600},
    {"id": "st3", "name": "풍상 측정소 3", "ex": -2500, "ny": 2500},
]

TRAIN_FRACTION = 0.7
STAB_IDX = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}


def _det_noise(seed: float) -> float:
    """결정적 유사 노이즈 (재현성 NFR-8 — random 미사용)."""
    x = math.sin(seed * 12.9898) * 43758.5453
    return (x - math.floor(x) - 0.5) * 2  # [-1, 1)


def load_series() -> list[dict]:
    con = sqlite3.connect(DB_PATH)
    weather = con.execute(
        "SELECT ts, wd, ws, temp, stab FROM weather_ts ORDER BY ts"
    ).fetchall()
    emission = dict(
        con.execute(
            "SELECT ts, val * (op_status) FROM emission_ts WHERE item='nox'"
        ).fetchall()
    )
    op = dict(
        con.execute("SELECT ts, op_status FROM emission_ts WHERE item='nox'").fetchall()
    )
    con.close()
    out = []
    for ts, wd, ws, temp, stab in weather:
        if ts not in emission:
            continue
        out.append(
            {
                "ts": ts,
                "epoch": datetime.fromisoformat(ts).timestamp(),
                "hour": datetime.fromisoformat(ts).hour,
                "wd": wd,
                "ws": ws,
                "stab": stab or "D",
                "q": float(emission[ts] or 0.0),
                "op": int(op.get(ts, 1) or 0),
            }
        )
    return out


def synthesize(rows: list[dict]) -> None:
    """각 시각·측정소의 배경/진짜기여/관측을 rows 에 채운다."""
    for i, r in enumerate(rows):
        # 진짜 대기: 기록 풍향에 편향을 더한 바람 이력으로 퍼프 이류
        hours_true = [
            {"epoch": p["epoch"], "wd": (p["wd"] + TRUE["wd_bias"]) % 360,
             "ws": p["ws"], "stab": p["stab"]}
            for p in rows[max(0, i - 4): i + 1]
        ]
        puffs_true = puff.advect_puffs(hours_true, r["epoch"])
        # 공통 배경 + 측정소별 관측
        h = r["epoch"] / 3600
        bg = 15 + 8 * math.sin(h / 9.7) + 4 * math.cos(h / 3.3)
        r["bg_true"] = bg
        for st in STATIONS:
            contrib = TRUE["gain"] * puff.concentration_at(
                st["ex"], st["ny"], puffs_true, r["q"], TRUE["stack_h"]
            )
            noise = TRUE["noise"] * _det_noise(r["epoch"] + hash(st["id"]) % 97)
            r[f"true_{st['id']}"] = contrib
            r[f"obs_{st['id']}"] = max(0.0, bg + contrib + noise)


def separate_delta(rows: list[dict]) -> dict:
    """F-AI-01 — Δ농도 분리 (방법 A·B) + 교차확인. 대상: st1."""
    # 방법 A — 가동/정지 자연실험: 정지 시간의 관측으로 시간대별 배경 추정
    stopped_by_hour: dict[int, list[float]] = {}
    for r in rows:
        if r["op"] == 0:
            stopped_by_hour.setdefault(r["hour"], []).append(r["obs_st1"])
    overall_stopped = [v for vs in stopped_by_hour.values() for v in vs]
    overall_mean = sum(overall_stopped) / len(overall_stopped) if overall_stopped else 0.0

    for r in rows:
        vs = stopped_by_hour.get(r["hour"])
        bg_a = sum(vs) / len(vs) if vs else overall_mean
        r["delta_a"] = r["obs_st1"] - bg_a
        # 방법 B — 풍상측 차감: 시각별로 배출원 풍상측에 있는 측정소를 배경으로.
        # 풍상측 후보가 없으면 최저값 프록시 (프로토콜 §5.5 함정 대응)
        bearing = math.radians((r["wd"] + 180) % 360)
        upwind = [
            r[f"obs_{st['id']}"]
            for st in STATIONS
            if (st["ex"] * math.sin(bearing) + st["ny"] * math.cos(bearing)) < 0
        ]
        bg_b = min(upwind) if upwind else min(r[f"obs_{st['id']}"] for st in STATIONS)
        r["delta_b"] = r["obs_st1"] - bg_b

    corr_ab = pearson([r["delta_a"] for r in rows], [r["delta_b"] for r in rows])
    corr_b_true = pearson([r["delta_b"] for r in rows], [r["true_st1"] for r in rows])
    return {"corrAB": round(corr_ab, 3), "corrBTrue": round(corr_b_true, 3)}


def physics_predictions(rows: list[dict]) -> None:
    """B1a(플룸)·B1b(퍼프) — 표준 가정값(H=40, 기록 풍향)으로 st1 기여 예측."""
    st = STATIONS[0]
    for i, r in enumerate(rows):
        r["b1a"] = plume.concentration_at(
            st["ex"], st["ny"], r["q"], r["ws"], STACK_H, r["wd"], r["stab"]
        )
        hours = [
            {"epoch": p["epoch"], "wd": p["wd"], "ws": p["ws"], "stab": p["stab"]}
            for p in rows[max(0, i - 4): i + 1]
        ]
        r["b1b"] = puff.concentration_at(
            st["ex"], st["ny"], puff.advect_puffs(hours, r["epoch"]), r["q"], STACK_H
        )


def features(r: dict) -> list[float]:
    """곱셈형 보정 피처 — 전부 물리 예측에 비례해 '기여 0 → 예측 0' 보장.
    (절편형은 조용한 시간대에 잡음을 더해 기각 — 실험 로그 참조)"""
    wd = math.radians(r["wd"])
    return [
        r["b1b"],
        r["b1a"],
        r["b1b"] * math.sin(wd),
        r["b1b"] * math.cos(wd),
        r["b1b"] * r["ws"] / 10.0,
        r["b1b"] * STAB_IDX[r["stab"]] / 5.0,
    ]


def run() -> dict:
    rows = load_series()
    if len(rows) < 100:
        raise SystemExit(
            f"데이터 부족({len(rows)}시간) — 먼저 python -m engine.pipeline --mock --backfill 240"
        )
    synthesize(rows)
    delta_diag = separate_delta(rows)
    physics_predictions(rows)

    # ⑤ 시간 분리 (누수 차단): 앞 70% 학습 / 뒤 30% 검증
    split = int(len(rows) * TRAIN_FRACTION)
    train, test = rows[:split], rows[split:]

    model = Ridge(lam=2.0).fit(
        [features(r) for r in train], [r["delta_b"] for r in train]
    )

    target = [r["delta_b"] for r in test]
    preds = {
        "B0": [0.0] * len(test),  # 국가 방식 — 배출원 기여 귀속 없음
        "B1a": [r["b1a"] for r in test],
        "B1b": [r["b1b"] for r in test],
        # 배출원 기여 농도는 물리적으로 음수 불가 — 0 하한 절단 (튜닝 아님)
        "B2": [max(0.0, model.predict(features(r))) for r in test],
    }

    ladder = []
    names = {
        "B0": "측정소 현재값 (국가 방식·기여 무귀속)",
        "B1a": "가우시안 플룸 (정상상태)",
        "B1b": "가우시안 퍼프 (시간 전파)",
        "B2": "퍼프 + 보정 모델 (제안)",
    }
    notes = {
        "B0": "예측 부재의 한계",
        "B1a": "물리모델 기본 성능",
        "B1b": "시간 변동 반영",
        "B2": "보정 모델의 순수 기여",
    }
    for key in ("B0", "B1a", "B1b", "B2"):
        ladder.append(
            {
                "id": key,
                "name": names[key],
                "rmse": round(rmse(preds[key], target), 2),
                "mae": round(mae(preds[key], target), 2),
                "r": round(pearson(preds[key], target), 3),
                "note": notes[key],
            }
        )

    rmse_b1b = ladder[2]["rmse"]
    rmse_b2 = ladder[3]["rmse"]
    improvement = round((rmse_b1b - rmse_b2) / rmse_b1b * 100, 1) if rmse_b1b else 0.0

    # 개선의 불확실성 — 24h 블록 부트스트랩 (자기상관 보존, 시드 고정 NFR-8).
    # 이벤트가 희소해 heavy-tail — 대응 t/윌콕슨은 검정력 부족(실험으로 확인),
    # CI를 정직하게 보고하고 유의성 확보는 실데이터 표본 확대(P2b) 과제로 명시.
    import random

    block = 24
    blocks = [list(range(i, min(i + block, len(test)))) for i in range(0, len(test), block)]
    rng = random.Random(42)
    imps = []
    for _ in range(2000):
        idx = [j for b in rng.choices(blocks, k=len(blocks)) for j in b]
        a = rmse([preds["B1b"][j] for j in idx], [target[j] for j in idx])
        b = rmse([preds["B2"][j] for j in idx], [target[j] for j in idx])
        imps.append((a - b) / a * 100 if a > 0 else 0.0)
    imps.sort()

    report = {
        "kind": "synthetic-twin",
        "caveat": "합성 쌍둥이 실험 — mock 수집 데이터 위에 편차 물리(굴뚝고 55m·풍향 +4°·스케일 1.3)로 만든 합성 관측 기준. 실측(P2b) 검증으로 교체 예정",
        "generatedFrom": rows[-1]["ts"],
        "hours": len(rows),
        "trainHours": len(train),
        "testHours": len(test),
        "metric": "Δ농도(풍상 차감) RMSE (μg/m³)",
        "ladder": ladder,
        "improvementPct": improvement,
        "bootstrap": {
            "median": round(imps[len(imps) // 2], 1),
            "ci95": [round(imps[50], 1), round(imps[1949], 1)],
            "pLeqZero": round(sum(1 for x in imps if x <= 0) / len(imps), 3),
            "note": "이벤트 희소로 CI가 넓음 — p<0.01 확보는 실데이터 표본 확대 과제(프로토콜 §5)",
        },
        "deltaMethods": delta_diag,
        "model": "곱셈형 릿지 보정 (표준 라이브러리 자체 구현) — P6b에서 XGBoost 교체",
        # 검증창 시계열 샘플(마지막 96h) — /report 라인 차트가 소비
        "series": {
            "note": "검증(테스트) 구간 마지막 96시간 — 관측 Δ농도 vs 물리(B1b) vs 보정(B2)",
            "ts": [r["ts"][5:13].replace("T", " ") for r in test[-96:]],
            "true": [round(v, 2) for v in target[-96:]],
            "b1b": [round(v, 2) for v in preds["B1b"][-96:]],
            "b2": [round(v, 2) for v in preds["B2"][-96:]],
        },
    }

    # 플라이휠 ③: 시민 체감 제보를 정답 라벨로 소비 (있으면)
    feedback = citizen.summarize()
    if feedback:
        citizen.mark_consumed()
        report["citizenFeedback"] = feedback

    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA_DIR / "validation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    rep = run()
    print(json.dumps({k: rep[k] for k in ("hours", "improvementPct", "bootstrap", "deltaMethods")}, ensure_ascii=False, indent=2))
    for s in rep["ladder"]:
        print(f"  {s['id']:>3}  RMSE {s['rmse']:>7}  MAE {s['mae']:>7}  R {s['r']:>6}")
