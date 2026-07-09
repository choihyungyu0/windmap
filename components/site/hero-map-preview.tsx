"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { renderPlumeCanvas } from "@/components/map/plume-render";
import { concentrationAt } from "@/lib/plume";
import { lngLatToOffset } from "@/lib/geo";
import { defaultScenario, gradeOf, receptors, source } from "@/lib/mock";

/**
 * 히어로 우측 제품 프리뷰 — 관제 화면(다크)의 축소판.
 * 구도: 시점을 플룸 진행 방향(남동)으로 당겨 배출원을 좌상단 1/3에 두고
 * 플룸이 카드를 대각선으로 가로지르게. 배경에 청주 행정동 경계선을 희미하게
 * 깔아 "지도"로 읽히게 한다. 클릭 → /map.
 */

// 뷰 중심(배출원 기준 m) — 플룸(북서풍→남동진) 진행 방향으로 오프셋
const CX = 1000;
const CY = -900;
const HALF = 2400; // 줌인 (관제 화면은 3000)

const LEVEL_HEX: Record<string, string> = {
  good: "#0d9488",
  watch: "#d97706",
  warn: "#ea580c",
  severe: "#dc2626",
};

type EmdGeo = {
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
};

export function HeroMapPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let started = false;
    let cancelled = false;

    const start = () => {
      if (started || !canvas.clientWidth) return; // 숨김(모바일) 상태면 대기
      started = true;
      fetch("/data/cheongju_emd.geojson")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((geo: EmdGeo | null) => {
          if (!cancelled) init(geo);
        });
    };

    const init = (geo: EmdGeo | null) => {
      const ctx = canvas.getContext("2d")!;
      const W = (canvas.width = canvas.clientWidth * 2); // 레티나
      const H = (canvas.height = canvas.clientHeight * 2);
      const params = { ...defaultScenario, h: source.stackHeight };
      const px = (ex: number) => ((ex - CX + HALF) / (2 * HALF)) * W;
      const py = (ny: number) => ((CY - ny + HALF) / (2 * HALF)) * H;

      const drawScene = () => {
        ctx.fillStyle = "#081420";
        ctx.fillRect(0, 0, W, H);

        // 행정동 경계선 — 희미하게 (지도 질감)
        if (geo) {
          ctx.strokeStyle = "rgba(125,180,220,0.16)";
          ctx.lineWidth = 1.5;
          for (const f of geo.features) {
            const polys =
              f.geometry.type === "MultiPolygon"
                ? (f.geometry.coordinates as number[][][][])
                : [f.geometry.coordinates as number[][][]];
            for (const poly of polys) {
              const ring = poly[0];
              ctx.beginPath();
              for (let i = 0; i < ring.length; i++) {
                const [ex, ny] = lngLatToOffset(ring[i][0], ring[i][1]);
                if (i === 0) ctx.moveTo(px(ex), py(ny));
                else ctx.lineTo(px(ex), py(ny));
              }
              ctx.stroke();
            }
          }
        }

        // 플룸 — 배출원 중심 래스터. 뷰가 오프셋돼 있으므로 뷰 전체를 덮도록
        // 래스터 범위를 확장해 가장자리 잘림을 방지.
        const RH = HALF + Math.max(Math.abs(CX), Math.abs(CY));
        const plume = renderPlumeCanvas(params, 160, RH);
        ctx.drawImage(plume, px(-RH), py(RH), (RH / HALF) * W, (RH / HALF) * H);

        // 배출원 마커 (좌상단 1/3 지점에 놓임)
        ctx.beginPath();
        ctx.arc(px(0), py(0), 8, 0, Math.PI * 2);
        ctx.fillStyle = "#081420";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#00b8d4";
        ctx.stroke();

        // 취약시설 (등급색)
        for (const r of receptors) {
          const x = px(r.ex), y = py(r.ny);
          if (x < 0 || x > W || y < 0 || y > H) continue;
          ctx.fillStyle = LEVEL_HEX[gradeOf(concentrationAt(r.ex, r.ny, params))];
          ctx.strokeStyle = "rgba(255,255,255,0.65)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(x - 6, y - 6, 12, 12);
          ctx.fill();
          ctx.stroke();
        }
      };
      drawScene();

      // 바람 파티클 (은은하게)
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const parts = Array.from({ length: 55 }, () => ({
        x: Math.random() * W, y: Math.random() * H, life: Math.random() * 100,
      }));
      const dir = (((params.wd + 180) % 360) * Math.PI) / 180;
      const vx = Math.sin(dir) * 60, vy = -Math.cos(dir) * 60;
      let last = performance.now();
      const scene = document.createElement("canvas");
      scene.width = W;
      scene.height = H;
      scene.getContext("2d")!.drawImage(canvas, 0, 0);
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        ctx.globalAlpha = 0.16;
        ctx.drawImage(scene, 0, 0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,184,212,0.55)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        for (const p of parts) {
          const nx = p.x + vx * dt, ny = p.y + vy * dt;
          p.life -= dt * 60;
          if (nx < 0 || nx > W || ny < 0 || ny > H || p.life <= 0) {
            p.x = Math.random() * W;
            p.y = Math.random() * H;
            p.life = 50 + Math.random() * 100;
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
    };

    start();
    if (!started) {
      ro = new ResizeObserver(start);
      ro.observe(canvas);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return (
    <Link
      href="/map"
      aria-label="확산 관제 지도 열기"
      className="group block overflow-hidden rounded-2xl border border-[#1c3850] bg-[#0b1b2b] shadow-[0_30px_80px_-30px_rgba(11,27,43,0.55)] transition-transform duration-300 hover:-translate-y-1"
    >
      {/* 상단 스트립 */}
      <div className="flex items-center gap-2 border-b border-[#1c3850] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-[#00b8d4]" />
        <span className="text-xs font-medium text-[#d7e5f0]">확산 관제</span>
        <span className="font-data text-[10px] text-[#7c93a8]">LIVE 시뮬레이션</span>
        <span className="ml-auto text-[10px] text-[#7c93a8]">청주 · 북서풍 315°</span>
      </div>

      <div className="relative aspect-[4/3.4]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="absolute bottom-3 left-3 rounded-md bg-[#0b1b2b]/85 px-2.5 py-1.5 text-[10px] text-[#7c93a8] backdrop-blur">
          가우시안 플룸 실시간 계산 · 시뮬레이션
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-[#00b8d4] px-3.5 py-1.5 text-xs font-semibold text-[#04141f] transition-transform duration-300 group-hover:translate-x-0.5">
          라이브 관제 열기 →
        </div>
      </div>
    </Link>
  );
}
