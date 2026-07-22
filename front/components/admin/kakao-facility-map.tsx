"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 관제 대시보드 시설 위치 지도 (카카오맵 JS SDK).
 *
 * 배출원 + 취약시설을 등급색 오버레이로 표시하고 2/4km 거리 링을 그린다.
 * 키는 NEXT_PUBLIC_KAKAO_MAP_API_KEY (JavaScript 키 — 카카오 개발자 콘솔에
 * localhost:3000 및 배포 도메인 등록 필요).
 */

type Facility = {
  id: string;
  name: string;
  type: string;
  lng: number;
  lat: number;
  level: "good" | "watch" | "warn" | "severe";
  conc: number;
};

interface KakaoFacilityMapProps {
  /** 단일 기준 배출원(있으면 거리 링 표시) — 전역 모드에선 생략 */
  source?: { lng: number; lat: number; name: string };
  facilities: Facility[];
  /** 시설 칩 부가 수치 단위 (기본 ㎍) */
  metricUnit?: string;
  className?: string;
}

const LEVEL_HEX: Record<Facility["level"], string> = {
  good: "#0d9488",
  watch: "#d97706",
  warn: "#ea580c",
  severe: "#dc2626",
};

declare global {
  interface Window {
    // 카카오맵 SDK 전역 — 공식 타입 패키지 없이 최소한으로만 선언
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao?: any;
  }
}

let sdkPromise: Promise<void> | null = null;

function loadKakaoSdk(appkey: string): Promise<void> {
  if (window.kakao?.maps?.Map) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false`;
      script.async = true;
      script.onload = () => window.kakao.maps.load(() => resolve());
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Kakao Maps SDK load failed"));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

function overlayHtml(color: string, name: string, sub?: string) {
  return (
    `<div style="display:flex;align-items:center;gap:5px;transform:translateY(-4px);` +
    `background:rgba(8,20,32,.85);border:1px solid ${color};border-radius:9999px;` +
    `padding:2px 9px 2px 6px;color:#e2eef7;font-size:11px;line-height:1.6;white-space:nowrap;">` +
    `<span style="width:8px;height:8px;border-radius:9999px;background:${color};flex-shrink:0;"></span>` +
    `<span>${name}</span>` +
    (sub ? `<span style="color:#8fa8bb;">${sub}</span>` : "") +
    `</div>`
  );
}

export function KakaoFacilityMap({
  source,
  facilities,
  metricUnit = "㎍",
  className,
}: KakaoFacilityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY?.trim();
    if (!appkey) {
      setError("NEXT_PUBLIC_KAKAO_MAP_API_KEY 가 설정되지 않았습니다.");
      return;
    }
    let cancelled = false;
    const container = containerRef.current;
    const center = source ?? facilities[0];

    loadKakaoSdk(appkey)
      .then(() => {
        if (cancelled || !container || !center) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 8,
        });

        const bounds = new kakao.maps.LatLngBounds();

        if (source) {
          // 거리 링 (2km · 4km) — 단일 배출원 기준일 때만
          for (const radius of [2000, 4000]) {
            new kakao.maps.Circle({
              map,
              center: new kakao.maps.LatLng(source.lat, source.lng),
              radius,
              strokeWeight: 1.2,
              strokeColor: "#7db4dc",
              strokeOpacity: 0.55,
              strokeStyle: "shortdash",
              fillOpacity: 0,
            });
          }
          new kakao.maps.CustomOverlay({
            map,
            position: new kakao.maps.LatLng(source.lat, source.lng),
            content: overlayHtml("#00b8d4", source.name),
            yAnchor: 1.15,
          });
          bounds.extend(new kakao.maps.LatLng(source.lat, source.lng));
        }

        // 시설 — 등급색 칩
        for (const f of facilities) {
          const pos = new kakao.maps.LatLng(f.lat, f.lng);
          bounds.extend(pos);
          new kakao.maps.CustomOverlay({
            map,
            position: pos,
            content: overlayHtml(
              LEVEL_HEX[f.level],
              f.name,
              f.conc >= 0.01 ? `${f.conc.toFixed(1)}${metricUnit}` : undefined
            ),
            yAnchor: 1.15,
          });
        }
        map.setBounds(bounds, 36, 36, 36, 36);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "카카오맵을 불러오지 못했습니다 — JavaScript 키와 사이트 도메인(localhost:3000) 등록을 확인하세요."
          );
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [source, facilities, metricUnit]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-control-line bg-control-bg/50 p-6 text-center text-xs leading-relaxed text-control-muted ${className ?? ""}`}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-md ${className ?? ""}`}
      role="img"
      aria-label="배출원·취약시설 위치 지도 (카카오맵)"
    />
  );
}
