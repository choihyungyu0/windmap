#!/usr/bin/env python3
"""
build_snapshot.py — 충북 전역 확산 대시보드(const D)를 프론트 스냅샷으로 export.

표준 라이브러리만 사용 (backend 관례: 외부 패키지 0).

`chungbuk_dispersion_dashboard.html` 안의 `const D = {...};` 는 수집기(collectors/)가
공공 API에서 받아온 raw/ 데이터를 **시군별·시간별로 집계한 완결 데이터셋**이다
(1156시간, 시설63·측정소34·시군8, 배출 NOx/HCl/SOx/TSP + 측정 NO2/SO2/PM10/PM25 +
시군별 wd/ws). 이 스크립트는 그 객체를 그대로 뽑아 프론트가 fetch 하는
`front/public/data/chungbuk.json` 으로 기록한다.

→ 프론트 시각화가 백엔드 대시보드와 **정확히 동일한 집계값**으로 구동된다.
   대시보드가 갱신(재수집)되면 이 스크립트를 재실행해 스냅샷을 갱신한다.

실행 (windmap 루트 또는 어디서든):
    python backend/data/build_snapshot.py
    python backend/data/build_snapshot.py --check   # 스키마 검증만
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent                     # backend/data
DASHBOARD = HERE / "chungbuk_dispersion_dashboard.html"
OUT = HERE.parent.parent / "front" / "public" / "data" / "chungbuk.json"

# 스냅샷이 반드시 가져야 하는 최상위 키 (프론트 lib/chungbuk.ts 계약)
REQUIRED_KEYS = {
    "times", "n", "cities", "facilities", "emis",
    "stations", "meas", "wind", "domain", "city_centroids",
}


def extract_d(html: str) -> dict:
    """대시보드 HTML에서 `const D = {...};` 한 줄을 찾아 파싱한다.

    D 객체는 단일(초장문) 라인이라 줄 단위 스캔이 가장 안전하다
    (문자열 안의 `;` 로 인한 정규식 오탐 방지).
    """
    for line in html.splitlines():
        s = line.lstrip()
        if s.startswith("const D ") and "=" in s:
            body = s.split("=", 1)[1].strip()
            if body.endswith(";"):
                body = body[:-1].rstrip()
            return json.loads(body)
    raise SystemExit("‼ `const D = ...` 라인을 대시보드에서 찾지 못했습니다.")


def validate(d: dict) -> list[str]:
    """프론트 계약과 어긋나는 점을 문자열 목록으로 반환(빈 목록 = OK)."""
    problems: list[str] = []
    missing = REQUIRED_KEYS - d.keys()
    if missing:
        problems.append(f"누락된 최상위 키: {sorted(missing)}")

    n = d.get("n")
    if n != len(d.get("times", [])):
        problems.append(f"n({n}) != len(times)({len(d.get('times', []))})")

    nf = len(d.get("facilities", []))
    for pol, mat in d.get("emis", {}).items():
        if len(mat) != nf:
            problems.append(f"emis[{pol}] 행수 {len(mat)} != 시설수 {nf}")
        elif mat and len(mat[0]) != n:
            problems.append(f"emis[{pol}] 열수 {len(mat[0])} != n {n}")

    ns = len(d.get("stations", []))
    for key, mat in d.get("meas", {}).items():
        if len(mat) != ns:
            problems.append(f"meas[{key}] 행수 {len(mat)} != 측정소수 {ns}")

    for city in d.get("cities", []):
        if city not in d.get("wind", {}):
            problems.append(f"wind 에 시군 '{city}' 바람 없음")
    return problems


def main() -> int:
    # Windows 콘솔(cp949)에서도 기호·한글 출력이 깨지지 않도록
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="충북 확산 대시보드 → 프론트 스냅샷 export")
    ap.add_argument("--check", action="store_true", help="파일 쓰지 않고 스키마 검증만")
    args = ap.parse_args()

    if not DASHBOARD.exists():
        raise SystemExit(f"‼ 대시보드 파일 없음: {DASHBOARD}")

    d = extract_d(DASHBOARD.read_text(encoding="utf-8"))
    problems = validate(d)
    if problems:
        print("⚠ 검증 경고:")
        for p in problems:
            print("  -", p)
    else:
        print("✓ 스키마 검증 통과")

    print(
        f"  기간 {d['times'][0]} ~ {d['times'][-1]} · {d['n']}시간 · "
        f"시설 {len(d['facilities'])} · 측정소 {len(d['stations'])} · "
        f"시군 {len(d['cities'])} · 배출물질 {list(d['emis'])} · 측정 {list(d['meas'])}"
    )

    if args.check:
        return 1 if problems else 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 실데이터 파일 — 용량 최소화 위해 compact, 한글 그대로(ensure_ascii=False)
    OUT.write_text(
        json.dumps(d, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    kb = OUT.stat().st_size / 1024
    print(f"→ {OUT}  ({kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
