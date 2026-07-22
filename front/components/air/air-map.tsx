"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { loadChungbuk, measAt, type ChungbukSnapshot } from "@/lib/chungbuk";
import {
  estimateFromSamples,
  pmClass,
  pmColor,
  renderAirIDW,
  type AirBounds,
  type AirPick,
  type AirSample,
} from "@/lib/air-grid";

/**
 * 사각지대 대기질 지도 (F-GAP-01) — 다크 배경(CARTO dark-matter) 위에 34개 대기측정소
 * (에어코리아) 실측 PM2.5 를 IDW 보간한 추정 격자. 시간 슬라이더로 실측 시계열 스크럽.
 * 색: 한국 대기질 표준. 실데이터(측정소 보간)이며, 지도 클릭 시 추정·신뢰도 팝업.
 */

const DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function buildLayers(samples: AirSample[], b: AirBounds): Layer[] {
  const out: Layer[] = [];
  if (samples.length) {
    out.push(
      new BitmapLayer({
        id: "air-raster",
        image: renderAirIDW(samples, b),
        bounds: [b.west, b.south, b.east, b.north],
        opacity: 0.8,
      })
    );
  }
  out.push(
    new ScatterplotLayer<AirSample>({
      id: "air-stations",
      data: samples,
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 5,
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      getFillColor: (d) => {
        const [r, g, bb] = pmColor(d.pm25);
        return [r, g, bb, 255];
      },
      stroked: true,
      getLineColor: [255, 255, 255, 235],
      getLineWidth: 1.5,
      lineWidthUnits: "pixels",
    })
  );
  return out;
}

export function AirMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [t, setT] = useState(0);
  const [pick, setPick] = useState<AirPick | null>(null);
  const [tilesError, setTilesError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadChungbuk()
      .then((s) => {
        if (!alive) return;
        setT(s.n - 1);
        setSnap(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const bounds: AirBounds | null = snap
    ? {
        west: snap.domain.lon_min,
        south: snap.domain.lat_min,
        east: snap.domain.lon_max,
        north: snap.domain.lat_max,
      }
    : null;

  // 현재 시각 측정소 실측 표본 (결측 제외)
  const samples: AirSample[] = useMemo(() => {
    if (!snap) return [];
    const out: AirSample[] = [];
    snap.stations.forEach((st, si) => {
      const v = measAt(snap, "PM25", si, t);
      if (v != null) out.push({ lng: st.lon, lat: st.lat, pm25: v });
    });
    return out;
  }, [snap, t]);
  const samplesRef = useRef(samples);
  samplesRef.current = samples;

  // 지도 1회 초기화 (스냅샷 로드 후 — 도메인 프레이밍)
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
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    const overlay = new MapboxOverlay({
      layers: [],
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
    map.on("click", (e) =>
      setPick(estimateFromSamples(samplesRef.current, e.lngLat.lng, e.lngLat.lat))
    );
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
  }, [snap]);

  // 표본 변경 → 오버레이 갱신
  useEffect(() => {
    if (!overlayRef.current || !bounds) return;
    overlayRef.current.setProps({ layers: buildLayers(samples, bounds) });
  }, [samples, bounds]);

  const pk = pick ? pmClass(pick.pm25) : null;

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-[#0b1b2b]">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

        {!snap && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            측정소 실측 불러오는 중…
          </div>
        )}

        {tilesError && (
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-alert-watch/50 bg-white/90 px-4 py-1.5 text-xs text-alert-watch backdrop-blur">
            배경지도 타일을 불러오지 못했습니다 — 네트워크 확인
          </div>
        )}

        {/* 클릭 팝업 (추정 농도 + 신뢰도) */}
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
                측정소에 가까울수록 신뢰도가 높습니다. 측정소 실측 IDW 보간.
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
          <span className="h-2 w-2 rounded-full bg-gray-900 ring-1 ring-white" /> 측정소 34곳(실측) · 지도 클릭 → 추정값
        </span>
      </div>

      {/* 시각 스크럽 */}
      <div className="mt-3 flex items-center gap-3">
        <span className="font-data shrink-0 text-xs text-muted-foreground">
          {snap ? snap.times[t] : "—"}
        </span>
        <input
          type="range"
          min={0}
          max={snap ? snap.n - 1 : 0}
          step={1}
          value={t}
          disabled={!snap}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="측정 시각"
          className="w-full accent-brand"
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">실측 시계열</span>
      </div>
    </div>
  );
}

export default AirMap;
