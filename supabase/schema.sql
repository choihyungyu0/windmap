-- 바람의 지도 — Supabase 스키마 (배포용 공유 저장소)
-- 실행 방법: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--
-- 용도:
--   pipeline_status : engine 파이프라인 최신 상태 1행 (관제 대시보드가 읽음)
--   alert_history   : 경보·노출 이력 아카이브 (사업계획서 Ⅷ — 장기 축적 가치)
-- 쓰기는 service_role(engine 배치)만, 읽기는 공개(anon) — 데모 데이터 기준.

create table if not exists public.pipeline_status (
  id int primary key default 1 check (id = 1), -- 단일 행 강제
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_history (
  id bigint generated always as identity primary key,
  ts text not null,               -- 예측 기준 시각 (ISO8601)
  receptor_id text not null,
  receptor text not null,
  level text not null,            -- watch | warn | severe
  conc real,                      -- 예측 농도 (μg/m³)
  arrival_min real,               -- 도달 예상 (분)
  wd real,
  ws real,
  created_at timestamptz not null default now()
);

create index if not exists idx_alert_history_ts on public.alert_history (ts);

-- 시민 체감 제보 (플라이휠) — 경보 대상 주민의 원터치 응답.
-- '측정소 없는 곳의 정답 라벨' → 보정 AI 재학습 입력.
create table if not exists public.citizen_report (
  id bigint generated always as identity primary key,
  receptor_id text not null,      -- 응답 대상 시설/지점
  receptor text not null,
  smell boolean not null,         -- true=냄새남, false=괜찮음 (원터치 두 버튼)
  reporter text not null default 'resident', -- resident | facility (기관 제보자 가중)
  pred_level text,                -- 응답 시점 예측 등급 (예측↔체감 교차검증용)
  pred_conc real,                 -- 응답 시점 예측 농도
  wd real,
  ws real,
  consumed boolean not null default false, -- 재학습 배치 반영 여부
  created_at timestamptz not null default now()
);

create index if not exists idx_citizen_report_created on public.citizen_report (created_at);
create index if not exists idx_citizen_report_consumed on public.citizen_report (consumed);

-- RLS: anon 은 읽기만, 쓰기는 service_role(RLS 우회)만
alter table public.pipeline_status enable row level security;
alter table public.alert_history enable row level security;
alter table public.citizen_report enable row level security;

drop policy if exists "public read status" on public.pipeline_status;
create policy "public read status" on public.pipeline_status
  for select using (true);

drop policy if exists "public read alerts" on public.alert_history;
create policy "public read alerts" on public.alert_history
  for select using (true);

-- 제보는 익명 쓰기 허용(동의 기반 원터치), 읽기도 공개(집계용).
-- 개인정보 미수집 — 좌표·이름 없이 시설ID·불리언만 (윤리 XIV·NFR 보안).
drop policy if exists "public read reports" on public.citizen_report;
create policy "public read reports" on public.citizen_report
  for select using (true);

drop policy if exists "public insert reports" on public.citizen_report;
create policy "public insert reports" on public.citizen_report
  for insert with check (
    reporter in ('resident', 'facility')
    and length(receptor_id) < 64
  );
