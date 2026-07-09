"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LogoMark } from "@/components/site/logo";
import { MapGuide } from "@/components/map/map-guide";
import {
  renderPlumeCanvas,
  renderPuffCanvas,
} from "@/components/map/plume-render";
import { concentrationAt, type Stability } from "@/lib/plume";
import { arrivalSeconds, puffConcentrationAt } from "@/lib/puff";
import { offsetToLngLat } from "@/lib/geo";
import {
  defaultScenario,
  gradeOf,
  LEVEL_META,
  receptors,
  source,
  type AlertLevel,
} from "@/lib/mock";

// MapLibre는 브라우저 전용 — SSR 제외
const PlumeMap = dynamic(
  () => import("./plume-map").then((m) => m.PlumeMap),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-control-muted">
        지도 불러오는 중…
      </div>
    ),
  }
);

/* ── 상수 ── */
const GRID = 160; // 플룸 래스터 격자 (한 변)
const HALF_EXTENT = 3000; // 배출원~가장자리 거리(m) → 래스터 한 변 6km
const STABILITY_LABEL: Record<Stability, string> = {
  A: "A · 매우 불안정",
  B: "B · 불안정",
  C: "C · 약간 불안정",
  D: "D · 중립",
  E: "E · 약간 안정",
  F: "F · 매우 안정",
};
const LEVEL_COLOR: Record<AlertLevel, string> = {
  good: "var(--alert-good)",
  watch: "var(--alert-watch)",
  warn: "var(--alert-warn)",
  severe: "var(--alert-severe)",
};

/** 풍향(도) → 8방위 한글 */
function windName(wd: number): string {
  const names = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return names[Math.round(((wd % 360) + 360) % 360 / 45) % 8] + "풍";
}

/* ── 풍향 다이얼 (드래그 + 키보드 접근) ── */
function WindDial({ wd, onChange }: { wd: number; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const angleFromEvent = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // 북=0°, 시계방향
    return Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
  }, []);

  return (
    <div>
      <svg
        ref={ref}
        viewBox="0 0 120 120"
        className="mx-auto block h-36 w-36 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const a = angleFromEvent(e);
          if (a !== null) onChange(a);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const a = angleFromEvent(e);
          if (a !== null) onChange(a);
        }}
        onPointerUp={() => (dragging.current = false)}
        aria-hidden
      >
        <circle cx="60" cy="60" r="52" fill="var(--control-surface)" stroke="var(--control-line)" />
        {/* 좌표는 소수 2자리로 고정 — SSR/클라이언트 부동소수점 차이로 인한
            hydration 불일치 방지 */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const long = i % 6 === 0;
          const r1 = long ? 43 : 47;
          const f = (v: number) => Number(v.toFixed(2));
          return (
            <line
              key={i}
              x1={f(60 + r1 * Math.sin(a))}
              y1={f(60 - r1 * Math.cos(a))}
              x2={f(60 + 52 * Math.sin(a))}
              y2={f(60 - 52 * Math.cos(a))}
              stroke={long ? "var(--control-muted)" : "var(--control-line)"}
              strokeWidth={long ? 1.5 : 1}
            />
          );
        })}
        {["N", "E", "S", "W"].map((t, i) => {
          const a = (i * 90 * Math.PI) / 180;
          const f = (v: number) => Number(v.toFixed(2));
          return (
            <text
              key={t}
              x={f(60 + 34 * Math.sin(a))}
              y={f(60 - 34 * Math.cos(a) + 3.5)}
              textAnchor="middle"
              fontSize="9"
              fill="var(--control-muted)"
            >
              {t}
            </text>
          );
        })}
        {/* 바늘 — 불어오는 방향에서 중심으로 (기상 관례) */}
        <g transform={`rotate(${wd} 60 60)`}>
          <line x1="60" y1="14" x2="60" y2="60" stroke="var(--wind)" strokeWidth="2.5" strokeLinecap="round" />
          <polygon points="60,8 55,18 65,18" fill="var(--wind)" />
        </g>
        <circle cx="60" cy="60" r="4" fill="var(--wind)" />
      </svg>
      <label className="mt-2 block">
        <span className="sr-only">풍향 (도)</span>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={wd}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[var(--wind)]"
        />
      </label>
      <p className="mt-1 text-center text-sm">
        <span className="font-data text-lg text-control-text">{wd}°</span>{" "}
        <span className="text-control-muted">{windName(wd)}</span>
      </p>
    </div>
  );
}

/* ── 슬라이더 행 ── */
function SliderRow({
  label, unit, min, max, step, value, onChange,
}: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="text-control-muted">{label}</span>
        <span className="font-data text-control-text">
          {value}
          <span className="ml-0.5 text-xs text-control-muted">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--wind)]"
      />
    </label>
  );
}

