"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { concentrationAt } from "@/lib/plume";
import { lngLatToOffset } from "@/lib/geo";
import {
  defaultReadings,
  defaultScenario,
  gradeOf,
  LEVEL_META,
  source,
  type AlertLevel,
} from "@/lib/mock";

/**
 * 경보 화면 위험 지도 — 행정동 경계 SVG 코로플레스 (라이트 톤).
 * 관제(/map)의 요약판: 채색은 경보 4등급 그대로(연속 램프 금지 — 이산
 * 등급에 없는 정밀도를 암시하지 않기), 동 클릭 → 관제로 이동.
 * 의존성 0 정적 SVG — 오프라인·성능 무결.
 */

type Feature = {
  properties: { emd: string; gu: string; adm_cd2: string; centroid: [number, number] };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

const FILL: Record<AlertLevel, string> = {
  good: "#eef2f4",
  watch: "#fcd34d",
  warn: "#fb923c",
  severe: "#ef4444",
};

const VB = 720; // viewBox 한 변

export function RiskMap() {
  const router = useRouter();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/cheongju_emd.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => setFeatures(g?.features ?? null))
      .catch(() => setFeatures(null));
  }, []);

  const scene = useMemo(() => {
    if (!features) return null;
    const params = { ...defaultScenario, h: source.stackHeight };

    // 전체 bbox (미터 오프셋 기준) → viewBox 사상
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const projected = features.map((f) => {
      const polys =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][])
          : [f.geometry.coordinates as number[][][]];
      const rings = polys.map((poly) =>
        poly[0].map(([lng, lat]) => {
          const [ex, ny] = lngLatToOffset(lng, lat);
          minX = Math.min(minX, ex); maxX = Math.max(maxX, ex);
          minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
          return [ex, ny] as [number, number];
        })
      );
      return { f, rings };
    });
    const span = Math.max(maxX - minX, maxY - minY);
    const sx = (ex: number) => ((ex - minX) / span) * VB;
    const sy = (ny: number) => ((maxY - ny) / span) * VB;

    const shapes = projected.map(({ f, rings }) => {
      const [clng, clat] = f.properties.centroid;
      const [cex, cny] = lngLatToOffset(clng, clat);
      // 등급 = 중심점 + 경계 정점들의 최대 농도 (플룸이 동을 '가로지르는'
      // 경우 중심점만으로는 놓침 — 경계 샘플링으로 보완)
      let maxConc = 0;
      if (Math.abs(cex) < 9000 && Math.abs(cny) < 9000) {
        maxConc = concentrationAt(cex, cny, params);
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i += 2) {
            const [ex, ny] = ring[i];
            if (Math.abs(ex) > 9000 || Math.abs(ny) > 9000) continue;
            const c = concentrationAt(ex, ny, params);
            if (c > maxConc) maxConc = c;
          }
        }
      }
      const level: AlertLevel = gradeOf(maxConc);
      const d = rings
        .map(
          (ring) =>
            "M" + ring.map(([ex, ny]) => `${sx(ex).toFixed(1)},${sy(ny).toFixed(1)}`).join("L") + "Z"
        )
        .join(" ");
      return { d, level, emd: f.properties.emd, gu: f.properties.gu, cx: sx(cex), cy: sy(cny) };
    });

    const affected = shapes.filter((s) => s.level !== "good");
    return {
      shapes,
      affected,
      src: { x: sx(0), y: sy(0) },
      readings: defaultReadings(),
    };
  }, [features]);

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
          {
            label: "영향 행정동",
            value: `${scene.affected.length}곳`,
          },
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

      {/* SVG 코로플레스 */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-border">
        <svg
          viewBox={`0 0 ${VB} ${VB * 0.78}`}
          className="block w-full"
          role="img"
          aria-label="행정동별 위험 지도 (시뮬레이션)"
        >
          {/* 위험도 낮은 동 먼저, 채색 동은 위로 */}
          {[...scene.shapes]
            .sort((a, b) => (a.level === "good" ? -1 : 1) - (b.level === "good" ? -1 : 1))
            .map((s) => (
              <path
                key={s.emd + s.cx}
                d={s.d}
                fill={FILL[s.level]}
                stroke="#ffffff"
                strokeWidth={hover === s.emd ? 2.5 : 1.2}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseEnter={() => setHover(s.emd)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/map?q=${encodeURIComponent(s.emd)}`)}
              >
                <title>
                  {s.gu} {s.emd} — {LEVEL_META[s.level].label}
                </title>
              </path>
            ))}

          {/* 영향 동 라벨 */}
          {scene.affected.map((s) => (
            <text
              key={"t" + s.emd}
              x={s.cx}
              y={s.cy}
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="#1f2937"
            >
              {s.emd}
            </text>
          ))}

          {/* 배출원 */}
          <circle cx={scene.src.x} cy={scene.src.y} r="6" fill="#fff" stroke="#0e7490" strokeWidth="3" />
          <text x={scene.src.x + 10} y={scene.src.y + 4} fontSize="12" fill="#0e7490" fontWeight="600">
            시범 배출원
          </text>
        </svg>

        {/* 범례 */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-white/90 px-3 py-2 text-xs backdrop-blur">
          {(Object.keys(FILL) as AlertLevel[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[3px] border border-black/10"
                style={{ background: FILL[l] }}
              />
              {LEVEL_META[l].label}
            </span>
          ))}
        </div>
        <p className="absolute right-3 top-3 rounded-md bg-white/90 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
          동 클릭 시 확산 관제로 이동 · 시뮬레이션
        </p>
      </div>
    </div>
  );
}
