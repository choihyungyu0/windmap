import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  alternates: { canonical: "/air" },
  title: "사각지대 대기질",
  description:
    "측정소가 없는 마을의 대기질을 위성 관측(AOD)·기상·토지이용 데이터로 추정합니다. 공간 사각지대를 메우는 위성 기반 추정.",
};

/* 데모 격자 — 결정적 의사값 (F-GAP-01 위성 추정 모델(P7)로 교체 예정) */
const SIZE = 10;
function pmAt(row: number, col: number): number {
  const v =
    24 +
    12 * Math.sin(col * 0.8 + 1.2) +
    9 * Math.cos(row * 0.9 - 0.5) +
    6 * Math.sin((row + col) * 0.45);
  return Math.max(6, Math.round(v));
}
/** 한국형 PM2.5 등급 (μg/m³): 좋음 0–15 · 보통 16–35 · 나쁨 36–75 · 매우나쁨 76+ */
function pmClass(v: number): { label: string; cls: string } {
  if (v <= 15) return { label: "좋음", cls: "bg-sky-500/80" };
  if (v <= 35) return { label: "보통", cls: "bg-emerald-500/80" };
  if (v <= 75) return { label: "나쁨", cls: "bg-alert-warn/85" };
  return { label: "매우나쁨", cls: "bg-alert-severe/85" };
}
const STATIONS = new Set(["2-3", "7-7"]); // 측정소가 있는 격자 (실측 앵커)

export default function AirPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "홈", path: "/" }, { name: "사각지대 대기질", path: "/air" }]} />
      <Navbar />
      <main id="main">
        <Section className="pt-32 lg:pt-40">
          <SectionHeader
            kicker="Coverage"
            title={"측정소가 없어도,\n하늘에서는 보입니다"}
            description="지상 측정망은 듬성듬성하지만 위성은 전 국토를 봅니다. 위성 에어로졸 광학두께(AOD)에 기상·토지이용을 학습시켜, 측정소 없는 격자의 지상 초미세먼지를 추정합니다."
          />

          <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_360px]">
            {/* 추정 격자 */}
            <Reveal>
              <div>
                <div
                  className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3"
                  style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
                  role="img"
                  aria-label="시범 구역 초미세먼지 추정 격자 지도 (시뮬레이션)"
                >
                  {Array.from({ length: SIZE * SIZE }, (_, i) => {
                    const row = Math.floor(i / SIZE);
                    const col = i % SIZE;
                    const v = pmAt(row, col);
                    const { label, cls } = pmClass(v);
                    const isStation = STATIONS.has(`${row}-${col}`);
                    return (
                      <div
                        key={i}
                        title={`PM2.5 ${v} μg/m³ · ${label}${isStation ? " · 측정소 실측" : " · 위성 추정"}`}
                        className={cn(
                          "tnum relative flex aspect-square items-center justify-center rounded-[4px] text-[10px] font-semibold text-white/95",
                          cls
                        )}
                      >
                        {v}
                        {isStation && (
                          <span
                            className="absolute right-0.5 top-0.5 block h-1.5 w-1.5 rounded-full bg-white ring-1 ring-black/30"
                            aria-hidden
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-black/30" /> 측정소(실측 앵커)
                  </span>
                  {(
                    [
                      ["좋음 ≤15", "bg-sky-500/80"],
                      ["보통 16–35", "bg-emerald-500/80"],
                      ["나쁨 36–75", "bg-alert-warn/85"],
                      ["매우나쁨 76+", "bg-alert-severe/85"],
                    ] as const
                  ).map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className={cn("h-2.5 w-2.5 rounded-[3px]", c)} /> {l}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  시뮬레이션 표본 — 위성 공백 추정 모델(P7·F-GAP-01) 연결 시 실제
                  격자 추정치와 신뢰도로 교체됩니다. 단위: μg/m³ (PM2.5).
                </p>
              </div>
            </Reveal>

            {/* 방법 설명 */}
            <Reveal delay={0.12}>
              <div className="flex flex-col gap-5">
                {(
                  [
                    ["① 위성이 본다", "천리안 GK-2·MODIS의 에어로졸 광학두께(AOD)가 대기 중 입자 총량을 관측합니다."],
                    ["② 지상으로 변환", "AOD·기상·토지이용을 피처로, 측정소가 있는 지점에서 위성값→지상 PM2.5 관계를 학습합니다."],
                    ["③ 사각지대 추정", "학습된 모델이 측정소 없는 격자의 지상 농도를 추정합니다. 격자마다 신뢰도를 함께 표시합니다."],
                  ] as const
                ).map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-border p-6">
                    <h3 className="font-bold">{t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  위성-지상 융합 추정은 교차검증 상관 0.9 이상이 보고된 확립된
                  방법론이며, 저궤도 위성의 시간 해상도 한계는 정지궤도(천리안)
                  병용과 기상 보간으로 보완합니다.
                </p>
              </div>
            </Reveal>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
