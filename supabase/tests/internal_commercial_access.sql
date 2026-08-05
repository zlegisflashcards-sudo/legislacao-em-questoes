\set ON_ERROR_STOP on

begin;

-- O dump public nao inclui triggers de auth; este stub existe apenas no teste local.
create trigger teste_criar_aluno_para_usuario
  after insert on auth.users
  for each row execute function public.criar_aluno_para_usuario();

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000001-0000-4000-8000-000000000001', 'admin-teste-local@example.invalid', '{"nome":"Admin local"}'),
  ('20000002-0000-4000-8000-000000000002', 'aluno-teste-local@example.invalid', '{"nome":"Aluno local"}');

do $do$
begin
  if not exists (
    select 1 from public.alunos
    where user_id = '20000002-0000-4000-8000-000000000002'
      and email = 'aluno-teste-local@example.invalid'
  ) then
    raise exception 'O trigger de criacao de aluno nao funcionou.';
  end if;
end;
$do$;

set local role service_role;

insert into public.leis (slug, titulo, nome_curto, categoria, ordem) values
  ('lei-teste-local-a', 'Lei teste local A', 'Lei A', 'teste', 1),
  ('lei-teste-local-b', 'Lei teste local B', 'Lei B', 'teste', 2);

insert into public.materiais_leis (
  lei_id, tipo, titulo, provedor, url_externa, acao, ordem
) values (
  (select id from public.leis where slug = 'lei-teste-local-a'),
  'flashcards',
  'Pasta de flashcards local',
  'google_drive',
  'https://drive.google.com/drive/folders/teste-local-sem-acesso',
  'abrir',
  1
);

insert into public.produtos (
  id, nome, tipo, hotmart_product_id, slug, tipo_produto, ordem
) values (
  '00000000-0000-4000-8000-000000000003',
  'Produto teste local',
  'combo',
  null,
  'produto-teste-local',
  'combo',
  1
);

insert into public.produto_leis (produto_id, lei_id, ordem)
select
  '00000000-0000-4000-8000-000000000003',
  id,
  ordem
from public.leis
where slug in ('lei-teste-local-a', 'lei-teste-local-b');

insert into public.compras (
  id,
  aluno_id,
  produto_id,
  hotmart_product_id,
  status,
  origem,
  identificador_externo,
  status_acesso,
  adquirida_em,
  administrador_user_id
) values (
  '00000000-0000-4000-8000-000000000004',
  (select id from public.alunos where user_id = '20000002-0000-4000-8000-000000000002'),
  '00000000-0000-4000-8000-000000000003',
  null,
  'manual',
  'cortesia',
  'teste-local-aquisicao',
  'ativo',
  pg_catalog.now(),
  '10000001-0000-4000-8000-000000000001'
);

insert into public.liberacoes_leis (
  aluno_id, lei_id, compra_id, produto_id, origem, status, concedida_por
)
select
  (select id from public.alunos where user_id = '20000002-0000-4000-8000-000000000002'),
  lei.id,
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  'produto',
  'ativo',
  '10000001-0000-4000-8000-000000000001'
from public.leis as lei
where lei.slug in ('lei-teste-local-a', 'lei-teste-local-b');

insert into public.liberacoes_leis (
  aluno_id, lei_id, origem, status, motivo, concedida_por
) values (
  (select id from public.alunos where user_id = '20000002-0000-4000-8000-000000000002'),
  (select id from public.leis where slug = 'lei-teste-local-a'),
  'cortesia',
  'ativo',
  'Segunda fonte sintetica',
  '10000001-0000-4000-8000-000000000001'
);

insert into public.auditoria_administrativa (
  ator_user_id, acao, entidade, entidade_id, detalhes
) values (
  '10000001-0000-4000-8000-000000000001',
  'teste_estrutural',
  'compra',
  '00000000-0000-4000-8000-000000000004',
  '{"sintetico":true}'
);

reset role;

do $do$
declare
  aluno_teste uuid;
  lei_a bigint;
  total integer;
begin
  select id into aluno_teste from public.alunos
  where user_id = '20000002-0000-4000-8000-000000000002';
  select id into lei_a from public.leis where slug = 'lei-teste-local-a';

  select count(*) into total from public.produto_leis
  where produto_id = '00000000-0000-4000-8000-000000000003';
  if total <> 2 then raise exception 'Produto nao foi ligado a duas leis.'; end if;

  select count(*) into total from public.acessos_efetivos_leis
  where aluno_id = aluno_teste;
  if total <> 2 then raise exception 'Acesso efetivo inicial incorreto: %.', total; end if;

  begin
    insert into public.liberacoes_leis (
      aluno_id, lei_id, compra_id, produto_id, origem, status
    ) values (
      aluno_teste,
      lei_a,
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003',
      'produto',
      'ativo'
    );
    raise exception 'Duplicidade compra + lei foi aceita.';
  exception when unique_violation then null;
  end;

  begin
    insert into public.liberacoes_leis (aluno_id, lei_id, origem, status)
    values (aluno_teste, lei_a, 'cortesia', 'ativo');
    raise exception 'Duplicidade individual ativa foi aceita.';
  exception when unique_violation then null;
  end;

  begin
    insert into public.liberacoes_leis (aluno_id, lei_id, origem, status)
    values (aluno_teste, lei_a, 'administrativo', 'revogado');
    raise exception 'Revogacao sem timestamp foi aceita.';
  exception when check_violation then null;
  end;
