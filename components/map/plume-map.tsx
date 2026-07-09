"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import {
  BitmapLayer,
  GeoJsonLayer,
  PathLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import { circlePath, plumeBounds, SOURCE_LL } from "@/lib/geo";
import type { AlertLevel } from "@/lib/mock";

/**
 * 실지도 플룸 레이어 (F-MAP-01 · P4) — MapLibre(CARTO dark-matter, 무키) 위에
 * deck.gl MapboxOverlay 로 플룸 래스터·배출원·취약시설·거리 링을 얹는다.
 *
 * react-map-gl 래퍼 대신 순수 maplibre-gl 을 쓴 이유: React 19/Next 15 와의
 * 버전 궁합 리스크 제거(제안 가이드의 대안 경로).
 */

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const LEVEL_RGB: Record<AlertLevel, [number, number, number]> = {
  good: [13, 148, 136],
  watch: [217, 119, 6],
  warn: [234, 88, 12],
  severe: [220, 38, 38],
};

export interface MapReading {
  id: string;
  name: string;
  lng: number;
  lat: number;
  level: AlertLevel;
}

/** 읍면동 경계 GeoJSON (properties: emd·adm_cd2·centroid) */
export type EmdGeoJson = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { emd: string; gu: string; adm_cd2: string; centroid: [number, number] };
    geometry: object;
  }[];
};

