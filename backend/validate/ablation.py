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

실행:  python -m backend.validate.ablation
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from datetime import datetime

from ..config import DB_PATH, PUBLIC_DATA_DIR
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
    "stack_h": 120.0,  # 파일럿(청주 소각) 실제 굴뚝고 — tms_stack_params_chungbuk.xlsx
    "wd_bias": 4.0,    # 경미한 방향 편차 (지형 효과)
    "gain": 1.3,       # 확산 스케일 오차
    "noise": 2.5,      # 관측 노이즈 σ (μg/m³)
}

# 파일럿 실제 굴뚝고 (xlsx). 모델 물리 예측이 이 값을 쓰도록 STACK_H 대신 사용.
# 두 굴뚝(stack_code 1,2) 모두 120m 로 동일 → 대표값 하나로 충분.
# ponytail: 플룸 라이즈(Δh) 도입 실험 결과 이 검증 세팅(st1 1500m 거리 + 실입력
# 저풍속 65%)에선 오히려 신호 소실(R 0.79→0.31). 함수(plume.plume_rise_briggs)는
# 다른 확산 계산용으로 보존, 여기선 물리고도 그대로 사용.
PILOT_STACK_H = 120.0

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


# ── 실입력 로더 (--real) — 실배출(TMS)·실바람(ASOS)을 스냅샷에서 읽어 rows 구성 ──
# 시범 배출원: 청주 소각시설(가동/정지 뚜렷 → 방법 A 자연실험 성립, 시범배출원 서사와 정합)
PILOT_FACILITY = "청주시 생활폐기물처리시설"


def _parse_ts_real(label: str, year: int = 2026) -> tuple[str, float, int]:
    """스냅샷 시각 라벨 '7/10 20시' → (iso, epoch, hour)."""
    date_part, hour_part = label.split(" ")
    mo, day = (int(x) for x in date_part.split("/"))
    hour = int(hour_part.replace("시", ""))
    dt = datetime(year, mo, day, hour)
    return dt.isoformat(), dt.timestamp(), hour


def _derive_stab(hour: int, ws: float) -> str:
    """실측 안정도 미제공 → 주야·풍속 기반 Pasquill 근사(라벨로 명시)."""
    if hour <= 5 or hour >= 21:  # 야간
        return "E" if ws < 2.5 else "D"
    if 10 <= hour <= 16:  # 주간
        return "C" if ws < 3 else "D"
    return "D"


def load_series_real(pilot: str = PILOT_FACILITY) -> tuple[list[dict], str]:
    """front/public/data/chungbuk.json 에서 시범 배출원 실 NOx + 소속 시군 실바람 로드."""
    snap = json.loads((PUBLIC_DATA_DIR / "chungbuk.json").read_text(encoding="utf-8"))
    names = [f["name"] for f in snap["facilities"]]
    if pilot in names:
        fi = names.index(pilot)
    else:  # 폴백: NOx 가동시간 최다 시설 자동 선택
        fi = max(range(len(names)), key=lambda i: sum(1 for v in snap["emis"]["NOx"][i] if v))
        pilot = names[fi]
    city = snap["facilities"][fi]["city"]
    wind = snap["wind"].get(city, {})
    wd_arr, ws_arr = wind.get("wd", []), wind.get("ws", [])
    nox = snap["emis"]["NOx"][fi]
    out: list[dict] = []
    for t, label in enumerate(snap["times"]):
        wd = wd_arr[t] if t < len(wd_arr) else None
        ws = ws_arr[t] if t < len(ws_arr) else None
        if wd is None or ws is None:
            continue  # 바람 결측 시각 제외
        iso, epoch, hour = _parse_ts_real(label)
        q = float(nox[t] or 0.0)
        out.append(
            {
                "ts": iso,
                "epoch": epoch,
                "hour": hour,
                "wd": float(wd),
                "ws": float(ws),
                "stab": _derive_stab(hour, float(ws)),
                "q": q,
                "op": 1 if q > 0 else 0,
            }
        )
    return out, pilot


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
            # 측정소별 노이즈 위상 분리 — 결정적 시드(재현성 NFR-8, hash() 금지)
            st_seed = sum(ord(c) for c in st["id"])
            noise = TRUE["noise"] * _det_noise(r["epoch"] + st_seed)
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
    """B1a(플룸)·B1b(퍼프) — 파일럿 실제 굴뚝고(xlsx)·기록 풍향으로 st1 기여 예측."""
    st = STATIONS[0]
    for i, r in enumerate(rows):
        r["b1a"] = plume.concentration_at(
            st["ex"], st["ny"], r["q"], r["ws"], PILOT_STACK_H, r["wd"], r["stab"]
        )
        hours = [
            {"epoch": p["epoch"], "wd": p["wd"], "ws": p["ws"], "stab": p["stab"]}
            for p in rows[max(0, i - 4): i + 1]
        ]
        r["b1b"] = puff.concentration_at(
            st["ex"], st["ny"], puff.advect_puffs(hours, r["epoch"]), r["q"], PILOT_STACK_H
        )


