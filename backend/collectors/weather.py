"""
F-COL-02 기상 수집 — 풍향·풍속·기온 + Pasquill-Gifford 안정도 산출.

live 연동 확정(P2b):
  엔드포인트  https://apis.data.go.kr/1360000/AsosHourlyInfoService/getWthrDataList
  파라미터    serviceKey, dataType=JSON, dataCd=ASOS, dateCd=HR,
              stnIds(청주 131), startDt/startHh~endDt/endHh, numOfRows, pageNo
  특성        시간자료. 당일분은 지연될 수 있어 최근 2일 요청 후 '최신 유효 관측행'을 쓴다.
  응답        response.body.items.item = [{tm, stnId, wd, ws, ta, ...}] (tm 오름차순)

안정도는 Turner 간략법: 주간(07~18시)은 풍속 근사, 야간은 풍속 기준.
정밀화(일사량·운량 반영)는 P3에서 퍼프 엔진과 함께 고도화한다.
키가 없으면 mock 폴백(기존 동작 유지).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from ..config import ASOS_BASE, SERVICE_KEY, WEATHER_STATION
from .base import (FetchError, http_get_json, mock_weather, parse_num,
                   portal_items, portal_msg, portal_ok)


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

    # ── live: ASOS 시간자료 → 최신 유효 관측행 ──
    # ASOS는 '전날 자료까지' 제공(당일분 미확정) → endDt=전일, 그 이전 2일을 요청.
    try:
        now = datetime.fromisoformat(ts_iso)
        end = now - timedelta(days=1)
        start = end - timedelta(days=2)
        data = http_get_json(
            f"{ASOS_BASE}/getWthrDataList",
            {
                "serviceKey": SERVICE_KEY, "dataType": "JSON",
                "dataCd": "ASOS", "dateCd": "HR",
                "stnIds": WEATHER_STATION["id"],
                "startDt": start.strftime("%Y%m%d"), "startHh": "00",
                "endDt": end.strftime("%Y%m%d"), "endHh": "23",
                "numOfRows": "999", "pageNo": "1",
            },
        )
        if not portal_ok(data):
            raise FetchError(f"ASOS {portal_msg(data)}")
        # tm 오름차순 → 풍향·풍속이 유효한 마지막 행 채택
        latest = None
        for it in portal_items(data):
            if parse_num(it.get("wd")) is not None and parse_num(it.get("ws")) is not None:
                latest = it
        if latest is None:
            return {"rows": [], "mode": "live", "message": "ASOS 유효 관측행 없음 — 스테일 유지"}

        wd = round(parse_num(latest.get("wd")), 1)
        ws = round(parse_num(latest.get("ws")), 1)
        temp = round(parse_num(latest.get("ta")) or 0.0, 1)
        obs_hour = hour
        if latest.get("tm"):
            try:
                obs_hour = datetime.strptime(latest["tm"], "%Y-%m-%d %H:%M").hour
            except ValueError:
                pass
        stab = pg_stability(ws, obs_hour)
        rows = [(WEATHER_STATION["id"], wd, ws, temp, stab, ts_iso)]
        return {"rows": rows, "mode": "live", "message": f"ASOS {latest.get('tm')} 관측 반영"}
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
