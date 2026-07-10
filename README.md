# 바람의 지도 (Wind Map)

배출원-주거지 대기오염 확산 예측 AI — 공기의 경로를 데이터로 밝히다.

제13회 전국 ICT융합 AI 공모전 (충북 현안 해결 AI 혁신 · 환경·안전) 디지털 시제품.

## 무엇을 하나

공개된 굴뚝 실시간 배출 데이터(TMS)·기상·위성 데이터를 결합해:

- **확산 예측 지도** (`/map`) — 배출원 플룸이 바람을 따라 이동하는 경로를 3D 시각화. 풍향·풍속·배출량 라이브 조작.
- **취약시설 사전 경보** (`/alerts`) — 학교·병원·경로당에 도달 예상 시각과 함께 선제 알림.
- **사각지대 대기질 추정** (`/air`) — 위성 AOD로 측정소 없는 지역의 대기질 추정.
- **성능 검증 리포트** (`/report`) — 애블레이션(B0→B1a→B1b→B2)·통계 검정·SHAP.

## 구조

```
front/                  # 프론트 — Next.js 15 (App Router · Tailwind v4)
  app/ components/ lib/ # 화면·컴포넌트·클라이언트 로직
  lib/plume.ts          # 클라이언트 가우시안 플룸 엔진 (라이브 데모)
  public/data/          # 사전계산 스냅샷 (backend 산출물을 프론트가 소비)
backend/                # 백엔드 — Python 데이터 파이프라인 (수집·퍼프·보정AI·검증)
supabase/               # 공용 DB 스키마 (제보 미러·파이프라인 상태)
docs/                   # 기획·정책 문서
```

## 실행

프론트 (Next.js):

```bash
cd front
npm install
cp .env.example .env.local   # 값 채우기 (env 파일은 front/ 에 둠)
npm run dev                  # http://localhost:3000
```

백엔드 파이프라인 (Python — 레포 루트에서):

```bash
python -m backend.pipeline --mock    # 1사이클 (키 불필요) — 상세: backend/README.md
```

## 윤리 원칙

특정 기업·시설을 오염 피해의 원인으로 지목하지 않는다. 공개 TMS 데이터 기반의
"배출원 영향 범위 추정"만 다루며, 확산 예측은 역학적 인과 입증이 아니다.
