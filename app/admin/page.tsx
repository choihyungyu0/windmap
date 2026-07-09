import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { concentrationAt } from "@/lib/plume";
import {
  defaultScenario,
  gradeOf,
  LEVEL_META,
  receptors,
  source,
  sourceCandidates,
} from "@/lib/mock";
import { MODE_LABEL, readPipelineStatus } from "@/lib/pipeline-status";
import { reportStats } from "@/lib/reports";

export const metadata: Metadata = {
  title: "관제 대시보드",
  robots: { index: false, follow: false },
};

// 파이프라인 상태 파일을 요청마다 읽는다 (빌드 시점 고정 방지)
export const dynamic = "force-dynamic";

const LEVEL_BG: Record<string, string> = {
  good: "var(--alert-good)",
  watch: "var(--alert-watch)",
  warn: "var(--alert-warn)",
  severe: "var(--alert-severe)",
};

/** ADM-DSH 관제 대시보드 (F-ADSH-01/02) — 기본 시나리오 플룸 실계산 집계.
 *  실시간 스트림(WS) 연동은 P7. */
export default async function AdminDashboardPage() {
  const pipeline = await readPipelineStatus();
  const reports = await reportStats();
  const p = { ...defaultScenario, h: source.stackHeight };
  const readings = receptors
    .map((r) => {
      const conc = concentrationAt(r.ex, r.ny, p);
      return { ...r, conc, level: gradeOf(conc) };
    })
    .sort((a, b) => b.conc - a.conc);
  const active = readings.filter((r) => r.level !== "good");
  const worst = readings[0];

  const cards = [
    {
      label: "감시 배출원",
      value: `${sourceCandidates.filter((s) => s.active).length} / ${sourceCandidates.length}`,
      note: pipeline ? "TMS 수집 파이프라인 가동" : "TMS 수집 연동 P2 예정",
    },
    {
      label: "활성 경보",
      value: String(active.length),
      note: active.map((a) => LEVEL_META[a.level].label).join(" · ") || "없음",
    },
    {
      label: "감시 취약시설",
      value: String(receptors.length),
      note: "학교·병원·경로당·주거지",
    },
    {
      label: "현재 시나리오",
      value: `${p.wd}° · ${p.u} m/s`,
      note: `배출률 ${p.q} g/s · 안정도 ${p.stability}`,
    },
  ];

  return (
    <AdminShell>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">관제 대시보드</h1>
        <span className="rounded-full border border-control-line px-3 py-1 text-xs text-control-muted">
          시범 모드 · 시뮬레이션 데이터
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
            engine 파이프라인 실행 전 — <code className="font-data">python -m engine.pipeline --mock</code>
          </span>
        )}
      </section>

      {/* 요약 지표 (F-ADSH-01) */}
      <section aria-label="요약 지표" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-control-line bg-control-surface/60 p-5">
            <p className="text-xs text-control-muted">{c.label}</p>
            <p className="font-data mt-2 text-2xl font-semibold">{c.value}</p>
            <p className="mt-1.5 text-xs text-control-muted">{c.note}</p>
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
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          {[
            { label: "누적 제보", value: `${reports.total}건` },
            {
              label: "냄새남 / 괜찮음",
              value: `${reports.smell} / ${reports.ok}`,
            },
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
        <p className="mt-4 border-t border-control-line pt-3 text-xs leading-relaxed text-control-muted">
          측정소 없는 곳의 실측 공백을 주민 체감으로 메웁니다. 응답은 검증
          배치가 정답 라벨로 소비하며(예측↔체감 교차검증, 기관 제보자 2배 가중),
          거짓·장난 제보는 가중·이상치·예측 대조로 방어합니다. 개인정보 미수집 —
          시설ID·불리언만 저장.
        </p>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* 실시간 경보 패널 (F-ADSH-02) */}
        <section
          aria-label="활성 경보"
          className="rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="kicker text-control-muted">활성 경보</h2>
            <span className="text-xs text-control-muted">WS 실시간 갱신 — P7 연동</span>
          </div>
          {active.length === 0 ? (
            <p className="mt-6 text-sm text-control-muted">현재 활성 경보가 없습니다.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2.5">
              {active.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border border-control-line bg-control-bg/50 px-4 py-3"
                >
                  <span
                    className="flex h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: LEVEL_BG[a.level] }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-control-muted">{a.type}</span>
                  <span className="font-data ml-auto text-sm">
                    {a.conc.toFixed(1)}
                    <span className="ml-1 text-[10px] text-control-muted">μg/m³</span>
                  </span>
                  <span className="text-xs font-semibold" style={{ color: LEVEL_BG[a.level] }}>
                    {LEVEL_META[a.level].symbol} {LEVEL_META[a.level].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/history"
            className="mt-5 inline-block text-sm text-wind underline-offset-4 hover:underline"
          >
            경보·노출 이력 조회 →
          </Link>
        </section>

        {/* 시설 위험도 집계 */}
        <section
          aria-label="시설 위험도"
          className="rounded-lg border border-control-line bg-control-surface/60 p-5"
        >
          <h2 className="kicker text-control-muted">시설 위험도</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {readings.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: LEVEL_BG[r.level] }}
                  aria-hidden
                />
                <span>{r.name}</span>
                <span className="font-data ml-auto text-control-muted">
                  {r.conc < 0.1 ? "< 0.1" : r.conc.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          {worst && worst.level !== "good" && (
            <p className="mt-5 rounded-md border border-control-line bg-control-bg/50 px-4 py-3 text-xs leading-relaxed text-control-muted">
              최고 위험: <strong className="text-control-text">{worst.name}</strong> —{" "}
              {LEVEL_META[worst.level].advice}
            </p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
