"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import {
  loadChungbuk,
  measAt,
  windArrows,
  type ChungbukSnapshot,
  type WindArrow,
} from "@/lib/chungbuk";
import { AIR_LEVEL_META, pm25Level, type AirLevel } from "@/lib/air-grid";

/**
 * 취약시설 경보 위험 지도 — 충북 전역 34개 대기측정소 실측 PM2.5 를 3D 기둥으로
 * (높이=농도, 색=경보 등급) + 배출 굴뚝 + 시군 바람. 실데이터(에어코리아·ASOS).
 * MapLibre(CARTO dark-matter) + deck.gl. ⚠ 등급은 한국 대기질 기준 매핑.
 */

const DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface StationCol {
  name: string;
  city: string;
  position: [number, number];
  pm25: number;
  level: AirLevel;
  rgb: [number, number, number];
}
interface Hover {
  name: string;
  city: string;
  pm25: number;
  level: AirLevel;
  x: number;
  y: number;
}

export function StationRiskMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [tilesError, setTilesError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChungbuk().then((s) => alive && setSnap(s));
    return () => {
      alive = false;
    };
  }, []);

  const t = snap ? snap.n - 1 : 0;

  const stations: StationCol[] = useMemo(() => {
    if (!snap) return [];
    const out: StationCol[] = [];
    snap.stations.forEach((st, si) => {
      const pm25 = measAt(snap, "PM25", si, t);
      if (pm25 == null) return;
      const level = pm25Level(pm25);
      out.push({
        name: st.name,
        city: st.city,
        position: [st.lon, st.lat],
        pm25,
        level,
        rgb: AIR_LEVEL_META[level].rgb,
      });
    });
    return out;
  }, [snap, t]);

  const emitters = useMemo(() => {
    if (!snap) return [] as { position: [number, number] }[];
    return snap.facilities.map((f) => ({ position: [f.lon, f.lat] as [number, number] }));
  }, [snap]);

  const arrows: WindArrow[] = useMemo(
    () => (snap ? windArrows(snap, t, new Set(snap.cities)) : []),
    [snap, t]
  );

  function buildLayers(): Layer[] {
    return [
      new ColumnLayer<StationCol>({
        id: "station-risk",
        data: stations,
        diskResolution: 12,
        radius: 1700,
        extruded: true,
        pickable: true,
        elevationScale: 360,
        getPosition: (d) => d.position,
        getElevation: (d) => d.pm25,
        getFillColor: (d) => [...d.rgb, 235] as [number, number, number, number],
        updateTriggers: { getElevation: t, getFillColor: t },
      }),
      new ScatterplotLayer<{ position: [number, number] }>({
        id: "emitters",
        data: emitters,
        getPosition: (d) => d.position,
        getRadius: 3,
        radiusUnits: "pixels",
        radiusMinPixels: 2,
        getFillColor: [208, 59, 59, 190],
        stroked: false,
      }),
      new TextLayer<WindArrow>({
        id: "wind-arrows",
        data: arrows,
        getPosition: (d) => d.position,
        getText: () => "↑",
        getAngle: (d) => -((d.wd + 180) % 360),
        getSize: 20,
        getColor: [0, 184, 212, 200],
        characterSet: ["↑"],
        billboard: true,
        fontSettings: { buffer: 8 },
        updateTriggers: { getAngle: t },
      }),
    ];
  }

  // 지도 1회 초기화
  useEffect(() => {
    if (!snap || !containerRef.current) return;
    const b = snap.domain;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK,
      bounds: [
        [b.lon_min, b.lat_min],
        [b.lon_max, b.lat_max],
      ],
      fitBoundsOptions: { padding: 30 },
      pitch: 48,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

    const overlay = new MapboxOverlay({
      layers: [],
      onHover: (info: PickingInfo) => {
        const o = info.object as StationCol | undefined;
        if (!o || info.layer?.id !== "station-risk") {
          setHover(null);
          return;
        }
        setHover({ name: o.name, city: o.city, pm25: o.pm25, level: o.level, x: info.x, y: info.y });
      },
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;

    let flagged = false;
    map.on("error", () => {
      if (!flagged && !map.isStyleLoaded()) {
        flagged = true;
        setTilesError(true);
      }
    });
    map.on("style.load", () => {
      for (const layer of map.getStyle().layers) {
        if (layer.type !== "symbol") continue;
        const tf = map.getLayoutProperty(layer.id, "text-field");
        if (tf && JSON.stringify(tf).includes("name")) {
          map.setLayoutProperty(layer.id, "text-field", [
            "coalesce",
            ["get", "name:ko"],
            ["get", "name"],
            ["get", "name_en"],
          ]);
        }
      }
    });
    map.once("load", () => {
      map
        .getContainer()
        .querySelectorAll("details.maplibregl-ctrl-attrib")
        .forEach((el) => el.removeAttribute("open"));
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());
    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [snap]);

  // 레이어 갱신
  useEffect(() => {
    overlayRef.current?.setProps({ layers: buildLayers() });
  });

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-[#081420]">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {!snap && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
          실측 대기질 불러오는 중…
        </div>
      )}

      {tilesError && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-alert-watch/50 bg-black/70 px-4 py-1.5 text-xs text-alert-watch backdrop-blur">
          배경지도 타일을 불러오지 못했습니다 — 네트워크 확인
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-white/15 bg-black/85 px-3 py-2 text-xs text-white backdrop-blur"
          style={{ left: Math.min(hover.x + 12, 360), top: Math.max(hover.y - 8, 8) }}
        >
          <div className="font-medium">{hover.name}</div>
          <div className="mt-0.5 text-white/70">
            {hover.city} · PM2.5{" "}
            <span className="font-data" style={{ color: AIR_LEVEL_META[hover.level].hex }}>
              {hover.pm25} µg/m³ · {AIR_LEVEL_META[hover.level].label}
            </span>
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
        <p className="mb-1.5 font-medium">
          측정소 실측 PM2.5 {snap ? `· ${snap.times[t]}` : ""}
        </p>
        <div className="flex flex-col gap-1">
          {(["good", "watch", "warn", "severe"] as AirLevel[]).map((lv) => (
            <span key={lv} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: AIR_LEVEL_META[lv].hex }}
              />
              {AIR_LEVEL_META[lv].label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-white/50">기둥 높이 = 농도 · 붉은 점 = 배출 굴뚝</p>
      </div>
    </div>
  );
}

export default StationRiskMap;
