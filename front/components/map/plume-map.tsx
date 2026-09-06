"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import {
  HEAT_COLOR_RANGE,
  type Domain,
  type FacilityMarker,
  type HeatPoint,
  type StationMarker,
  type WindArrow,
} from "@/lib/chungbuk";
import { dashSegments, type Trajectory } from "@/lib/trajectory";

/**
 * 충북 전역 확산 지도 (F-MAP-01) — MapLibre(CARTO dark-matter, 무키) 위에
 * deck.gl MapboxOverlay 로 다중 배출원 근사 확산(HeatmapLayer)·시설·측정소·바람을 얹는다.
 *
 * ⚠ 히트맵은 풍향·풍속·배출량 기반 **상대 영향 강도 근사**이며 절대 농도(μg/m³)가 아니다.
 *   HeatmapLayer 는 뷰포트 상대 정규화라 색이 절대값이 아님 — 범례에 "상대 강도" 병기.
 *
 * react-map-gl 래퍼 대신 순수 maplibre-gl 사용(React 19/Next 15 버전 궁합 리스크 제거).
 */

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** 지도 위 호버 대상 — 상위(control-room) 툴팁 패널이 소비 */
export interface MapHover {
  kind: "facility" | "station";
  name: string;
  city: string;
  value: number | null; // facility: 배출 g/s · station: 측정값
  x: number;
  y: number;
}

export interface PlumeMapProps {
  points: HeatPoint[];
  facilities: FacilityMarker[];
  stations: StationMarker[];
  arrows: WindArrow[];
  domain: Domain;
  layers: { dispersion: boolean; facilities: boolean; stations: boolean; wind: boolean };
  /** 선택 굴뚝의 시간별 예측 이동 경로 — 없으면 null */
  trajectory: Trajectory | null;
  /** 레이어 updateTriggers 키 — 물질·시각·시군필터가 바뀔 때만 재계산 */
  frameKey: string;
  onHover: (h: MapHover | null) => void;
  /** 굴뚝·측정소 클릭 — 빈 곳 클릭이면 null */
  onClick: (h: MapHover | null) => void;
  onTileError: () => void;
}

function hoverFrom(info: PickingInfo): MapHover | null {
  const o = info.object as (FacilityMarker | StationMarker) | undefined;
  const id = info.layer?.id;
  if (!o || !id) return null;
  if (id === "facilities") {
    const f = o as FacilityMarker;
    return { kind: "facility", name: f.name, city: f.city, value: f.E, x: info.x, y: info.y };
  }
  if (id === "stations") {
    const s = o as StationMarker;
    return { kind: "station", name: s.name, city: s.city, value: s.v, x: info.x, y: info.y };
  }
  return null;
}

