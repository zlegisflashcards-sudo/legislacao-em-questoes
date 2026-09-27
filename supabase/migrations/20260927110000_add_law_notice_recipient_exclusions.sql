begin;

-- Complementa o fluxo de avisos existente: a Central somente exclui
-- destinatários da revisão, sem duplicar avisos, entregas ou envios.
create table if not exists public.law_update_notice_recipient_exclusions (
  notice_id uuid not null references public.law_update_notices(id) on delete cascade,
  student_id uuid not null references public.alunos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (notice_id, student_id)
);

alter table public.law_update_notice_recipient_exclusions enable row level security;
revoke all on public.law_update_notice_recipient_exclusions from public, anon, authenticated;
grant select, insert, update, delete on public.law_update_notice_recipient_exclusions to service_role;

commit;
