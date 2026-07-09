/**
 * 사이트 전역 콘텐츠 단일 소스 — 「바람의 지도」
 * 배출원-주거지 대기오염 확산 예측 AI (제13회 전국 ICT융합 AI 공모전)
 *
 * 네비게이션은 기능명세 ①화면목록 기준:
 * /map(확산 지도) · /alerts(취약시설 경보) · /air(사각지대 대기질)
 * /report(성능검증) · /about(서비스 소개) · /admin(관리자, 네비 미노출)
 */

export const brand = {
  name: "바람의 지도",
  initials: "바람",
  tagline: "공기의 경로를 데이터로 밝히다",
  email: "cchoi9632@gmail.com",
  location: "충청북도 청주시",
} as const;

export const nav = [
  { label: "확산 지도", href: "/map" },
  { label: "취약시설 경보", href: "/alerts" },
  { label: "사각지대 대기질", href: "/air" },
  { label: "성능 검증", href: "/report" },
  { label: "서비스 소개", href: "/about" },
] as const;

export const footer = {
  description:
    "공개된 굴뚝 배출(TMS)·기상·위성 데이터로 오염물질의 확산 경로를 예측하고, 측정소 없는 마을의 대기질을 추정하며, 취약시설에 도달 전 사전 경보를 보냅니다.",
  groups: [
    {
      title: "서비스",
      links: [
        { label: "확산 지도", href: "/map" },
        { label: "취약시설 경보", href: "/alerts" },
        { label: "사각지대 대기질", href: "/air" },
      ],
    },
    {
      title: "신뢰성",
      links: [
        { label: "성능 검증 리포트", href: "/report" },
        { label: "서비스 소개·원리", href: "/about" },
        { label: "윤리 원칙", href: "/about#ethics" },
      ],
    },
  ],
  social: [{ label: "GitHub", href: "#" }],
  legal: [
    { label: "데이터 출처·한계 고지", href: "/about#data" },
    // 관리자 진입점 — 상단 네비 대신 푸터 하단에만 노출(로그인으로 보호됨)
    { label: "관리자", href: "/admin" },
  ],
};
