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
    "측정소가 없는 마을의 대기질을, 충북 34개 측정소 실측 PM2.5를 공간 보간(IDW)해 추정합니다. 측정 사각지대를 메우는 실측 기반 추정.",
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
            description="지상 측정망은 듬성듬성합니다. 충북 34개 측정소의 실측 초미세먼지를 역거리가중(IDW)으로 공간 보간해, 측정소 없는 지점의 농도를 추정합니다. 위성 에어로졸(AOD) 융합은 다음 단계입니다."
          />

          <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_360px]">
            {/* 위성 추정 대기질 지도 (HeatmapLayer) */}
            <Reveal>
              <div>
                <AirMap />
                <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                  <li>· 충북 34개 측정소 실측 PM2.5를 IDW 공간 보간 — 실데이터. 아래 슬라이더로 실측 시계열(7/10~7/16)을 스크럽</li>
                  <li>· 등급 구간은 한국 대기질 표준(좋음→매우나쁨), 색은 서비스 경보 팔레트와 통일</li>
                  <li>· 색점 = 측정소 실측 농도색 · 지도 클릭 시 해당 지점의 추정값과 신뢰도 표시</li>
                </ul>
              </div>
            </Reveal>

            {/* 방법 설명 */}
            <Reveal delay={0.12}>
              <div className="flex flex-col gap-5">
                <p className="kicker text-muted-foreground">현재 데모 · 측정소 실측 보간</p>
                {(
                  [
                    ["① 측정소가 측정한다", "충북 34개 대기측정소(에어코리아)가 1시간 간격으로 PM2.5 등 실측 농도를 보고합니다."],
                    ["② 사각지대를 보간한다", "측정소 실측값을 역거리가중(IDW)으로 공간 보간해, 측정소 없는 지점의 농도를 추정합니다."],
                    ["③ 신뢰도를 함께 본다", "지도 클릭 시 그 지점의 추정 농도와, 최근접 측정소 거리 기반 신뢰도를 함께 표시합니다."],
                  ] as const
                ).map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-border p-6">
                    <h3 className="font-bold">{t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                ))}
                <ul className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
                  <li>· 다음 단계(P7): 위성 에어로졸(AOD)·기상·토지이용을 학습해 측정망 밖까지 정밀화 — 교차검증 상관 0.9+ 보고된 방법론</li>
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
