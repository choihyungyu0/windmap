/**
 * 충북 전역 실데이터 로더·확산 근사 (실측 스냅샷 소비 계층).
 *
 * `public/data/chungbuk.json` — backend 수집기가 공공 API(CleanSYS TMS·ASOS 기상·
 * 에어코리아)에서 받아 시군별·시간별로 집계한 실데이터(988시간, 시설59·측정소34·시군8).
 * `backend/data/build_snapshot.py` 가 backend 확산 대시보드와 동일한 집계값을 export 한다.
 *
 * ⚠ 확산 표현은 **풍향·풍속·배출량 기반 근사 풋프린트**이며 검증된 물리 모델이 아니다.
 *   히트맵 색은 절대 농도(μg/m³)가 아니라 **상대 영향 강도**다. 화면 배지로 병기한다.
 *   입자상(PM10·PM2.5)은 굴뚝 먼지(TSP) 배출을 가스 확산으로 근사한다(참고용).
 *
 * 관례: 순수 함수·의존성 0. 모듈 로드 시 window/fetch 접근 없음(SSR 안전) — fetch 는
 * loadChungbuk() 안에서만, 클라이언트 effect 에서 호출한다.
 */

/* ── 스키마 (build_snapshot.py 산출물과 1:1) ── */
export type EmisKey = "NOx" | "HCl" | "SOx" | "TSP";
export type MeasKey = "NO2" | "SO2" | "PM10" | "PM25";
/** 화면에서 고르는 물질 — 배출/측정 키로 매핑된다 (PM은 TSP 배출로 근사) */
export type PollutantKey = "NOx" | "SOx" | "HCl" | "PM10" | "PM25";

export interface Facility {
  name: string;
  city: string;
  lat: number;
  lon: number;
  pols: string[];
}
export interface Station {
  name: string;
  city: string;
  lat: number;
  lon: number;
}
export interface Domain {
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
}
export interface ChungbukSnapshot {
  times: string[];
  n: number;
  cities: string[];
  facilities: Facility[];
  emis: Record<EmisKey, number[][]>; // [시설][시각] g/s
  stations: Station[];
  meas: Record<MeasKey, (number | null)[][]>; // [측정소][시각] μg/m³(또는 항목별 단위)
  wind: Record<string, { wd: (number | null)[]; ws: (number | null)[] }>; // 시군별
  domain: Domain;
  city_centroids: Record<string, [number, number]>; // [lat, lon]
}

/* ── 물질 설정 (backend 대시보드 POLS 포팅) ── */
export const POLLUTANTS: Record<
  PollutantKey,
  { label: string; emis: EmisKey; meas: MeasKey | null; note: string }
> = {
  NOx: { label: "NO₂", emis: "NOx", meas: "NO2", note: "" },
  SOx: { label: "SO₂", emis: "SOx", meas: "SO2", note: "" },
  HCl: {
    label: "HCl",
    emis: "HCl",
    meas: null,
    note: "HCl은 측정소 관측 항목이 아니라 굴뚝 배출만 표시됩니다(측정 검증값 없음).",
  },
  PM10: {
    label: "PM10",
    emis: "TSP",
    meas: "PM10",
    note: "⚠ PM10은 입자상 물질입니다. 굴뚝 먼지(TSP) 배출을 가스 확산모델로 근사 표시하며 실제 입자 침착·2차 생성·재비산은 반영되지 않습니다(참고용).",
  },
  PM25: {
    label: "PM2.5",
    emis: "TSP",
    meas: "PM25",
    note: "⚠ PM2.5는 입자상 물질입니다. 굴뚝 먼지(TSP) 배출을 가스 확산모델로 근사 표시하며 실제 입자 침착·2차 생성은 반영되지 않습니다(참고용). WHO 건강영향 최우선 물질.",
  },
};

export const POLLUTANT_ORDER: PollutantKey[] = ["NOx", "SOx", "HCl", "PM10", "PM25"];

/**
 * 히트맵 색 램프 (낮음→높음) — 앱 경보 팔레트(청록→호박→주황→빨강)와 정합.
 * ⚠ 상대 영향 강도이지 절대 농도가 아니다. 브랜드 청록과 충돌하는 파랑 계열은 배제.
 */
export const HEAT_COLOR_RANGE: [number, number, number][] = [
  [0, 184, 212], // 청록 (낮음 — 경보 good)
  [64, 178, 168], // 청록-라임 전이
  [217, 119, 6], // 호박 (경보 watch)
  [234, 88, 12], // 주황 (경보 warn)
  [220, 38, 38], // 빨강 (경보 severe)
  [153, 20, 20], // 진한 빨강 (최고)
];

