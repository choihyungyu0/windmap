import type { Metadata } from "next";
import { readFile } from "fs/promises";
import path from "path";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";
import { ReportSummary } from "@/components/report/report-summary";
import { ablationExample } from "@/lib/mock";

export const metadata: Metadata = {
  alternates: { canonical: "/report" },
  title: "성능 검증 리포트",
  description:
    "애블레이션(B0→B1a→B1b→B2)으로 보정 AI의 순수 기여를 정량 입증합니다. 배경농도 분리·통계 검정·SHAP 해석까지 검증 과정을 공개합니다.",
};

const METHODS = [
  {
    id: "A",
    name: "가동/정지 자연실험",
    desc: "TMS 운영상태로 정지 기간을 찾아 유사 기상의 가동 기간과 짝지음 — 배출원 기여의 가장 깨끗한 준실측치.",
  },
  {
    id: "B",
    name: "풍상측 차감 (Δ농도)",
    desc: "바람 위쪽 측정소 값을 배경으로 보고 풍하측에서 차감. 시간별 풍향으로 풍상/풍하를 동적 지정.",
  },
  {
    id: "C",
    name: "풍향 조건부 대조",
    desc: "같은 측정소가 풍하에 들 때와 아닐 때의 농도 분포 차이 — 확산 방향 예측이 맞다는 분포 수준의 증거.",
  },
] as const;

// engine 애블레이션 배치 결과 — 요청 시점에 파일 조회 (없으면 예시 수치 폴백)
export const dynamic = "force-dynamic";

interface ValidationReport {
  kind: string;
  caveat: string;
  hours: number;
  trainHours: number;
  testHours: number;
  metric: string;
  ladder: { id: string; name: string; rmse: number; mae: number; r: number; note: string }[];
  improvementPct: number;
  bootstrap: { median: number; ci95: [number, number]; pLeqZero: number; note: string };
  deltaMethods: { corrAB: number; corrBTrue: number };
  model: string;
}

async function readValidation(): Promise<ValidationReport | null> {
  try {
    const p = path.join(process.cwd(), "public", "data", "validation-report.json");
    return JSON.parse(await readFile(p, "utf-8")) as ValidationReport;
  } catch {
    return null;
  }
}

const METRICS = [
  ["RMSE", "예측-실측 오차 크기 (메인 지표)"],
  ["MAE", "평균 절대 오차 — 이상치 영향 확인"],
  ["R", "실측 추세를 따라가는 정도 (상관계수)"],
  ["도달시각 오차", "오염이 언제 도달하는지 — 국가 서비스에 없는 지표"],
  ["경보 F1", "위험 경보의 정밀도·재현율 — 실용성 증명"],
] as const;

