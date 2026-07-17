"""
backend 전역 설정 — 경로·API 키·시범 배출원/측정소 정의.

외부 패키지 의존 없음(표준 라이브러리만). 키는 front/.env.local 에서
읽는다(DATA_GO_KR_SERVICE_KEY — Next.js 규약상 env 파일은 front 에 둔다).
키가 없으면 수집기는 mock 폴백으로 동작한다.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # windmap/
BACKEND_DIR = Path(__file__).resolve().parent  # windmap/backend/
DB_PATH = BACKEND_DIR / "windmap.sqlite"
PUBLIC_DATA_DIR = ROOT / "front" / "public" / "data"
STATUS_PATH = PUBLIC_DATA_DIR / "pipeline-status.json"


def _load_env_local() -> dict[str, str]:
    """front/.env.local 단순 파서 (KEY=VALUE, # 주석). 루트 폴백 지원."""
    env: dict[str, str] = {}
    p = ROOT / "front" / ".env.local"
    if not p.exists():
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

# ── 시범 배출원 (오픈이슈 #1 확정 — CleanSYS 실시간 실측 + VWorld 지오코딩 좌표) ──
# CleanSYS rltmMesureResult(areaNm=충청북도) 응답의 fact_manage_nm/stack_code 로 매칭한다.
# lat/lon 은 시설 실주소 지오코딩 실좌표. 첫 항목(소각장)이 시범 주배출원.
SOURCES = [
    {
        "id": "cheongju_inc",
        "name": "청주시 생활폐기물처리시설(소각)",
        "lat": 36.624098, "lon": 127.404721,
        "cleansys_fact_nm": "청주시 생활폐기물처리시설",
        "cleansys_stack_code": "2",
    },
    {
        "id": "kleannara",
        "name": "깨끗한나라 청주공장",
        "lat": 36.593287, "lon": 127.339334,
        "cleansys_fact_nm": "깨끗한나라㈜ 청주공장",
        "cleansys_stack_code": "6",
    },
    {
        "id": "env_hq",
        "name": "청주시환경관리본부(하수처리)",
        "lat": 36.663603, "lon": 127.394081,
        "cleansys_fact_nm": "청주시환경관리본부(하수처리과)",
        "cleansys_stack_code": "1",
    },
]

# 기상청 관측 지점 (청주 ASOS 지점번호 131)
WEATHER_STATION = {"id": "131", "name": "청주"}

# 수용지점(취약시설) — 배출원 원점 미터 오프셋. lib/mock.ts 와 정합.
RECEPTORS = [
    {"id": "r1", "name": "초등학교 가", "ex": 1200, "ny": 900},
    {"id": "r2", "name": "요양병원 나", "ex": -950, "ny": 1650},
    {"id": "r3", "name": "경로당 다", "ex": 1300, "ny": -1200},
    {"id": "r4", "name": "아파트단지 라", "ex": 2300, "ny": -2100},
    {"id": "r5", "name": "마을회관 마", "ex": -2200, "ny": -1150},
]

# 유효 굴뚝고 표준 가정값 (오픈이슈 O-2)
STACK_H = 40.0

# 에어코리아 측정소 (검증 기준값). id=에어코리아 실제 측정소명.
# 충북 전역 34곳을 data/raw/stations_chungbuk.json(getMsrstnList addr=충북 실측)에서 로드 —
# 단일 소스. 파일이 없으면 청주 대표 6곳으로 폴백.
_AIR_FALLBACK = [
    {"id": "봉명동", "name": "봉명동(청주)"}, {"id": "복대동", "name": "복대동(청주)"},
    {"id": "사천동", "name": "사천동(청주)"}, {"id": "오송읍", "name": "오송읍(청주)"},
    {"id": "산남동", "name": "산남동(청주)"}, {"id": "오창읍", "name": "오창읍(청주)"},
]


def _load_air_stations() -> list[dict]:
    """충북 전역 측정소 34곳 로드 (stations_chungbuk.json). 실패 시 청주 6곳 폴백."""
    import json
    p = BACKEND_DIR / "data" / "raw" / "stations_chungbuk.json"
    if p.exists():
        try:
            st = json.loads(p.read_text(encoding="utf-8"))
            rows = [{"id": nm, "name": f"{nm}({(m or {}).get('city', '')})"}
                    for nm, m in st.items()]
            if rows:
                return rows
        except (ValueError, OSError):
            pass
    return _AIR_FALLBACK


AIR_STATIONS = _load_air_stations()

# ── 실 API 엔드포인트 ──
# CleanSYS: 스모크 테스트로 확정(rltmMesureResult, areaNm=충청북도, type=json).
#   ⚠ 기존 후보 StackTotalService/getUnityDayAvgInfo(사업장별)는 실동작 미확인 →
#     실시간 전역 조회가 되는 cleansys/rltmMesureResult 로 교체.
# ASOS·에어코리아는 P2b에서 weather.py·airkorea.py 연동 시 함께 확정.
CLEANSYS_BASE = "https://apis.data.go.kr/B552584/cleansys"
CLEANSYS_AREA = "충청북도"   # rltmMesureResult areaNm — 도 전역 1회 조회
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
