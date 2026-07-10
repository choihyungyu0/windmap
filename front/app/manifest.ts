import type { MetadataRoute } from "next";

// PWA 매니페스트 — Next가 <link rel="manifest">를 자동 주입. 아이콘은 P1 브랜딩에서 추가.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "바람의 지도",
    short_name: "바람의지도",
    description: "배출원-주거지 대기오염 확산 예측 AI",
    start_url: "/",
    display: "standalone",
    lang: "ko",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [],
  };
}
