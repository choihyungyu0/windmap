/**
 * 도로 경로 스냅 — 예측 이동 경로의 시각별 지점을 경유하는 최단 도로 경로 (OSRM / OpenStreetMap).
 *
 * ⚠ 물리적 근거는 없다. 오염물질은 바람을 따라 이동하므로 도로와 무관하다.
 * 발표·시연에서 "지도 경로"처럼 보이게 하는 표시용 옵션이며, 원본은 바람 궤적
 * (lib/trajectory.ts)이다. 공개 데모 서버(router.project-osrm.org)를 쓰므로 실패하면
 * null 을 돌려주고 호출측은 바람 궤적 표시로 되돌아간다. 자체 서버는
 * NEXT_PUBLIC_OSRM_URL 로 지정.
 */

const BASE = process.env.NEXT_PUBLIC_OSRM_URL ?? "https://router.project-osrm.org";

export interface RoadRoute {
  /** 도로 경로 전체 좌표 [lng, lat] */
  path: [number, number][];
  /** 경유점(출발점 + 시각별 지점)이 도로에 스냅된 위치 — 입력 순서와 같음 */
  snapped: [number, number][];
  /** 경유점별 누적 도로 거리 (km), snapped[i] 에 대응 (index 0 = 0) */
  cumKm: number[];
}

interface OsrmResponse {
  code: string;
  routes?: {
    geometry: { coordinates: [number, number][] };
    legs: { distance: number }[];
  }[];
  waypoints?: { location: [number, number] }[];
}

// 같은 (굴뚝, 시각) 조합은 재생을 오가며 반복 요청되므로 결과를 메모리에 보관
const cache = new Map<string, RoadRoute | null>();

export async function fetchRoadRoute(
  points: [number, number][],
  signal?: AbortSignal
): Promise<RoadRoute | null> {
  if (points.length < 2) return null;
  const key = points.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(";");
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const url = `${BASE}/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as OsrmResponse;
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r || !j.waypoints) {
      cache.set(key, null);
      return null;
    }
    const cumKm = [0];
    for (const leg of r.legs) cumKm.push(cumKm[cumKm.length - 1] + leg.distance / 1000);
    const out: RoadRoute = {
      path: r.geometry.coordinates,
      snapped: j.waypoints.map((w) => w.location),
      cumKm,
    };
    cache.set(key, out);
    return out;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e; // 호출측이 취소한 것 — 조용히 전파
    return null;
  }
}
