\set ON_ERROR_STOP on

begin;

-- O backup public nao inclui o trigger de auth; este stub existe apenas no teste isolado.
create trigger teste_minhas_leis_criar_aluno
  after insert on auth.users
  for each row execute function public.criar_aluno_para_usuario();

insert into auth.users (id, email, raw_user_meta_data) values
  ('51000001-0000-4000-8000-000000000001', 'sem-acesso-minhas-leis@example.invalid', '{"nome":"Sem acesso"}'),
  ('52000002-0000-4000-8000-000000000002', 'aluno-minhas-leis@example.invalid', '{"nome":"Aluno alvo"}'),
  ('53000003-0000-4000-8000-000000000003', 'outro-minhas-leis@example.invalid', '{"nome":"Outro aluno"}');

set local role service_role;

insert into public.leis (slug, titulo, nome_curto, descricao, codigo, categoria, ativo, ordem, thumbnail_url,norma_originaria_referencia,norma_originaria_data,houve_alteracao_legislativa,ultima_alteracao_referencia,ultima_alteracao_data,situacao_atualizacao) values
  ('minhas-leis-b', 'Lei Beta', 'Beta', 'Descricao B', 'B-2', 'Categoria B', true, 2, 'https://example.invalid/b.png','Lei nº 2/2020','2020-02-02',true,'Lei nº 22/2026','2026-08-02','em_revisao'),
  ('minhas-leis-a', 'Lei Alfa', 'Alfa', 'Descricao A', 'A-1', 'Categoria A', true, 1, null,'Lei nº 1/2015','2015-01-01',false,null,null,'atualizado'),
  ('minhas-leis-sem-ativa', 'Lei sem fonte ativa', null, null, 'S-3', 'Categoria S', true, 3, null,null,null,false,null,null,'revisao_pendente'),
  ('minhas-leis-inativa', 'Lei inativa', null, null, 'I-0', 'Categoria I', false, 0, null,null,null,false,null,null,'desatualizado');

insert into public.materiais_leis (lei_id,tipo,titulo,provedor,url_externa,acao,ordem,ativo,quantidade_itens,versao_material,revisado_em,publicado_em,observacao_interna) values
  ((select id from public.leis where slug='minhas-leis-a'),'flashcards','Deck Alfa 1.0','externo','https://private.invalid/alfa-1.apkg','baixar',2,true,100,'1.0','2026-07-01','2026-07-01','interno alfa 1'),
  ((select id from public.leis where slug='minhas-leis-a'),'flashcards','Deck Alfa 1.1','externo','https://private.invalid/alfa-2.apkg','baixar',1,true,50,'1.1','2026-08-01','2026-08-02','interno alfa 2'),
  ((select id from public.leis where slug='minhas-leis-a'),'flashcards','Deck Alfa sem quantidade','externo','https://private.invalid/alfa-null.apkg','baixar',3,true,null,'0.9','2026-06-01','2026-06-01','interno nulo'),
  ((select id from public.leis where slug='minhas-leis-a'),'flashcards','Deck Alfa inativo','externo','https://private.invalid/alfa-inativo.apkg','baixar',0,false,999,'9.9','2026-09-01','2026-09-01','interno inativo'),
  ((select id from public.leis where slug='minhas-leis-a'),'pdf','PDF Alfa','externo','https://private.invalid/alfa.pdf','baixar',0,true,700,'pdf-1','2026-09-02','2026-09-02','interno pdf'),
  ((select id from public.leis where slug='minhas-leis-b'),'flashcards','Deck Beta 4.0','externo','https://private.invalid/beta-1.apkg','baixar',2,true,300,'4.0','2026-08-03',null,'interno beta 1'),
  ((select id from public.leis where slug='minhas-leis-b'),'flashcards','Deck Beta 4.1','externo','https://private.invalid/beta-2.apkg','baixar',1,true,20,'4.1','2026-08-02','2026-08-04','interno beta 2');

insert into public.liberacoes_leis (aluno_id, lei_id, origem, status, revogada_em) values
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-a'), 'cortesia', 'ativo', null),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-a'), 'amostra', 'ativo', null),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-b'), 'premiacao', 'ativo', null),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-b'), 'migracao', 'revogado', pg_catalog.now()),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-sem-ativa'), 'cortesia', 'revogado', pg_catalog.now()),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-sem-ativa'), 'amostra', 'cancelado', null),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-sem-ativa'), 'premiacao', 'reembolsado', null),
  ((select id from public.alunos where user_id='52000002-0000-4000-8000-000000000002'), (select id from public.leis where slug='minhas-leis-inativa'), 'cortesia', 'ativo', null),
  ((select id from public.alunos where user_id='53000003-0000-4000-8000-000000000003'), (select id from public.leis where slug='minhas-leis-sem-ativa'), 'cortesia', 'ativo', null);

reset role;

do $do$
declare
  v_oid oid;
begin
  select p.oid into v_oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='obter_minhas_leis' and p.pronargs=0;
  if v_oid is null then raise exception '01: RPC obter_minhas_leis ausente'; end if;
  if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') then raise exception '02: anon possui EXECUTE'; end if;
  if not pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception '03: authenticated sem EXECUTE'; end if;
  if pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception '04: service_role recebeu EXECUTE desnecessario'; end if;
  if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid) then raise exception '05: RPC nao e SECURITY DEFINER'; end if;
  if (select p.proconfig from pg_catalog.pg_proc p where p.oid=v_oid) is distinct from array['search_path=pg_catalog'] then raise exception '06: search_path inseguro'; end if;
end;
$do$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);