export interface PlumeMapProps {
  plumeCanvas: HTMLCanvasElement | null;
  halfExtent: number;
  readings: MapReading[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  layers: { plume: boolean; facilities: boolean; rings: boolean; boundaries: boolean };
  boundaries: EmdGeoJson | null;
  /** adm_cd2 → 위험 등급 (배출원 확산 예측 기반 행정동 채색) */
  riskByCode: Record<string, AlertLevel>;
  /** 지역 검색(F-SRCH-01) — 매칭된 행정동으로 카메라 이동 */
  focus: { lng: number; lat: number; key: string } | null;
  /** 매칭된 행정동 경계 강조 */
  highlightCode: string | null;
  /** 바람 흐름선 오버레이 — 현재 조작값과 실시간 동기 */
  wind: { wd: number; ws: number };
  showWind: boolean;
  onTileError: () => void;
}

const RISK_FILL: Record<AlertLevel, [number, number, number, number]> = {
  good: [13, 148, 136, 14],
  watch: [217, 119, 6, 70],
  warn: [234, 88, 12, 95],
  severe: [220, 38, 38, 115],
};

function buildLayers(p: PlumeMapProps): Layer[] {
  const out: Layer[] = [];

  // 행정동 위험도 코로플레스 — 맨 아래 계층 (플룸·마커가 위에 겹침)
  if (p.layers.boundaries && p.boundaries) {
    const riskKey = Object.entries(p.riskByCode)
      .map(([k, v]) => k + v)
      .join();
    out.push(
      new GeoJsonLayer({
        id: "emd-boundaries",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: p.boundaries as any,
        stroked: true,
        filled: true,
        getFillColor: (f: { properties?: { adm_cd2?: string } }) =>
          RISK_FILL[p.riskByCode[f.properties?.adm_cd2 ?? ""] ?? "good"],
        getLineColor: (f: { properties?: { adm_cd2?: string } }) =>
          f.properties?.adm_cd2 === p.highlightCode
            ? ([0, 184, 212, 230] as [number, number, number, number])
            : ([125, 180, 220, 55] as [number, number, number, number]),
        getLineWidth: (f: { properties?: { adm_cd2?: string } }) =>
          f.properties?.adm_cd2 === p.highlightCode ? 2.5 : 1,
        lineWidthUnits: "pixels",
        updateTriggers: {
          getFillColor: riskKey,
          getLineColor: p.highlightCode,
          getLineWidth: p.highlightCode,
        },
      })
    );
  }

  if (p.layers.rings) {
    out.push(
      new PathLayer({
        id: "rings",
        data: [{ path: circlePath(2000) }, { path: circlePath(4000) }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [125, 180, 220, 70],
        getWidth: 1.2,
        widthUnits: "pixels",
      })
    );
  }

  if (p.layers.plume && p.plumeCanvas) {
    out.push(
      new BitmapLayer({
        id: "plume",
        image: p.plumeCanvas,
        bounds: plumeBounds(p.halfExtent),
        opacity: 1,
      })
    );
  }

  // 배출원 마커
  out.push(
    new ScatterplotLayer({
      id: "source",
      data: [SOURCE_LL],
      getPosition: () => [SOURCE_LL.lng, SOURCE_LL.lat],
      getRadius: 70,
      radiusUnits: "meters",
      getFillColor: [0, 184, 212, 190],
      stroked: true,
      getLineColor: [255, 255, 255, 220],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
    })
  );

  if (p.layers.facilities) {
    out.push(
      new ScatterplotLayer<MapReading>({
        id: "facilities",
        data: p.readings,
        pickable: true,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => (d.id === p.selectedId ? 135 : 95),
        radiusUnits: "meters",
        getFillColor: (d) => [...LEVEL_RGB[d.level], 235] as [number, number, number, number],
        stroked: true,
        getLineColor: (d) =>
          d.id === p.selectedId ? [255, 255, 255, 255] : [255, 255, 255, 150],
        getLineWidth: (d) => (d.id === p.selectedId ? 2.5 : 1.2),
        lineWidthUnits: "pixels",
        onClick: (info: PickingInfo<MapReading>) => {
          if (info.object)
            p.onSelect(info.object.id === p.selectedId ? null : info.object.id);
        },
        updateTriggers: {
          getRadius: p.selectedId,
          getLineColor: p.selectedId,
          getLineWidth: p.selectedId,
          getFillColor: p.readings.map((r) => r.level).join(),
        },
      }),
      new TextLayer<MapReading>({
        id: "labels",
        data: p.readings,
        getPosition: (d) => [d.lng, d.lat],
        getText: (d) => d.name,
        getSize: 12,
        getColor: [215, 229, 240, 235],
        getPixelOffset: [0, -18],
        characterSet: "auto",
        fontFamily: "Pretendard, 'Malgun Gothic', sans-serif",
      })
    );
  }

  return out;
}

export function PlumeMap(props: PlumeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // 지도 1회 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [SOURCE_LL.lng, SOURCE_LL.lat],
      zoom: 11.4,
      pitch: 45,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-left"
    );
    // 저작자 표시를 ⓘ 아이콘으로 접기 (CARTO 약관상 완전 제거는 불가)
    map.once("load", () => {
      map
        .getContainer()
        .querySelectorAll("details.maplibregl-ctrl-attrib")
        .forEach((d) => d.removeAttribute("open"));
    });

    // 지명 한글화 — CARTO 기본 스타일은 로마자(name_en 계열)를 쓰므로,
    // 이름을 그리는 심볼 레이어의 text-field 를 한글 우선으로 교체.
    // (OSM 로컬 지명(name)이 국내에서는 한글)
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

    if (process.env.NODE_ENV !== "production") {
      // 개발 편의: 콘솔에서 지도 상태 점검용
      (window as unknown as Record<string, unknown>).__windmapMap = map;
    }

    const overlay = new MapboxOverlay({
      layers: [],
      onClick: (info: PickingInfo) => {
        // 빈 곳 클릭 → 선택 해제
        if (!info.object) propsRef.current.onSelect(null);
      },
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay as unknown as maplibregl.IControl);

    let flagged = false;
    map.on("error", () => {
      // 스타일/타일 로드 실패(오프라인 등) — 1회만 상위에 알림
      if (!flagged && !map.isStyleLoaded()) {
        flagged = true;
        propsRef.current.onTileError();
      }
    });

    // 컨테이너 크기 추적 — 초기 레이아웃 확정 전에 지도가 만들어지면
    // 캔버스가 잘못된 크기로 고정된다(deck 오버레이 높이 0 증상). 명시적 resize.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // 상태 변경 → 레이어 갱신 (매 렌더, 레이어 생성은 저비용)
  useEffect(() => {
    overlayRef.current?.setProps({ layers: buildLayers(props) });
  });

  // 바람 흐름선 — 2D 캔버스 파티클 이류. 데모 바람장은 공간 균일(조작값)이라
  // GPU 격자 방식(webgl-wind) 대신 경량 구현으로 동일한 시각 효과를 낸다.
  // 풍향 다이얼과 실시간 동기 + 지도 회전(bearing) 반영.
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = windCanvasRef.current;
    if (!canvas || !props.showWind) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d")!;
    const fit = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const N = 160;
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      life: Math.random() * 120,
    }));

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { wd, ws } = propsRef.current.wind;
      const bearing = mapRef.current?.getBearing() ?? 0;
      // 화면상 이동 방위 = 플룸 진행 방위(wd+180) − 지도 회전
      const dir = (((wd + 180 - bearing) % 360) * Math.PI) / 180;
      const speed = 26 + ws * 9; // px/s
      const vx = Math.sin(dir) * speed;
      const vy = -Math.cos(dir) * speed;

      // 잔상 페이드 → 흐름선 효과
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(0,184,212,0.55)";
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";

      for (const p of parts) {
        const nx = p.x + vx * dt;
        const ny = p.y + vy * dt;
        p.life -= dt * 60;
        const out = nx < 0 || nx > canvas.width || ny < 0 || ny > canvas.height;
        if (out || p.life <= 0) {
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
          p.life = 60 + Math.random() * 120;
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx;
        p.y = ny;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [props.showWind]);

  // 검색 매칭 행정동으로 카메라 이동 (F-SRCH-01)
  const focusKey = props.focus?.key ?? null;
  useEffect(() => {
    if (!focusKey || !props.focus) return;
    mapRef.current?.flyTo({
      center: [props.focus.lng, props.focus.lat],
      zoom: 12.2,
      duration: 1400,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // 인라인 style 고정 — maplibre-gl.css 의 `.maplibregl-map { position: relative }`
  // 가 Tailwind `absolute` 를 덮어써 높이가 0으로 붕괴하는 문제 방지.
  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {props.showWind && (
        <canvas
          ref={windCanvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      )}
    </>
  );
}

export default PlumeMap;
