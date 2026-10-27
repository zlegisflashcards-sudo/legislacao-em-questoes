-- Executável somente em banco PostgreSQL descartável e vazio.
-- Confirma que o rollback remove apenas a RPC, sem tocar dados/auditoria.

create schema auth;
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

\ir ../migrations/20261027120000_add_safe_apkg_uuid_question_updates.sql

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1, true);
insert into public.questions values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, true, 'Antes', 'Certo', 'J1', 'T', 'A', 'L', '1.1', 1, 'U', 77, now());

select public.admin_apply_apkg_uuid_question_updates(1,
  '[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","expected":{"pergunta":"Antes","resposta":"Certo","justificativa":"J1","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.1","total_artigos":1,"ultima_alteracao_legislativa":"U"},"proposed":{"pergunta":"Depois","resposta":"Errado","justificativa":"J2","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.2","total_artigos":1,"ultima_alteracao_legislativa":"U"}}]'::jsonb,
  '[]'::jsonb, '11111111-1111-1111-1111-111111111111');

\ir ../rollbacks/20261027120000_add_safe_apkg_uuid_question_updates.rollback.sql

do $$ begin
  if not exists (select 1 from public.questions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and pergunta = 'Depois' and resposta = 'Errado' and structure_id = 77) then
    raise exception 'rollback alterou a questão ou o vínculo estrutural';
  end if;
  if (select count(*) from public.auditoria_administrativa where acao = 'importar_apkg_uuid') <> 1 then
    raise exception 'rollback alterou a auditoria';
  end if;
  if to_regprocedure('public.admin_apply_apkg_uuid_question_updates(bigint,jsonb,jsonb,uuid)') is not null then
    raise exception 'rollback não removeu a RPC';
  end if;
end $$;
