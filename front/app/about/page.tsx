import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Section, SectionHeader } from "@/components/site/section";
import { Reveal, RevealLines } from "@/components/site/reveal";
import { BreadcrumbJsonLd } from "@/components/site/breadcrumb-jsonld";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "서비스 소개",
  description:
    "북이면이 던진 질문에서 출발했습니다. 배출과 노출 사이의 데이터 공백을 메우는 확산 예측 인프라 — 원리·데이터 출처·윤리 원칙을 소개합니다.",
};

const ENGINES = [
  {
    name: "① 확산 엔진 (물리)",
    desc: "가우시안 플룸·퍼프 — 대기과학 표준 모델로 오염물질이 어디로, 언제 퍼질지 계산합니다. 도달 시각은 퍼프 모델의 정식 산출물입니다.",
    tag: "투명·재현 가능",
  },
  {
    name: "② 보정 AI (학습)",
    desc: "물리모델 예측과 하류 측정소 실측의 오차를 학습해 지형·시간대·계절 요인을 보정합니다. 기여도는 애블레이션으로 정량 입증합니다.",
    tag: "XGBoost 오차 학습",
  },
  {
    name: "③ 공백 추정 AI (위성)",
    desc: "위성 AOD·기상·토지이용으로 측정소 없는 격자의 지상 대기질을 추정해 공간 사각지대를 메웁니다.",
    tag: "AOD → 지상 PM2.5",
  },
] as const;

const DATA_SOURCES = [
  ["굴뚝 실시간 배출 (TMS)", "환경부 CleanSYS 오픈 API · 청주시 개방 데이터", "먼지·SOx·NOx·HCl·HF·NH₃·CO 7항목 + 운영상태"],
  ["기상", "기상청 API", "풍향·풍속·기온 → 대기안정도 산출"],
  ["위성 AOD", "천리안 GK-2 / MODIS (Google Earth Engine)", "에어로졸 광학두께"],
  ["측정소 대기질", "에어코리아 API", "실측 — 검증 기준값"],
  ["배출시설·취약시설 위치", "공공데이터포털 GIS", "배출원·학교·병원·경로당 좌표"],
] as const;

