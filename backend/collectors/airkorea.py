"""
F-COL-03 에어코리아 측정소 실측 수집 — 검증(Δ농도 대조)의 기준값.
"""

from __future__ import annotations

from ..config import AIRKOREA_BASE, AIR_STATIONS, SERVICE_KEY
from .base import FetchError, http_get_json, mock_station


def collect(ts_epoch: float, ts_iso: str, mock: bool) -> dict:
    if mock or not SERVICE_KEY:
        rows = [
            (st["id"], "pm25", mock_station(ts_epoch, st["id"]), ts_iso)
            for st in AIR_STATIONS
        ]
        msg = "mock 생성" if mock else "서비스 키 미설정 — mock 폴백"
        return {"rows": rows, "mode": "mock", "message": msg}

    try:
        rows = []
        for st in AIR_STATIONS:
            data = http_get_json(
                f"{AIRKOREA_BASE}/getMsrstnAcctoRltmMesureDnsty",
                {
                    "serviceKey": SERVICE_KEY,
                    "stationName": st["id"],
                    "dataTerm": "DAILY",
                    "returnType": "json",
                    "ver": "1.3",
                },
            )
            # TODO(P2b): 실응답 스키마 확인 후 파싱 확정
            _ = data
        return {"rows": rows, "mode": "live", "message": f"{len(rows)}행 수집"}
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
