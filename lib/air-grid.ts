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

function pmField(lng: number, lat: number): number {
  // 위경도 기반 결정적 필드 — 도심 고농도 + 완만한 공간 변동
  const x = (lng - AIR_BOUNDS.west) / (AIR_BOUNDS.east - AIR_BOUNDS.west);
  const y = (lat - AIR_BOUNDS.south) / (AIR_BOUNDS.north - AIR_BOUNDS.south);
  const base =
    30 +
    26 * Math.exp(-(((x - 0.52) ** 2 + (y - 0.46) ** 2) / 0.05)) + // 도심 핫스팟
    14 * Math.sin(x * 6.1 + 1.2) * Math.cos(y * 4.7) +
    8 * Math.sin((x + y) * 5.3);
  return Math.max(6, Math.round(base));
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