function buildLayers(p: PlumeMapProps): Layer[] {
  const out: Layer[] = [];

  // 근사 확산 히트맵 — 맨 아래 (시설·측정소가 위에 겹침)
  if (p.layers.dispersion) {
    out.push(
      new HeatmapLayer<HeatPoint>({
        id: "dispersion",
        data: p.points,
        getPosition: (d) => d.position,
        getWeight: (d) => d.weight,
        aggregation: "SUM",
        radiusPixels: 34, // 전역 스케일 튜닝값(28~42) — 과포화/소실 균형
        intensity: 1,
        threshold: 0.03,
        colorRange: HEAT_COLOR_RANGE,
        updateTriggers: { getPosition: p.frameKey, getWeight: p.frameKey },
      })
    );
  }

  // 시군별 바람 화살표 — 시군 중심점, 풍하(이동) 방향을 가리킴
  if (p.layers.wind) {
    out.push(
      new TextLayer<WindArrow>({
        id: "wind-arrows",
        data: p.arrows,
        getPosition: (d) => d.position,
        getText: () => "↑",
        // '↑'는 북향(0°). 풍하 나침 방위(wd+180)로 CW 회전 → deck CCW 관례에선 음수.
        getAngle: (d) => -((d.wd + 180) % 360),
        getSize: 24,
        getColor: [0, 184, 212, 220],
        characterSet: ["↑"],
        billboard: true,
        fontSettings: { buffer: 8 },
        updateTriggers: { getAngle: p.frameKey },
      })
    );
  }

  // 예측 이동 경로 — 선택 굴뚝에서 시군 실측 바람을 시간별로 따라간 전진 궤적
  if (p.trajectory) {
    const tr = p.trajectory;
    out.push(
      new PathLayer<[number, number][]>({
        id: "trajectory-path",
        data: dashSegments(tr.path, 1400, 800),
        getPath: (d) => d,
        getColor: [0, 184, 212, 235],
        widthUnits: "pixels",
        getWidth: 2.5,
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer<Trajectory["nodes"][number]>({
        id: "trajectory-nodes",
        data: tr.nodes,
        getPosition: (d) => d.position,
        getRadius: 5,
        radiusUnits: "pixels",
        // 데이터 범위 밖(바람 유지 가정) 노드는 속이 빈 원
        getFillColor: (d) => (d.assumed ? [11, 27, 43, 235] : [0, 184, 212, 255]),
        stroked: true,
        getLineColor: [0, 184, 212, 255],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
      }),
      new TextLayer<Trajectory["nodes"][number]>({
        id: "trajectory-labels",
        data: tr.nodes,
        getPosition: (d) => d.position,
        getText: (d) => `+${d.hour}h`,
        getSize: 12,
        getColor: [215, 229, 240, 255],
        getPixelOffset: [0, -15],
        background: true,
        getBackgroundColor: [11, 27, 43, 210],
        backgroundPadding: [5, 2],
        characterSet: "+0123456789h".split(""),
        billboard: true,
      }),
      new ScatterplotLayer<[number, number]>({
        id: "trajectory-origin",
        data: [tr.origin],
        getPosition: (d) => d,
        getRadius: 11,
        radiusUnits: "pixels",
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 230],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
      })
    );
  }

  // 측정소 — 현재시각 측정값 색 (초록 테두리)
  if (p.layers.stations) {
    out.push(
      new ScatterplotLayer<StationMarker>({
        id: "stations",
        data: p.stations,
        pickable: true,
        getPosition: (d) => d.position,
        getRadius: 6,
        radiusUnits: "pixels",
        radiusMinPixels: 4,
        getFillColor: (d) => [...d.color, 230] as [number, number, number, number],
        stroked: true,
        getLineColor: [12, 163, 12, 255],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: p.frameKey },
      })
    );
  }

  // 배출 굴뚝 — 반경 ∝ 현재 배출 강도, 실명 툴팁(호버)
  if (p.layers.facilities) {
    out.push(
      new ScatterplotLayer<FacilityMarker>({
        id: "facilities",
        data: p.facilities,
        pickable: true,
        getPosition: (d) => d.position,
        getRadius: (d) => 3 + d.en * 11,
        radiusUnits: "pixels",
        radiusMinPixels: 2.5,
        getFillColor: [208, 59, 59, 220],
        stroked: true,
        getLineColor: [255, 255, 255, 190],
        getLineWidth: 1,
        lineWidthUnits: "pixels",
        updateTriggers: { getRadius: p.frameKey },
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

  // 지도 1회 초기화 — 충북 전역 도메인으로 프레이밍
  useEffect(() => {
    if (!containerRef.current) return;
    const d = propsRef.current.domain;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      bounds: [
        [d.lon_min, d.lat_min],
        [d.lon_max, d.lat_max],
      ],
      fitBoundsOptions: { padding: 24 },
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      "top-left"
    );
    // 저작자 표시를 ⓘ 아이콘으로 접기 (CARTO 약관상 완전 제거는 불가)
    map.once("load", () => {
      map
        .getContainer()
        .querySelectorAll("details.maplibregl-ctrl-attrib")
        .forEach((el) => el.removeAttribute("open"));
    });

    // 지명 한글화 — CARTO 기본 스타일은 로마자를 쓰므로 한글 우선으로 교체.
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

    const overlay = new MapboxOverlay({
      layers: [],
      onHover: (info: PickingInfo) => propsRef.current.onHover(hoverFrom(info)),
      onClick: (info: PickingInfo) => propsRef.current.onClick(hoverFrom(info)),
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
    map.addControl(overlay as unknown as maplibregl.IControl);

    let flagged = false;
    map.on("error", () => {
      if (!flagged && !map.isStyleLoaded()) {
        flagged = true;
        propsRef.current.onTileError();
      }
    });

    // 컨테이너 크기 추적 — 초기 레이아웃 확정 전 생성 시 캔버스 높이 0 방지.
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

  // 인라인 style 고정 — maplibre-gl.css 의 position:relative 가 Tailwind absolute 를
  // 덮어써 높이가 0으로 붕괴하는 문제 방지.
  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

export default PlumeMap;
