-- PostgreSQL descartável: a RPC deve aceitar alteração de justificativa em
-- duplicidade histórica, sem criar questão, tocar structure_id ou ocultar audit.
create schema if not exists auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table auth.users (id uuid primary key);
create table public.leis (id bigint primary key, ativo boolean not null);
create table public.questions (
  id uuid primary key, lei_id bigint not null references public.leis(id), ativo boolean not null,
  pergunta text not null, resposta text not null, justificativa text, titulo text, assunto text,
  legislacao text, ordem text not null, total_artigos integer, ultima_alteracao_legislativa text,
  structure_id bigint, updated_at timestamptz not null default now()
);
create table public.legisbot_comentarios (slug text, ordem text, precisa_revisao boolean not null default false);
create table public.auditoria_administrativa (
  ator_user_id uuid, acao text, entidade text, entidade_id text,
  estado_anterior jsonb, estado_posterior jsonb, detalhes jsonb
);
\i /tmp/20261027120000_add_safe_apkg_uuid_question_updates.sql

begin;
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1, true);
insert into public.questions values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, true, 'Assertiva historicamente duplicada', 'Certo', 'Justificativa anterior', 'T', 'A', 'L', '1.1', 1, null, 77, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, true, 'Assertiva historicamente duplicada', 'Certo', 'Outra justificativa', 'T', 'A', 'L', '1.2', 1, null, 88, now());

select public.admin_apply_apkg_uuid_question_updates(1,
  '[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","expected":{"pergunta":"Assertiva historicamente duplicada","resposta":"Certo","justificativa":"Justificativa anterior","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.1","total_artigos":1,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Assertiva historicamente duplicada","resposta":"Certo","justificativa":"Justificativa nova","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.1","total_artigos":1,"ultima_alteracao_legislativa":null}}]'::jsonb,
  '[]'::jsonb, '11111111-1111-1111-1111-111111111111');

do $$ begin
  if (select count(*) from public.questions) <> 2 then raise exception 'a RPC criou questão em atualização por UUID'; end if;
  if not exists (select 1 from public.questions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and justificativa = 'Justificativa nova' and structure_id = 77) then raise exception 'atualização de justificativa ou vínculo falhou'; end if;
  if (select count(*) from public.auditoria_administrativa where acao = 'importar_apkg_uuid') <> 1 then raise exception 'auditoria ausente'; end if;
end $$;
rollback;
