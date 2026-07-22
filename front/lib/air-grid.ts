/**
 * 사각지대 대기질 추정 — 34개 대기측정소(에어코리아) 실측 PM2.5를 역거리가중(IDW)으로
 * 보간해, 측정소가 없는 지점의 농도를 추정한다. (실데이터 · 시뮬레이션 아님)
 *
 * 이전 버전은 합성 노이즈장(위성 AOD 흉내)이었으나, backend/data 의 34측정소 실측
 * 시계열이 붙어 실측 보간으로 교체했다. 위성-지상 융합(AOD) 추정은 로드맵(P7)이며,
 * 현재 지도는 지상 측정망 보간이다.
 *
 * 의존성 0 (IDW 는 lib/chungbuk 의 순수 함수 재사용).
 */

import { idw } from "./chungbuk";

export interface AirSample {
  lng: number;
  lat: number;
  pm25: number;
}
export interface AirBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}
export interface AirPick {
  lng: number;
  lat: number;
  pm25: number;
  confidence: number; // 최근접 측정소까지 거리 기반 (0~1)
}

/** 한국형 PM2.5 등급 — 구간은 한국 대기질 표준, 색은 서비스 경보 팔레트와 정합. */
export function pmClass(v: number): { label: string; hex: string } {
  if (v <= 15) return { label: "좋음", hex: "#0d9488" };
  if (v <= 35) return { label: "보통", hex: "#84cc16" };
  if (v <= 75) return { label: "나쁨", hex: "#ea580c" };
  return { label: "매우나쁨", hex: "#dc2626" };
}

/** 대기질 경보 등급 — 서비스 4단계(경보 화면·위험 지도 공유) */
export type AirLevel = "good" | "watch" | "warn" | "severe";

/** PM2.5(µg/m³) → 경보 등급 (한국 4등급을 서비스 경보 팔레트에 매핑) */
export function pm25Level(v: number): AirLevel {
  if (v <= 15) return "good"; // 좋음
  if (v <= 35) return "watch"; // 보통 — 민감군 관심
  if (v <= 75) return "warn"; // 나쁨
  return "severe"; // 매우나쁨
}

export const AIR_LEVEL_META: Record<
  AirLevel,
  { label: string; symbol: string; advice: string; hex: string; rgb: [number, number, number] }
> = {
  good: { label: "좋음", symbol: "○", advice: "정상 활동 가능", hex: "#0d9488", rgb: [13, 148, 136] },
  watch: { label: "보통", symbol: "◐", advice: "민감군 실외활동 조정 권고", hex: "#d97706", rgb: [217, 119, 6] },
  warn: { label: "나쁨", symbol: "◑", advice: "실외활동·환기 자제 권고", hex: "#ea580c", rgb: [234, 88, 12] },
  severe: { label: "매우나쁨", symbol: "●", advice: "실내 대피·환기 차단, 외출 자제", hex: "#dc2626", rgb: [220, 38, 38] },
};

/** PM2.5 → RGBA 연속 보간 (등급 앵커색 사이 단조 증가). */
export function pmColor(v: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [13, 148, 136]], // 좋음 (청록 — 경보 good)
    [15, [13, 148, 136]],
    [35, [132, 204, 22]], // 보통 (라임)
    [55, [217, 119, 6]], // 나쁨 진입 (호박 — 경보 watch)
    [75, [234, 88, 12]], // 나쁨 (주황 — 경보 warn)
    [110, [220, 38, 38]], // 매우나쁨 (빨강 — 경보 severe)
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
  return [rgb[0], rgb[1], rgb[2], 225];
}

/** 최근접 측정소까지 거리(도) */
function nearestDeg(samples: AirSample[], lng: number, lat: number): number {
  let nearest = Infinity;
  for (const s of samples) {
    const d = Math.hypot(lng - s.lng, lat - s.lat);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/** 임의 지점 실측 보간 추정 (지도 클릭 팝업용) */
export function estimateFromSamples(
  samples: AirSample[],
  lng: number,
  lat: number
): AirPick {
  const pm25 = samples.length
    ? Math.round(
        idw(
          samples.map((s) => ({ lat: s.lat, lon: s.lng, value: s.pm25 })),
          lat,
          lng,
          2.2
        )
      )
    : 0;
  const nearest = nearestDeg(samples, lng, lat);
  const confidence = Math.max(0.35, Math.min(0.98, 1 - nearest * 3.2));
  return { lng, lat, pm25: Math.max(0, pm25), confidence };
}

/**
 * 실측 IDW 보간 래스터 — 촘촘한 격자를 ImageData로 굽고 BitmapLayer가 GPU 선형
 * 보간으로 부드럽게 확대. 측정소 실측값을 역거리가중으로 채운다.
 */
export function renderAirIDW(
  samples: AirSample[],
  b: AirBounds,
  n = 220
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const img = new ImageData(n, n);
  const pts = samples.map((s) => ({ lat: s.lat, lon: s.lng, value: s.pm25 }));
  const spanLng = b.east - b.west;
  const spanLat = b.north - b.south;
  for (let r = 0; r < n; r++) {
    const lat = b.north - (r / (n - 1)) * spanLat; // 위=북
    for (let c = 0; c < n; c++) {
      const lng = b.west + (c / (n - 1)) * spanLng;
      const idx = (r * n + c) * 4;
      if (!pts.length) {
        img.data[idx + 3] = 0;
        continue;
      }
      const v = idw(pts, lat, lng, 2.2);
      const [rr, gg, bb, aa] = pmColor(v);
      img.data[idx] = rr;
      img.data[idx + 1] = gg;
      img.data[idx + 2] = bb;
      img.data[idx + 3] = aa;
    }
  }
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas;
}
