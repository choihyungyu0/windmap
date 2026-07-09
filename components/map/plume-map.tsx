"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import {
  BitmapLayer,
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

export interface PlumeMapProps {
  plumeCanvas: HTMLCanvasElement | null;
  halfExtent: number;
  readings: MapReading[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  layers: { plume: boolean; facilities: boolean; rings: boolean };
  onTileError: () => void;
}

function buildLayers(p: PlumeMapProps): Layer[] {
  const out: Layer[] = [];

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

    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // 상태 변경 → 레이어 갱신 (매 렌더, 레이어 생성은 저비용)
  useEffect(() => {
    overlayRef.current?.setProps({ layers: buildLayers(props) });
  });

  return <div ref={containerRef} className="absolute inset-0" />;
}

export default PlumeMap;