end;
$do$;

update public.liberacoes_leis
set status = 'revogado',
    revogada_em = pg_catalog.now(),
    revogada_por = '10000001-0000-4000-8000-000000000001'
where compra_id = '00000000-0000-4000-8000-000000000004'
  and lei_id = (select id from public.leis where slug = 'lei-teste-local-a');

do $do$
begin
  if not exists (
    select 1 from public.acessos_efetivos_leis
    where aluno_id = (
      select id from public.alunos
      where user_id = '20000002-0000-4000-8000-000000000002'
    )
      and lei_id = (select id from public.leis where slug = 'lei-teste-local-a')
  ) then
    raise exception 'A segunda fonte nao manteve o acesso.';
  end if;
end;
$do$;

update public.liberacoes_leis
set status = 'revogado',
    revogada_em = pg_catalog.now(),
    revogada_por = '10000001-0000-4000-8000-000000000001'
where compra_id is null
  and produto_id is null
  and origem = 'cortesia'
  and lei_id = (select id from public.leis where slug = 'lei-teste-local-a');

do $do$
begin
  if exists (
    select 1 from public.acessos_efetivos_leis
    where aluno_id = (
      select id from public.alunos
      where user_id = '20000002-0000-4000-8000-000000000002'
    )
      and lei_id = (select id from public.leis where slug = 'lei-teste-local-a')
  ) then
    raise exception 'Acesso permaneceu apos revogar todas as fontes.';
  end if;
end;
$do$;

update public.compras
set status_acesso = 'cancelado', cancelada_em = pg_catalog.now()
where id = '00000000-0000-4000-8000-000000000004';

update public.liberacoes_leis
set status = 'cancelado'
where compra_id = '00000000-0000-4000-8000-000000000004'
  and status = 'ativo';

update public.compras
set status_acesso = 'reembolsado', reembolsada_em = pg_catalog.now()
where id = '00000000-0000-4000-8000-000000000004';

update public.liberacoes_leis
set status = 'reembolsado'
where compra_id = '00000000-0000-4000-8000-000000000004'
  and status = 'cancelado';

do $do$
begin
  if (select count(*) from public.liberacoes_leis
      where compra_id = '00000000-0000-4000-8000-000000000004') <> 2 then
    raise exception 'Historico de liberacoes foi apagado.';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.leis', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.leis', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.liberacoes_leis', 'insert')
     or pg_catalog.has_table_privilege('anon', 'public.materiais_leis', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'public.materiais_leis', 'select') then
    raise exception 'Anon/authenticated recebeu privilegio indevido.';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.leis', 'select,insert,update,delete') then
    raise exception 'service_role sem privilegios administrativos.';
  end if;

  if pg_catalog.has_table_privilege('service_role', 'public.auditoria_administrativa', 'update')
     or pg_catalog.has_table_privilege('service_role', 'public.auditoria_administrativa', 'delete')
     or not pg_catalog.has_table_privilege('service_role', 'public.auditoria_administrativa', 'select,insert') then
    raise exception 'Auditoria nao esta append-only para service_role.';
  end if;
end;
$do$;

delete from auth.users where id = '20000002-0000-4000-8000-000000000002';

do $do$
begin
  if not exists (
    select 1 from public.alunos
    where email = 'aluno-teste-local@example.invalid'
      and user_id is null
  ) then
    raise exception 'Exclusao Auth apagou ou nao desvinculou o historico do aluno.';
  end if;
end;
$do$;

rollback;

do $do$
begin
  if exists (select 1 from public.leis where slug like '%teste-local%')
     or exists (select 1 from public.produtos where id = '00000000-0000-4000-8000-000000000003')
     or exists (select 1 from public.compras where id = '00000000-0000-4000-8000-000000000004')
     or exists (select 1 from auth.users where id in (
       '10000001-0000-4000-8000-000000000001',
       '20000002-0000-4000-8000-000000000002'
     )) then
    raise exception 'Dados sinteticos permaneceram apos rollback.';
  end if;
end;
$do$;

select 'testes_funcionais_concluidos' as resultado;
