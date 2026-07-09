// P0 임시 홈 — P1에서 지역 검색 진입(F-SRCH-01) 홈으로 교체 예정.
export default function Home() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="text-sm font-medium tracking-widest text-muted-foreground">
        WIND MAP · 구축 중
      </p>
      <h1 className="text-4xl font-bold sm:text-5xl">바람의 지도</h1>
      <p className="max-w-md text-muted-foreground">
        배출원-주거지 대기오염 확산 예측 AI. 공기의 경로를 데이터로 밝힙니다.
      </p>
    </main>
  );
}