/* ── 로더 (모듈 캐시 — 여러 화면이 공유) ── */
let cache: Promise<ChungbukSnapshot> | null = null;
export function loadChungbuk(): Promise<ChungbukSnapshot> {
  if (!cache) {
    cache = fetch("/data/chungbuk.json").then((r) => {
      if (!r.ok) throw new Error(`chungbuk.json fetch 실패: ${r.status}`);
      return r.json() as Promise<ChungbukSnapshot>;
    });
  }
  return cache;
}

/* ── 접근자 ── */
/** 배출물질의 전 시간·전 시설 최댓값 (정규화 기준) */
export function emissionScale(s: ChungbukSnapshot, k: EmisKey): number {
  let mx = 0;
  for (const row of s.emis[k]) for (const v of row) if (v > mx) mx = v;
  return mx || 1;
}
export function emissionAt(s: ChungbukSnapshot, k: EmisKey, fi: number, t: number): number {
  return s.emis[k]?.[fi]?.[t] ?? 0;
}
export function measAt(s: ChungbukSnapshot, k: MeasKey, si: number, t: number): number | null {
  return s.meas[k]?.[si]?.[t] ?? null;
}
/** 시군 바람 (결측 시 null) — 시설은 소속 시군(facility.city)으로 조회 */
export function windAt(
  s: ChungbukSnapshot,
  city: string,
  t: number
): { wd: number | null; ws: number } {
  const w = s.wind[city];
  if (!w) return { wd: null, ws: 0 };
  return { wd: w.wd?.[t] ?? null, ws: w.ws?.[t] ?? 0 };
}

/** 측정소 색: 값 없음=중립 회색, 있으면 현재시각 최댓값 대비 초록→빨강 (대시보드 포팅) */
function measColor(v: number | null, mmax: number): [number, number, number] {
  if (v == null) return [201, 201, 196];
  const u = Math.min(v / (mmax || 1), 1);
  return [Math.round(60 + u * 195), Math.round(163 - u * 120), 12];
}

/**
 * 측지 오프셋 — (lat,lon)에서 bearing 방위로 distM 미터 이동한 [경도, 위도].
 * backend 대시보드 offset() 포팅 (deck.gl 관례에 맞춰 [lng, lat] 반환).
 */
export function offsetLngLat(
  lat: number,
  lon: number,
  distM: number,
  bearingDeg: number
): [number, number] {
  const R = 6378137;
  const br = (bearingDeg * Math.PI) / 180;
  const dLat = ((distM * Math.cos(br)) / R) * (180 / Math.PI);
  const dLon =
    ((distM * Math.sin(br)) / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lon + dLon, lat + dLat];
}

/* ── 렌더 데이터 빌더 ── */
export interface HeatPoint {
  position: [number, number];
  weight: number;
}
export interface FacilityMarker {
  name: string;
  city: string;
  position: [number, number];
  E: number; // 현재시각 배출률 g/s
  en: number; // 정규화 강도 0~1
}
export interface StationMarker {
  name: string;
  city: string;
  position: [number, number];
  v: number | null; // 현재시각 측정값
  color: [number, number, number];
}
export interface WindArrow {
  city: string;
  position: [number, number]; // [lng, lat]
  wd: number; // 불어오는 방향(도)
  ws: number;
}

/**
 * 전역 확산 근사 포인트클라우드 — HeatmapLayer 급이용.
 * backend 대시보드 render() 포팅: 각 시설의 현재 배출량·소속 시군 바람으로
 * 풍하 방향을 따라 가중점을 흩뿌린다. (검증된 물리 아님 — 근사 풋프린트.)
 */
export function buildDispersionPoints(
  s: ChungbukSnapshot,
  pol: PollutantKey,
  t: number,
  cities: Set<string>
): HeatPoint[] {
  const cfg = POLLUTANTS[pol];
  const scale = emissionScale(s, cfg.emis);
  const pts: HeatPoint[] = [];
  s.facilities.forEach((f, fi) => {
    if (!cities.has(f.city)) return;
    const E = emissionAt(s, cfg.emis, fi, t);
    if (E <= 0) return;
    const { wd, ws } = windAt(s, f.city, t);
    if (wd == null) return;
    const en = Math.min(E / scale, 1);
    const dir = (wd + 180) % 360; // 풍하(이동) 방위
    const reach = 400 + (ws || 1) * 260; // m
    for (let d = 0.15; d <= 1.0; d += 0.16) {
      const dist = reach * d;
      for (let k = -1; k <= 1; k++) {
        const position = offsetLngLat(f.lat, f.lon, dist, dir + k * 10);
        const weight = Math.max((en * Math.exp(-0.5 * k * k)) / (1 + dist / 500), 0.02);
        pts.push({ position, weight });
      }
    }
    pts.push({ position: [f.lon, f.lat], weight: en }); // 배출원 자체
  });
  return pts;
}

