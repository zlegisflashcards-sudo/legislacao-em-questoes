-- PostgreSQL descartavel: 124 atualizacoes UUID validas nao possuem limite
-- especial. Exercita o mesmo contrato de nove campos usado pelo APKG.
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
\ir ../migrations/20261027120000_add_safe_apkg_uuid_question_updates.sql

begin;
insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into public.leis values (1, true);
insert into public.questions (id, lei_id, ativo, pergunta, resposta, justificativa, titulo, assunto, legislacao, ordem, total_artigos, ultima_alteracao_legislativa, structure_id)
select ('00000000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid, 1, true,
  'Questao ' || item, 'Certo', 'Justificativa original', 'LAI', 'Assunto original', 'Art. 1',
  '0001.0.00.' || item, 126, null, 900000 + item
from generate_series(1, 124) item;

with updates as (
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'expected', jsonb_build_object(
      'pergunta', pergunta, 'resposta', resposta, 'justificativa', justificativa,
      'titulo', titulo, 'assunto', assunto, 'legislacao', legislacao, 'ordem', ordem,
      'total_artigos', total_artigos, 'ultima_alteracao_legislativa', ultima_alteracao_legislativa
    ),
    'proposed', jsonb_build_object(
      'pergunta', pergunta, 'resposta', case when ordem = '0001.0.00.124' then 'Errado' else resposta end,
      'justificativa', case when ordem = '0001.0.00.122' then 'Justificativa revisada' else justificativa end,
      'titulo', titulo, 'assunto', case when ordem = '0001.0.00.123' then 'Assunto revisado' else assunto end,
      'legislacao', legislacao,
      'ordem', case when ordem in ('0001.0.00.122', '0001.0.00.123', '0001.0.00.124') then ordem else replace(ordem, '.00.', '.01.') end,
      'total_artigos', total_artigos, 'ultima_alteracao_legislativa', ultima_alteracao_legislativa
    )
  ) order by id) payload
  from public.questions
)
select public.admin_apply_apkg_uuid_question_updates(1, payload, '[]'::jsonb, '11111111-1111-1111-1111-111111111111') from updates;

do $$ begin
  if (select count(*) from public.questions) <> 124 then raise exception 'o lote alterou a cardinalidade'; end if;
  if (select count(*) from public.questions where ordem like '0001.0.01.%') <> 121 then raise exception 'as 121 Ordens nao foram atualizadas'; end if;
  if not exists (select 1 from public.questions where ordem = '0001.0.00.122' and justificativa = 'Justificativa revisada' and structure_id = 900122) then raise exception 'justificativa ou vinculo nao preservados'; end if;
  if not exists (select 1 from public.questions where ordem = '0001.0.00.123' and assunto = 'Assunto revisado' and structure_id = 900123) then raise exception 'assunto ou vinculo nao preservados'; end if;
  if not exists (select 1 from public.questions where ordem = '0001.0.00.124' and resposta = 'Errado' and structure_id = 900124) then raise exception 'gabarito ou vinculo nao preservados'; end if;
  if (select count(*) from public.auditoria_administrativa where acao = 'importar_apkg_uuid') <> 1 then raise exception 'auditoria do lote ausente'; end if;
end $$;

-- A RPC antiga devolve a mensagem generica para Ordem fora do contrato; a
-- aplicacao agora antecipa este caso na previa, com linha/campo identificados.
savepoint invalid_order;
do $$ begin
  begin
    perform public.admin_apply_apkg_uuid_question_updates(1,
      '[{"id":"00000000-0000-4000-8000-000000000001","expected":{"pergunta":"Questao 1","resposta":"Certo","justificativa":"Justificativa original","titulo":"LAI","assunto":"Assunto original","legislacao":"Art. 1","ordem":"0001.0.01.1","total_artigos":126,"ultima_alteracao_legislativa":null},"proposed":{"pergunta":"Questao 1","resposta":"Certo","justificativa":"Justificativa original","titulo":"LAI","assunto":"Assunto original","legislacao":"Art. 1","ordem":"0001.0.01-A","total_artigos":126,"ultima_alteracao_legislativa":null}}]'::jsonb,
      '[]'::jsonb, '11111111-1111-1111-1111-111111111111');
    raise exception 'Ordem fora do contrato foi aceita';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback to savepoint invalid_order;
rollback;
