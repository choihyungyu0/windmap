"""
AUTO-01 수집→(예측)→내보내기 1사이클.

실행:
  python -m engine.pipeline --mock            # 키 없이 완주 (현재 시각 1사이클)
  python -m engine.pipeline --mock --backfill 72   # 과거 72시간 채우기 (학습 데이터 흉내)
  python -m engine.pipeline                   # 키 있으면 live, 없으면 mock 폴백

예측 단계(F-DSP-02 퍼프·F-AI-02 보정)는 P3/P6에서 이 파이프라인에 끼워진다 —
지금은 수집→품질감시→저장→상태 내보내기까지가 골격이다.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

# Windows 콘솔 cp949 대응 — 한글·특수문자 출력 깨짐 방지
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from .collectors import airkorea, tms, weather
from .db import connect, upsert_many
from .export import write_status
from .quality import audit_cycle

KST = timezone(timedelta(hours=9))


def run_cycle(when: datetime, mock: bool) -> dict:
    ts_iso = when.replace(minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    ts_epoch = when.timestamp()

    results = {
        "tms": tms.collect(ts_epoch, ts_iso, mock),
        "weather": weather.collect(ts_epoch, ts_iso, mock),
        "airkorea": airkorea.collect(ts_epoch, ts_iso, mock),
    }

    with connect() as con:
        upsert_many(con, "emission_ts", ["source_id", "item", "val", "op_status", "ts"], results["tms"]["rows"])
        upsert_many(con, "weather_ts", ["site", "wd", "ws", "temp", "stab", "ts"], results["weather"]["rows"])
        upsert_many(con, "station_ts", ["station_id", "item", "val", "ts"], results["airkorea"]["rows"])

        issues = audit_cycle(con, ts_iso, results)
        mode = (
            "mock" if all(r["mode"] == "mock" for r in results.values())
            else "live" if all(r["mode"] == "live" for r in results.values())
            else "live-fallback"
        )
        ok = 0 if any(i["level"] == "error" for i in issues) else 1
        summary = {k: {"mode": v["mode"], "rows": len(v["rows"])} for k, v in results.items()}
        con.execute(
            "INSERT INTO pipeline_run (ts, mode, ok, summary) VALUES (?,?,?,?)",
            (ts_iso, mode, ok, json.dumps(summary, ensure_ascii=False)),
        )
        write_status(con, ts_iso, mode, results, issues)

    return {"ts": ts_iso, "mode": mode, "ok": ok, "summary": summary, "issues": issues}


def main() -> None:
    ap = argparse.ArgumentParser(description="바람의 지도 수집 파이프라인 (AUTO-01)")
    ap.add_argument("--mock", action="store_true", help="키 없이 결정적 mock 데이터로 실행")
    ap.add_argument("--backfill", type=int, default=0, metavar="HOURS", help="과거 N시간 시간별 채우기")
    args = ap.parse_args()

    now = datetime.now(KST)
    if args.backfill > 0:
        for i in range(args.backfill, 0, -1):
            r = run_cycle(now - timedelta(hours=i), mock=args.mock)
            if i % 24 == 0 or i == 1:
                print(f"backfill {i:>3}h 전 → {r['ts']} ({r['mode']})")
    r = run_cycle(now, mock=args.mock)
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
