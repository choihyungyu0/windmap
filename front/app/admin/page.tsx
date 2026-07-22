import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { KakaoFacilityMap } from "@/components/admin/kakao-facility-map";
import { readSnapshotServer } from "@/lib/chungbuk-server";
import { pmClass } from "@/lib/air-grid";
import { Donut, WindRose } from "@/components/charts/primitives";
import { MODE_LABEL, readPipelineStatus } from "@/lib/pipeline-status";
import { reportStats } from "@/lib/reports";

export const metadata: Metadata = {
  title: "관제 대시보드",
  robots: { index: false, follow: false },
};

// 파이프라인 상태 파일을 요청마다 읽는다 (빌드 시점 고정 방지)
export const dynamic = "force-dynamic";

/** 배출 강도(현재 최대 대비) → 등급색 (건강영향 아님, 배출량 상대 표시) */
function emitLevel(share: number): "good" | "watch" | "warn" | "severe" {
  if (share >= 0.5) return "severe";
  if (share >= 0.2) return "warn";
  if (share >= 0.05) return "watch";
  return "good";
}
const LEVEL_BG: Record<string, string> = {
  good: "var(--alert-good)",
  watch: "var(--alert-watch)",
  warn: "var(--alert-warn)",
  severe: "var(--alert-severe)",
};

/** ADM-DSH 관제 대시보드 — 충북 전역 실배출(CleanSYS TMS)·실측(에어코리아) 집계.
 *  실시간 스트림(WS) 연동은 P7. */
