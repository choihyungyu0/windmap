"""
F-COL-02 기상 수집 — 풍향·풍속·기온 + Pasquill-Gifford 안정도 산출.

안정도는 Turner 간략법: 주간(07~18시)은 풍속·일사 근사, 야간은 풍속 기준.
정밀화(일사량·운량 반영)는 P3에서 퍼프 엔진과 함께 고도화한다.
"""

from __future__ import annotations

from datetime import datetime

from ..config import ASOS_BASE, SERVICE_KEY, WEATHER_STATION
from .base import FetchError, http_get_json, mock_weather


def pg_stability(ws: float, hour: int) -> str:
    """Turner 간략법 — 풍속(m/s)·시각으로 P-G 계급."""
    day = 7 <= hour <= 18
    if day:
        if ws < 2:
            return "B"
        if ws < 3:
            return "B"
        if ws < 5:
            return "C"
        return "D"
    if ws < 2:
        return "F"
    if ws < 3:
        return "E"
    return "D"


def collect(ts_epoch: float, ts_iso: str, mock: bool) -> dict:
    hour = datetime.fromisoformat(ts_iso).hour
    if mock or not SERVICE_KEY:
        wd, ws, temp = mock_weather(ts_epoch)
        stab = pg_stability(ws, hour)
        rows = [(WEATHER_STATION["id"], wd, ws, temp, stab, ts_iso)]
        msg = "mock 생성" if mock else "서비스 키 미설정 — mock 폴백"
        return {"rows": rows, "mode": "mock", "message": msg}

    try:
        data = http_get_json(
            f"{ASOS_BASE}/getWthrDataList",
            {
                "serviceKey": SERVICE_KEY,
                "stnIds": WEATHER_STATION["id"],
                "dataType": "JSON",
                "dataCd": "ASOS",
                "dateCd": "HR",
            },
        )
        # TODO(P2b): 실응답 스키마 확인 후 파싱 확정
        _ = data
        return {"rows": [], "mode": "live", "message": "0행 수집"}
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
