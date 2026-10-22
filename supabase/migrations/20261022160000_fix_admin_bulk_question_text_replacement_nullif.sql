begin;

-- NULLIF é sintaxe SQL, não uma função exposta em pg_catalog. Recria somente
-- a RPC recém-adicionada com a forma válida, preservando toda a lógica anterior.
do $block$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.admin_bulk_replace_law_question_text(bigint,uuid[],text,text,text,jsonb,uuid)'::pg_catalog.regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'A funcao de substituicao em lote nao foi encontrada.' using errcode = 'P0002';
  end if;
  if pg_catalog.strpos(v_definition, 'pg_catalog.nullif(') = 0 then
    raise exception 'A funcao de substituicao em lote nao contem a definicao esperada.' using errcode = 'P0001';
  end if;
  execute pg_catalog.replace(v_definition, 'pg_catalog.nullif(', 'nullif(');
end;
$block$;

commit;
