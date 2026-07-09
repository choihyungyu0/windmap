/**
 * 사각지대 대기질 추정 격자 (F-GAP-01 데모) — 청주 인근 위성 AOD 기반
 * 지상 PM2.5 추정을 흉내낸 결정적 격자. 실제 위성 공백추정 모델(P7)로 교체.
 *
 * 값·신뢰도 모두 시드 없는 결정적 함수(재현성 NFR-8). 측정소(실측 앵커)에
 * 가까울수록 신뢰도 높게 — 위성-지상 융합의 핵심 직관.
 */

import { SOURCE_LL } from "./geo";

// 청주 시가지~인근을 덮는 경위도 범위
export const AIR_BOUNDS = {
  west: SOURCE_LL.lng - 0.28,
  east: SOURCE_LL.lng + 0.28,
  south: SOURCE_LL.lat - 0.22,
  north: SOURCE_LL.lat + 0.22,
} as const;

/** 실측 앵커 측정소 (경위도) — 추정의 기준점 */
export const AIR_STATIONS = [
  { name: "송정동", lng: SOURCE_LL.lng - 0.06, lat: SOURCE_LL.lat + 0.05 },
  { name: "사천동", lng: SOURCE_LL.lng + 0.11, lat: SOURCE_LL.lat - 0.08 },
] as const;

export interface AirCell {
  lng: number;
  lat: number;
  pm25: number; // μg/m³
  confidence: number; // 0~1 (측정소 근접도)
}

/** 한국형 PM2.5 등급 */
export function pmClass(v: number): { label: string; hex: string } {
  if (v <= 15) return { label: "좋음", hex: "#2563eb" };
  if (v <= 35) return { label: "보통", hex: "#059669" };
  if (v <= 75) return { label: "나쁨", hex: "#ea580c" };
  return { label: "매우나쁨", hex: "#dc2626" };
}

/** PM2.5 → RGBA 연속 보간 (한국 대기질 표준, 단조 증가). 래스터용. */
export function pmColor(v: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [37, 99, 235]], // 좋음 (파랑)
    [15, [37, 99, 235]],
    [35, [5, 150, 105]], // 보통 (초록)
    [55, [217, 119, 6]], // 나쁨 진입 (호박)
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
  return [rgb[0], rgb[1], rgb[2], 200];
}

/**
 * 대기질 추정 래스터 캔버스 — 격자를 ImageData로 굽고 BitmapLayer가 GPU
 * 선형 보간으로 부드럽게 확대. (HeatmapLayer는 밀도 히트맵이라 균일 격자의
 * 절대값을 색으로 못 냄 → 이 방식이 정확하고 부드러움. 플룸과 동일 기법.)
 */
export function renderAirCanvas(n = 96): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const img = new ImageData(n, n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const lng = AIR_BOUNDS.west + (c / (n - 1)) * (AIR_BOUNDS.east - AIR_BOUNDS.west);
      // 위쪽(row 0)이 북 → lat 상단
      const lat = AIR_BOUNDS.north - (r / (n - 1)) * (AIR_BOUNDS.north - AIR_BOUNDS.south);
      const [rr, gg, bb, aa] = pmColor(pmField(lng, lat));
      const idx = (r * n + c) * 4;
      img.data[idx] = rr;
      img.data[idx + 1] = gg;
      img.data[idx + 2] = bb;
      img.data[idx + 3] = aa;
    }
  }
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}

function pmField(lng: number, lat: number): number {
  // 위경도 기반 결정적 필드 — 좋음(외곽)~매우나쁨(도심 핫스팟) 전 구간 표현
  const x = (lng - AIR_BOUNDS.west) / (AIR_BOUNDS.east - AIR_BOUNDS.west);
  const y = (lat - AIR_BOUNDS.south) / (AIR_BOUNDS.north - AIR_BOUNDS.south);
  const base =
    14 +
    62 * Math.exp(-(((x - 0.54) ** 2 + (y - 0.44) ** 2) / 0.04)) + // 도심 핫스팟 → 매우나쁨
    18 * Math.exp(-(((x - 0.2) ** 2 + (y - 0.75) ** 2) / 0.03)) + // 부심 나쁨
    12 * Math.sin(x * 6.1 + 1.2) * Math.cos(y * 4.7) +
    7 * Math.sin((x + y) * 5.3);
  return Math.max(5, Math.round(base));
}

function confidenceAt(lng: number, lat: number): number {
  let nearest = Infinity;
  for (const s of AIR_STATIONS) {
    const d = Math.hypot(lng - s.lng, lat - s.lat);
    if (d < nearest) nearest = d;
  }
  // 0.02° 이내 高신뢰 → 0.25° 밖 低신뢰
  return Math.max(0.35, Math.min(0.98, 1 - nearest * 2.6));
}

/** N×N 추정 격자 (기본 42 → 부드러운 히트맵) */
export function airGrid(n = 42): AirCell[] {
  const cells: AirCell[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const lng = AIR_BOUNDS.west + (c / (n - 1)) * (AIR_BOUNDS.east - AIR_BOUNDS.west);
      const lat = AIR_BOUNDS.south + (r / (n - 1)) * (AIR_BOUNDS.north - AIR_BOUNDS.south);
      cells.push({ lng, lat, pm25: pmField(lng, lat), confidence: confidenceAt(lng, lat) });
    }
  }
  return cells;
}

/** 임의 지점의 추정값 (지도 클릭 팝업용) */
export function estimateAt(lng: number, lat: number): AirCell {
  return { lng, lat, pm25: pmField(lng, lat), confidence: confidenceAt(lng, lat) };
}
