"""
F-COL-01 굴뚝 TMS 수집 (CleanSYS) — 7항목 + 운영상태.

live 연동 확정(P2b, 실호출 스모크 테스트 완료):
  엔드포인트  https://apis.data.go.kr/B552584/cleansys/rltmMesureResult
  파라미터    serviceKey, type=json, areaNm=충청북도
  특성        '현재 시점' 스냅샷만 반환(과거 시계열 X) → 스케줄러 30분 주기 누적으로 축적.
  응답        response.body.items = [{mesure_dt, fact_manage_nm, stack_code,
              {hcl,nox,sox,co,tsp,nh3,hf}_mesure_value, *_exhst_perm_stdr_value}, ...]
              areaNm=충청북도 1회 호출로 도 전역 64사업장/160배출구가 한 번에 온다.
  함정        측정값이 "미수신"·"보수중"·"측정자료확인중(가동중지)"·"기기점검" 등
              문자열이면 결측/정지 → 숫자만 유효(op_status로 구분).
키가 없으면 mock 으로 파이프라인 전체를 완주시킨다(기존 동작 유지).
"""

from __future__ import annotations

from ..config import CLEANSYS_AREA, CLEANSYS_BASE, SERVICE_KEY, SOURCES, TMS_ITEMS
from .base import (FetchError, http_get_json, mock_emission, parse_num,
                   portal_items, portal_msg, portal_ok)

# TMS 7항목(config.TMS_ITEMS) → CleanSYS 실시간 응답 필드명. dust=먼지=TSP.
_ITEM_FIELD = {
    "dust": "tsp_mesure_value",
    "sox": "sox_mesure_value",
    "nox": "nox_mesure_value",
    "hcl": "hcl_mesure_value",
    "hf": "hf_mesure_value",
    "nh3": "nh3_mesure_value",
    "co": "co_mesure_value",
}


def _parse_val(raw) -> tuple[float, int]:
    """실측 문자열 → (값, 운영상태). 숫자=가동(1), 상태문자열·결측=정지·무효(0).

    "측정자료확인중(가동중지)"·"보수중" 등은 정지/무효로 op_status=0 → mock 과 동일하게
    가동/정지 자연실험(검증 방법 A) 신호로 쓰인다. 상세 품질 플래그는 quality.py 담당."""
    v = parse_num(raw)
    return (round(v, 2), 1) if v is not None else (0.0, 0)


def collect(ts_epoch: float, ts_iso: str, mock: bool) -> dict:
    """반환: {rows: [(source_id,item,val,op_status,ts)], mode, message}"""
    if mock or not SERVICE_KEY:
        rows = []
        for s in SOURCES:
            for item in TMS_ITEMS:
                val, op = mock_emission(ts_epoch, item)
                rows.append((s["id"], item, val, op, ts_iso))
        msg = "mock 생성" if mock else "서비스 키 미설정 — mock 폴백"
        return {"rows": rows, "mode": "mock", "message": msg}

    # ── live: CleanSYS 실시간 스냅샷 (areaNm=충청북도 1회 호출로 도 전역) ──
    try:
        data = http_get_json(
            f"{CLEANSYS_BASE}/rltmMesureResult",
            {"serviceKey": SERVICE_KEY, "type": "json", "areaNm": CLEANSYS_AREA},
        )
        if not portal_ok(data):
            raise FetchError(f"CleanSYS {portal_msg(data)}")
        items = portal_items(data)
        if not items:
            return {"rows": [], "mode": "live", "message": "CleanSYS 스냅샷 items 비어있음 — 스테일 유지"}

        # (사업장명, 배출구코드) → 응답 항목 인덱스
        by_key = {
            (str(it.get("fact_manage_nm", "")).strip(), str(it.get("stack_code", "")).strip()): it
            for it in items
        }
        rows: list[tuple] = []
        matched = 0
        for s in SOURCES:
            fnm = s.get("cleansys_fact_nm")
            if not fnm:  # 시범배출원에 CleanSYS 매칭 키가 없으면 건너뜀
                continue
            it = by_key.get((str(fnm).strip(), str(s.get("cleansys_stack_code", "")).strip()))
            if it is None:
                continue
            matched += 1
            for item in TMS_ITEMS:
                val, op = _parse_val(it.get(_ITEM_FIELD[item]))
                rows.append((s["id"], item, val, op, ts_iso))

        if matched == 0:
            return {
                "rows": [], "mode": "error",
                "message": f"CleanSYS {len(items)}개 배출구 응답했으나 SOURCES 매칭 0 "
                           f"— config.SOURCES 의 cleansys_fact_nm/stack_code 확인",
            }
        return {
            "rows": rows, "mode": "live",
            "message": f"CleanSYS 실시간 {len(items)}배출구 중 {matched}개 배출원 매칭 → {len(rows)}행",
        }
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
