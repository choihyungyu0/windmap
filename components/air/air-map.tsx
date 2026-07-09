"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import {
  AIR_BOUNDS,
  AIR_STATIONS,
  airGrid,
  estimateAt,
  pmClass,
  type AirCell,
} from "@/lib/air-grid";
import { SOURCE_LL } from "@/lib/geo";

/**
 * 사각지대 대기질 지도 (F-GAP-01) — 라이트 배경(CARTO positron) 위
 * HeatmapLayer로 위성 추정 PM2.5를 부드럽게 보간. 한국 대기질 표준 색축
 * (파랑→초록→노랑→빨강, 단조 증가 — Turbo 미사용: 지각 왜곡·색맹 취약).
 * colorDomain 고정으로 줌 무관 절대값 매핑. 클릭 시 격자 추정·신뢰도 팝업.
 */

const POSITRON = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// 대기질 표준 램프 (좋음→매우나쁨). HeatmapLayer는 저→고 순서로 보간.
const COLOR_RANGE: [number, number, number][] = [
  [37, 99, 235], // 좋음 (파랑)
  [5, 150, 105], // 보통 (초록)
  [217, 119, 6], // 나쁨 진입 (호박)
  [234, 88, 12], // 나쁨 (주황)
  [220, 38, 38], // 매우나쁨 (빨강)
];

export function AirMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [pick, setPick] = useState<AirCell | null>(null);
  const [tilesError, setTilesError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const grid = airGrid(42);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: POSITRON,
      center: [SOURCE_LL.lng, SOURCE_LL.lat],
      zoom: 10.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    const overlay = new MapboxOverlay({
      layers: [
        new HeatmapLayer<AirCell>({
          id: "air-heat",
          data: grid,
          getPosition: (d) => [d.lng, d.lat],
          getWeight: (d) => d.pm25,
          radiusPixels: 70,
          intensity: 1,
          threshold: 0.03,
          colorRange: COLOR_RANGE,
          colorDomain: [10, 90], // 절대 매핑 — 줌 변화에도 색=농도 유지
          opacity: 0.68,
        }),
        // 픽킹 전용 투명 격자점 — HeatmapLayer는 집계라 클릭 대상이 없음
        new ScatterplotLayer<AirCell>({
          id: "air-pick",
          data: grid,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 340,
          radiusUnits: "meters",
          getFillColor: [0, 0, 0, 0],
          pickable: true,
          onClick: (info: PickingInfo<AirCell>) => {
            if (info.object) setPick(info.object);
          },
        }),
        // 측정소 앵커
        new ScatterplotLayer({
          id: "air-stations",
          data: AIR_STATIONS as unknown as { lng: number; lat: number }[],
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 5,
          radiusUnits: "pixels",
          radiusMinPixels: 5,
          getFillColor: [17, 24, 39, 230],
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
        }),
      ],
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay as unknown as maplibregl.IControl);

    let flagged = false;
    map.on("error", () => {
      if (!flagged && !map.isStyleLoaded()) {
        flagged = true;
        setTilesError(true);
      }
    });
    // 지명 한글화
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
    // 클릭한 지점 값 (격자점 밖 클릭 대응)
    map.on("click", (e) => setPick(estimateAt(e.lngLat.lng, e.lngLat.lat)));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());
    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
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

      {/* 클릭 팝업 (F-GAP-01: 격자별 추정 농도 + 신뢰도) */}
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
              "linear-gradient(90deg, #2563eb, #059669 30%, #d97706 55%, #ea580c 75%, #dc2626)",
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
