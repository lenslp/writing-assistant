create extension if not exists pgcrypto;

create table if not exists public.hot_topics (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  title text not null,
  url text,
  source text not null,
  source_type text not null default 'rss',
  heat integer not null default 0,
  trend_score integer not null default 0,
  summary text,
  tags text[] not null default '{}',
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists hot_topics_fetched_at_idx on public.hot_topics (fetched_at desc);
create index if not exists hot_topics_heat_idx on public.hot_topics (heat desc);

create table if not exists public.fetch_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'hot-topics-refresh',
  status text not null,
  source text,
  inserted_count integer not null default 0,
  message text,
  payload jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.hot_topics enable row level security;
alter table public.fetch_jobs enable row level security;

drop policy if exists "public can read hot_topics" on public.hot_topics;
create policy "public can read hot_topics"
on public.hot_topics
for select
to anon, authenticated
using (true);

drop policy if exists "service role manages hot_topics" on public.hot_topics;
create policy "service role manages hot_topics"
on public.hot_topics
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role manages fetch_jobs" on public.fetch_jobs;
create policy "service role manages fetch_jobs"
on public.fetch_jobs
for all
to service_role
using (true)
with check (true);
