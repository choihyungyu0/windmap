import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";
import { AirMap } from "@/components/air/air-map";

export const metadata: Metadata = {
  alternates: { canonical: "/air" },
  title: "사각지대 대기질",
  description:
    "측정소가 없는 마을의 대기질을 위성 관측(AOD)·기상·토지이용 데이터로 추정합니다. 공간 사각지대를 메우는 위성 기반 추정.",
};

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
            {/* 위성 추정 대기질 지도 (HeatmapLayer) */}
            <Reveal>
              <div>
                <AirMap />
                <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                  <li>· 위성 AOD 기반 지상 PM2.5 추정을 부드럽게 보간 — 시뮬레이션이며, 위성 공백 추정 모델(P7·F-GAP-01) 연결 시 실제 격자 추정치로 교체</li>
                  <li>· 등급 구간은 한국 대기질 표준(좋음→매우나쁨), 색은 서비스 경보 팔레트와 통일</li>
                  <li>· 흰 점 = 측정소(실측 앵커) · 지도 클릭 시 해당 지점의 추정값과 신뢰도 표시</li>
                </ul>
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
                <ul className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
                  <li>· 위성-지상 융합 추정은 교차검증 상관 0.9 이상이 보고된 확립된 방법론</li>
                  <li>· 저궤도 위성의 시간 해상도 한계는 정지궤도(천리안) 병용과 기상 보간으로 보완</li>
                </ul>
              </div>
            </Reveal>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
