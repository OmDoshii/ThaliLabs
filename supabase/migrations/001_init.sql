-- Thali Labs: brand-wise Indian calorie counter
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------- foods
create table if not exists public.foods (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  brand                 text,                       -- null for generic
  variant               text,                       -- e.g. 'Taaza', 'Gold'
  category              text not null,
  is_generic            boolean not null default false,
  -- all per 100g (of the RAW item where a raw/cooked factor exists)
  kcal                  numeric(7,2) not null check (kcal >= 0),
  protein               numeric(6,2) not null check (protein >= 0),
  carbs                 numeric(6,2) not null check (carbs >= 0),
  fat                   numeric(6,2) not null check (fat >= 0),
  fibre                 numeric(6,2),
  sugar                 numeric(6,2),
  serving_g             numeric(7,2),
  serving_label         text,                       -- '1 scoop = 33g'
  piece_weight_g        numeric(7,2),
  piece_label           text,                       -- 'egg', 'slice'
  raw_to_cooked_factor  numeric(5,2),
  source_name           text,
  source_url            text,
  fetched_at            timestamptz,
  status                text not null default 'auto_fetched'
                          check (status in ('auto_fetched','verified','flagged')),
  confidence            text not null default 'low' check (confidence in ('low','normal')),
  report_count          int not null default 0,
  search_count          int not null default 0,
  search_text           text generated always as (
                          lower(coalesce(brand,'') || ' ' || name || ' ' || coalesce(variant,''))
                        ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists foods_search_trgm on public.foods using gin (search_text gin_trgm_ops);
create index if not exists foods_category_idx on public.foods (category);
create index if not exists foods_brand_idx on public.foods (brand);
create index if not exists foods_status_idx on public.foods (status);

-- -------------------------------------------------------------- aliases
create table if not exists public.aliases (
  id       bigint generated always as identity primary key,
  food_id  uuid not null references public.foods(id) on delete cascade,
  alias    text not null
);
create index if not exists aliases_trgm on public.aliases using gin (lower(alias) gin_trgm_ops);
create index if not exists aliases_food_idx on public.aliases (food_id);

-- --------------------------------------------------------- review queue
create table if not exists public.review_queue (
  id                uuid primary key default gen_random_uuid(),
  query             text not null,
  extracted         jsonb not null,
  source_url        text,
  failed_checks     text[] not null default '{}',
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------ fetch jobs
create table if not exists public.fetch_jobs (
  id          uuid primary key default gen_random_uuid(),
  query       text not null,
  status      text not null default 'queued'
                check (status in ('queued','finding_page','reading_label','validating','done','failed')),
  result_food_id uuid references public.foods(id) on delete set null,
  ip          text,                  -- for per-visitor rate limiting
  transient   jsonb,                 -- values shown once when checks fail (not saved publicly)
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists fetch_jobs_created_idx on public.fetch_jobs (created_at);

-- --------------------------------------------------- admin login limiter
create table if not exists public.admin_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  at         timestamptz not null default now()
);
create index if not exists admin_attempts_ip_at on public.admin_attempts (ip, at);

-- ------------------------------------------------------------------ RLS
-- The public (anon key) may ONLY read foods and aliases.
-- Everything else is locked: no policies => no access. All writes go through
-- the server with the service-role key, which bypasses RLS and never reaches the browser.
alter table public.foods           enable row level security;
alter table public.aliases         enable row level security;
alter table public.review_queue    enable row level security;
alter table public.fetch_jobs      enable row level security;
alter table public.admin_attempts  enable row level security;

drop policy if exists "public read foods" on public.foods;
create policy "public read foods" on public.foods for select to anon, authenticated using (true);

drop policy if exists "public read aliases" on public.aliases;
create policy "public read aliases" on public.aliases for select to anon, authenticated using (true);

-- ------------------------------------------------------- fuzzy search RPC
-- Ordering rule: generic first (when it matches), then branded by search_count.
create or replace function public.search_foods(q text, lim int default 8)
returns setof public.foods
language sql stable
as $$
  with params as (select lower(trim(q)) as t),
  scored as (
    select f.*,
           greatest(
             similarity(f.search_text, (select t from params)),
             coalesce((select max(similarity(lower(a.alias), (select t from params)))
                       from public.aliases a where a.food_id = f.id), 0),
             case when f.search_text like '%' || (select t from params) || '%' then 0.6 else 0 end,
             case when exists (select 1 from public.aliases a
                               where lower(a.alias) like (select t from params) || '%') then 0.7 else 0 end
           ) as score
    from public.foods f
  )
  select id, slug, name, brand, variant, category, is_generic, kcal, protein, carbs, fat, fibre, sugar,
         serving_g, serving_label, piece_weight_g, piece_label, raw_to_cooked_factor,
         source_name, source_url, fetched_at, status, confidence, report_count, search_count,
         search_text, created_at, updated_at
  from scored
  where score >= 0.32
  -- generic first, but only when it is a solid match (so typing "milky mist pan"
  -- still puts the Milky Mist row on top rather than a weakly-matching generic)
  order by (is_generic and score >= 0.45) desc, score desc, search_count desc
  limit lim;
$$;

-- Server-side increment (called with service role when a food is picked)
create or replace function public.bump_search_count(food uuid)
returns void language sql as $$
  update public.foods set search_count = search_count + 1 where id = food;
$$;
revoke execute on function public.bump_search_count(uuid) from anon, authenticated;
