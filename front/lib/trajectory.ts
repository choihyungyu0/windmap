/**
 * 전진 궤적(forward trajectory) — 시간별 예측 이동 경로.
 *
 * 굴뚝에서 t0 시각에 방출된 공기덩이(parcel)가 이후 시각의 시군 실측 바람을
 * 차례로 따라가는 위치를 적분한다. 서브스텝마다 현재 위치 기준으로 시군
 * 중심점 바람을 역거리가중(IDW) 벡터 보간해 쓰므로 시군 경계에서 방향이
 * 튀지 않고 연속적으로 휜다 — HYSPLIT 류 궤적 모델의 최단순 형태(수평 이류만).
 *
 * 퍼프(lib/puff.ts)가 "얼마나 퍼지나"라면 이 모듈은 "어디로 가나"를 답한다.
 * 확산 폭·농도는 담지 않으며, 스냅샷 마지막 시각 이후 구간은 마지막 바람을
 * 유지(persistence)하고 `assumed=true` 로 표시한다.
 */

import { type ChungbukSnapshot, distKm, offsetLngLat, windAt } from "./chungbuk";

export interface TrajectoryNode {
  position: [number, number]; // [lng, lat]
  /** 방출 시각 기준 +h */
  hour: number;
  /** 스냅샷 시각 라벨 — 범위 밖이면 "+Nh" */
  timeLabel: string;
  /** 이 구간의 바람을 빌려온 시군 */
  city: string;
  wd: number;
  ws: number;
  /** 누적 이동 거리 (km) */
  distKm: number;
  /** 데이터 범위 밖 — 마지막 바람 유지 가정 */
  assumed: boolean;
}

export interface Trajectory {
  origin: [number, number]; // [lng, lat]
  /** 서브스텝 포함 전체 경로 */
  path: [number, number][];
  /** 정시 노드 (+1h … +Nh) */
  nodes: TrajectoryNode[];
  /** path 에서 "마지막 바람 유지" 가정 구간이 시작하는 인덱스 (없으면 path.length-1) */
  splitIndex: number;
}

/**
 * 시군 중심점 바람의 역거리가중(거리²) 벡터 보간. 방향이 엇갈리는 지점에서는
 * 벡터 평균이라 풍속이 줄어드는데, 이는 평균장의 물리와도 맞다.
 * city 는 표시용 — 가장 가까운 시군.
 */
function windVectorAt(
  s: ChungbukSnapshot,
  lat: number,
  lon: number,
  t: number
): { wd: number; ws: number; city: string } | null {
  let sumW = 0;
  let u = 0; // 동향 성분 (이동 방향 기준)
  let v = 0; // 북향 성분
  let best: string | null = null;
  let bd = Infinity;
  for (const [city, [clat, clon]] of Object.entries(s.city_centroids)) {
    const w = windAt(s, city, t);
    if (w.wd == null) continue;
    const d = Math.max(distKm(lat, lon, clat, clon), 0.5);
    if (d < bd) {
      bd = d;
      best = city;
    }
    const wt = 1 / (d * d);
    const rad = (((w.wd + 180) % 360) * Math.PI) / 180; // 이동 방위
    u += wt * w.ws * Math.sin(rad);
    v += wt * w.ws * Math.cos(rad);
    sumW += wt;
  }
  if (!sumW || best == null) return null;
  u /= sumW;
  v /= sumW;
  const dir = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360; // 이동 방위
  return { wd: (dir + 180) % 360, ws: Math.hypot(u, v), city: best };
}

/**
 * origin 굴뚝에서 시각 인덱스 t0 에 방출된 덩이의 hours 시간 전진 궤적.
 * subSteps: 1시간을 나누는 적분 단계 수(시군 경계 전환을 부드럽게).
 */
export function forwardTrajectory(
  s: ChungbukSnapshot,
  origin: { lat: number; lon: number; city: string },
  t0: number,
  hours = 6,
  subSteps = 12
): Trajectory {
  let lat = origin.lat;
  let lon = origin.lon;
  const path: [number, number][] = [[lon, lat]];
  const nodes: TrajectoryNode[] = [];
  const dt = 3600 / subSteps;
  let cum = 0;
  let wd: number | null = null;
  let ws = 0;
  let splitIndex: number | null = null;

  for (let h = 0; h < hours; h++) {
    const ti = t0 + h;
    const assumed = ti > s.n - 1;
    if (assumed && splitIndex == null) splitIndex = path.length - 1;
    const tIdx = Math.min(ti, s.n - 1);
    let city = origin.city;
    for (let k = 0; k < subSteps; k++) {
      const w = windVectorAt(s, lat, lon, tIdx);
      if (w) {
        wd = w.wd;
        ws = w.ws;
        city = w.city;
      } else {
        // 전 시군 결측 — 소속 시군으로 대체, 그래도 없으면 직전 바람 유지
        const fb = windAt(s, origin.city, tIdx);
        if (fb.wd != null) {
          wd = fb.wd;
          ws = fb.ws;
        }
      }
      if (wd == null) break;
      const stepM = Math.max(ws, 0.3) * dt; // 정온(<0.3 m/s)도 최소 표류
      [lon, lat] = offsetLngLat(lat, lon, stepM, (wd + 180) % 360);
      cum += stepM / 1000;
      path.push([lon, lat]);
    }
    if (wd == null) break;
    const tEnd = ti + 1;
    nodes.push({
      position: [lon, lat],
      hour: h + 1,
      timeLabel: tEnd <= s.n - 1 ? s.times[tEnd] : `+${h + 1}h`,
      city,
      wd,
      ws,
      distKm: cum,
      assumed,
    });
  }
  return {
    origin: [origin.lon, origin.lat],
    path,
    nodes,
    splitIndex: splitIndex ?? path.length - 1,
  };
}

/**
 * Chaikin 코너 컷팅으로 꺾은선을 부드럽게 — 렌더 전용(노드 좌표는 그대로).
 * 양 끝점은 유지하므로 출발점·도착점이 움직이지 않는다.
 */
export function smoothPath(path: [number, number][], iterations = 3): [number, number][] {
  let pts = path;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
