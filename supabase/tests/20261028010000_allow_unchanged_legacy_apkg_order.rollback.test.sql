-- Confirma que o rollback restaura a rejeição estrita sem tocar dados.
create schema if not exists auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table auth.users (id uuid primary key);
create table public.leis (id bigint primary key, ativo boolean not null);
create table public.questions (id uuid primary key, lei_id bigint not null, ativo boolean not null, pergunta text not null, resposta text not null, justificativa text, titulo text, assunto text, legislacao text, ordem text not null, total_artigos integer, ultima_alteracao_legislativa text, structure_id bigint, updated_at timestamptz not null default now());
create table public.legisbot_comentarios (slug text, ordem text, precisa_revisao boolean not null default false);
create table public.auditoria_administrativa (ator_user_id uuid, acao text, entidade text, entidade_id text, estado_anterior jsonb, estado_posterior jsonb, detalhes jsonb);
\ir ../migrations/20261027120000_add_safe_apkg_uuid_question_updates.sql
\ir ../migrations/20261028010000_allow_unchanged_legacy_apkg_order.sql
\ir ../rollbacks/20261028010000_allow_unchanged_legacy_apkg_order.rollback.sql
begin;
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1,true);
insert into public.questions values ('b636cb14-ba82-4fc3-9b6b-cd1910032803',1,true,'Questao cloze','Certo','J','LAI','Art. 4º, V','Art. 4º','Lei de Acesso à Informação',126,null,777,now());
do $$ begin begin
 perform public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,'[]'::jsonb,'11111111-1111-1111-1111-111111111111');
 raise exception 'rollback não restaurou contrato estrito'; exception when sqlstate '22023' then null; end; end $$;
rollback;