/* ── 메인 관제 화면 ── */
export function ControlRoom({ query }: { query?: string }) {
  const [q, setQ] = useState(defaultScenario.q);
  const [u, setU] = useState(defaultScenario.u);
  const [wd, setWd] = useState(defaultScenario.wd);
  const [stability, setStability] = useState<Stability>(defaultScenario.stability);
  const [clock, setClock] = useState<string | null>(null);
  // F-MAP-04 레이어 토글 / F-MAP-03 수용지점 상세
  const [layers, setLayers] = useState({ plume: true, facilities: true, rings: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tilesError, setTilesError] = useState(false);
  // B1a 정상상태 / B1b 시간 전파 (F-DSP-01/02 · F-MAP-01 시간슬라이더)
  const [mode, setMode] = useState<"plume" | "puff">("plume");
  const [tMin, setTMin] = useState(15); // 방출 후 경과(분)
  const [playing, setPlaying] = useState(false);

  // 재생 — 0.5분/100ms 스텝, 60분 도달 시 정지
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setTMin((cur) => {
        if (cur >= 60) {
          setPlaying(false);
          return 60;
        }
        return Math.min(60, Math.round((cur + 0.5) * 2) / 2);
      });
    }, 100);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => {
    const tick = () => setClock(new Date().toTimeString().slice(0, 8));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const params = useMemo(
    () => ({ q, u, wd, stability, h: source.stackHeight }),
    [q, u, wd, stability]
  );

  // 농도장 래스터 — 입력 변경 즉시 재계산 (F-MAP-02), 지도에 BitmapLayer로 오버레이
  const plumeCanvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    return mode === "puff"
      ? renderPuffCanvas(params, GRID, HALF_EXTENT, tMin * 60)
      : renderPlumeCanvas(params, GRID, HALF_EXTENT);
  }, [params, mode, tMin]);

  // 수용지점별 도달 농도·도달시각 (라이브) + 경위도
  // 퍼프 모드: T+tMin 시점 농도, 도달시각은 퍼프 중심 통과(정식 산출물)
  const readings = useMemo(() => {
    const bearing = ((params.wd + 180) % 360) * (Math.PI / 180);
    return receptors
      .map((r) => {
        const conc =
          mode === "puff"
            ? puffConcentrationAt(r.ex, r.ny, params, tMin * 60)
            : concentrationAt(r.ex, r.ny, params);
        const downwind = r.ex * Math.sin(bearing) + r.ny * Math.cos(bearing);
        const arrival = arrivalSeconds(downwind, params.u);
        const etaMin = arrival === null ? null : Math.round(arrival / 60);
        const [lng, lat] = offsetToLngLat(r.ex, r.ny);
        return { ...r, conc, level: gradeOf(conc), downwind, etaMin, lng, lat };
      })
      .sort((a, b) => b.conc - a.conc);
  }, [params, mode, tMin]);

  const selected = selectedId
    ? readings.find((r) => r.id === selectedId) ?? null
    : null;

  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);
  const onTileError = useCallback(() => setTilesError(true), []);

  return (
    <div className="min-h-screen bg-control-bg text-control-text">
      {/* ── 상단 상태바 ── */}
      <header className="flex items-center gap-4 border-b border-control-line px-4 py-3 lg:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-control-text transition-opacity hover:opacity-80"
        >
          <LogoMark className="h-5 w-5 text-wind" />
          <span className="font-bold tracking-tight">바람의 지도</span>
        </Link>
        <span className="hidden h-4 w-px bg-control-line sm:block" />
        <h1 className="hidden text-sm font-medium text-control-muted sm:block">
          확산 관제 <span className="font-data">MAP</span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          {/* F-SRCH-01 검색 진입 인지 — 지오코딩 연동(P5) 전 안내 */}
          {query && (
            <span
              className="hidden max-w-[18rem] truncate rounded-full border border-wind/40 bg-wind/10 px-3 py-1 text-xs text-wind md:block"
              title={`"${query}" — 주소 정밀 조회(지오코딩)는 P5 연동 예정`}
            >
              “{query}” 주변 보기 · 정밀 조회 연동 예정
            </span>
          )}
          <MapGuide />
          <span className="hidden rounded-full border border-control-line px-3 py-1 text-xs text-control-muted sm:block">
            시범 모드 · 시뮬레이션 데이터
          </span>
          <span className="font-data hidden text-sm text-control-muted sm:block" suppressHydrationWarning>
            {clock ?? "--:--:--"}
          </span>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:gap-5 lg:p-6">
        {/* ── 좌: 조작 패널 (F-MAP-02) ── */}
        <section
          aria-label="확산 조건 조작"
          className="flex flex-col gap-6 rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          <div>
            <h2 className="kicker text-control-muted">기상 조건</h2>
            <div className="mt-4">
              <WindDial wd={wd} onChange={setWd} />
            </div>
          </div>

          <SliderRow label="풍속" unit="m/s" min={0.5} max={12} step={0.5} value={u} onChange={setU} />
          <SliderRow label="배출률" unit="g/s" min={1} max={100} step={1} value={q} onChange={setQ} />

          <label className="block">
            <span className="text-sm text-control-muted">대기안정도 (P-G)</span>
            <select
              value={stability}
              onChange={(e) => setStability(e.target.value as Stability)}
              className="mt-1.5 w-full rounded-md border border-control-line bg-control-bg px-3 py-2 text-sm text-control-text"
            >
              {(Object.keys(STABILITY_LABEL) as Stability[]).map((s) => (
                <option key={s} value={s}>
                  {STABILITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          {/* 확산 모드 — B1a 정상상태 / B1b 시간 전파 (F-DSP-01/02) */}
          <div role="group" aria-label="확산 모드" className="border-t border-control-line pt-4">
            <h2 className="kicker text-control-muted">확산 모드</h2>
            <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-md border border-control-line p-1">
              {(
                [
                  ["plume", "정상상태", "B1a"],
                  ["puff", "시간 전파", "B1b"],
                ] as const
              ).map(([key, label, tag]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                  className={
                    "rounded px-2 py-1.5 text-xs font-medium transition-colors " +
                    (mode === key
                      ? "bg-wind/20 text-control-text"
                      : "text-control-muted hover:text-control-text")
                  }
                >
                  {label} <span className="font-data opacity-60">{tag}</span>
                </button>
              ))}
            </div>

            {mode === "puff" && (
              <div className="mt-3">
                <span className="flex items-baseline justify-between text-sm">
                  <span className="text-control-muted">방출 후 경과</span>
                  <span className="font-data text-control-text">
                    T+{tMin}
                    <span className="ml-0.5 text-xs text-control-muted">분</span>
                  </span>
                </span>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playing && tMin >= 60) setTMin(0);
                      setPlaying((v) => !v);
                    }}
                    aria-label={playing ? "일시정지" : "재생"}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-wind/50 text-wind transition-colors hover:bg-wind/10"
                  >
                    {playing ? "❚❚" : "▶"}
                  </button>
                  <label className="flex-1">
                    <span className="sr-only">방출 후 경과 시간 (분)</span>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={0.5}
                      value={tMin}
                      onChange={(e) => {
                        setPlaying(false);
                        setTMin(Number(e.target.value));
                      }}
                      className="w-full accent-[var(--wind)]"
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-control-muted">
                  퍼프가 바람을 타고 퍼져나가는 과정 — 시설 도달 시각이 모델의
                  정식 산출물이 됩니다.
                </p>
              </div>
            )}
          </div>

          {/* F-MAP-04 레이어 토글 */}
          <div role="group" aria-label="레이어 표시" className="border-t border-control-line pt-4">
            <h2 className="kicker text-control-muted">레이어</h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {(
                [
                  ["plume", "플룸 (농도장)"],
                  ["facilities", "취약시설"],
                  ["rings", "거리 링"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() =>
                      setLayers((l) => ({ ...l, [key]: !l[key] }))
                    }
                    className="size-4 accent-[var(--wind)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <dl className="space-y-1.5 border-t border-control-line pt-4 text-xs text-control-muted">
            <div className="flex justify-between">
              <dt>배출원</dt>
              <dd className="text-control-text">{source.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt>유효 굴뚝고</dt>
              <dd className="font-data text-control-text">{source.stackHeight} m</dd>
            </div>
            <div className="flex justify-between">
              <dt>대상 물질</dt>
              <dd className="font-data text-control-text">{source.item}</dd>
            </div>
          </dl>
        </section>

        {/* ── 중앙: 확산 지도 (F-MAP-01 · 실지도) ── */}
        <section aria-label="확산 지도" className="relative">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-control-line bg-[#081420]">
            <PlumeMap
              plumeCanvas={plumeCanvas}
              halfExtent={HALF_EXTENT}
              readings={readings}
              selectedId={selectedId}
              onSelect={onSelect}
              layers={layers}
              onTileError={onTileError}
            />

            {/* 배경지도 로드 실패 안내 (오프라인 등) — 플룸 계산은 계속 동작 */}
            {tilesError && (
              <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-alert-watch/50 bg-control-bg/90 px-4 py-1.5 text-xs text-alert-watch backdrop-blur">
                배경지도 타일을 불러오지 못했습니다 — 네트워크 확인 (확산 계산은 정상)
              </div>
            )}

            {/* 수용지점 상세 패널 (F-MAP-03) */}
            {selected && (
              <div
                role="dialog"
                aria-label={`${selected.name} 상세`}
                className="absolute right-3 top-3 z-10 w-64 rounded-lg border border-control-line bg-control-bg/90 p-4 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{selected.name}</h3>
                    <p className="text-xs text-control-muted">{selected.type}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="상세 닫기"
                    className="text-control-muted transition-colors hover:text-control-text"
                  >
                    ✕
                  </button>
                </div>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-control-muted">
                      {mode === "puff" ? `T+${tMin}분 농도` : "예측 도달 농도"}
                    </dt>
                    <dd className="font-data">
                      {selected.conc < 0.1 ? "< 0.1" : selected.conc.toFixed(1)} μg/m³
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-control-muted">등급</dt>
                    <dd
                      className="font-semibold"
                      style={{ color: LEVEL_COLOR[selected.level] }}
                    >
                      {LEVEL_META[selected.level].symbol}{" "}
                      {LEVEL_META[selected.level].label}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-control-muted">풍하 거리</dt>
                    <dd className="font-data">
                      {selected.downwind > 0
                        ? `${(selected.downwind / 1000).toFixed(1)} km`
                        : "영향권 밖"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-control-muted">도달 예상</dt>
                    <dd className="font-data">
                      {selected.etaMin === null ? "—" : `약 ${selected.etaMin}분 후`}
                    </dd>
                  </div>
                </dl>
                {selected.level !== "good" && (
                  <p className="mt-3 border-t border-control-line pt-2.5 text-xs leading-relaxed text-control-muted">
                    {LEVEL_META[selected.level].advice}
                  </p>
                )}
                <p className="mt-2 text-[10px] text-control-muted">
                  {mode === "puff"
                    ? "좌측 슬라이더로 시점을 움직여 도달 과정을 확인하세요."
                    : "‘시간 전파’ 모드로 바꾸면 도달 과정을 시간대별로 볼 수 있습니다."}
                </p>
              </div>
            )}

            {/* 범례 */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-control-line bg-control-bg/85 px-3 py-2 backdrop-blur">
              <div
                className="h-1.5 w-44 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(0,184,212,.25), rgba(0,184,212,.9) 25%, #d97706 55%, #ea580c 78%, #dc2626)",
                }}
              />
              <div className="font-data mt-1 flex w-44 justify-between text-[9px] text-control-muted">
                <span>0</span><span>40</span><span>90</span><span>180</span><span>μg/m³</span>
              </div>
            </div>
          </div>

          <p className="mt-2 text-xs text-control-muted">
            {mode === "puff"
              ? `가우시안 퍼프(B1b) 시간 전파 — 방출 후 T+${tMin}분 시점의 농도장 · 자체 구현.`
              : "가우시안 플룸(B1a) 정상상태 실시간 계산."}{" "}
            배경지도 © CARTO / OpenStreetMap. 수치는 시뮬레이션이며 실측이
            아닙니다. 배출원·시설 위치는 데모용 예시 좌표로, 실존 특정 시설을
            지칭하지 않습니다.
          </p>
        </section>

        {/* ── 우: 수용지점 도달 현황 (F-ALT-01 미리보기) ── */}
        <section
          aria-label="수용지점 도달 현황"
          className="flex flex-col rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          <h2 className="kicker text-control-muted">취약시설 도달 현황</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {readings.map((r) => {
              const meta = LEVEL_META[r.level];
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedId((cur) => (cur === r.id ? null : r.id))
                    }
                    aria-pressed={selectedId === r.id}
                    className={
                      "w-full rounded-md border bg-control-bg/50 px-3.5 py-3 text-left transition-colors " +
                      (selectedId === r.id
                        ? "border-wind/60"
                        : "border-control-line hover:border-wind/30")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <span
                        className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ background: LEVEL_COLOR[r.level] }}
                      >
                        <span aria-hidden>{meta.symbol}</span>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="text-xs text-control-muted">{r.type}</span>
                      <span className="font-data text-sm">
                        {r.conc < 0.1 ? "< 0.1" : r.conc.toFixed(1)}
                        <span className="ml-1 text-[10px] text-control-muted">μg/m³</span>
                      </span>
                    </div>
                    {r.level !== "good" && (
                      <p className="mt-1.5 text-xs leading-relaxed text-control-muted">
                        {meta.advice}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/alerts"
            className="mt-auto pt-4 text-sm text-wind underline-offset-4 hover:underline"
          >
            경보 화면에서 전체 보기 →
          </Link>
        </section>
      </div>
    </div>
  );
}
