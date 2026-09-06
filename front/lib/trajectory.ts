/**
 * 전진 궤적(forward trajectory) — 시간별 예측 이동 경로.
 *
 * 굴뚝에서 t0 시각에 방출된 공기덩이(parcel)가 이후 시각의 시군 실측 바람을
 * 차례로 따라가는 위치를 적분한다. 서브스텝마다 현재 위치에서 가장 가까운
 * 시군 중심점의 바람(wd, ws)을 쓰므로 시군 경계를 넘으면 그 시군 바람으로
 * 방향이 꺾인다 — HYSPLIT 류 궤적 모델의 최단순 형태(수평 이류만).
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
}

function nearestCity(s: ChungbukSnapshot, lat: number, lon: number): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const [city, [clat, clon]] of Object.entries(s.city_centroids)) {
    const d = distKm(lat, lon, clat, clon);
    if (d < bd) {
      bd = d;
      best = city;
    }
  }
  return best;
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
  subSteps = 6
): Trajectory {
  let lat = origin.lat;
  let lon = origin.lon;
  const path: [number, number][] = [[lon, lat]];
  const nodes: TrajectoryNode[] = [];
  const dt = 3600 / subSteps;
  let cum = 0;
  let wd: number | null = null;
  let ws = 0;

  for (let h = 0; h < hours; h++) {
    const ti = t0 + h;
    const assumed = ti > s.n - 1;
    const tIdx = Math.min(ti, s.n - 1);
    let city = origin.city;
    for (let k = 0; k < subSteps; k++) {
      city = nearestCity(s, lat, lon) ?? origin.city;
      const w = windAt(s, city, tIdx);
      if (w.wd == null) {
        // 시군 바람 결측 — 소속 시군으로 대체, 그래도 없으면 직전 바람 유지
        const fb = windAt(s, origin.city, tIdx);
        if (fb.wd != null) {
          wd = fb.wd;
          ws = fb.ws;
        }
      } else {
        wd = w.wd;
        ws = w.ws;
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
  return { origin: [origin.lon, origin.lat], path, nodes };
}

/**
 * 경로를 대시(dashM)·간격(gapM) 미터 단위로 쪼갠 서브 경로 목록 —
 * deck.gl 기본 PathLayer 는 점선을 지원하지 않아 지리 단위로 직접 나눈다.
 */
export function dashSegments(
  path: [number, number][],
  dashM: number,
  gapM: number
): [number, number][][] {
  const out: [number, number][][] = [];
  if (path.length < 2) return out;
  const period = dashM + gapM;
  let along = 0; // 경로 시작부터의 누적 거리 (m)
  let cur: [number, number][] | null = null;

  for (let i = 1; i < path.length; i++) {
    const [lon0, lat0] = path[i - 1];
    const [lon1, lat1] = path[i];
    const segM = distKm(lat0, lon0, lat1, lon1) * 1000;
    if (segM <= 0) continue;
    let s = 0;
    while (s < segM) {
      const phase = along % period;
      const inDash = phase < dashM;
      const remain = (inDash ? dashM : period) - phase; // 현재 상태가 끝나기까지
      const adv = Math.min(remain, segM - s);
      const f0 = s / segM;
      const f1 = (s + adv) / segM;
      const p0: [number, number] = [lon0 + (lon1 - lon0) * f0, lat0 + (lat1 - lat0) * f0];
      const p1: [number, number] = [lon0 + (lon1 - lon0) * f1, lat0 + (lat1 - lat0) * f1];
      if (inDash) {
        if (!cur) cur = [p0];
        cur.push(p1);
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
      s += adv;
      along += adv;
    }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}