export default async function AdminDashboardPage() {
  const [snap, pipeline, reports] = await Promise.all([
    readSnapshotServer(),
    readPipelineStatus(),
    reportStats(),
  ]);

  if (!snap) {
    return (
      <AdminShell>
        <h1 className="text-2xl font-bold">관제 대시보드</h1>
        <p className="mt-6 rounded-lg border border-control-line bg-control-surface/60 p-6 text-sm text-control-muted">
          실데이터 스냅샷(chungbuk.json)이 없습니다 —{" "}
          <code className="font-data">python backend/data/build_snapshot.py</code> 실행 후
          새로고침하세요.
        </p>
      </AdminShell>
    );
  }

  const t = snap.n - 1; // 최신 시각
  const POL = "NOx" as const;

  // 현재 시각 시설별 배출 (내림차순)
  const emitters = snap.facilities
    .map((f, fi) => ({
      id: String(fi),
      name: f.name,
      city: f.city,
      lng: f.lon,
      lat: f.lat,
      E: snap.emis[POL][fi][t] ?? 0,
    }))
    .sort((a, b) => b.E - a.E);
  const emittingNow = emitters.filter((e) => e.E > 0).length;
  const worst = emitters[0];
  const emisMax = worst?.E || 1;

  // 관측 풍향 분포 (전 시군·전 기간 — 관측 풍배도)
  const windBins = new Array(16).fill(0) as number[];
  for (const w of Object.values(snap.wind)) {
    for (const wd of w.wd) {
      if (wd != null) windBins[Math.round(wd / 22.5) % 16]++;
    }
  }

  // 측정소 대기질 등급 분포 (현재 시각 · PM2.5)
  const grades = { 좋음: 0, 보통: 0, 나쁨: 0, 매우나쁨: 0 } as Record<string, number>;
  for (let si = 0; si < snap.stations.length; si++) {
    const v = snap.meas.PM25[si][t];
    if (v != null) grades[pmClass(v).label]++;
  }
  const gradeHex: Record<string, string> = {
    좋음: "#0d9488",
    보통: "#84cc16",
    나쁨: "#ea580c",
    매우나쁨: "#dc2626",
  };

  // 시군별 현재 배출 합계 (NOx)
  const byCity = new Map<string, number>();
  for (const e of emitters) byCity.set(e.city, (byCity.get(e.city) ?? 0) + e.E);
  const cityEmission = [...byCity.entries()].sort((a, b) => b[1] - a[1]);

  const cards = [
    {
      label: "배출 중 굴뚝 (현재)",
      value: `${emittingNow} / ${snap.facilities.length}`,
      note: "CleanSYS TMS 실시간 배출",
    },
    {
      label: `최다 배출 · ${POL}`,
      value: `${worst.E.toFixed(1)} g/s`,
      note: worst.name,
    },
    {
      label: "대기측정소",
      value: String(snap.stations.length),
      note: "에어코리아 실측 (PM2.5·NO₂·SO₂)",
    },
    {
      label: "실측 기간",
      value: `${snap.n}h`,
      note: `${snap.times[0]} ~ ${snap.times[snap.n - 1]}`,
    },
  ];

  const mapFacilities = emitters
    .filter((e) => e.E > 0)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.city,
      lng: e.lng,
      lat: e.lat,
      level: emitLevel(e.E / emisMax),
      conc: e.E,
    }));

  return (
    <AdminShell>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">관제 대시보드</h1>
        <span className="rounded-full border border-control-line px-3 py-1 text-xs text-control-muted">
          충북 실배출 · 실측 데이터
        </span>
      </div>

      {/* 자동화 파이프라인 상태 (AUTO-01·AUTO-03) */}
      <section
        aria-label="자동화 파이프라인 상태"
        className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-control-line bg-control-surface/60 px-5 py-4"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: pipeline
                ? pipeline.issues.some((i) => i.level === "error")
                  ? "var(--alert-severe)"
                  : "var(--alert-good)"
                : "var(--control-muted)",
            }}
            aria-hidden
          />
          수집 파이프라인
          {pipeline ? ` · ${MODE_LABEL[pipeline.mode]}` : " · 미가동"}
        </span>
        {pipeline ? (
          <>
            <span className="font-data text-xs text-control-muted">
              마지막 사이클 {pipeline.lastRun.slice(5, 16).replace("T", " ")} · 누적{" "}
              {pipeline.cycles}회
            </span>
            <span className="font-data text-xs text-control-muted">
              배출 {pipeline.dbTotals.emission_ts ?? 0} · 기상{" "}
              {pipeline.dbTotals.weather_ts ?? 0} · 실측{" "}
              {pipeline.dbTotals.station_ts ?? 0}행
            </span>
            <span className="text-xs text-control-muted">
              이슈 {pipeline.issues.length}건
              {pipeline.mode === "mock" && " · live 전환은 서비스 키 발급 후"}
            </span>
          </>
        ) : (
          <span className="text-xs text-control-muted">
            engine 파이프라인 실행 전 —{" "}
            <code className="font-data">python -m backend.pipeline --mock</code>
          </span>
        )}
      </section>

      {/* 요약 지표 */}
      <section aria-label="요약 지표" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-control-line bg-control-surface/60 p-5">
            <p className="text-xs text-control-muted">{c.label}</p>
            <p className="font-data mt-2 text-2xl font-semibold">{c.value}</p>
            <p className="mt-1.5 truncate text-xs text-control-muted" title={c.note}>
              {c.note}
            </p>
          </div>
        ))}
      </section>

      {/* 시민 제보 플라이휠 — 체감 응답이 학습으로 순환하는 루프 */}
      <section
        aria-label="시민 제보 플라이휠"
        className="mt-6 rounded-lg border border-wind/30 bg-wind/5 p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="kicker text-wind">시민 제보 플라이휠</h2>
          <span className="text-xs text-control-muted">
            경보 → 원터치 응답 → 정답 라벨 → 보정 학습 → 더 정확한 경보
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-4">
            <Donut
              size={104}
              thickness={13}
              segments={[
                { label: "냄새남", value: reports.smell, color: "var(--alert-warn)" },
                { label: "괜찮음", value: reports.ok, color: "var(--alert-good)" },
              ]}
              centerLabel={String(reports.total)}
              centerSub="건"
            />
            <div className="flex flex-col gap-1.5 text-xs text-control-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--alert-warn)" }} />
                냄새남 {reports.smell}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--alert-good)" }} />
                괜찮음 {reports.ok}
              </span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-2">
            {[
              {
                label: "예측↔체감 일치",
                value: reports.agreement === null ? "—" : `${reports.agreement}%`,
              },
              { label: "기관 제보자 비중", value: `${reports.facilityShare}%` },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-xs text-control-muted">{c.label}</p>
                <p className="font-data mt-1 text-xl font-semibold">{c.value}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 border-t border-control-line pt-3 text-xs leading-relaxed text-control-muted">
          측정소 없는 곳의 실측 공백을 주민 체감으로 메웁니다. 응답은 검증
          배치가 정답 라벨로 소비하며(예측↔체감 교차검증, 기관 제보자 2배 가중),
          거짓·장난 제보는 가중·이상치·예측 대조로 방어합니다. 개인정보 미수집 —
          시설ID·불리언만 저장.
        </p>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* 현재 상위 배출 시설 */}
          <section
            aria-label="현재 상위 배출 시설"
            className="rounded-lg border border-control-line bg-control-surface/60 p-5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="kicker text-control-muted">현재 상위 배출 시설 · {POL}</h2>
              <span className="text-xs text-control-muted">{snap.times[t]} 기준</span>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {emitters.slice(0, 8).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-md border border-control-line bg-control-bg/50 px-4 py-3"
                >
                  <span
                    className="flex h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: LEVEL_BG[emitLevel(e.E / emisMax)] }}
                    aria-hidden
                  />
                  <span className="truncate text-sm font-medium" title={e.name}>
                    {e.name}
                  </span>
                  <span className="shrink-0 text-xs text-control-muted">{e.city}</span>
                  <span className="font-data ml-auto shrink-0 text-sm">
                    {e.E.toFixed(2)}
                    <span className="ml-1 text-[10px] text-control-muted">g/s</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/admin/history"
              className="mt-5 inline-block text-sm text-wind underline-offset-4 hover:underline"
            >
              배출 이력 조회 →
            </Link>
          </section>

          {/* 시설 위치 지도 (카카오맵) — 충북 전역 실좌표 */}
          <section
            aria-label="시설 위치 지도"
            className="flex flex-1 flex-col rounded-lg border border-control-line bg-control-surface/60 p-5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="kicker text-control-muted">배출 굴뚝 위치 · 충북 전역</h2>
              <span className="text-xs text-control-muted">실좌표 (VWorld 지오코딩)</span>
            </div>
            <KakaoFacilityMap
              className="mt-4 min-h-[340px] flex-1"
              facilities={mapFacilities}
              metricUnit=" g/s"
            />
          </section>
        </div>

        <div className="flex flex-col gap-5">
          {/* 측정소 대기질 등급 분포 (현재) */}
          <section
            aria-label="측정소 대기질 등급 분포"
            className="rounded-lg border border-control-line bg-control-surface/60 p-5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="kicker text-control-muted">측정소 대기질 등급 · PM2.5</h2>
              <span className="text-xs text-control-muted">{snap.times[t]}</span>
            </div>
            <div className="mt-4 flex items-center gap-5">
              <Donut
                size={112}
                thickness={14}
                segments={Object.entries(grades).map(([label, value]) => ({
                  label,
                  value,
                  color: gradeHex[label],
                }))}
                centerLabel={String(snap.stations.length)}
                centerSub="측정소"
              />
              <ul className="flex flex-col gap-1.5 text-xs text-control-muted">
                {Object.entries(grades).map(([label, n]) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: gradeHex[label] }} />
                    {label} <span className="font-data">{n}</span>곳
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 관측 풍향 분포 (바람 장미) */}
          <section
            aria-label="관측 풍향 분포"
            className="rounded-lg border border-control-line bg-control-surface/60 p-5"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="kicker text-control-muted">관측 풍향 분포</h2>
              <span className="text-xs text-control-muted">기간 전체 · ASOS</span>
            </div>
            <div className="mt-2 flex justify-center">
              <WindRose bins={windBins} size={190} color="#22d3ee" />
            </div>
            <p className="text-xs leading-relaxed text-control-muted">
              충북 관측 지점들의 풍향(불어오는 방향) 빈도 — 배출이 주로 어느 방향으로
              이동하는지의 기후적 배경입니다.
            </p>
          </section>

          {/* 시군별 현재 배출 */}
          <section
            aria-label="시군별 배출"
            className="rounded-lg border border-control-line bg-control-surface/60 p-5"
          >
            <h2 className="kicker text-control-muted">시군별 현재 배출 · {POL}</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {cityEmission.map(([city, sum]) => (
                <li key={city} className="flex items-center gap-2.5 text-sm">
                  <span className="w-14 shrink-0">{city}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-control-line/60">
                    <span
                      className="block h-full rounded-full bg-[var(--alert-warn)]"
                      style={{
                        width: `${Math.max(3, (sum / (cityEmission[0]?.[1] || 1)) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="font-data shrink-0 text-control-muted">{sum.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
