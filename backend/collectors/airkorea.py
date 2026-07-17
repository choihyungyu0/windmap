"""
F-COL-03 에어코리아 측정소 실측 수집 — 검증(Δ농도 대조)의 기준값.

live 연동 확정(P2b):
  엔드포인트  https://apis.data.go.kr/B552584/ArpltnInforInqireSvc
              /getMsrstnAcctoRltmMesureDnsty
  파라미터    serviceKey, returnType=json, stationName, dataTerm=DAILY, ver=1.0,
              numOfRows=1, pageNo=1  (측정소별 최신 1건)
  응답        response.body.items = [{dataTime, no2Value, so2Value,
              pm10Value, pm25Value, ...}]  ('-'·null=결측)
  측정소명    config.AIR_STATIONS 의 실제 측정소명(에어코리아 getMsrstnList 확인).
키가 없으면 mock 폴백(기존 동작 유지).
"""

from __future__ import annotations

from ..config import AIRKOREA_BASE, AIR_STATIONS, SERVICE_KEY
from .base import (FetchError, http_get_json, mock_station, parse_num,
                   portal_items, portal_ok)

# 검증·확산 대시보드에 쓰는 측정 항목 → 에어코리아 응답 필드
_ITEM_FIELD = {
    "no2": "no2Value",
    "so2": "so2Value",
    "pm10": "pm10Value",
    "pm25": "pm25Value",
}


def collect(ts_epoch: float, ts_iso: str, mock: bool) -> dict:
    if mock or not SERVICE_KEY:
        rows = [
            (st["id"], "pm25", mock_station(ts_epoch, st["id"]), ts_iso)
            for st in AIR_STATIONS
        ]
        msg = "mock 생성" if mock else "서비스 키 미설정 — mock 폴백"
        return {"rows": rows, "mode": "mock", "message": msg}

    # ── live: 측정소별 최신 실측 (no2·so2·pm10·pm25) ──
    try:
        rows: list[tuple] = []
        n_ok = 0
        for st in AIR_STATIONS:
            data = http_get_json(
                f"{AIRKOREA_BASE}/getMsrstnAcctoRltmMesureDnsty",
                {
                    "serviceKey": SERVICE_KEY, "returnType": "json",
                    "stationName": st["id"], "dataTerm": "DAILY", "ver": "1.0",
                    "numOfRows": "1", "pageNo": "1",
                },
            )
            if not portal_ok(data):
                continue
            items = portal_items(data)
            if not items:
                continue
            it = items[0]  # 최신 1건
            got = False
            for item, field in _ITEM_FIELD.items():
                v = parse_num(it.get(field))
                if v is not None:
                    # no2·so2 는 ppm(~0.006)이라 소수 4자리 유지, pm은 µg/m³ 정수
                    rows.append((st["id"], item, round(v, 4), ts_iso))
                    got = True
            n_ok += 1 if got else 0
        if not rows:
            return {"rows": [], "mode": "error", "message": "에어코리아 유효 응답 없음 — 측정소명 확인"}
        return {
            "rows": rows, "mode": "live",
            "message": f"에어코리아 {n_ok}/{len(AIR_STATIONS)}개 측정소 → {len(rows)}행",
        }
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