const ETHICS = [
  {
    title: "특정 기업·시설을 지목하지 않습니다",
    desc: "공개 TMS 데이터에 기반한 “배출원의 영향 범위 추정”만 다룹니다. 개별 사업장을 오염 피해의 원인·가해자로 지목하거나 실명 비난·규제 촉구를 담지 않습니다.",
  },
  {
    title: "확산 예측은 인과 입증이 아닙니다",
    desc: "본 시스템의 노출 추정은 대응과 연구의 기초자료이지, 역학적 인과나 법적 책임 판단의 근거가 아닙니다.",
  },
  {
    title: "불안이 아니라 대응 정보를 지향합니다",
    desc: "경보는 공포가 아니라 “환기 조정·실외활동 조정” 같은 실행 가능한 행동과 함께 제공합니다.",
  },
  {
    title: "주민 사례 인용을 절제합니다",
    desc: "공개 조사·보도로 확인된 사실만을 존중의 어조로 인용하며, 주민의 고통을 소재로 소비하지 않습니다.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "홈", path: "/" }, { name: "서비스 소개", path: "/about" }]} />
      <Navbar />
      <main id="main">
        {/* ── 문제 — 북이면 (F-ABT-01) ── */}
        <Section className="pt-32 lg:pt-40">
          <div className="max-w-4xl">
            <Reveal>
              <span className="kicker text-brand">Why — 문제의 출발점</span>
            </Reveal>
            <RevealLines
              as="h1"
              text={"기록되지 않은 공기가\n있었습니다"}
              className="display mt-5 block text-[clamp(2.2rem,5.5vw,4rem)]"
            />
            <Reveal delay={0.15}>
              <div className="mt-8 space-y-5 text-lg leading-relaxed text-muted-foreground">
                <p>
                  청주시 청원구 북이면 — 반경 2km 안에 소각시설이 밀집한 이
                  지역에서 주민들은 암 집단 발병을 호소하며 2019년 국내 최초의
                  소각장 주변 건강영향조사를 이끌어냈습니다. 조사는 높은 암
                  발생을 확인했지만, 결론은{" "}
                  <em className="not-italic font-medium text-foreground">
                    &ldquo;역학적 관련성을 입증할 과학적 근거가 제한적&rdquo;
                  </em>
                  이었습니다.
                </p>
                <p>
                  이유는 하나였습니다.{" "}
                  <strong className="font-semibold text-foreground">
                    배출원에서 나온 오염물질이 언제, 어디로, 얼마나 이동해
                    누구에게 닿았는지를 기록한 데이터가 어디에도 없었다는 것.
                  </strong>{" "}
                  측정소 수치는 &lsquo;결과&rsquo;만 보여줄 뿐, 배출과 노출을
                  잇는 경로는 사후에 재구성할 수 없었습니다.
                </p>
                <p>
                  바람의 지도는 이 공백을 메웁니다. 배출이 바람을 타고
                  생활공간에 도달하는 과정을 상시 기록하는 — 같은 갈등이
                  반복되기 전에 미리 만들어 두는 사회적 인프라입니다.
                </p>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── 원리 — 3축 하이브리드 ── */}
        <Section className="border-t border-border">
          <SectionHeader
            kicker="How — 작동 원리"
            title={"물리가 뼈대,\nAI가 정확도"}
            description="판단·예측의 뼈대는 투명한 물리·회귀 모델이 담당합니다. LLM은 경보 문안 생성과 질의응답에만 제한적으로 사용해 블랙박스 논란을 차단합니다."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {ENGINES.map((e, i) => (
              <Reveal key={e.name} delay={i * 0.08}>
                <div className="flex h-full flex-col rounded-xl border border-border p-7">
                  <h3 className="text-lg font-bold">{e.name}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {e.desc}
                  </p>
                  <span className="font-data mt-5 text-xs text-brand">{e.tag}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── 데이터 출처·한계 (#data) ── */}
        <Section id="data" className="border-t border-border">
          <SectionHeader
            kicker="Data — 출처와 한계"
            title={"전 항목,\n공개 데이터입니다"}
            description="별도 장비나 협약 없이 누구나 검증할 수 있는 공개 데이터만 사용합니다."
          />
          <Reveal className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 pr-6 font-semibold">데이터</th>
                  <th className="py-3 pr-6 font-semibold">출처</th>
                  <th className="py-3 font-semibold">내용</th>
                </tr>
              </thead>
              <tbody>
                {DATA_SOURCES.map(([name, src, note]) => (
                  <tr key={name} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-6 font-medium">{name}</td>
                    <td className="py-3 pr-6 text-muted-foreground">{src}</td>
                    <td className="py-3 text-muted-foreground">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-3xl rounded-lg bg-muted px-6 py-5 text-sm leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">한계의 정직한 명시 —</strong>{" "}
              TMS 7항목에는 다이옥신 등 미량 유해물질이 포함되지 않습니다(주기적
              수동 채취로만 측정). 본 시스템의 확산 예측은 TMS 측정 물질의 직접
              예측인 동시에, 같은 굴뚝에서 같은 바람을 타고 이동하는 미측정
              물질의 <em className="not-italic font-medium">노출 경로 지표(proxy)</em>로
              기능합니다.
            </p>
          </Reveal>
        </Section>

        {/* ── 윤리 원칙 (#ethics · F-ABT-02) ── */}
        <Section id="ethics" className="border-t border-border">
          <SectionHeader
            kicker="Ethics — 지키는 것"
            title={"신뢰는 원칙에서\n나옵니다"}
            description="이 원칙은 법적 리스크 관리이자, ‘산업과 주거의 공존 인프라’라는 정체성입니다."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {ETHICS.map((e, i) => (
              <Reveal key={e.title} delay={i * 0.06}>
                <div className="h-full rounded-xl border border-border p-7">
                  <h3 className="font-bold">{e.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{e.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}
