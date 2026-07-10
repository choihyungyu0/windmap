"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { concentrationAt } from "@/lib/plume";
import { lngLatToOffset, SOURCE_LL } from "@/lib/geo";
import {
  defaultReadings,
  defaultScenario,
  gradeOf,
  LEVEL_META,
  source,
  type AlertLevel,
} from "@/lib/mock";

/**
 * 경보 화면 위험 지도 3D (SVG 코로플레스 교체판) — 흰 압출 건물에 동 경보
 * 등급색을 입힌다. 채색은 경보 4등급 그대로(연속 램프 금지 원칙 유지),
 * 동/건물 클릭 → 관제로 이동.
 *
 * 배경 타일 없음: 로컬 buildings_3d.geojson + cheongju_emd.geojson 만으로
 * 렌더 — 외부 의존이 maplibre/deck 번들뿐이라 오프라인 데모(NFR-4) 무결.
 */

type EmdFeature = {
  properties: { emd: string; gu: string; adm_cd2: string; centroid: [number, number] };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

type BuildingFeature = {
  properties: { h: number };
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

const FILL_HEX: Record<AlertLevel, string> = {
  good: "#eef2f4",
  watch: "#fcd34d",
  warn: "#fb923c",
  severe: "#ef4444",
};

// 건물 몸체 — good 은 클레이 화이트, 영향권은 등급색 원색(경보의 주인공)
const BLDG_RGB: Record<AlertLevel, [number, number, number, number]> = {
  good: [250, 250, 252, 255],
  watch: [252, 211, 77, 255],
  warn: [251, 146, 60, 255],
  severe: [239, 68, 68, 255],
};

// 바닥(행정동 면) — 은은하게, 건물이 돋보이도록 알파 낮게
const GROUND_RGBA: Record<AlertLevel, [number, number, number, number]> = {
  good: [227, 232, 236, 90],
  watch: [252, 211, 77, 70],
  warn: [251, 146, 60, 80],
  severe: [239, 68, 68, 90],
};

const DIR_NAMES = [
  "북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동",
  "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서",
] as const;

const M_PER_DEG_LAT = 111_320;

/** ray casting — lng/lat 링 내부 판정 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInEmd(lng: number, lat: number, f: EmdFeature): boolean {
  const polys =
    f.geometry.type === "MultiPolygon"
      ? (f.geometry.coordinates as number[][][][])
      : [f.geometry.coordinates as number[][][]];
  for (const poly of polys) {
    if (pointInRing(lng, lat, poly[0])) return true;
  }
  return false;
}

export function RiskMap3D() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [emd, setEmd] = useState<EmdFeature[] | null>(null);
  const [buildings, setBuildings] = useState<BuildingFeature[] | null>(null);

  useEffect(() => {
    fetch("/data/cheongju_emd.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => setEmd(g?.features ?? null))
      .catch(() => setEmd(null));
    fetch("/data/buildings_3d.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => setBuildings(g?.features ?? null))
      .catch(() => setBuildings(null));
  }, []);

  // 동 등급 산정 — SVG 판과 동일(중심점 + 경계 정점 샘플 최대 농도)
  const scene = useMemo(() => {
    if (!emd) return null;
    const params = { ...defaultScenario, h: source.stackHeight };

    const shapes = emd.map((f) => {
      const polys =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][])
          : [f.geometry.coordinates as number[][][]];
      const [clng, clat] = f.properties.centroid;
      const [cex, cny] = lngLatToOffset(clng, clat);
      let maxConc = 0;
      if (Math.abs(cex) < 9000 && Math.abs(cny) < 9000) {
        maxConc = concentrationAt(cex, cny, params);
        for (const poly of polys) {
          const ring = poly[0];
          for (let i = 0; i < ring.length; i += 2) {
            const [ex, ny] = lngLatToOffset(ring[i][0], ring[i][1]);
            if (Math.abs(ex) > 9000 || Math.abs(ny) > 9000) continue;
            const c = concentrationAt(ex, ny, params);
            if (c > maxConc) maxConc = c;
          }
        }
      }
      const level: AlertLevel = gradeOf(maxConc);
      return { f, level };
    });

    const levelByFeature = new Map(shapes.map((s) => [s.f, s.level]));
    const affected = shapes.filter((s) => s.level !== "good");
    return { shapes, affected, levelByFeature, readings: defaultReadings() };
  }, [emd]);

  // 건물 → 소속 동 등급 (영향 동만 PIP — 나머지는 화이트)
  const coloredBuildings = useMemo(() => {
    if (!buildings || !scene) return null;
    const hot = scene.affected;
    return buildings.map((b) => {
      const ring = b.geometry.coordinates[0];
      // footprint 무게중심 근사(정점 평균)
      let lng = 0, lat = 0;
      for (const [x, y] of ring) { lng += x; lat += y; }
      lng /= ring.length; lat /= ring.length;
      let level: AlertLevel = "good";
      for (const s of hot) {
        if (pointInEmd(lng, lat, s.f)) { level = s.level; break; }
      }
      return { polygon: ring, h: b.properties.h ?? 6, level };
    });
  }, [buildings, scene]);

  // maplibre(빈 스타일) + deck overlay
  useEffect(() => {
    if (!containerRef.current || !scene || !coloredBuildings) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#e9edf1" } },
        ],
      },
      center: [SOURCE_LL.lng, SOURCE_LL.lat - 0.012], // 남쪽 주의 동까지 한 화면에
      zoom: 11.7,
      pitch: 55,
      bearing: -12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    // 바람 화살표(배출원 → 확산 방향) 지오메트리
    const rad = (((defaultScenario.wd + 180) % 360) * Math.PI) / 180;
    const dE = Math.sin(rad);
    const dN = Math.cos(rad);
    const cosLat = Math.cos((SOURCE_LL.lat * Math.PI) / 180);
    const at = (m: number, side = 0): [number, number] => {
      const sRad = rad + side;
      const e = side === 0 ? dE : Math.sin(sRad);
      const n = side === 0 ? dN : Math.cos(sRad);
      return [
        SOURCE_LL.lng + (e * m) / (M_PER_DEG_LAT * cosLat),
        SOURCE_LL.lat + (n * m) / M_PER_DEG_LAT,
      ];
    };
    const arrowTail = at(220);
    const arrowTip = at(1500);
    const head = 180;
    const headL: [number, number] = [
      arrowTip[0] + (Math.sin(rad + 2.6) * head) / (M_PER_DEG_LAT * cosLat),
      arrowTip[1] + (Math.cos(rad + 2.6) * head) / M_PER_DEG_LAT,
    ];
    const headR: [number, number] = [
      arrowTip[0] + (Math.sin(rad - 2.6) * head) / (M_PER_DEG_LAT * cosLat),
      arrowTip[1] + (Math.cos(rad - 2.6) * head) / M_PER_DEG_LAT,
    ];
    const tipF: [number, number] = [
      arrowTip[0] + (dE * head) / (M_PER_DEG_LAT * cosLat),
      arrowTip[1] + (dN * head) / M_PER_DEG_LAT,
    ];

    const emdClick = (info: PickingInfo) => {
      const f = info.object as EmdFeature | undefined;
      if (f?.properties?.emd) router.push(`/map?q=${encodeURIComponent(f.properties.emd)}`);
    };

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [
        // 바닥 — 행정동 면(등급색 은은하게) + 흰 경계선
        new GeoJsonLayer({
          id: "emd-ground",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { type: "FeatureCollection", features: emd as any },
          filled: true,
          stroked: true,
          getFillColor: (f) =>
            GROUND_RGBA[scene.levelByFeature.get(f as unknown as EmdFeature) ?? "good"],
          getLineColor: [255, 255, 255, 220],
          getLineWidth: 26,
          lineWidthMinPixels: 1.2,
          pickable: true,
          onClick: emdClick,
        }),
        // 주인공 — 흰 압출 건물, 영향 동은 등급색
        new PolygonLayer({
          id: "buildings-3d",
          data: coloredBuildings,
          extruded: true,
          filled: true,
          stroked: false,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => d.h,
          // 개관 줌(11.7)에서도 입체감이 읽히도록 높이 과장 — 실측 아님(데모 근사)
          elevationScale: 2.2,
          getFillColor: (d) => BLDG_RGB[d.level as AlertLevel],
          material: { ambient: 0.5, diffuse: 0.6, shininess: 28, specularColor: [235, 240, 245] },
          pickable: false,
        }),
        // 바람 화살표 — "왜 이 동네가 위험한가"의 인과 표시
        new PathLayer({
          id: "wind-arrow",
          data: [{ path: [arrowTail, arrowTip] }],
          getPath: (d) => d.path,
          getColor: [14, 116, 144, 220],
          getWidth: 34,
          widthMinPixels: 2.5,
          capRounded: true,
        }),
        new PolygonLayer({
          id: "wind-arrow-head",
          data: [{ polygon: [tipF, headL, headR] }],
          getPolygon: (d) => d.polygon,
          getFillColor: [14, 116, 144, 220],
          stroked: false,
        }),
        // 배출원 마커 + 라벨
        new ScatterplotLayer({
          id: "src-dot",
          data: [{ position: [SOURCE_LL.lng, SOURCE_LL.lat] }],
          getPosition: (d) => d.position,
          getRadius: 60,
          radiusMinPixels: 5,
          getFillColor: [255, 255, 255, 255],
          getLineColor: [14, 116, 144, 255],
          getLineWidth: 20,
          lineWidthMinPixels: 2.5,
          stroked: true,
        }),
        new TextLayer({
          id: "labels",
          data: [
            { position: [SOURCE_LL.lng, SOURCE_LL.lat], text: "시범 배출원", color: [14, 116, 144, 255] as [number, number, number, number], offset: [0, -18] as [number, number] },
            ...scene.affected.map((s) => ({
              position: s.f.properties.centroid,
              text: s.f.properties.emd,
              color: [31, 41, 55, 255] as [number, number, number, number],
              offset: [0, 0] as [number, number],
            })),
          ],
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getColor: (d) => d.color,
          getPixelOffset: (d) => d.offset,
          getSize: 14,
          fontFamily: "Pretendard, sans-serif",
          fontSettings: { sdf: true },
          outlineWidth: 5,
          outlineColor: [255, 255, 255, 235],
          characterSet: "auto",
        }),
      ],
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay);

    return () => {
      map.removeControl(overlay);
      map.remove();
    };
  }, [scene, coloredBuildings, emd, router]);

  if (!scene) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
        지도 불러오는 중…
      </div>
    );
  }

  const active = scene.readings.filter((r) => r.level !== "good");

  return (
    <div>
      {/* KPI 스트립 */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "활성 경보", value: `${active.length}건` },
          { label: "영향 행정동", value: `${scene.affected.length}곳` },
          {
            label: "최고 위험",
            value: scene.readings[0]?.level !== "good" ? scene.readings[0].name : "—",
          },
          { label: "감시 시설", value: `${scene.readings.length}곳` },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border px-5 py-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="tnum mt-1 text-xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* 3D 건물 코로플레스 */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-border">
        <div
          ref={containerRef}
          className="h-[540px] w-full"
          role="img"
          aria-label="행정동별 위험 3D 건물 지도 (시뮬레이션)"
        />

        {/* 시나리오 배지 — 바람 조건(인과)을 지도 위에 명시 */}
        <p className="absolute right-3 top-3 rounded-md border border-border bg-white/90 px-3 py-1.5 text-xs font-medium backdrop-blur">
          {DIR_NAMES[Math.round(defaultScenario.wd / 22.5) % 16]}풍{" "}
          <span className="font-data">{defaultScenario.wd}°</span> ·{" "}
          <span className="font-data">{defaultScenario.u} m/s</span>
          <span className="ml-1.5 text-muted-foreground">→ 화살표 방향으로 확산</span>
        </p>

        {/* 범례 */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-white/90 px-3 py-2 text-xs backdrop-blur">
          {(Object.keys(FILL_HEX) as AlertLevel[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[3px] border border-black/10"
                style={{ background: l === "good" ? "#fafafc" : FILL_HEX[l] }}
              />
              {LEVEL_META[l].label}
              {l === "good" && <span className="text-muted-foreground">(흰 건물)</span>}
            </span>
          ))}
        </div>
        <p className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
          드래그 회전 · 동 클릭 시 확산 관제로 이동 · 시뮬레이션
        </p>
      </div>
    </div>
  );
}
