/**
 * 가우시안 퍼프 확산 엔진 (B1b) — 시간 전파, 브라우저 실시간.
 *
 * 연속 배출을 dtSec 간격의 이산 퍼프로 근사한다. 방출 후 경과시간 T에서
 * 각 퍼프는 풍하로 u·(T−방출시각)만큼 이류하고, 이동거리 기반 σ로 퍼진다.
 * T→∞ 에서 플룸(정상상태) 해에 수렴하며, 그 전 구간이 "도달 과정"이다 —
 * 도달 시각이 근사 추정이 아니라 모델의 정식 산출물이 되는 이유(계획서 Ⅴ-2).
 *
 * 라이브 데모는 등속 바람 가정(사용자 조작값). 시변 바람 퍼프는
 * engine/dispersion/puff.py (P6 검증 배치)가 담당한다.
 */

import { sigmaY, sigmaZ, type PlumeParams } from "./plume";

const SQRT_2PI_CUBED = Math.pow(2 * Math.PI, 1.5);

interface Puff {
  xc: number; // 풍하 중심 거리 (m)
  sx: number;
  sy: number;
  sz: number;
  /** 지표 농도 정규화 계수 (μg/m³ · 지수항 제외) */
  norm: number;
}

/** 방출 시작 후 tSec 시점의 퍼프 목록 (등속 바람) */
function buildPuffs(p: PlumeParams, tSec: number, dtSec: number): Puff[] {
  const u = Math.max(p.u, 0.5);
  const massUg = p.q * 1e6 * dtSec; // 퍼프 1개 질량
  const puffs: Puff[] = [];
  for (let rel = 0; rel < tSec; rel += dtSec) {
    const age = tSec - rel;
    const xc = u * age;
    if (xc < 1) continue;
    const sy = sigmaY(xc, p.stability);
    const sz = sigmaZ(xc, p.stability);
    // 종방향 σx — 퍼프 간격보다 좁아지면 구슬처럼 끊겨 보이므로 하한 적용
    const sx = Math.max(sy, (u * dtSec) / 2);
    const vertical = 2 * Math.exp(-(p.h * p.h) / (2 * sz * sz)); // 지면 반사
    puffs.push({
      xc,
      sx,
      sy,
      sz,
      norm: (massUg / (SQRT_2PI_CUBED * sx * sy * sz)) * vertical,
    });
  }
  return puffs;
}

/** 임의 지점(동 ex, 북 ny — m)의 방출 후 tSec 시점 지표 농도 (μg/m³) */
export function puffConcentrationAt(
  ex: number,
  ny: number,
  p: PlumeParams,
  tSec: number,
  dtSec = 60
): number {
  const bearing = ((p.wd + 180) % 360) * (Math.PI / 180);
  const x = ex * Math.sin(bearing) + ny * Math.cos(bearing);
  const y = ex * Math.cos(bearing) - ny * Math.sin(bearing);
  let c = 0;
  for (const pf of buildPuffs(p, tSec, dtSec)) {
    const dx = x - pf.xc;
    if (Math.abs(dx) > 4 * pf.sx || Math.abs(y) > 4 * pf.sy) continue;
    c +=
      pf.norm *
      Math.exp(-(dx * dx) / (2 * pf.sx * pf.sx)) *
      Math.exp(-(y * y) / (2 * pf.sy * pf.sy));
  }
  return c;
}

/** 퍼프 농도장 격자 — computeGrid(플룸)와 동일 규격 (row-major, [0]=북서) */
export function computePuffGrid(
  p: PlumeParams,
  size: number,
  halfExtent: number,
  tSec: number,
  dtSec = 60
): { data: Float32Array; max: number } {
  const data = new Float32Array(size * size);
  let max = 0;
  if (tSec <= 0) return { data, max };

  const puffs = buildPuffs(p, tSec, dtSec);
  if (puffs.length === 0) return { data, max };

  const step = (2 * halfExtent) / (size - 1);
  const bearing = ((p.wd + 180) % 360) * (Math.PI / 180);
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  // 가장 어린 퍼프(가까움)~가장 늙은 퍼프(멂) 범위 밖 셀은 조기 탈락
  const xMin = puffs[puffs.length - 1].xc - 4 * puffs[puffs.length - 1].sx;
  const xMax = puffs[0].xc + 4 * puffs[0].sx;

  for (let row = 0; row < size; row++) {
    const ny = halfExtent - row * step;
    for (let col = 0; col < size; col++) {
      const ex = -halfExtent + col * step;
      const x = ex * sin + ny * cos;
      if (x < xMin || x > xMax) continue;
      const y = ex * cos - ny * sin;
      let c = 0;
      for (const pf of puffs) {
        const dx = x - pf.xc;
        if (Math.abs(dx) > 4 * pf.sx || Math.abs(y) > 4 * pf.sy) continue;
        c +=
          pf.norm *
          Math.exp(-(dx * dx) / (2 * pf.sx * pf.sx)) *
          Math.exp(-(y * y) / (2 * pf.sy * pf.sy));
      }
      if (c > 1e-3) {
        data[row * size + col] = c;
        if (c > max) max = c;
      }
    }
  }
  return { data, max };
}

/** 퍼프 중심 도달 시각(초) — 풍하 거리 / 풍속. 풍상측이면 null. */
export function arrivalSeconds(downwindM: number, u: number): number | null {
  if (downwindM <= 0) return null;
  return downwindM / Math.max(u, 0.5);
}
