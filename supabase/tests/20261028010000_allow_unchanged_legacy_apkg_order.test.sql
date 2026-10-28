-- Executar apenas em PostgreSQL descartavel. Cobre o UUID legado real de LAI.
create schema if not exists auth;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table auth.users (id uuid primary key);
create table public.leis (id bigint primary key, ativo boolean not null);
create table public.questions (id uuid primary key, lei_id bigint not null references public.leis(id), ativo boolean not null, pergunta text not null, resposta text not null, justificativa text, titulo text, assunto text, legislacao text, ordem text not null, total_artigos integer, ultima_alteracao_legislativa text, structure_id bigint, updated_at timestamptz not null default now());
create table public.legisbot_comentarios (slug text, ordem text, precisa_revisao boolean not null default false);
create table public.auditoria_administrativa (ator_user_id uuid, acao text, entidade text, entidade_id text, estado_anterior jsonb, estado_posterior jsonb, detalhes jsonb);
\ir ../migrations/20261027120000_add_safe_apkg_uuid_question_updates.sql
\ir ../migrations/20261028010000_allow_unchanged_legacy_apkg_order.sql

begin;
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1,true);
insert into public.questions values ('b636cb14-ba82-4fc3-9b6b-cd1910032803',1,true,'Questao cloze','Certo','J','LAI','Art. 4º, V','Art. 4º','Lei de Acesso à Informação',126,null,777,now());

-- Ordem legada idêntica ao snapshot: corrige apenas Assunto e preserva vínculo.
select public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,
 '[]'::jsonb, '11111111-1111-1111-1111-111111111111');
do $$ begin
 if not exists (select 1 from public.questions where id='b636cb14-ba82-4fc3-9b6b-cd1910032803' and assunto='Art. 4º, inciso V' and ordem='Lei de Acesso à Informação' and structure_id=777) then raise exception 'legado imutavel nao preservado'; end if;
 if (select count(*) from public.auditoria_administrativa where acao='importar_apkg_uuid') <> 1 then raise exception 'auditoria ausente'; end if;
end $$;

-- Tentar trocar a Ordem legada por outra inválida continua proibido.
savepoint invalid_changed_order;
do $$ begin begin
 perform public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"Outra Ordem inválida","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,'[]'::jsonb,'11111111-1111-1111-1111-111111111111');
 raise exception 'troca inválida de Ordem foi aceita'; exception when sqlstate '22023' then null; end; end $$;
rollback to savepoint invalid_changed_order;

-- Uma Ordem nova válida continua permitida.
select public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"Lei de Acesso à Informação","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"0004.0.01.0.05","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,'[]'::jsonb,'11111111-1111-1111-1111-111111111111');

-- Snapshot concorrente não é ignorado pela exceção legada.
update public.questions set assunto='Edição concorrente' where id='b636cb14-ba82-4fc3-9b6b-cd1910032803';
savepoint concurrent_edit;
do $$ begin begin
 perform public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Art. 4º, inciso V","legislacao":"Art. 4º","ordem":"0004.0.01.0.05","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Nova alteração","legislacao":"Art. 4º","ordem":"0004.0.01.0.05","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,'[]'::jsonb,'11111111-1111-1111-1111-111111111111');
 raise exception 'edicao concorrente foi aceita'; exception when sqlstate '40001' then null; end; end $$;
rollback to savepoint concurrent_edit;

-- Falha da auditoria mantém atomicidade.
create function public.fail_legacy_apkg_audit() returns trigger language plpgsql as $$ begin if new.detalhes->>'origem'='apkg' then raise exception 'auditoria indisponivel'; end if; return new; end $$;
create trigger fail_legacy_apkg_audit before insert on public.auditoria_administrativa for each row execute function public.fail_legacy_apkg_audit();
savepoint audit_failure;
do $$ begin begin
 perform public.admin_apply_apkg_uuid_question_updates(1,
 '[{"id":"b636cb14-ba82-4fc3-9b6b-cd1910032803","expected":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Edição concorrente","legislacao":"Art. 4º","ordem":"0004.0.01.0.05","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao cloze","resposta":"Certo","justificativa":"J","titulo":"LAI","assunto":"Não deve persistir","legislacao":"Art. 4º","ordem":"0004.0.01.0.05","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,'[]'::jsonb,'11111111-1111-1111-1111-111111111111');
 raise exception 'falha de auditoria foi aceita'; exception when others then null; end; end $$;
do $$ begin
 if exists (select 1 from public.questions where id='b636cb14-ba82-4fc3-9b6b-cd1910032803' and assunto='Não deve persistir') then raise exception 'rollback de auditoria falhou'; end if;
end $$;
rollback to savepoint audit_failure;
rollback;
