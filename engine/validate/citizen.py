"""
시민 체감 제보 소비 (플라이휠 ③단계) — 제보를 '측정소 없는 곳의 정답 라벨'로.

프론트(/api/report)가 engine/citizen-reports.jsonl 에 append 한 제보를 읽어
예측↔체감 교차검증 지표를 산출하고 소비 표시(consumed)한다. 실제 재학습에서는
이 라벨이 보정 모델의 지도 신호가 되며(P6b), 현재 골격은 신뢰 지표까지 산출한다.

- reporter 가중: 기관 제보자(facility) 2배, 주민 1배 (거짓/장난 방어)
- 예측 '주의 이상' ↔ 체감 '냄새남' 일치를 F1으로
"""

from __future__ import annotations

import json
from pathlib import Path

from ..config import ENGINE_DIR

REPORTS_PATH = ENGINE_DIR / "citizen-reports.jsonl"


def _weight(reporter: str) -> float:
    return 2.0 if reporter == "facility" else 1.0


def summarize() -> dict | None:
    if not REPORTS_PATH.exists():
        return None
    rows = []
    for line in REPORTS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if not rows:
        return None

    tp = fp = fn = tn = 0.0  # 예측 주의이상=양성, 체감 냄새남=실제 양성
    facility = 0
    for r in rows:
        w = _weight(r.get("reporter", "resident"))
        if r.get("reporter") == "facility":
            facility += 1
        pred = r.get("predLevel")
        if not pred:
            continue
        pred_bad = pred not in ("좋음", "good")
        smell = bool(r.get("smell"))
        if pred_bad and smell:
            tp += w
        elif pred_bad and not smell:
            fp += w
        elif not pred_bad and smell:
            fn += w
        else:
            tn += w

    comparable = tp + fp + fn + tn
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision and recall
        else None
    )
    agreement = (tp + tn) / comparable if comparable else None

    return {
        "total": len(rows),
        "facilityShare": round(facility / len(rows) * 100),
        "labeledForTraining": int(comparable),
        "agreementPct": round(agreement * 100) if agreement is not None else None,
        "alertF1": round(f1, 3) if f1 is not None else None,
        "note": "체감 제보를 정답 라벨로 소비 — 예측↔체감 교차검증(가중). 보정 모델 지도 신호로 사용(P6b).",
    }


def mark_consumed() -> int:
    """소비 표시 — consumed=true 로 재작성. 반환: 새로 소비한 건수."""
    if not REPORTS_PATH.exists():
        return 0
    lines = REPORTS_PATH.read_text(encoding="utf-8").splitlines()
    out = []
    newly = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not obj.get("consumed"):
            obj["consumed"] = True
            newly += 1
        out.append(json.dumps(obj, ensure_ascii=False))
    REPORTS_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")
    return newly
