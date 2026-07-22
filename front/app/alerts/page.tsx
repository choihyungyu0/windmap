import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { AlertsBoard } from "@/components/alerts/alerts-board";
import { StationRiskMap } from "@/components/alerts/station-risk-map";
import { CitizenChat } from "@/components/site/citizen-chat";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";

export const metadata: Metadata = {
  alternates: { canonical: "/alerts" },
  title: "취약시설 경보",
  description:
    "충북 전역 34개 대기측정소 실측 대기질로 지역별 경보 등급·풍상 배출원·행동 권고를 제공합니다. 취약시설 밀집 지역을 도달 전에 지킵니다.",
};

export default function AlertsPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "홈", path: "/" }, { name: "취약시설 경보", path: "/alerts" }]} />
      <Navbar />
      <main id="main">
        <Section className="pt-32 lg:pt-40">
          <SectionHeader
            kicker="Alerts"
            title={"도달하기 전에,\n먼저 알립니다"}
            description="충북 전역 34개 대기측정소의 실측 대기질을 등급으로 지도에 세우고, 어느 배출원이 풍상에 있는지 함께 봅니다. 취약시설이 밀집한 지역을 도달 전에 지키는 대응 정보입니다."
          />
          <Reveal delay={0.1} className="mt-14">
            <StationRiskMap />
          </Reveal>
          <Reveal delay={0.15} className="mt-10">
            <AlertsBoard />
          </Reveal>
        </Section>
      </main>
      <Footer />
      <CitizenChat />
    </>
  );
}
