import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 콘텐츠에서 쓰는 원격 이미지 호스트 — next/image 최적화 허용.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
    // 최신 브라우저에 더 가벼운 포맷 우선 제공 (전송량↓, LCP↑).
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
