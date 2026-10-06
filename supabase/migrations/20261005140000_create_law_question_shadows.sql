begin;

create table if not exists public.admin_law_question_doc_sources (
  lei_id bigint primary key references public.leis(id) on delete cascade,
  material_id bigint references public.materiais_leis(id) on delete restrict,
  source_url text,
  google_document_id text check (google_document_id is null or google_document_id ~ '^[A-Za-z0-9_-]+$'),
  configured_at timestamptz not null default now(),
  configured_by uuid references auth.users(id) on delete set null
);

create table if not exists public.admin_law_question_shadow_analyses (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete cascade,
  material_id bigint references public.materiais_leis(id) on delete restrict,
  source_url text,
  google_document_id text,
  source_kind text not null default 'google_docs' check (source_kind in ('google_docs', 'texto_colado')),
  partial boolean not null default false,
  google_revision_id text,
  units jsonb not null check (jsonb_typeof(units) = 'array'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  complete boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.admin_law_question_shadow_units (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete cascade,
  identity_key text not null,
  ordem text,
  assunto text not null,
  tipo text not null check (tipo in ('caput', 'paragrafo')),
  texto_html text not null,
  texto_plano text not null,
  caminho_estrutural jsonb not null default '[]'::jsonb check (jsonb_typeof(caminho_estrutural) = 'array'),
  source_fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_analysis_id uuid references public.admin_law_question_shadow_analyses(id) on delete set null,
  decision text check (decision in ('nao_cabe_questao', 'revogado')),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  unique (lei_id, identity_key)
);

create index if not exists admin_law_question_shadow_units_lei_ordem_idx
  on public.admin_law_question_shadow_units(lei_id, ordem);
create index if not exists admin_law_question_shadow_analyses_lei_created_idx
  on public.admin_law_question_shadow_analyses(lei_id, created_at desc);

alter table public.admin_law_question_doc_sources enable row level security;
alter table public.admin_law_question_shadow_analyses enable row level security;
alter table public.admin_law_question_shadow_units enable row level security;

revoke all on public.admin_law_question_doc_sources from public, anon, authenticated;
revoke all on public.admin_law_question_shadow_analyses from public, anon, authenticated;
revoke all on public.admin_law_question_shadow_units from public, anon, authenticated;
grant select, insert, update, delete on public.admin_law_question_doc_sources to service_role;
grant select, insert, update, delete on public.admin_law_question_shadow_analyses to service_role;
grant select, insert, update, delete on public.admin_law_question_shadow_units to service_role;

comment on table public.admin_law_question_shadow_units is
  'Inventário administrativo de dispositivos lidos do Google Docs para análise de cobertura por questões. Não altera questões nem publicação.';

commit;
