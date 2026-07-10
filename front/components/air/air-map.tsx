"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import {
  AIR_BOUNDS,
  AIR_STATIONS,
  estimateAt,
  pmClass,
  renderAirCanvas,
  renderAirCanvasClipped,
  type AirCell,
} from "@/lib/air-grid";
import { SOURCE_LL } from "@/lib/geo";

/**
 * 사각지대 대기질 지도 (F-GAP-01) — 다크 배경(CARTO dark-matter) 위 위성 추정
 * PM2.5. 히트맵(부드러운 구름 얼룩)을 청주 행정경계 안쪽으로만 클리핑해
 * 지도 밖 네모 번짐을 없앤다(경계선을 따라 오염이 잘림 — 뉴스 이미지형).
 * 색: 한국 대기질 표준. ⚠ 시뮬레이션(배지 유지). 클릭 시 추정·신뢰도 팝업.
 */

const DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type EmdFeature = {
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

export function AirMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [pick, setPick] = useState<AirCell | null>(null);
  const [tilesError, setTilesError] = useState(false);

  function layers(raster: HTMLCanvasElement, emd: EmdFeature[] | null): Layer[] {
    const out: Layer[] = [
      new BitmapLayer({
        id: "air-raster",
        image: raster,
        bounds: [AIR_BOUNDS.west, AIR_BOUNDS.south, AIR_BOUNDS.east, AIR_BOUNDS.north],
        opacity: 0.85,
      }),
    ];
    // 경계선 살짝 (오염이 어느 구역에 잘렸는지 읽히게)
    if (emd) {
      out.push(
        new GeoJsonLayer({
          id: "air-emd-line",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { type: "FeatureCollection", features: emd } as any,
          stroked: true,
          filled: false,
          getLineColor: [235, 242, 248, 95],
          getLineWidth: 1,
          lineWidthUnits: "pixels",
        })
      );
    }
    out.push(
      new ScatterplotLayer({
        id: "air-stations",
        data: AIR_STATIONS as unknown as { lng: number; lat: number }[],
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 5,
        radiusUnits: "pixels",
        radiusMinPixels: 5,
        getFillColor: [255, 255, 255, 240],
        stroked: true,
        getLineColor: [11, 27, 43, 255],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
      })
    );
    return out;
  }

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK,
      center: [SOURCE_LL.lng, SOURCE_LL.lat],
      zoom: 10.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    const overlay = new MapboxOverlay({
      // 경계 로드 전: 클리핑 없는 래스터로 우선 표시
      layers: layers(renderAirCanvas(200), null),
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;

    // 경계 로드 → 클리핑 래스터로 교체
    fetch("/data/cheongju_emd.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((geo: { features: EmdFeature[] } | null) => {
        if (!geo || !overlayRef.current) return;
        const clipped = renderAirCanvasClipped(geo.features, 320);
        overlayRef.current.setProps({ layers: layers(clipped, geo.features) });
      })
      .catch(() => {});

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
    map.on("click", (e) => setPick(estimateAt(e.lngLat.lng, e.lngLat.lat)));

    // 저작자 표시를 ⓘ 아이콘으로 접기 (CARTO 약관상 완전 제거는 불가)
    map.once("load", () => {
      map
        .getContainer()
        .querySelectorAll("details.maplibregl-ctrl-attrib")
        .forEach((d) => d.removeAttribute("open"));
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
  }, []);

  const pk = pick ? pmClass(pick.pm25) : null;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {tilesError && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-alert-watch/50 bg-white/90 px-4 py-1.5 text-xs text-alert-watch backdrop-blur">
          배경지도 타일을 불러오지 못했습니다 — 네트워크 확인
        </div>
      )}

      {/* 클릭 팝업 (F-GAP-01: 추정 농도 + 신뢰도) */}
      {pick && pk && (
        <div className="absolute right-3 top-3 z-10 w-52 rounded-lg border border-border bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">추정 PM2.5</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
              style={{ background: pk.hex }}
            >
              {pk.label}
            </span>
          </div>
          <p className="tnum mt-1 text-2xl font-bold">
            {pick.pm25}
            <span className="ml-1 text-sm font-normal text-muted-foreground">μg/m³</span>
          </p>
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">추정 신뢰도</span>
              <span className="tnum font-semibold">{Math.round(pick.confidence * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round(pick.confidence * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              측정소에 가까울수록 신뢰도가 높습니다. 위성 추정 · 시뮬레이션.
            </p>
          </div>
        </div>
      )}

      {/* 범례 (연속 램프) */}
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-white/90 px-3 py-2 backdrop-blur">
        <div
          className="h-1.5 w-48 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #0d9488, #84cc16 30%, #d97706 55%, #ea580c 75%, #dc2626)",
          }}
        />
        <div className="tnum mt-1 flex w-48 justify-between text-[9px] text-muted-foreground">
          <span>좋음</span>
          <span>보통</span>
          <span>나쁨</span>
          <span>매우나쁨</span>
        </div>
      </div>
      <span className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md bg-white/90 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-gray-900 ring-1 ring-white" /> 측정소(실측 앵커) · 지도 클릭 → 추정값
      </span>
    </div>
  );
}

export default AirMap;
