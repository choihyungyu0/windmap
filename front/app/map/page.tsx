import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import { ControlRoom } from "@/components/map/control-room";

export const metadata: Metadata = {
  alternates: { canonical: "/map" },
  title: "확산 지도",
  description:
    "배출원 플룸이 바람을 따라 이동하는 경로를 실시간 시각화. 풍향·풍속·배출량을 조작하면 확산 결과가 즉시 바뀝니다.",
};

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string; sel?: string }>;
}) {
  // F-SRCH-01: 홈 지역 검색에서 넘어온 검색어 — 지오코딩(P5) 전까지 배지로 인지
  // ?t=시각인덱스&sel=굴뚝명 — 특정 장면(시각·예측 이동 경로) 딥링크
  const { q, t, sel } = await searchParams;
  const tNum = t != null && t !== "" && Number.isFinite(Number(t)) ? Number(t) : undefined;
  return (
    <main id="main">
      <ControlRoom query={q} initialT={tNum} initialSel={sel} />
    </main>
  );
}
