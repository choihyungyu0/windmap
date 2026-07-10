import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./devices.css"; // vendored (Devices.css v0.2.0, MIT) — no runtime dep
import { SmoothScroll } from "@/components/site/smooth-scroll";
import localFont from "next/font/local";
import { Preloader } from "@/components/site/preloader";
import { ScrollProgress } from "@/components/site/scroll-progress";

// Self-hosted Pretendard Variable (OFL) — body / UI · 사이트 전역 단일 폰트.
const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
  preload: true,
});

const SITE_NAME = "바람의 지도";
const SITE_DESC =
  "배출원-주거지 대기오염 확산 예측 AI. 공개 굴뚝 배출(TMS)·기상·위성 데이터로 오염물질이 어느 주거지에 몇 시에 도달할지 예측하고, 측정소 없는 마을의 대기질을 추정하며, 취약시설에 도달 전 사전 경보를 보냅니다.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — 배출원-주거지 대기오염 확산 예측 AI`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: [
    "대기오염 확산 예측",
    "가우시안 플룸",
    "가우시안 퍼프",
    "TMS 굴뚝 배출",
    "대기질 예보",
    "취약시설 경보",
    "위성 대기질 추정",
    "청주 대기질",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — 배출원-주거지 대기오염 확산 예측 AI`,
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — 배출원-주거지 대기오염 확산 예측 AI`,
    description: SITE_DESC,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={pretendard.variable}
      // 프리로더 인라인 스크립트가 하이드레이션 전에 .preloader-seen 을
      // 부여하므로 html 클래스는 의도적으로 서버/클라이언트가 다를 수 있다
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/* 재방문 시 프리로더 커튼을 하이드레이션 전에 숨김 — SSR 커튼이 JS
            로드 동안 콘텐츠를 가리는 플래시 방지 (globals.css .preloader-seen) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(sessionStorage.getItem("windmap-preloader")==="1")document.documentElement.classList.add("preloader-seen")}catch(e){}',
          }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          본문으로 건너뛰기
        </a>
        <SmoothScroll>
          <Preloader />
          {children}
        </SmoothScroll>
        <ScrollProgress />
      </body>
    </html>
  );
}
