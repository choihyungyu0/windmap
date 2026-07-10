"""
F-COL-01 굴뚝 TMS 수집 (CleanSYS) — 7항목 + 운영상태.

live 모드는 키 발급 후 스모크 테스트로 엔드포인트·응답 스키마를 확정한다(P2b).
그 전에는 mock으로 파이프라인 전체를 완주시킨다.
"""

from __future__ import annotations

from ..config import CLEANSYS_BASE, SERVICE_KEY, SOURCES, TMS_ITEMS
from .base import FetchError, http_get_json, mock_emission


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

    # ── live (P2b에서 스모크 테스트 후 파라미터 확정) ──
    try:
        rows = []
        for s in SOURCES:
            if not s["cleansys_fact_id"]:
                raise FetchError(f"{s['name']} CleanSYS 사업장 ID 미확정 (오픈이슈 #1)")
            data = http_get_json(
                f"{CLEANSYS_BASE}/getUnityDayAvgInfo",
                {
                    "serviceKey": SERVICE_KEY,
                    "factManageNo": str(s["cleansys_fact_id"]),
                    "returnType": "json",
                },
            )
            # TODO(P2b): 실응답 스키마 확인 후 파싱 확정
            _ = data
        return {"rows": rows, "mode": "live", "message": f"{len(rows)}행 수집"}
    except FetchError as e:
        return {"rows": [], "mode": "error", "message": str(e)}
