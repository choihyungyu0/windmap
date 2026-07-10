// 배포 도메인 확정 시 교체.
const SITE_URL = "https://windmap.vercel.app";

/**
 * 하위 페이지 경로(빵부스러기) 구조화 데이터 — 검색결과에 "홈 > 페이지" 경로를 노출.
 * 서버 컴포넌트: <head>가 아닌 본문에 렌더돼도 크롤러가 수집한다.
 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; path: string }[];
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
