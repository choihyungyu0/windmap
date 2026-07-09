import type { MetadataRoute } from "next";

// 배포 도메인 확정 시 교체.
const SITE = "https://windmap.vercel.app";

// 공개 페이지 허용, 관리자·API 경로 차단.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
