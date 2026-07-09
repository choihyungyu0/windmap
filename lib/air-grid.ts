/**
 * 사각지대 대기질 추정 격자 (F-GAP-01 데모) — 위성 AOD 기반 지상 PM2.5
 * 추정을 흉내낸 결정적 mock. ⚠ 시뮬레이션이며 실측 아님(화면 배지 유지).
 * 실제 위성 공백추정 모델(P7)이 붙으면 이 모듈만 교체한다.
 *
 * 레시피 (자연스러운 얼룩): 여러 오염원(세기·크기 다름) × 바람 방향 타원
 * 이류 + 다중 옥타브 값노이즈(구름 질감) + 배경 + 구름 결측(NaN).
 * 노이즈는 외부 라이브러리 없이 자체 구현(의존성 0·재현성 NFR-8).
 */

import { SOURCE_LL } from "./geo";

export const AIR_BOUNDS = {
  west: SOURCE_LL.lng - 0.28,
  east: SOURCE_LL.lng + 0.28,
  south: SOURCE_LL.lat - 0.22,
  north: SOURCE_LL.lat + 0.22,
} as const;

/** 실측 앵커 측정소 (경위도) */
export const AIR_STATIONS = [
  { name: "송정동", lng: SOURCE_LL.lng - 0.06, lat: SOURCE_LL.lat + 0.05 },
  { name: "사천동", lng: SOURCE_LL.lng + 0.11, lat: SOURCE_LL.lat - 0.08 },
] as const;

export interface AirCell {
  lng: number;
  lat: number;
  pm25: number;
  confidence: number;
}

/** 한국형 PM2.5 등급 */
export function pmClass(v: number): { label: string; hex: string } {
  if (v <= 15) return { label: "좋음", hex: "#2563eb" };
  if (v <= 35) return { label: "보통", hex: "#059669" };
  if (v <= 75) return { label: "나쁨", hex: "#ea580c" };
  return { label: "매우나쁨", hex: "#dc2626" };
}

/** PM2.5 → RGBA 연속 보간 (한국 대기질 표준, 단조 증가). */
export function pmColor(v: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [37, 99, 235]], // 좋음 (파랑)
    [15, [37, 99, 235]],
    [35, [16, 185, 129]], // 보통 (청록/초록)
    [55, [234, 179, 8]], // 나쁨 진입 (노랑)
    [75, [234, 88, 12]], // 나쁨 (주황)
    [110, [220, 38, 38]], // 매우나쁨 (빨강)
  ];
  let rgb = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1];
      const [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0);
      rgb = [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
      break;
    }
  }
  return [rgb[0], rgb[1], rgb[2], 235];
}

// ── 결정적 값 노이즈 (해시 기반 격자 보간 + 다중 옥타브) ──
function hash(ix: number, iy: number): number {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295; // 0~1
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const n00 = hash(x0, y0);
  const n10 = hash(x0 + 1, y0);
  const n01 = hash(x0, y0 + 1);
  const n11 = hash(x0 + 1, y0 + 1);
  return (
    n00 * (1 - fx) * (1 - fy) +
    n10 * fx * (1 - fy) +
    n01 * (1 - fx) * fy +
    n11 * fx * fy
  );
}
function fbm(x: number, y: number): number {
  // 5옥타브 프랙탈 — 큰 덩어리 + 중간 얼룩 + 작은 갈래·잔결
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    freq *= 2.2;
    amp *= 0.55;
  }
  return sum / norm; // 0~1 정규화
}

// ── mock 오염원: 세기·크기·타원 방향 다르게 흩뿌림 (정규화 좌표 0~1) ──
const WIND_DEG = 315; // 데모 주풍(북서풍) — 타원 이류 방향
const SOURCES = [
  { x: 0.54, y: 0.44, s: 115, r: 0.13 }, // 도심 강 (핫스팟)
  { x: 0.24, y: 0.72, s: 72, r: 0.09 }, // 부심 강
  { x: 0.72, y: 0.3, s: 60, r: 0.08 }, // 산단 중
  { x: 0.38, y: 0.18, s: 42, r: 0.07 }, // 외곽 약
  { x: 0.82, y: 0.66, s: 52, r: 0.07 },
  { x: 0.14, y: 0.4, s: 36, r: 0.06 },
  { x: 0.62, y: 0.82, s: 44, r: 0.06 }, // 남측
  { x: 0.44, y: 0.6, s: 30, r: 0.05 }, // 중간 잔덩어리
];

