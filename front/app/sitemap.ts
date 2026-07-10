import type { MetadataRoute } from "next";

// 배포 도메인 확정 시 교체 (Vercel 배포 후 실제 URL로).
const SITE = "https://windmap.vercel.app";

// 페이지별 마지막 의미 있는 수정일(정적) — 빌드마다 바뀌지 않도록 고정.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: {
    path: string;
    lastModified: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }[] = [
    { path: "/", lastModified: "2026-07-09", priority: 1.0, changeFrequency: "weekly" },
    { path: "/map", lastModified: "2026-07-09", priority: 0.9, changeFrequency: "weekly" },
    { path: "/alerts", lastModified: "2026-07-09", priority: 0.8, changeFrequency: "weekly" },
    { path: "/air", lastModified: "2026-07-09", priority: 0.7, changeFrequency: "weekly" },
    { path: "/report", lastModified: "2026-07-09", priority: 0.7, changeFrequency: "monthly" },
    { path: "/about", lastModified: "2026-07-09", priority: 0.6, changeFrequency: "monthly" },
  ];

  return routes.map((r) => ({
    url: `${SITE}${r.path}`,
    lastModified: r.lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
