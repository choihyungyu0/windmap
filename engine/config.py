"""
engine 전역 설정 — 경로·API 키·시범 배출원/측정소 정의.

외부 패키지 의존 없음(표준 라이브러리만). 키는 프로젝트 루트 .env.local 에서
읽는다(DATA_GO_KR_SERVICE_KEY). 키가 없으면 수집기는 mock 폴백으로 동작한다.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # windmap/
ENGINE_DIR = ROOT / "engine"
DB_PATH = ENGINE_DIR / "windmap.sqlite"
PUBLIC_DATA_DIR = ROOT / "public" / "data"
STATUS_PATH = PUBLIC_DATA_DIR / "pipeline-status.json"


def _load_env_local() -> dict[str, str]:
    """루트 .env.local 단순 파서 (KEY=VALUE, # 주석)."""
    env: dict[str, str] = {}
    p = ROOT / ".env.local"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


_ENV = _load_env_local()

SERVICE_KEY: str = os.environ.get(
    "DATA_GO_KR_SERVICE_KEY", _ENV.get("DATA_GO_KR_SERVICE_KEY", "")
)

# ── 시범 대상 정의 (오픈이슈 #1 확정 전 임시 — CleanSYS 충북 등재 확인 후 교체) ──
# 좌표는 lib/mock.ts 의 시범 배출원과 정합.
SOURCES = [
    {
        "id": "s1",
        "name": "시범 배출원 A (소각시설)",
        "lat": 36.72,
        "lon": 127.49,
        # CleanSYS 사업장 식별자 — 키 발급 후 스모크 테스트에서 확정 (P2b)
        "cleansys_fact_id": None,
    },
]

# 기상청 관측 지점 (청주 ASOS 지점번호 131)
WEATHER_STATION = {"id": "131", "name": "청주"}

# 에어코리아 측정소 (검증 기준값 — 배출원 하류 후보, P2b에서 풍향 분석 후 확정)
AIR_STATIONS = [
    {"id": "송정동", "name": "송정동(청주)"},
    {"id": "사천동", "name": "사천동(청주)"},
]

# ── 실 API 엔드포인트 후보 (⚠ 키 발급 후 스모크 테스트로 확정 — P2b) ──
# 공공데이터포털 게이트웨이 기준. 파라미터·응답 스키마는 실호출로 검증한다.
CLEANSYS_BASE = "https://apis.data.go.kr/B552584/StackTotalService"
ASOS_BASE = "https://apis.data.go.kr/1360000/AsosHourlyInfoService"
AIRKOREA_BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc"

# 수집 항목 (TMS 7항목)
TMS_ITEMS = ["dust", "sox", "nox", "hcl", "hf", "nh3", "co"]

# 이상치 기준 (품질 감시 AUTO-03) — 물리적으로 불가능한 값 컷
QUALITY_BOUNDS = {
    "nox": (0.0, 500.0),  # ppm
    "ws": (0.0, 60.0),  # m/s
    "wd": (0.0, 360.0),
    "temp": (-40.0, 55.0),  # ℃
    "pm25": (0.0, 1000.0),  # μg/m³
}

RETRY_COUNT = 3  # 수집 실패 재시도 (기능명세 F-COL-01 비고)
HTTP_TIMEOUT_S = 15
