-- Operações de saneamento da Central do Artigo.
-- A operação congela as questões selecionadas na prévia; ela não altera
-- questões, LegisBot ou vínculos por si só.
create table if not exists public.question_conflict_operations (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete restrict,
  lei_slug text not null,
  action text not null check (action in (
    'limpar_html_assunto',
    'padronizar_nome_curto',
    'manter_granularidade',
    'aplicar_estrutura'
  )),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'prepared' check (status in (
    'prepared', 'running', 'completed', 'partial', 'failed', 'unknown'
  )),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null
);

create index if not exists question_conflict_operations_law_created_idx
  on public.question_conflict_operations (lei_id, created_at desc);

create table if not exists public.question_conflict_operation_items (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.question_conflict_operations(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  slug text not null,
  ordem text not null,
  pending_types jsonb not null default '[]'::jsonb,
  expected_updated_at timestamptz null,
  before_value jsonb not null default '{}'::jsonb,
  after_value jsonb not null default '{}'::jsonb,
  status text not null default 'prepared' check (status in (
    'prepared', 'applied', 'no_change', 'excluded', 'failed', 'unknown'
  )),
  reason_code text null,
  reason text null,
  applied_at timestamptz null,
  unique (operation_id, question_id)
);

create index if not exists question_conflict_operation_items_operation_idx
  on public.question_conflict_operation_items (operation_id, status);
create index if not exists question_conflict_operation_items_question_idx
  on public.question_conflict_operation_items (question_id, operation_id);

-- A decisão é por questão e por assinatura dos dados analisados. Uma alteração
-- relevante produz outra assinatura e volta a exigir revisão, sem apagar o
-- histórico editorial anterior.
create table if not exists public.question_editorial_decisions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  decision_type text not null check (decision_type = 'granularidade_mantida'),
  signature text not null check (btrim(signature) <> ''),
  slug text not null,
  ordem text not null,
  decision jsonb not null default '{}'::jsonb,
  operation_id uuid null references public.question_conflict_operations(id) on delete set null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  unique (question_id, decision_type, signature)
);

create index if not exists question_editorial_decisions_question_idx
  on public.question_editorial_decisions (question_id, decision_type, created_at desc);

alter table public.question_conflict_operations enable row level security;
alter table public.question_conflict_operation_items enable row level security;
alter table public.question_editorial_decisions enable row level security;

revoke all on public.question_conflict_operations, public.question_conflict_operation_items,
  public.question_editorial_decisions from public, anon, authenticated;
grant select, insert, update, delete on public.question_conflict_operations,
  public.question_conflict_operation_items, public.question_editorial_decisions to service_role;

comment on table public.question_conflict_operations is
  'Prévia e resultado persistentes de saneamentos editoriais de conflitos das questões.';
comment on table public.question_editorial_decisions is
  'Decisões editoriais por questão e assinatura, sem dispensar conflitos futuros alterados.';
