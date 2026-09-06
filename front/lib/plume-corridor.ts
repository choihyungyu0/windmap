/**
 * 예측 이동 경로 위의 확산 띠(corridor) — 궤적 중심선을 따라 횡풍 σy 만큼 벌어지는 부채꼴 래스터.
 *
 * 등속 바람의 정상상태 플룸(lib/plume.ts)이 직선 원뿔이라면, 이 모듈은 같은 σy 를
 * 시간별 실측 바람으로 휘어진 중심선(lib/trajectory.ts)에 입힌다. 각 화소는 중심선까지의
 * 횡풍 거리 y 로 exp(-y²/2σy²) 만큼 옅어지고, 색은 중심선 지표 농도의 **상대값**(로그 스케일):
 * 굴뚝 근처 적색 → 멀어질수록 시안. 절대 농도(μg/m³)가 아니며 배출량은 상쇄된다.
 * 굴뚝고·안정도는 표준 가정(H=100 m, 낮 B / 아침·저녁 C / 밤 D).
 *
 * 결과는 deck.gl BitmapLayer 용 캔버스 + [W,S,E,N] 경계. 클라이언트 전용.
 */

import { groundConcentration, sigmaY, type Stability } from "./plume";
import { smoothPath, type Trajectory } from "./trajectory";

export interface CorridorImage {
  image: HTMLCanvasElement;
  /** [west, south, east, north] (경도·위도) */
  bounds: [number, number, number, number];
}

/** 시각 라벨("8/11 16시")의 시(hour) → Pasquill 안정도 근사: 여름 낮 불안정, 밤 중립 */
export function stabilityForHour(hour: number | null): Stability {
  if (hour == null) return "D";
  if (hour >= 10 && hour <= 16) return "B";
  if (hour >= 7 && hour <= 18) return "C";
  return "D";
}

export function hourOfLabel(label: string | undefined): number | null {
  const m = label?.match(/(\d{1,2})시/);
  return m ? Number(m[1]) : null;
}

/** 상대 농도 0~1 → RGB. 범례와 같은 시안(저) → 호박 → 주황 → 적(고) 축. */
export function corridorRGB(rel: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0, 184, 212]],
    [0.4, [217, 119, 6]],
    [0.7, [234, 88, 12]],
    [1, [220, 38, 38]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (rel <= stops[i][0]) {
      const [r0, c0] = stops[i - 1];
      const [r1, c1] = stops[i];
      const f = (rel - r0) / (r1 - r0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * 궤적 → 확산 띠 캔버스. grid: 긴 변의 화소 수(기본 256, 충북 전역에서 수십 ms).
 * h: 유효 굴뚝고(m). 띠 가장자리는 3σy 에서 잘라 배경을 덮지 않는다.
 */
export function renderCorridor(
  tr: Trajectory,
  stability: Stability,
  h = 100,
  grid = 256
): CorridorImage | null {
  if (typeof document === "undefined" || tr.path.length < 2 || tr.nodes.length === 0) return null;
  const pts = smoothPath(tr.path, 1);
  const n = pts.length;
  const hours = tr.nodes.length;

  // 로컬 미터 좌표 (출발점 원점, 등장방형 근사 — 충북 규모에서 오차 ≪ σy)
  const lon0 = tr.origin[0];
  const lat0 = tr.origin[1];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const S = new Float64Array(n); // 누적 거리 (m)
  const LEN = new Float64Array(n); // 구간 길이
  for (let i = 0; i < n; i++) {
    X[i] = (pts[i][0] - lon0) * kx;
    Y[i] = (pts[i][1] - lat0) * ky;
    if (i > 0) {
      LEN[i - 1] = Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
      S[i] = S[i - 1] + LEN[i - 1];
    }
  }

  // 정점별 중심선 상대 농도 (로그 스케일) — 풍속은 소속 시각 노드의 값
  const REL = new Float64Array(n);
  let cMax = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(Math.floor((i / (n - 1)) * hours), hours - 1);
    const u = tr.nodes[hi].ws;
    REL[i] = groundConcentration(Math.max(S[i], 50), 0, { q: 1, u, h, stability });
    if (REL[i] > cMax) cMax = REL[i];
  }
  if (cMax <= 0) return null;
  for (let i = 0; i < n; i++) {
    REL[i] = Math.min(1, Math.max(0, 1 + Math.log10(REL[i] / cMax) / 4.5)); // 4.5 decade: 6h 경로 끝까지 색이 이어지도록
  }

  // 래스터 범위 — 끝단 3σy + 여유
  const pad = 3 * sigmaY(Math.max(S[n - 1], 30), stability) + 300;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (X[i] < minX) minX = X[i];
    if (X[i] > maxX) maxX = X[i];
    if (Y[i] < minY) minY = Y[i];
    if (Y[i] > maxY) maxY = Y[i];
  }
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const cell = Math.max(maxX - minX, maxY - minY) / grid;
  const nx = Math.max(2, Math.ceil((maxX - minX) / cell));
  const ny = Math.max(2, Math.ceil((maxY - minY) / cell));

  const img = new ImageData(nx, ny);
  const data = img.data;
  for (let row = 0; row < ny; row++) {
    const py = maxY - (row + 0.5) * cell; // 위 = 북
    for (let col = 0; col < nx; col++) {
      const px = minX + (col + 0.5) * cell;
      // 가장 가까운 구간과 그 지점의 s·상대 농도
      let bestD2 = Infinity;
      let bestS = 0;
      let bestRel = 0;
      for (let j = 0; j < n - 1; j++) {
        const ax = X[j], ay = Y[j];
        const dx = X[j + 1] - ax, dy = Y[j + 1] - ay;
        const L2 = dx * dx + dy * dy;
        let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + t * dx - px;
        const qy = ay + t * dy - py;
        const d2 = qx * qx + qy * qy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestS = S[j] + t * LEN[j];
          bestRel = REL[j] + (REL[j + 1] - REL[j]) * t;
        }
      }
      const sig = sigmaY(Math.max(bestS, 30), stability);
      if (bestD2 > 9 * sig * sig) continue;
      const fall = Math.exp(-bestD2 / (2 * sig * sig));
      const [r, g, b] = corridorRGB(bestRel);
      const k = (row * nx + col) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = Math.round(255 * fall * (0.45 + 0.45 * bestRel));
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = nx;
  canvas.height = ny;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return {
    image: canvas,
    bounds: [minX / kx + lon0, minY / ky + lat0, maxX / kx + lon0, maxY / ky + lat0],
  };
}
