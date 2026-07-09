"""
AUTO-01 스케줄러 — 30분 주기 상시 수집 루프.

실행:
  python -m engine.scheduler --mock                 # 30분 주기
  python -m engine.scheduler --mock --interval 60   # 데모용 60초 주기

표준 라이브러리만 사용(외부 스케줄러 의존 없음). 사이클 실패는 다음 주기에
자동 재시도되며, 실패 내역은 quality_log·pipeline_run에 남는다(AUTO-03).
n8n 대신 코드 스케줄러를 채택한 이유: 오프라인 데모 원칙(NFR-4)·운영 단순성.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime

# Windows 콘솔 cp949 대응
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

from .pipeline import KST, run_cycle


def main() -> None:
    ap = argparse.ArgumentParser(description="바람의 지도 수집 스케줄러 (AUTO-01)")
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--interval", type=int, default=1800, metavar="SEC", help="주기(초), 기본 1800=30분")
    args = ap.parse_args()

    print(f"[scheduler] {args.interval}초 주기 시작 (mode={'mock' if args.mock else 'live'}) — Ctrl+C 종료")
    while True:
        started = time.monotonic()
        try:
            r = run_cycle(datetime.now(KST), mock=args.mock)
            issues = f", 이슈 {len(r['issues'])}건" if r["issues"] else ""
            print(f"[scheduler] {r['ts']} 사이클 완료 ({r['mode']}{issues})")
        except Exception:
            # 사이클 실패가 루프를 죽이지 않는다 — 다음 주기 자동 재시도
            print("[scheduler] 사이클 예외 — 다음 주기에 재시도")
            traceback.print_exc()
        time.sleep(max(1.0, args.interval - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
