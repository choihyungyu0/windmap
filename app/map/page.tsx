import type { Metadata } from "next";
import { ControlRoom } from "@/components/map/control-room";

export const metadata: Metadata = {
  alternates: { canonical: "/map" },
  title: "확산 지도",
  description:
    "배출원 플룸이 바람을 따라 이동하는 경로를 실시간 시각화. 풍향·풍속·배출량을 조작하면 확산 결과가 즉시 바뀝니다.",
};

export default function MapPage() {
  return (
    <main id="main">
      <ControlRoom />
    </main>
  );
}
