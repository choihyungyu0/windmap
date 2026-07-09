import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal, RevealLines } from "@/components/site/reveal";
import { SearchEntry } from "@/components/site/search-entry";
import { HeroFog } from "@/components/site/hero-fog";
import { defaultReadings, LEVEL_META } from "@/lib/mock";
import { Wind, Siren, SatelliteDish, FlaskConical } from "lucide-react";

const FEATURES = [
  {
    href: "/map",
    icon: Wind,
    title: "확산 예측 지도",
    desc: "배출원에서 나온 플룸이 바람을 따라 어디로 가는지 실시간으로 계산해 그립니다. 풍향을 돌리면 지도가 바뀝니다.",
  },
  {
    href: "/alerts",
    icon: Siren,
    title: "도달 전 사전 경보",
    desc: "학교·병원·경로당에 도달 예상 시각과 함께 선제 알림. “40분 뒤 도달 — 실외활동 조정 권고” 수준의 실행 정보를 줍니다.",
  },
  {
    href: "/air",
    icon: SatelliteDish,
    title: "사각지대 대기질",
    desc: "측정소가 없는 마을도 위성 관측(AOD)으로 상공의 대기질을 추정해 공간 사각지대를 메웁니다.",
  },
] as const;

const SOURCES = [
  "환경부 CleanSYS (굴뚝 TMS)",
  "기상청 API",
  "에어코리아",
  "천리안 GK-2 / MODIS",
];

export default function Home() {
  // F-SRCH-02 내 주변 위험 요약(간이판) — 시범 구역 기본 시나리오의 현재 상태
  const readings = defaultReadings();
  const active = readings.filter((r) => r.level !== "good");
  const worst = readings[0];

  return (
    <>
      <Navbar />
      <main id="main">
        {/* ── 히어로: 질문으로 연다 ── */}
        <Section className="overflow-hidden pt-36 lg:pt-44">
          <HeroFog />
          <div className="max-w-4xl">
            <Reveal>
              <span className="kicker text-brand">
                배출원-주거지 대기오염 확산 예측 AI
              </span>
            </Reveal>
            <RevealLines
              as="h1"
              text={"이 공기는 어디서 와서,\n어디로 갑니까"}
              className="display mt-6 block text-[clamp(2.6rem,6.5vw,5rem)]"
            />
            <Reveal delay={0.15}>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                국가 대기질 앱은 측정소의 &lsquo;지금 수치&rsquo;만 보여줍니다.
                바람의 지도는 공개된 굴뚝 배출 데이터와 바람을 이어,
                <strong className="font-semibold text-foreground">
                  {" "}저 굴뚝의 배출이 몇 시에 어느 동네에 닿을지
                </strong>
                를 예측합니다.
              </p>
            </Reveal>
            <Reveal delay={0.25} className="mt-10">
              <SearchEntry />
            </Reveal>
            <Reveal delay={0.3}>
              <p className="mt-4 text-xs text-muted-foreground">
                시범 지역: 청주시 (배출원 1~3개소) · 데이터: 전 항목 공개 데이터
              </p>
            </Reveal>

            {/* F-SRCH-02 시범 구역 현재 요약 카드 */}
            <Reveal delay={0.35}>
              <Link
                href="/alerts"
                className="mt-8 inline-flex max-w-xl flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border px-6 py-4 transition-colors hover:border-brand/50"
              >
                <span className="kicker text-muted-foreground">
                  시범 구역 현재
                </span>
                <span className="text-sm font-semibold">
                  활성 경보 <span className="tnum">{active.length}</span>건
                </span>
                {worst && worst.level !== "good" && (
                  <span className="text-sm text-muted-foreground">
                    최고 위험: {worst.name}{" "}
                    <span
                      className={`font-semibold ${
                        {
                          watch: "text-alert-watch",
                          warn: "text-alert-warn",
                          severe: "text-alert-severe",
                        }[worst.level]
                      }`}
                    >
                      {LEVEL_META[worst.level].symbol} {LEVEL_META[worst.level].label}
                    </span>
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  시뮬레이션 · 자세히 →
                </span>
              </Link>
            </Reveal>
          </div>
        </Section>

        {/* ── 세 가지 핵심 기능 ── */}
        <Section className="pt-0">
          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.href} delay={i * 0.08}>
                <Link
                  href={f.href}
                  className="group flex h-full flex-col rounded-xl border border-border p-7 transition-colors hover:border-brand/50"
                >
                  <f.icon className="size-6 text-brand" aria-hidden />
                  <h2 className="mt-5 text-xl font-bold">{f.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {f.desc}
                  </p>
                  <span className="mt-auto pt-6 text-sm font-medium text-brand">
                    바로가기{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── 신뢰: 검증과 데이터 출처 ── */}
        <Section className="border-t border-border">
          <SectionHeader
            kicker="Evidence"
            title={"주장하지 않고\n증명합니다"}
            description="물리 확산모델과 보정 AI의 하이브리드. 배출원과 하류 측정소의 실측 대조로 예측 정확도를 정량 검증하고, 그 과정을 전부 공개합니다."
            trailing={
              <Link
                href="/report"
                className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand"
              >
                <FlaskConical className="size-4" aria-hidden />
                성능 검증 리포트
              </Link>
            }
          />
          <Reveal delay={0.15}>
            <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-border pt-8">
              <span className="kicker text-muted-foreground">데이터 출처</span>
              {SOURCES.map((s) => (
                <span key={s} className="text-sm font-medium text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          </Reveal>
        </Section>
      </main>
      <Footer />
    </>
  );
}
