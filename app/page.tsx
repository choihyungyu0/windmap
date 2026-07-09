import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal, RevealLines } from "@/components/site/reveal";
import { SearchEntry } from "@/components/site/search-entry";
import { HeroFog } from "@/components/site/hero-fog";
import { CitizenChat } from "@/components/site/citizen-chat";
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

// 서비스 소개 요약 — 3축 하이브리드 원리 (상세: /about)
const PRINCIPLES = [
  ["① 확산 엔진 (물리)", "가우시안 플룸·퍼프로 오염물질이 어디로, 언제 퍼질지 계산"],
  ["② 보정 AI (학습)", "물리 예측과 하류 실측의 오차를 학습해 지형·시간대 보정"],
  ["③ 공백 추정 AI (위성)", "위성 AOD로 측정소 없는 마을의 대기질까지 추정"],
] as const;

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
              richLines={[
                <>
                  이{" "}
                  <span className="bg-gradient-to-r from-[#0e7490] via-[#00b8d4] to-[#22d3ee] bg-clip-text text-transparent">
                    공기
                  </span>
                  는 어디서 와서,
                </>,
                "어디로 갑니까",
              ]}
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

        {/* ── 서비스 소개: 왜 만들었나(북이면) + 어떻게 작동하나(3축) ── */}
        <Section className="border-t border-border">
          <SectionHeader
            kicker="About — 왜 만들었나"
            title={"기록되지 않은 공기가\n있었습니다"}
          />
          <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            {/* 북이면 스토리 (요약) */}
            <Reveal>
              <div className="space-y-5 text-base leading-relaxed text-muted-foreground lg:text-lg">
                <p>
                  청주시 북이면 — 소각시설이 밀집한 이 지역의 주민들은 2019년
                  국내 최초의 소각장 주변 건강영향조사를 이끌어냈습니다. 조사는
                  높은 암 발생을 확인했지만 결론은{" "}
                  <em className="not-italic font-medium text-foreground">
                    &ldquo;역학적 관련성을 입증할 과학적 근거가 제한적&rdquo;
                  </em>
                  이었습니다.
                </p>
                <p>
                  이유는 하나 —{" "}
                  <strong className="font-semibold text-foreground">
                    배출이 언제, 어디로, 누구에게 닿았는지 기록한 데이터가
                    어디에도 없었기 때문입니다.
                  </strong>{" "}
                  바람의 지도는 그 공백을 메우는, 같은 갈등이 반복되기 전에
                  미리 만들어 두는 사회적 인프라입니다.
                </p>
              </div>
            </Reveal>

            {/* 3축 원리 요약 */}
            <Reveal delay={0.12}>
              <div className="flex h-full flex-col">
                <span className="kicker text-muted-foreground">
                  물리가 뼈대, AI가 정확도
                </span>
                <ul className="mt-5 flex flex-col divide-y divide-border border-y border-border">
                  {PRINCIPLES.map(([name, desc]) => (
                    <li key={name} className="py-4">
                      <p className="text-sm font-bold">{name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {desc}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap gap-3 pt-8">
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    서비스 소개 자세히 →
                  </Link>
                  <Link
                    href="/report"
                    className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand"
                  >
                    <FlaskConical className="size-4" aria-hidden />
                    성능 검증 리포트
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>
      </main>
      <Footer />
      <CitizenChat />
    </>
  );
}
