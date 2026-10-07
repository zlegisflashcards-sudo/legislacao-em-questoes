begin;

alter table public.legisbot_comentarios
  add column if not exists context_kind text not null default 'comment',
  add column if not exists structure_id bigint references public.law_structure(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legisbot_comentarios'::regclass
      and conname = 'legisbot_comentarios_context_kind_check'
  ) then
    alter table public.legisbot_comentarios
      add constraint legisbot_comentarios_context_kind_check
      check (context_kind in ('comment', 'shadow_question'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legisbot_comentarios'::regclass
      and conname = 'legisbot_shadow_not_publishable_check'
  ) then
    alter table public.legisbot_comentarios
      add constraint legisbot_shadow_not_publishable_check
      check (context_kind <> 'shadow_question' or (status = 'pendente' and comentario is null));
  end if;
end $$;

create index if not exists legisbot_comentarios_shadow_context_idx
  on public.legisbot_comentarios (context_kind, slug, ordem)
  where context_kind = 'shadow_question';

comment on column public.legisbot_comentarios.context_kind is
  'comment = comentário editorial normal; shadow_question = contexto pré-editorial que ainda não possui questão real.';

commit;