export default async function ReportPage() {
  const real = await readValidation();
  const ladder = real?.ladder ?? ablationExample.ladder;
  const metric = real?.metric ?? ablationExample.metric;
  const caveat = real?.caveat ?? ablationExample.caveat;
  const maxRmse = Math.max(...ladder.map((s) => s.rmse));
  const b1b = ladder.find((s) => s.id === "B1b")!;
  const b2 = ladder.find((s) => s.id === "B2")!;
  const improvement =
    real?.improvementPct ?? Math.round(((b1b.rmse - b2.rmse) / b1b.rmse) * 100);

  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "홈", path: "/" }, { name: "성능 검증 리포트", path: "/report" }]} />
      <Navbar />
      <main id="main">
        <Section className="pt-32 lg:pt-40">
          <SectionHeader
            kicker="Ablation Study"
            title={"AI를 빼면,\n성능이 떨어집니다"}
            description="같은 데이터·같은 검증 기간에서 구성요소를 하나씩 제거하며 비교합니다. 물리모델 단독과 보정 AI 적용의 차이가 AI의 순수 기여입니다."
          />

          {/* 베이스라인 사다리 */}
          <Reveal className="mt-14">
            <div className="rounded-xl border border-border p-7 lg:p-9">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-bold">
                  베이스라인 사다리 —{" "}
                  <span className="text-muted-foreground">{metric}</span>
                </h3>
                <span className="rounded-full border border-alert-watch/50 bg-alert-watch/10 px-3 py-1 text-xs font-medium text-alert-watch">
                  {caveat}
                </span>
              </div>

              <ul className="mt-8 flex flex-col gap-5">
                {ladder.map((s) => {
                  const isOurs = s.id === "B2";
                  return (
                    <li key={s.id}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={isOurs ? "font-bold" : "font-medium"}>
                          <span className="font-data mr-2 text-muted-foreground">{s.id}</span>
                          {s.name}
                        </span>
                        <span className="font-data font-semibold">{s.rmse.toFixed(1)}</span>
                      </div>
                      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className={isOurs ? "h-full rounded-full bg-brand" : "h-full rounded-full bg-foreground/25"}
                          style={{ width: `${(s.rmse / maxRmse) * 100}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-8 border-t border-border pt-6 text-sm leading-relaxed">
                핵심 비교는 <strong className="font-data">B1b → B2</strong>: 보정 모델 적용 시 오차{" "}
                <strong className="font-data">{improvement}%</strong> 감소
                {real ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (검증 {real.testHours}시간 · 학습 {real.trainHours}시간, 시간 분리).
                    블록 부트스트랩 95% CI{" "}
                    <span className="font-data">
                      [{real.bootstrap.ci95[0]}%, {real.bootstrap.ci95[1]}%]
                    </span>{" "}
                    — {real.bootstrap.note}. Δ분리 교차확인: 방법 A·B 상관{" "}
                    <span className="font-data">{real.deltaMethods.corrAB}</span>.
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {" "}(예시). 개선의 통계적 유의성은 대응표본 검정으로 확인하며 목표는{" "}
                    <span className="font-data">p&lt;0.01</span> — 효과크기·신뢰구간을 함께 보고합니다.
                  </span>
                )}
              </p>
            </div>
          </Reveal>

          {/* 발표용 요약 (F-RPT · LLM 전달 계층) — 실검증 데이터가 있을 때만 */}
          {real && (
            <Reveal delay={0.05}>
              <ReportSummary />
            </Reveal>
          )}

          {/* 배경농도 분리 */}
          <Reveal delay={0.1} className="mt-16">
            <h3 className="text-2xl font-bold">검증이 성립하는 조건 — 배경농도 3중 분리</h3>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              하류 측정소 실측치는 배경농도·도로·타 배출원의 총합입니다. 분리 없이 비교하면
              보정 AI가 배경농도 맞히기를 학습해 검증 전체가 무의미해집니다. 세 방법으로
              분리하고 서로 교차확인합니다.
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {METHODS.map((m) => (
                <div key={m.id} className="rounded-xl border border-border p-6">
                  <span className="font-data text-sm text-brand">방법 {m.id}</span>
                  <h4 className="mt-2 font-bold">{m.name}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* 지표 정의 */}
          <Reveal delay={0.1} className="mt-16">
            <h3 className="text-2xl font-bold">평가 지표</h3>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 pr-6 font-semibold">지표</th>
                    <th className="py-3 font-semibold">의미</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(([k, v]) => (
                    <tr key={k} className="border-b border-border/60">
                      <td className="font-data py-3 pr-6 whitespace-nowrap">{k}</td>
                      <td className="py-3 text-muted-foreground">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              검증 규모: 배출원 2~3개소 × 수 주간 × 다양한 풍향·계절 — 시간 분리
              교차검증으로 데이터 누수를 차단합니다. SHAP로 보정 AI가 어떤
              조건(풍속·지형·시간대)에서 기여하는지 함께 공개합니다. 실측 검증
              결과는 P6 배치 산출 후 이 페이지에 게시됩니다.
            </p>
          </Reveal>
        </Section>
      </main>
      <Footer />
    </>
  );
}
