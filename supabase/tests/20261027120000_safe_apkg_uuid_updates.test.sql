-- Executável em PostgreSQL descartável:
--   psql -v ON_ERROR_STOP=1 -d legis_test -f supabase/tests/20261027120000_safe_apkg_uuid_updates.test.sql
-- Nada deste arquivo aponta para Supabase. A migration possui BEGIN/COMMIT
-- próprios; por isso o esquema mínimo e a função ficam no banco descartável,
-- enquanto todos os dados/asserções abaixo encerram com ROLLBACK.

create schema if not exists auth;
do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null;
end $$;
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

begin;

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1, true), (2, true);
insert into public.questions values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, true, 'Antes', 'Certo', 'J1', 'T', 'A', 'L', '1.1', 1, 'U', 77, now()),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, true, 'Outra lei', 'Certo', null, null, null, null, '2.1', null, null, 88, now()),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, false, 'Inativa', 'Certo', null, null, null, null, '1.2', null, null, 99, now());
insert into public.legisbot_comentarios values ('L1', '1.9', false);

-- Atualiza somente justificativa/gabarito e Ordem; UUID e structure_id ficam preservados.
select public.admin_apply_apkg_uuid_question_updates(1,
  '[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","expected":{"pergunta":"Antes","resposta":"Certo","justificativa":"J1","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.1","total_artigos":1,"ultima_alteracao_legislativa":"U"},"proposed":{"pergunta":"Antes","resposta":"Errado","justificativa":"J2","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.9","total_artigos":1,"ultima_alteracao_legislativa":"U"}}]'::jsonb,
  '[{"slug":"L1","ordem":"1.9","kind":"estrutural"}]'::jsonb,
  '11111111-1111-1111-1111-111111111111');
do $$ begin
  if not exists (select 1 from public.questions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and resposta = 'Errado' and justificativa = 'J2' and ordem = '1.9' and structure_id = 77) then raise exception 'atualizacao ou preservacao de vinculo falhou'; end if;
  if not exists (select 1 from public.legisbot_comentarios where slug = 'L1' and ordem = '1.9' and precisa_revisao) then raise exception 'aviso editorial nao foi registrado'; end if;
  if (select count(*) from public.auditoria_administrativa where acao = 'importar_apkg_uuid') <> 1 then raise exception 'auditoria ausente'; end if;
end $$;

-- Repetição idempotente não deve alterar estado nem criar uma segunda auditoria;
-- o aplicativo a classifica como ja aplicado e não chama a RPC.
do $$ begin
  if not exists (select 1 from public.questions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and resposta = 'Errado') then raise exception 'estado aplicado nao preservado'; end if;
end $$;

-- Um UUID de outra lei falha e a transação inteira é revertida no savepoint.
savepoint wrong_law;
do $$ begin
  begin
    perform public.admin_apply_apkg_uuid_question_updates(1,
      '[{"id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","expected":{"pergunta":"Outra lei","resposta":"Certo","justificativa":null,"titulo":null,"assunto":null,"legislacao":null,"ordem":"2.1","total_artigos":null,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Outra lei","resposta":"Certo","justificativa":null,"titulo":null,"assunto":null,"legislacao":null,"ordem":"2.1","total_artigos":null,"ultima_alteracao_legislativa":null}}]'::jsonb, '[]'::jsonb,
      '11111111-1111-1111-1111-111111111111');
    raise exception 'UUID de outra lei foi aceito';
  exception when sqlstate '40001' then null;
  end;
end $$;
rollback to savepoint wrong_law;

-- UUID inativo também nunca pode ser tratado como uma inserção nova.
savepoint inactive_uuid;
do $$ begin
  begin
    perform public.admin_apply_apkg_uuid_question_updates(1,
      '[{"id":"cccccccc-cccc-cccc-cccc-cccccccccccc","expected":{"pergunta":"Inativa","resposta":"Certo","justificativa":null,"titulo":null,"assunto":null,"legislacao":null,"ordem":"1.2","total_artigos":null,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Inativa","resposta":"Certo","justificativa":null,"titulo":null,"assunto":null,"legislacao":null,"ordem":"1.2","total_artigos":null,"ultima_alteracao_legislativa":null}}]'::jsonb, '[]'::jsonb,
      '11111111-1111-1111-1111-111111111111');
    raise exception 'UUID inativo foi aceito';
  exception when sqlstate '40001' then null;
  end;
end $$;
rollback to savepoint inactive_uuid;

-- A comparação do snapshot impede sobrescrever edição concorrente.
update public.questions set justificativa = 'editada por outro ator' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
savepoint concurrent_edit;
do $$ begin
  begin
    perform public.admin_apply_apkg_uuid_question_updates(1,
      '[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","expected":{"pergunta":"Antes","resposta":"Errado","justificativa":"J2","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.9","total_artigos":1,"ultima_alteracao_legislativa":"U"},"proposed":{"pergunta":"Depois","resposta":"Errado","justificativa":"J3","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.9","total_artigos":1,"ultima_alteracao_legislativa":"U"}}]'::jsonb,
      '[]'::jsonb, '11111111-1111-1111-1111-111111111111');
    raise exception 'edicao concorrente foi aceita';
  exception when sqlstate '40001' then null;
  end;
end $$;
rollback to savepoint concurrent_edit;

-- Falha de auditoria reverte também a alteração da questão (atomicidade).
create function public.fail_apkg_audit() returns trigger language plpgsql as $$ begin
  if new.detalhes->>'origem' = 'apkg' then raise exception 'auditoria indisponivel'; end if;
  return new;
end $$;
create trigger fail_apkg_audit before insert on public.auditoria_administrativa for each row execute function public.fail_apkg_audit();
savepoint audit_failure;
do $$ declare v_failed boolean := false; begin
  begin
    perform public.admin_apply_apkg_uuid_question_updates(1,
      '[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","expected":{"pergunta":"Antes","resposta":"Errado","justificativa":"editada por outro ator","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.9","total_artigos":1,"ultima_alteracao_legislativa":"U"},"proposed":{"pergunta":"Nao deve persistir","resposta":"Errado","justificativa":"J4","titulo":"T","assunto":"A","legislacao":"L","ordem":"1.9","total_artigos":1,"ultima_alteracao_legislativa":"U"}}]'::jsonb,
      '[]'::jsonb, '11111111-1111-1111-1111-111111111111');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'falha de auditoria foi aceita'; end if;
  if exists (select 1 from public.questions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and pergunta = 'Nao deve persistir') then raise exception 'rollback por falha de auditoria falhou'; end if;
end $$;
rollback to savepoint audit_failure;

rollback;
