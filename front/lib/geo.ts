/**
 * 지리 좌표 헬퍼 — 미터 오프셋(동/북) ↔ 경위도 변환.
 *
 * 확산 계산(lib/plume.ts)은 배출원 원점의 미터 평면에서 수행하고,
 * 지도 표시 직전에만 경위도로 변환한다. 6km 반경의 국지 규모에서는
 * 등장방형(equirectangular) 근사가 충분하다 (오차 << 격자 해상도).
 *
 * ⚠ 윤리: 아래 배출원 좌표는 데모용 예시 좌표다. 실존 특정 시설의
 * 좌표를 지칭하지 않으며, 시범 배출원 확정(오픈이슈 #1) 시 교체한다.
 */

/** 시범 배출원 기준점 (청주 인근 예시 좌표 — engine/config.py 와 정합) */
export const SOURCE_LL = { lng: 127.49, lat: 36.72 } as const;

const M_PER_DEG_LAT = 111_320;

/** 배출원 기준 동쪽 ex(m)·북쪽 ny(m) 지점의 [경도, 위도] */
export function offsetToLngLat(ex: number, ny: number): [number, number] {
  const lat = SOURCE_LL.lat + ny / M_PER_DEG_LAT;
  const lng =
    SOURCE_LL.lng +
    ex / (M_PER_DEG_LAT * Math.cos((SOURCE_LL.lat * Math.PI) / 180));
  return [lng, lat];
}

/** [경도, 위도] → 배출원 기준 미터 오프셋 (동 ex, 북 ny) — offsetToLngLat 역변환 */
export function lngLatToOffset(lng: number, lat: number): [number, number] {
  const ny = (lat - SOURCE_LL.lat) * M_PER_DEG_LAT;
  const ex =
    (lng - SOURCE_LL.lng) *
    M_PER_DEG_LAT *
    Math.cos((SOURCE_LL.lat * Math.PI) / 180);
  return [ex, ny];
}

/** 배출원 중심 반지름 r(m) 원 경로 (지도 거리 링용) */
export function circlePath(radiusM: number, segments = 72): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    pts.push(offsetToLngLat(radiusM * Math.sin(a), radiusM * Math.cos(a)));
  }
  return pts;
}

/** 플룸 래스터의 지리 경계 [west, south, east, north] */
export function plumeBounds(halfExtentM: number): [number, number, number, number] {
  const [w, s] = offsetToLngLat(-halfExtentM, -halfExtentM);
  const [e, n] = offsetToLngLat(halfExtentM, halfExtentM);
  return [w, s, e, n];
}
