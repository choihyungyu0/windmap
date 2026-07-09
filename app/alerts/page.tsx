import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { AlertsBoard } from "@/components/alerts/alerts-board";
import { RiskMap } from "@/components/alerts/risk-map";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";

export const metadata: Metadata = {
  alternates: { canonical: "/alerts" },
  title: "취약시설 경보",
  description:
    "학교·병원·경로당 등 취약시설별 도달 예상 시각·경보 등급·행동 권고. 도달 전에 대응할 수 있는 실행 정보를 제공합니다.",
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
            description="예측된 확산 경로 위의 학교·병원·경로당에 도달 예상 시각과 함께 행동 권고를 보냅니다. 경보는 공포가 아니라 대응 정보입니다."
          />
          <Reveal delay={0.1} className="mt-14">
            <RiskMap />
          </Reveal>
          <Reveal delay={0.15} className="mt-10">
            <AlertsBoard />
          </Reveal>
        </Section>
      </main>
      <Footer />
    </>
  );
}