def features(r: dict) -> list[float]:
    """곱셈형 보정 피처 — 전부 물리 예측에 비례해 '기여 0 → 예측 0' 보장.
    (절편형은 조용한 시간대에 잡음을 더해 기각 — 실험 로그 참조)"""
    # ponytail: 원래 6피처였으나 계수 안정성 진단(2026-08-22)에서 cos(wd)·ws/10 이
    # 5-fold·풍향·풍속 슬라이스마다 부호 뒤집힘 → 노이즈로 판정 후 제거. 4피처 축소로
    # 실입력 성능 유지(2.7→2.2%p), 통제에서 오히려 개선(22.4→25.1%). λ는 _compute() 참조.
    wd = math.radians(r["wd"])
    return [
        r["b1b"],
        r["b1a"],
        r["b1b"] * math.sin(wd),
        r["b1b"] * STAB_IDX[r["stab"]] / 5.0,
    ]


def _compute(rows: list[dict], real: bool, pilot: str | None) -> dict:
    """입력 시계열 rows → 합성 관측·Δ분리·물리·보정·지표 산출 (파일 쓰기 없음)."""
    synthesize(rows)
    delta_diag = separate_delta(rows)
    physics_predictions(rows)

    # ⑤ 시간 분리 (누수 차단): 앞 70% 학습 / 뒤 30% 검증
    split = int(len(rows) * TRAIN_FRACTION)
    train, test = rows[:split], rows[split:]

    # ponytail: λ=15 는 4피처 축소(2026-08-22) 후 실입력·통제 종합 최적 —
    # 실입력 +2.2% · 통제 +25.1%. 실입력 단독 최적은 λ=50 이나 통제에서 크게 손해라 절충.
    # 피처/굴뚝고 변경 시 재스윕 필수. CV 로 자동 선택은 실측 표본 확대(P2b) 후 도입.
    model = Ridge(lam=15.0).fit(
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

    # 검증 구간이 짧으면(실입력 ~6일치) 블록을 줄여 부트스트랩 표본 확보
    block = 24 if len(test) >= 96 else 12
    blocks = [list(range(i, min(i + block, len(test)))) for i in range(0, len(test), block)]
    rng = random.Random(42)
    imps = []
    for _ in range(2000):
        idx = [j for b in rng.choices(blocks, k=len(blocks)) for j in b]
        a = rmse([preds["B1b"][j] for j in idx], [target[j] for j in idx])
        b = rmse([preds["B2"][j] for j in idx], [target[j] for j in idx])
        imps.append((a - b) / a * 100 if a > 0 else 0.0)
    imps.sort()

    kind = "real-input-twin" if real else "synthetic-twin"
    if real:
        caveat = (
            f"실입력 합성-쌍둥이 — 실배출(CleanSYS TMS, {pilot} NOx)·실바람(ASOS)을 입력으로 "
            f"구동. 배출원 순수 기여의 '정답'은 측정소 총농도에서 분리 불가라 편차 물리(굴뚝고 "
            f"55m·풍향+4°·스케일1.3)+노이즈로 합성. 실측 Δ검증은 전용 시범배출원 가동/정지 "
            f"자연실험(P2b) 과제. 실입력 표본 {len(rows)}h"
        )
        metric = "Δ농도(풍상 차감) RMSE (μg/m³) · 실입력(TMS·ASOS)"
    else:
        caveat = (
            "합성 쌍둥이 실험 — mock 수집 데이터 위에 편차 물리(굴뚝고 55m·풍향 +4°·스케일 1.3)로 "
            "만든 합성 관측 기준. 실측(P2b) 검증으로 교체 예정"
        )
        metric = "Δ농도(풍상 차감) RMSE (μg/m³)"

    report = {
        "kind": kind,
        "caveat": caveat,
        "generatedFrom": rows[-1]["ts"],
        "pilot": pilot,
        "hours": len(rows),
        "trainHours": len(train),
        "testHours": len(test),
        "metric": metric,
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
        # ponytail: 라이브 예측이 로드할 계수. 스키마 = features() 순서 고정.
        "b2Coef": {
            "lam": model.lam,
            "features": ["b1b", "b1a", "b1b*sin(wd)", "b1b*stab/5"],
            "weights": [round(w, 6) for w in model.w],
        },
        # 검증창 시계열 샘플(마지막 96h) — /report 라인 차트가 소비
        "series": {
            "note": "검증(테스트) 구간 마지막 96시간 — 관측 Δ농도 vs 물리(B1b) vs 보정(B2)",
            "ts": [r["ts"][5:13].replace("T", " ") for r in test[-96:]],
            "true": [round(v, 2) for v in target[-96:]],
            "b1b": [round(v, 2) for v in preds["B1b"][-96:]],
            "b2": [round(v, 2) for v in preds["B2"][-96:]],
        },
    }

    return report


def _attach_citizen(report: dict) -> None:
    """플라이휠 ③: 시민 체감 제보를 정답 라벨로 소비 (있으면)."""
    feedback = citizen.summarize()
    if feedback:
        citizen.mark_consumed()
        report["citizenFeedback"] = feedback


def _write(report: dict) -> None:
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA_DIR / "validation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def run(real: bool = False) -> dict:
    """단일 실행 — real=False: 통제 합성-쌍둥이(mock 구동) · real=True: 실입력(TMS·ASOS)."""
    if real:
        rows, pilot = load_series_real()
    else:
        rows, pilot = load_series(), None
    if len(rows) < 100:
        hint = (
            "실입력 시계열이 짧습니다 — build_snapshot.py 재생성 후 재시도"
            if real
            else "먼저 python -m backend.pipeline --mock --backfill 240"
        )
        raise SystemExit(f"데이터 부족({len(rows)}시간) — {hint}")
    report = _compute(rows, real, pilot)
    _attach_citizen(report)
    _write(report)
    return report


def run_combined() -> dict:
    """통제(합성-쌍둥이) + 실입력(TMS·ASOS)을 한 리포트로 — /report 나란히 게시용."""
    ctrl_rows = load_series()
    if len(ctrl_rows) < 100:
        raise SystemExit(
            f"통제 데이터 부족({len(ctrl_rows)}h) — python -m backend.pipeline --mock --backfill 240"
        )
    report = _compute(ctrl_rows, real=False, pilot=None)
    try:
        real_rows, pilot = load_series_real()
        if len(real_rows) >= 100:
            r = _compute(real_rows, real=True, pilot=pilot)
            report["realInput"] = {
                k: r[k]
                for k in (
                    "caveat", "pilot", "hours", "trainHours", "testHours",
                    "metric", "ladder", "improvementPct", "bootstrap", "series", "b2Coef",
                )
            }
        else:
            report["realInputError"] = f"실입력 {len(real_rows)}h < 100"
    except Exception as e:  # 실입력 실패해도 통제 리포트는 유지
        report["realInputError"] = str(e)
    _attach_citizen(report)
    _write(report)
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="F-VAL-01 애블레이션 배치")
    ap.add_argument(
        "--real",
        action="store_true",
        help="실배출(TMS)·실바람(ASOS) 입력으로만 구동 (front/public/data/chungbuk.json)",
    )
    ap.add_argument(
        "--combined",
        action="store_true",
        help="통제(합성-쌍둥이) + 실입력을 한 리포트로 나란히 (권장 — /report 게시용)",
    )
    args = ap.parse_args()
    rep = run_combined() if args.combined else run(real=args.real)
    print(f"kind={rep['kind']} · pilot={rep.get('pilot')} · metric={rep['metric']}")
    print(json.dumps({k: rep[k] for k in ("hours", "improvementPct", "bootstrap", "deltaMethods")}, ensure_ascii=False, indent=2))
    for s in rep["ladder"]:
        print(f"  {s['id']:>3}  RMSE {s['rmse']:>7}  MAE {s['mae']:>7}  R {s['r']:>6}")
    if rep.get("realInput"):
        ri = rep["realInput"]
        print(f"  [realInput] pilot={ri['pilot']} · {ri['hours']}h · 개선 {ri['improvementPct']}%")
        for s in ri["ladder"]:
            print(f"    {s['id']:>3}  RMSE {s['rmse']:>7}  R {s['r']:>6}")
    if rep.get("realInputError"):
        print("  [realInput] 실패:", rep["realInputError"])