/** 시설 마커 — 반경은 현재 배출 강도에 비례 */
export function facilityMarkers(
  s: ChungbukSnapshot,
  pol: PollutantKey,
  t: number,
  cities: Set<string>
): FacilityMarker[] {
  const cfg = POLLUTANTS[pol];
  const scale = emissionScale(s, cfg.emis);
  return s.facilities
    .map((f, fi) => {
      const E = emissionAt(s, cfg.emis, fi, t);
      return {
        name: f.name,
        city: f.city,
        position: [f.lon, f.lat] as [number, number],
        E,
        en: Math.min(E / scale, 1),
      };
    })
    .filter((m) => cities.has(m.city));
}

/** 측정소 마커 — 색은 현재시각 측정값(최댓값 대비) */
export function stationMarkers(
  s: ChungbukSnapshot,
  pol: PollutantKey,
  t: number,
  cities: Set<string>
): StationMarker[] {
  const cfg = POLLUTANTS[pol];
  const key = cfg.meas;
  let mmax = 1;
  if (key) {
    for (let si = 0; si < s.stations.length; si++) {
      const v = measAt(s, key, si, t);
      if (v != null && v > mmax) mmax = v;
    }
  }
  return s.stations
    .map((st, si) => {
      const v = key ? measAt(s, key, si, t) : null;
      return {
        name: st.name,
        city: st.city,
        position: [st.lon, st.lat] as [number, number],
        v,
        color: measColor(v, mmax),
      };
    })
    .filter((m) => cities.has(m.city));
}

/** 시군별 바람 화살표 (시군 중심점 기준) — 결측·필터 제외 */
export function windArrows(
  s: ChungbukSnapshot,
  t: number,
  cities: Set<string>
): WindArrow[] {
  const out: WindArrow[] = [];
  for (const [city, ll] of Object.entries(s.city_centroids)) {
    if (!cities.has(city)) continue;
    const { wd, ws } = windAt(s, city, t);
    if (wd == null) continue;
    out.push({ city, position: [ll[1], ll[0]], wd, ws });
  }
  return out;
}

/**
 * 역거리가중(IDW) 보간 — 측정소 실측값을 임의 지점으로 추정 (/air 격자·클릭 추정).
 * 좌표는 위경도, 거리는 대략적 미터 환산(국지 규모 충분).
 */
export function idw(
  samples: { lat: number; lon: number; value: number }[],
  lat: number,
  lon: number,
  power = 2
): number {
  let num = 0;
  let den = 0;
  for (const p of samples) {
    const dx = (p.lon - lon) * 90000; // ≈ m (위도 36° 부근 경도)
    const dy = (p.lat - lat) * 110540; // ≈ m
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) return p.value; // 좌표 일치
    const w = 1 / Math.pow(d2, power / 2);
    num += w * p.value;
    den += w;
  }
  return den ? num / den : 0;
}

/** 도메인 중심 [lng, lat] (지도 초기 카메라용) */
export function domainCenter(s: ChungbukSnapshot): [number, number] {
  return [
    (s.domain.lon_min + s.domain.lon_max) / 2,
    (s.domain.lat_min + s.domain.lat_max) / 2,
  ];
}

/* ── 경보용 기하 헬퍼 ── */
/** 두 점 사이 방위각(도, A→B, 북=0 시계방향) */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** 두 점 거리(km, 하버사인) */
export function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface UpwindEmitter {
  name: string;
  city: string;
  E: number;
  distKm: number;
}

/**
 * 특정 지점(측정소)의 풍상(upwind)에 있어 현재 영향을 줄 수 있는 배출원 —
 * 각 시설의 소속 시군 실바람 풍하 방향이 그 지점을 향하고(±maxAngle°) 거리
 * maxKm 이내인 배출원. ⚠ 풍향·거리 기반 근사이며 인과 입증 아님.
 */
export function upwindEmitters(
  s: ChungbukSnapshot,
  point: { lat: number; lon: number },
  pol: PollutantKey,
  t: number,
  maxKm = 25,
  maxAngle = 55
): UpwindEmitter[] {
  const emisKey = POLLUTANTS[pol].emis;
  const out: UpwindEmitter[] = [];
  s.facilities.forEach((f, fi) => {
    const E = emissionAt(s, emisKey, fi, t);
    if (E <= 0) return;
    const { wd } = windAt(s, f.city, t);
    if (wd == null) return;
    const dir = (wd + 180) % 360; // 풍하(이동) 방위
    const brg = bearingDeg(f.lat, f.lon, point.lat, point.lon);
    let diff = Math.abs(brg - dir);
    if (diff > 180) diff = 360 - diff;
    if (diff > maxAngle) return;
    const d = distKm(f.lat, f.lon, point.lat, point.lon);
    if (d > maxKm) return;
    out.push({ name: f.name, city: f.city, E, distKm: d });
  });
  return out.sort((a, b) => b.E - a.E);
}
