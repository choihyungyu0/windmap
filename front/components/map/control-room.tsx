"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogoDark } from "@/components/site/logo";
import { MapGuide } from "@/components/map/map-guide";
import type { MapHover } from "./plume-map";
import { forwardTrajectory } from "@/lib/trajectory";
import {
  buildDispersionPoints,
  facilityMarkers,
  loadChungbuk,
  POLLUTANTS,
  POLLUTANT_ORDER,
  stationMarkers,
  windArrows,
  type ChungbukSnapshot,
  type PollutantKey,
} from "@/lib/chungbuk";

// MapLibre는 브라우저 전용 — SSR 제외
const PlumeMap = dynamic(() => import("./plume-map").then((m) => m.PlumeMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-control-muted">
      지도 불러오는 중…
    </div>
  ),
});

const SPEEDS = [1, 2, 4] as const;

/* ── 메인 관제 화면 ── */
export function ControlRoom({
  query,
  initialT,
  initialSel,
}: {
  query?: string;
  /** 딥링크 ?t= — 시각 인덱스 */
  initialT?: number;
  /** 딥링크 ?sel= — 예측 이동 경로를 그릴 굴뚝명 */
  initialSel?: string;
}) {
  const [snap, setSnap] = useState<ChungbukSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pol, setPol] = useState<PollutantKey>("NOx");
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [layers, setLayers] = useState({
    dispersion: true,
    facilities: true,
    stations: true,
    wind: true,
    trajectory: true,
  });
  const [hover, setHover] = useState<MapHover | null>(null);
  /** 클릭으로 고른 굴뚝 — 예측 이동 경로의 출발점 */
  const [selected, setSelected] = useState<{ name: string; city: string } | null>(null);
  const [tilesError, setTilesError] = useState(false);
  const [clock, setClock] = useState<string | null>(null);

  // 실데이터 스냅샷 로드 (public/data/chungbuk.json — 모듈 캐시)
  useEffect(() => {
    let alive = true;
    loadChungbuk()
      .then((s) => {
        if (!alive) return;
        // 검색어가 시군명과 매칭되면 그 시군만, 아니면 전체
        const matched = query
          ? s.cities.filter((c) => c.includes(query.trim()) || query.includes(c))
          : [];
        setSelectedCities(new Set(matched.length ? matched : s.cities));
        // 딥링크로 시각·굴뚝이 지정되면 그 장면으로, 아니면 최신 시각부터
        const tInit =
          initialT != null && initialT >= 0 && initialT < s.n
            ? Math.floor(initialT)
            : s.n - 1;
        setT(tInit);
        const pre = initialSel ? s.facilities.find((f) => f.name === initialSel) : undefined;
        if (pre) setSelected({ name: pre.name, city: pre.city });
        setSnap(s);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [query, initialT, initialSel]);

  // 재생 — 700/speed ms 스텝, 마지막에서 처음으로 순환
  useEffect(() => {
    if (!playing || !snap) return;
    const id = setInterval(
      () => setT((c) => (c + 1) % snap.n),
      Math.round(700 / speed)
    );
    return () => clearInterval(id);
  }, [playing, speed, snap]);

  useEffect(() => {
    const tick = () => setClock(new Date().toTimeString().slice(0, 8));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const cityKey = useMemo(
    () => [...selectedCities].sort().join(","),
    [selectedCities]
  );
  const frameKey = `${pol}|${t}|${cityKey}`;

  const points = useMemo(
    () => (snap ? buildDispersionPoints(snap, pol, t, selectedCities) : []),
    [snap, pol, t, cityKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const facilities = useMemo(
    () => (snap ? facilityMarkers(snap, pol, t, selectedCities) : []),
    [snap, pol, t, cityKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const stations = useMemo(
    () => (snap ? stationMarkers(snap, pol, t, selectedCities) : []),
    [snap, pol, t, cityKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const arrows = useMemo(
    () => (snap ? windArrows(snap, t, selectedCities) : []),
    [snap, t, cityKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 선택 굴뚝의 전진 궤적 — 현재 시각 방출 기준 +6h. 재생 중이면 시각을 따라 다시 그려진다.
  const selectedFacility = useMemo(
    () =>
      snap && selected
        ? (snap.facilities.find(
            (f) => f.name === selected.name && f.city === selected.city
          ) ?? null)
        : null,
    [snap, selected]
  );
  const trajectory = useMemo(
    () =>
      snap && selectedFacility && layers.trajectory
        ? forwardTrajectory(snap, selectedFacility, t, 6)
        : null,
    [snap, selectedFacility, t, layers.trajectory]
  );

  // 선택이 바뀔 때 경로 전체가 보이도록 지도 이동 — key 는 굴뚝 기준이라 재생 중엔 그대로
  const focus = useMemo(() => {
    if (!trajectory || !selectedFacility) return null;
    const pts = [trajectory.origin, ...trajectory.nodes.map((n) => n.position)];
    const lngs = pts.map((q) => q[0]);
    const lats = pts.map((q) => q[1]);
    return {
      key: `${selectedFacility.name}|${selectedFacility.city}`,
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ] as [[number, number], [number, number]],
    };
  }, [trajectory, selectedFacility]);

  // 상위 배출 시설 (현재 시각) — 우측 패널
  const topEmitters = useMemo(
    () => [...facilities].filter((f) => f.E > 0).sort((a, b) => b.E - a.E).slice(0, 8),
    [facilities]
  );
  const emitMax = topEmitters[0]?.E ?? 1;

  const cfg = POLLUTANTS[pol];
  const measUnit = pol === "PM10" || pol === "PM25" ? " µg/m³" : "";

  // 굴뚝 클릭 → 선택/해제, 빈 곳 클릭 → 해제
  function onMapClick(h: MapHover | null) {
    if (!h || h.kind !== "facility") {
      setSelected(null);
      return;
    }
    setSelected((prev) =>
      prev && prev.name === h.name && prev.city === h.city
        ? null
        : { name: h.name, city: h.city }
    );
  }
  function toggleCity(c: string) {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function toggleAllCities() {
    if (!snap) return;
    setSelectedCities((prev) =>
      prev.size === snap.cities.length ? new Set() : new Set(snap.cities)
    );
  }

  return (
    <div className="min-h-screen bg-control-bg text-control-text">
      {/* ── 상단 상태바 ── */}
      <header className="flex items-center gap-4 border-b border-control-line px-4 py-3 lg:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-control-text transition-opacity hover:opacity-80"
        >
          <LogoDark />
        </Link>
        <span className="hidden h-4 w-px bg-control-line sm:block" />
        <h1 className="hidden text-sm font-medium text-control-muted sm:block">
          충북 확산 관제 <span className="font-data">MAP</span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          {query && (
            <span className="hidden max-w-[16rem] truncate rounded-full border border-wind/40 bg-wind/10 px-3 py-1 text-xs text-wind md:block">
              검색: {query}
            </span>
          )}
          <MapGuide />
          <span className="hidden rounded-full border border-control-line px-3 py-1 text-xs text-control-muted sm:block">
            충북 실배출 · 근사 확산
          </span>
          <span
            className="font-data hidden text-sm text-control-muted sm:block"
            suppressHydrationWarning
          >
            {clock ?? "--:--:--"}
          </span>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:gap-5 lg:p-6">
        {/* ── 좌: 조작 패널 ── */}
        <section
          aria-label="확산 조건 조작"
          className="flex flex-col gap-6 rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          {/* 물질 선택 */}
          <div>
            <h2 className="kicker text-control-muted">대상 물질</h2>
            <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-md border border-control-line p-1">
              {POLLUTANT_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPol(key)}
                  aria-pressed={pol === key}
                  className={
                    "rounded px-1.5 py-1.5 text-xs font-medium transition-colors " +
                    (pol === key
                      ? "bg-wind/20 text-control-text"
                      : "text-control-muted hover:text-control-text")
                  }
                >
                  {POLLUTANTS[key].label}
                </button>
              ))}
            </div>
            {cfg.note && (
              <p className="mt-2.5 rounded-md border border-alert-watch/40 bg-alert-watch/5 px-2.5 py-2 text-[11px] leading-relaxed text-alert-watch">
                {cfg.note}
              </p>
            )}
          </div>

          {/* 시간 */}
          <div className="border-t border-control-line pt-4">
            <div className="flex items-baseline justify-between">
              <h2 className="kicker text-control-muted">시각</h2>
              <span className="font-data text-sm text-control-text">
                {snap ? snap.times[t] : "—"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPlaying((v) => !v)}
                disabled={!snap}
                aria-label={playing ? "일시정지" : "재생"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-wind/50 text-wind transition-colors hover:bg-wind/10 disabled:opacity-40"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <label className="flex-1">
                <span className="sr-only">시각 슬라이더</span>
                <input
                  type="range"
                  min={0}
                  max={snap ? snap.n - 1 : 0}
                  step={1}
                  value={t}
                  disabled={!snap}
                  onChange={(e) => {
                    setPlaying(false);
                    setT(Number(e.target.value));
                  }}
                  className="w-full accent-[var(--wind)]"
                />
              </label>
              <select
                value={speed}
                onChange={(e) =>
                  setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])
                }
                aria-label="재생 배속"
                className="rounded-md border border-control-line bg-control-bg px-1.5 py-1 text-xs text-control-text"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 시군 필터 */}
          <div className="border-t border-control-line pt-4">
            <div className="flex items-center justify-between">
              <h2 className="kicker text-control-muted">시군</h2>
              <button
                type="button"
                onClick={toggleAllCities}
                className="text-[11px] text-wind hover:underline"
              >
                {snap && selectedCities.size === snap.cities.length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {(snap?.cities ?? []).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCities.has(c)}
                    onChange={() => toggleCity(c)}
                    className="size-4 accent-[var(--wind)]"
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          {/* 레이어 토글 */}
          <div
            role="group"
            aria-label="레이어 표시"
            className="border-t border-control-line pt-4"
          >
            <h2 className="kicker text-control-muted">레이어</h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {(
                [
                  ["dispersion", "확산 (근사)"],
                  ["facilities", "배출 굴뚝"],
                  ["stations", "대기측정소"],
                  ["wind", "시군 바람"],
                  ["trajectory", "예측 이동 경로"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                    className="size-4 accent-[var(--wind)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* 데이터셋 요약 */}
          <dl className="space-y-1.5 border-t border-control-line pt-4 text-xs text-control-muted">
            <div className="flex justify-between">
              <dt>기간</dt>
              <dd className="font-data text-control-text">
                {snap ? `${snap.times[0]} ~ ${snap.times[snap.n - 1]}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>배출 굴뚝 · 측정소</dt>
              <dd className="font-data text-control-text">
                {snap ? `${snap.facilities.length} · ${snap.stations.length}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>시군</dt>
              <dd className="font-data text-control-text">
                {snap ? `${snap.cities.length}개` : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── 중앙: 확산 지도 ── */}
        <section aria-label="확산 지도" className="relative">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-control-line bg-[#081420]">
            {snap && !loadError ? (
              <PlumeMap
                points={points}
                facilities={facilities}
                stations={stations}
                arrows={arrows}
                domain={snap.domain}
                layers={layers}
                frameKey={frameKey}
                trajectory={trajectory}
                focus={focus}
                onHover={setHover}
                onClick={onMapClick}
                onTileError={() => setTilesError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-control-muted">
                {loadError
                  ? "실데이터를 불러오지 못했습니다 — chungbuk.json 확인"
                  : "실데이터 불러오는 중…"}
              </div>
            )}

            {/* 배경지도 로드 실패 안내 */}
            {tilesError && (
              <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-alert-watch/50 bg-control-bg/90 px-4 py-1.5 text-xs text-alert-watch backdrop-blur">
                배경지도 타일을 불러오지 못했습니다 — 네트워크 확인 (확산 표시는 정상)
              </div>
            )}

            {/* 예측 이동 경로 패널 — 선택 굴뚝의 +1h…+6h 위치 */}
            {layers.trajectory && trajectory && selectedFacility && (
              <div className="absolute bottom-9 right-3 z-10 w-[20rem] rounded-md border border-wind/40 bg-control-bg/95 px-3 py-2.5 text-xs backdrop-blur">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="kicker text-wind">예측 이동 경로</div>
                    <div
                      className="mt-0.5 truncate font-medium text-control-text"
                      title={selectedFacility.name}
                    >
                      {selectedFacility.name}
                    </div>
                    <div className="text-control-muted">
                      {selectedFacility.city} · {snap?.times[t]} 방출 기준
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="경로 닫기"
                    className="-mr-1 -mt-1 rounded px-1.5 text-base leading-none text-control-muted hover:text-control-text"
                  >
                    ×
                  </button>
                </div>
                <ol className="font-data mt-2 space-y-1">
                  {trajectory.nodes.map((n) => (
                    <li key={n.hour} className="flex items-center gap-2 whitespace-nowrap">
                      <span className="w-7 text-wind">+{n.hour}h</span>
                      <span className="w-[4.4rem] text-control-muted">{n.timeLabel}</span>
                      <span className="w-14 text-right text-control-text">
                        {n.distKm.toFixed(1)} km
                      </span>
                      <span className="flex-1 truncate text-right text-control-muted">
                        {n.city} {n.ws.toFixed(1)} m/s
                      </span>
                    </li>
                  ))}
                </ol>
                {trajectory.nodes.some((n) => n.assumed) && (
                  <p className="mt-1.5 text-[10px] text-alert-watch">
                    ※ 데이터 마지막 시각 이후는 마지막 바람 유지 가정
                  </p>
                )}
                <p className="mt-1.5 text-[10px] leading-snug text-control-muted">
                  시군 실측 바람을 시간별로 따라간 중심 이동 경로 — 확산 폭·농도가 아닙니다.
                </p>
              </div>
            )}
            {layers.trajectory && !selectedFacility && snap && !loadError && (
              <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-control-line bg-control-bg/85 px-3 py-1.5 text-[11px] text-control-muted backdrop-blur">
                굴뚝을 클릭하면 시간별 예측 이동 경로를 표시합니다
              </div>
            )}

            {/* 호버 상세 툴팁 */}
            {hover && (
              <div
                className="pointer-events-none absolute z-10 max-w-[15rem] rounded-md border border-control-line bg-control-bg/95 px-3 py-2 text-xs backdrop-blur"
                style={{
                  left: Math.min(hover.x + 12, 320),
                  top: Math.max(hover.y - 8, 8),
                }}
              >
                <div className="font-medium text-control-text">{hover.name}</div>
                <div className="mt-0.5 text-control-muted">
                  {hover.city} ·{" "}
                  {hover.kind === "facility" ? (
                    <>
                      {cfg.label} 배출{" "}
                      <span className="font-data text-control-text">
                        {hover.value != null ? hover.value.toFixed(2) : "0"} g/s
                      </span>
                    </>
                  ) : hover.value != null ? (
                    <>
                      {cfg.meas ? `${cfg.label} 측정 ` : "측정 "}
                      <span className="font-data text-control-text">
                        {hover.value}
                        {measUnit}
                      </span>
                    </>
                  ) : (
                    "측정값 없음"
                  )}
                </div>
              </div>
            )}

            {/* 범례 — 상대 영향 강도(근사), 절대 농도 아님 */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-control-line bg-control-bg/85 px-3 py-2 backdrop-blur">
              <div
                className="h-1.5 w-44 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0,184,212,.35), rgba(0,184,212,.9) 20%, #d97706 55%, #ea580c 78%, #dc2626)",
                }}
              />
              <div className="font-data mt-1 flex w-44 justify-between text-[9px] text-control-muted">
                <span>낮음</span>
                <span>상대 영향 강도 (근사)</span>
                <span>높음</span>
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-control-muted">
            충북 전역 {snap?.facilities.length ?? "—"}개 굴뚝의 실시간 배출량(CleanSYS
            TMS)과 시군별 실측 바람(ASOS)으로 그린 <strong>근사 확산 풋프린트</strong>{" "}
            — 풍향·풍속·배출량 기반이며 검증된 물리 모델이 아닙니다. 색은 절대
            농도(μg/m³)가 아닌 상대 영향 강도입니다. 측정소 색은 에어코리아 실측값.
            예측 이동 경로는 시군 실측 바람을 시간별로 따라간 전진 궤적(중심선)이며
            확산 폭·농도가 아닙니다. 배경지도 © CARTO / OpenStreetMap. 배출 영향 범위 추정이며 특정 시설을
            오염 피해의 인과로 지목하지 않습니다.
          </p>
        </section>

        {/* ── 우: 상위 배출 시설 (현재 시각) ── */}
        <section
          aria-label="상위 배출 시설"
          className="flex flex-col rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          <h2 className="kicker text-control-muted">
            상위 배출 시설 · {cfg.label}
          </h2>
          <p className="mt-1 text-xs text-control-muted">
            {snap ? snap.times[t] : "—"} 기준 · 선택 시군 · 클릭하면 예측 이동 경로
          </p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {topEmitters.length === 0 && (
              <li className="text-sm text-control-muted">
                이 시각·물질·시군에서 배출 신호가 없습니다.
              </li>
            )}
            {topEmitters.map((f) => {
              const isSel = selected?.name === f.name && selected?.city === f.city;
              const pick = () =>
                setSelected(isSel ? null : { name: f.name, city: f.city });
              return (
              <li
                key={f.name}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                onClick={pick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick();
                  }
                }}
                className={
                  "cursor-pointer rounded-md border px-3.5 py-2.5 transition-colors " +
                  (isSel
                    ? "border-wind/60 bg-wind/10"
                    : "border-control-line bg-control-bg/50 hover:border-wind/40")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium" title={f.name}>
                    {f.name}
                  </span>
                  <span className="font-data shrink-0 text-sm text-control-text">
                    {f.E.toFixed(2)}
                    <span className="ml-1 text-[10px] text-control-muted">g/s</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-control-muted">{f.city}</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-control-line/60">
                    <span
                      className="block h-full rounded-full bg-[var(--alert-warn)]"
                      style={{ width: `${Math.max(6, (f.E / emitMax) * 100)}%` }}
                    />
                  </span>
                </div>
              </li>
              );
            })}
          </ul>
          <Link
            href="/alerts"
            className="mt-auto pt-4 text-sm text-wind underline-offset-4 hover:underline"
          >
            취약시설 경보 화면 →
          </Link>
        </section>
      </div>
    </div>
  );
}
