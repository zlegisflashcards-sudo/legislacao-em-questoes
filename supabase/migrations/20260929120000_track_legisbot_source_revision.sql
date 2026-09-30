begin;

alter table public.legisbot_comentarios
  add column if not exists source_signature varchar(64),
  add column if not exists precisa_revisao boolean not null default false;

-- Novas solicitações passam exclusivamente pela API autenticada e pela RPC
-- service_role, que resolve a fonte em public.questions.
drop policy if exists "Criar solicitacoes pendentes do LegisBot"
  on public.legisbot_comentarios;
revoke insert, update, delete on public.legisbot_comentarios from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legisbot_comentarios'::regclass
      and conname = 'legisbot_comentarios_source_signature_check'
  ) then
    alter table public.legisbot_comentarios
      add constraint legisbot_comentarios_source_signature_check
      check (source_signature is null or source_signature ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

create index if not exists legisbot_comentarios_precisa_revisao_idx
  on public.legisbot_comentarios (precisa_revisao)
  where precisa_revisao = true;

comment on column public.legisbot_comentarios.source_signature is
  'SHA-256 normalizado da fonte usada na geração; ignora diferenças visuais irrelevantes.';
comment on column public.legisbot_comentarios.precisa_revisao is
  'Preserva o comentário anterior e sinaliza que o flashcard-fonte mudou.';

commit;
