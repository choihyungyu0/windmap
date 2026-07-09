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

-- RLS: anon 은 읽기만, 쓰기는 service_role(RLS 우회)만
alter table public.pipeline_status enable row level security;
alter table public.alert_history enable row level security;

drop policy if exists "public read status" on public.pipeline_status;
create policy "public read status" on public.pipeline_status
  for select using (true);

drop policy if exists "public read alerts" on public.alert_history;
create policy "public read alerts" on public.alert_history
  for select using (true);
