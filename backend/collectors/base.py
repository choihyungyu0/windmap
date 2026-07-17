"""
수집기 공통 — HTTP(재시도 3회, 표준 라이브러리 urllib)와 결정적 mock 생성기.

mock은 Math.random 류를 쓰지 않고 시각(hour) 기반 삼각함수로 생성한다:
동일 시각 → 동일 값 (재현성 NFR-8). 운영상태(op_status)는 주기적으로 0이
되도록 설계해 "가동/정지 자연실험"(검증 프로토콜 §5.5 방법 A) 데이터를
mock 단계에서도 흉내 낸다.
"""

from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request

from ..config import HTTP_TIMEOUT_S, RETRY_COUNT


class FetchError(Exception):
    """재시도 소진 후 최종 실패."""


def http_get_json(base: str, params: dict[str, str]) -> dict:
    """GET + JSON 파싱. RETRY_COUNT회 재시도, 지수 백오프."""
    url = f"{base}?{urllib.parse.urlencode(params)}"
    last: Exception | None = None
    for attempt in range(RETRY_COUNT):
        try:
            with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_S) as res:
                return json.loads(res.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            if attempt < RETRY_COUNT - 1:
                time.sleep(2**attempt)
    raise FetchError(f"{RETRY_COUNT}회 재시도 실패: {last}") from last


# ── 공공데이터포털 공통 응답 헬퍼 ──

def portal_ok(data: dict) -> bool:
    """공통 응답코드(header.resultCode) 00/0=정상 검사."""
    header = (data.get("response") or {}).get("header") or {}
    return str(header.get("resultCode", "00")) in ("00", "0")


def portal_msg(data: dict) -> str:
    header = (data.get("response") or {}).get("header") or {}
    return f"resultCode={header.get('resultCode')} {header.get('resultMsg')}"


def portal_items(data: dict) -> list:
    """response.body.items 추출 — list / {item:[...]} 양형 방어."""
    body = (data.get("response") or {}).get("body") or {}
    items = body.get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    return items if isinstance(items, list) else [items]


def parse_num(raw) -> float | None:
    """실측 문자열 → float. 결측('-'·''·None·비수치)은 None."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ── 결정적 mock 시그널 ──

def _h(ts_epoch: float) -> float:
    """시각을 시간 단위 실수로."""
    return ts_epoch / 3600.0


def mock_emission(ts_epoch: float, item: str) -> tuple[float, int]:
    """(농도값, 운영상태). 36시간마다 4시간 정지 구간 → 자연실험 표본."""
    h = _h(ts_epoch)
    phase = h % 36.0
    op = 0 if phase < 4.0 else 1
    seed = sum(ord(c) for c in item)
    base = 20 + 12 * math.sin(h / 3.1 + seed) + 6 * math.cos(h / 7.3 + seed * 0.5)
    val = 0.0 if op == 0 else round(max(0.5, base), 2)
    return val, op


def mock_weather(ts_epoch: float) -> tuple[float, float, float]:
    """(풍향, 풍속, 기온) — 하루 주기로 도는 바람."""
    h = _h(ts_epoch)
    wd = (270 + 90 * math.sin(h / 12.0) + 30 * math.sin(h / 3.7)) % 360
    ws = max(0.5, 3.0 + 2.2 * math.sin(h / 6.1) + 1.1 * math.cos(h / 2.9))
    temp = 22 + 6 * math.sin((h % 24) / 24 * 2 * math.pi - 1.3)
    return round(wd, 1), round(ws, 1), round(temp, 1)


def mock_station(ts_epoch: float, station_id: str) -> float:
    """측정소 PM/NO2 유사 신호 — 배경 + 완만한 변동."""
    h = _h(ts_epoch)
    seed = sum(ord(c) for c in station_id)
    return round(max(2.0, 18 + 8 * math.sin(h / 5.3 + seed) + 4 * math.cos(h / 11.7 + seed)), 1)