-- Usuario autenticado sem registro em public.alunos.
select pg_catalog.set_config('request.jwt.claim.sub','54000004-0000-4000-8000-000000000004',true);
do $do$ begin
  if (select count(*) from public.obter_minhas_leis())<>0 then raise exception '07: usuario sem aluno recebeu lei'; end if;
end $do$;

-- Aluno existente, mas sem liberacao.
select pg_catalog.set_config('request.jwt.claim.sub','51000001-0000-4000-8000-000000000001',true);
do $do$ begin
  if (select count(*) from public.obter_minhas_leis())<>0 then raise exception '08: aluno sem liberacao recebeu lei'; end if;
end $do$;

-- Aluno alvo: duas leis, consolidadas e ordenadas.
select pg_catalog.set_config('request.jwt.claim.sub','52000002-0000-4000-8000-000000000002',true);
do $do$
declare
  v_rows jsonb;
  v_keys text;
begin
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) order by x.ordem,x.titulo) into v_rows from public.obter_minhas_leis() x;
  if pg_catalog.jsonb_array_length(v_rows)<>2 then raise exception '09: quantidade consolidada incorreta: %',v_rows; end if;
  if v_rows->0->>'slug'<>'minhas-leis-a' or v_rows->1->>'slug'<>'minhas-leis-b' then raise exception '10: ordenacao incorreta: %',v_rows; end if;
  if (v_rows->0->>'fontes_ativas')::integer<>2 then raise exception '11: duas fontes ativas nao foram consolidadas'; end if;
  if (v_rows->1->>'fontes_ativas')::integer<>1 then raise exception '12: fonte revogada foi contada como ativa'; end if;
  if (v_rows->0->>'total_flashcards')::integer<>150 then raise exception '12a: total Alfa nao ignorou inativo, PDF ou quantidade nula: %',v_rows->0; end if;
  if v_rows->0->>'versao_material'<>'1.1' or v_rows->0->>'revisado_em'<>'2026-08-01' or v_rows->0->>'publicado_em'<>'2026-08-02' then raise exception '12b: versao vigente Alfa nao foi deterministica: %',v_rows->0; end if;
  if v_rows->0->>'situacao_atualizacao'<>'atualizado' or (v_rows->0->>'houve_alteracao_legislativa')::boolean then raise exception '12c: situacao Alfa invalida'; end if;
  if v_rows->0->>'referencia_normativa_atual'<>'Lei nº 1/2015' or v_rows->0->>'tipo_referencia_normativa'<>'originaria' then raise exception '12d: norma originaria Alfa invalida'; end if;
  if (v_rows->1->>'total_flashcards')::integer<>320 or v_rows->1->>'versao_material'<>'4.1' or v_rows->1->>'publicado_em'<>'2026-08-04' then raise exception '12e: resumo Beta invalido: %',v_rows->1; end if;
  if v_rows->1->>'situacao_atualizacao'<>'em_revisao' or not (v_rows->1->>'houve_alteracao_legislativa')::boolean then raise exception '12f: situacao Beta invalida'; end if;
  if v_rows->1->>'referencia_normativa_atual'<>'Lei nº 22/2026' or v_rows->1->>'tipo_referencia_normativa'<>'alteracao' then raise exception '12g: ultima alteracao Beta invalida'; end if;
  if v_rows::text like '%minhas-leis-sem-ativa%' then raise exception '13: status inativo concedeu acesso'; end if;
  if v_rows::text like '%minhas-leis-inativa%' then raise exception '14: lei inativa foi retornada'; end if;
  select pg_catalog.string_agg(key,',' order by key) into v_keys from pg_catalog.jsonb_object_keys(v_rows->0) key;
  if v_keys <> 'categoria,codigo,descricao,fontes_ativas,houve_alteracao_legislativa,id,nome_curto,ordem,publicado_em,referencia_normativa_atual,revisado_em,situacao_atualizacao,slug,thumbnail_url,tipo_referencia_normativa,titulo,total_flashcards,versao_material' then raise exception '15: campos inesperados: %',v_keys; end if;
  if v_rows::text ~ '(compra_id|produto_id|administrador|motivo|identificador_externo|url_externa|observacao_interna|historico_atualizacoes_leis|email|private.invalid|interno alfa)' then raise exception '16: dado administrativo exposto'; end if;
end;
$do$;

-- Outro aluno enxerga somente a propria liberacao, nunca as leis do alvo.
select pg_catalog.set_config('request.jwt.claim.sub','53000003-0000-4000-8000-000000000003',true);
do $do$ begin
  if (select count(*) from public.obter_minhas_leis())<>1
    or not exists(select 1 from public.obter_minhas_leis() where slug='minhas-leis-sem-ativa')
    or exists(select 1 from public.obter_minhas_leis() where slug in ('minhas-leis-a','minhas-leis-b')) then
    raise exception '17: isolamento entre alunos falhou';
  end if;
  if not exists(select 1 from public.obter_minhas_leis() where slug='minhas-leis-sem-ativa' and total_flashcards=0 and versao_material is null and revisado_em is null and publicado_em is null and referencia_normativa_atual is null and tipo_referencia_normativa='originaria') then
    raise exception '17a: fallbacks sem material ou norma invalidos';
  end if;
end $do$;

rollback;

do $do$ begin
  if exists(select 1 from public.leis where slug like 'minhas-leis-%')
    or exists(select 1 from auth.users where id::text like '5%00000%') then
    raise exception '18: residuos sinteticos permaneceram';
  end if;
end $do$;

select 'student_acquired_laws: cenarios editoriais e de seguranca aprovados' as resultado;
