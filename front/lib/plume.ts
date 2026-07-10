/**
 * 가우시안 플룸 확산 엔진 (B1a) — 브라우저 내 실시간 계산.
 *
 * 라이브 데모(F-MAP-02)의 뼈대: 풍향·풍속·배출량 조작 → 즉시 재계산.
 * 서버 왕복 없이 밀리초 단위로 돌므로 시연장 네트워크와 무관하게 동작한다.
 * 퍼프(B1b)·보정 AI(B2)는 engine/ Python 배치가 담당하고, 이 모듈은
 * 정상상태 공간 스크리닝 전용. 수식은 표준 가우시안 플룸(지면 반사 포함).
 *
 * 좌표 관례: 풍향(wd)은 기상 관례 "불어오는 방향"(북=0°, 시계방향).
 * 플룸 진행 방위(downwind bearing) = wd + 180°.
 */

export type Stability = "A" | "B" | "C" | "D" | "E" | "F";

export interface PlumeParams {
  /** 배출률 Q (g/s) */
  q: number;
  /** 10m 풍속 u (m/s) — 0.5 미만은 0.5로 클램프(정온 시 플룸식 발산) */
  u: number;
  /** 유효 굴뚝고 H (m) — 물리고 + 부력 상승. 미상 시 표준 가정값 사용 */
  h: number;
  /** 풍향 wd (도, 불어오는 방향, 북=0 시계방향) */
  wd: number;
  /** 대기안정도 (Pasquill-Gifford 계급) */
  stability: Stability;
}

/**
 * Briggs 개활지 확산계수 σy, σz (m). x는 풍하 거리(m), 100m~10km 유효.
 * 출처: Briggs(1973) open-country 근사 — 교과서 표준 계수.
 */
export function sigmaY(x: number, s: Stability): number {
  const c: Record<Stability, number> = {
    A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04,
  };
  return (c[s] * x) / Math.sqrt(1 + 0.0001 * x);
}

export function sigmaZ(x: number, s: Stability): number {
  switch (s) {
    case "A": return 0.2 * x;
    case "B": return 0.12 * x;
    case "C": return (0.08 * x) / Math.sqrt(1 + 0.0002 * x);
    case "D": return (0.06 * x) / Math.sqrt(1 + 0.0015 * x);
    case "E": return (0.03 * x) / (1 + 0.0003 * x);
    case "F": return (0.016 * x) / (1 + 0.0003 * x);
  }
}

/**
 * 지표(z=0) 농도 (μg/m³). x: 풍하거리(m, >0), y: 횡풍거리(m).
 * C = Q/(2π·u·σy·σz) · exp(-y²/2σy²) · 2·exp(-H²/2σz²)  (지면 전반사)
 */
export function groundConcentration(
  x: number,
  y: number,
  p: Pick<PlumeParams, "q" | "u" | "h" | "stability">
): number {
  if (x <= 1) return 0;
  const u = Math.max(p.u, 0.5);
  const sy = sigmaY(x, p.stability);
  const sz = sigmaZ(x, p.stability);
  const qUg = p.q * 1e6; // g/s → μg/s
  const base = qUg / (2 * Math.PI * u * sy * sz);
  const crosswind = Math.exp(-(y * y) / (2 * sy * sy));
  const vertical = 2 * Math.exp(-(p.h * p.h) / (2 * sz * sz));
  return base * crosswind * vertical;
}

/**
 * 임의 지점(동거리 ex, 북거리 ny — m, 배출원 원점)의 지표 농도.
 * 풍향을 반영해 풍하/횡풍 좌표로 회전 후 플룸식 적용.
 */
export function concentrationAt(
  ex: number,
  ny: number,
  p: PlumeParams
): number {
  const bearing = ((p.wd + 180) % 360) * (Math.PI / 180); // 플룸 진행 방위
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  const downwind = ex * sin + ny * cos; // 진행 방향 성분
  const crosswind = ex * cos - ny * sin; // 횡풍 성분
  return groundConcentration(downwind, crosswind, p);
}

/**
 * 정사각 격자 농도장 계산 — 캔버스 히트맵용.
 * size×size 격자, halfExtent: 중심(배출원)에서 가장자리까지 거리(m).
 * 반환: Float32Array(size*size), 행 우선(row-major), [0]=북서 모서리.
 */
export function computeGrid(
  p: PlumeParams,
  size: number,
  halfExtent: number
): { data: Float32Array; max: number } {
  const data = new Float32Array(size * size);
  let max = 0;
  const step = (2 * halfExtent) / (size - 1);
  const bearing = ((p.wd + 180) % 360) * (Math.PI / 180);
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);

  for (let row = 0; row < size; row++) {
    const ny = halfExtent - row * step; // 위 = 북
    for (let col = 0; col < size; col++) {
      const ex = -halfExtent + col * step;
      const downwind = ex * sin + ny * cos;
      if (downwind <= 1) continue;
      const crosswind = ex * cos - ny * sin;
      const c = groundConcentration(downwind, crosswind, p);
      if (c > 1e-3) {
        data[row * size + col] = c;
        if (c > max) max = c;
      }
    }
  }
  return { data, max };
}