function pmField(nx: number, ny: number): number {
  // 바람 방향으로 늘어진 타원 감쇠 — 진행축 완만, 횡축 급감
  const dir = ((WIND_DEG + 180) % 360) * (Math.PI / 180);
  const sin = Math.sin(dir);
  const cos = Math.cos(dir);
  let plume = 0;
  for (const src of SOURCES) {
    const dx = nx - src.x;
    const dy = ny - src.y;
    const along = dx * sin + dy * cos;
    const cross = dx * cos - dy * sin;
    const d2 = (along / (src.r * 2.6)) ** 2 + (cross / (src.r * 0.85)) ** 2;
    plume += src.s * Math.exp(-d2);
  }

  // 프랙탈 노이즈를 곱셈 방식으로 강하게 — 얼룩·갈래·구멍 생성.
  // 노이즈 낮은 곳은 농도가 확 죽어 '부서진 구름'이 된다(매끈함 파괴).
  const big = fbm(nx * 3.5 + 2, ny * 3.5 + 7); // 큰 스케일 흐름
  const mid = fbm(nx * 9 + 40, ny * 9 + 13); // 중간 얼룩
  const fine = valueNoise(nx * 22 + 5, ny * 22 + 60); // 작은 갈래
  const combo = 0.5 * big + 0.35 * mid + 0.15 * fine; // 0~1
  // 곱셈 변조: pow로 낮은 노이즈는 '구멍'까지 죽이고(대비), 높은 곳은 코어를
  // 살려 매우나쁨 핫스팟이 나오게. 하한으로 완전 0은 방지.
  const mod = Math.max(0.08, Math.pow(combo, 1.3) * 1.9);

  const bg = 6 + 20 * big; // 흐르는 배경 얼룩
  return bg + plume * mod;
}

/** 구름 결측 영역 여부 (위성 저궤도 관측 공백 — 회색 처리) */
function isCloudGap(nx: number, ny: number): boolean {
  // 별도 노이즈 필드로 몇 개의 유기적 구멍 — 위성 구름 마스킹 흉내
  return fbm(nx * 4.2 + 77, ny * 4.2 + 19) > 0.63;
}

function confidenceAt(lng: number, lat: number): number {
  let nearest = Infinity;
  for (const s of AIR_STATIONS) {
    const d = Math.hypot(lng - s.lng, lat - s.lat);
    if (d < nearest) nearest = d;
  }
  return Math.max(0.35, Math.min(0.98, 1 - nearest * 2.6));
}

function toNorm(lng: number, lat: number): [number, number] {
  return [
    (lng - AIR_BOUNDS.west) / (AIR_BOUNDS.east - AIR_BOUNDS.west),
    (lat - AIR_BOUNDS.south) / (AIR_BOUNDS.north - AIR_BOUNDS.south),
  ];
}

/** 경위도 → 래스터 캔버스 픽셀 좌표 (n×n, AIR_BOUNDS 기준) */
function llToPixel(lng: number, lat: number, n: number): [number, number] {
  const [nx, ny] = toNorm(lng, lat);
  return [nx * (n - 1), (1 - ny) * (n - 1)]; // 위=북
}

/**
 * 대기질 래스터를 청주 행정경계 안쪽으로만 클리핑 — 지도 밖(바다·타 지역)
 * 네모 번짐 제거. 경계 밖은 투명, 경계선을 따라 오염이 잘린다(뉴스 이미지형).
 * @param features 청주 읍면동 MultiPolygon feature 배열
 */
export function renderAirCanvasClipped(
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[],
  n = 320,
): HTMLCanvasElement {
  const base = renderAirCanvas(n);
  const out = document.createElement("canvas");
  out.width = n;
  out.height = n;
  const ctx = out.getContext("2d")!;

  // 청주 전체 경계를 하나의 클립 패스로
  ctx.beginPath();
  for (const f of features) {
    const polys =
      f.geometry.type === "MultiPolygon"
        ? (f.geometry.coordinates as number[][][][])
        : [f.geometry.coordinates as number[][][]];
    for (const poly of polys) {
      const ring = poly[0];
      for (let i = 0; i < ring.length; i++) {
        const [px, py] = llToPixel(ring[i][0], ring[i][1], n);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
  }
  ctx.clip();
  ctx.drawImage(base, 0, 0);
  return out;
}

/** 임의 지점 추정값 (지도 클릭 팝업용) */
export function estimateAt(lng: number, lat: number): AirCell {
  const [nx, ny] = toNorm(lng, lat);
  return {
    lng,
    lat,
    pm25: Math.max(5, Math.round(pmField(nx, ny))),
    confidence: confidenceAt(lng, lat),
  };
}

/**
 * 대기질 추정 래스터 캔버스 — 촘촘한 격자를 ImageData로 굽고 BitmapLayer가
 * GPU 선형 보간으로 부드럽게 확대. 구름 결측은 반투명 회색.
 */
export function renderAirCanvas(n = 200): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const img = new ImageData(n, n);
  for (let r = 0; r < n; r++) {
    const ny = 1 - r / (n - 1); // 위=북
    for (let c = 0; c < n; c++) {
      const nx = c / (n - 1);
      const idx = (r * n + c) * 4;
      if (isCloudGap(nx, ny)) {
        img.data[idx] = 148;
        img.data[idx + 1] = 155;
        img.data[idx + 2] = 165;
        img.data[idx + 3] = 90; // 결측 — 옅은 회색
        continue;
      }
      const [rr, gg, bb, aa] = pmColor(pmField(nx, ny));
      img.data[idx] = rr;
      img.data[idx + 1] = gg;
      img.data[idx + 2] = bb;
      img.data[idx + 3] = aa;
    }
  }
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}
