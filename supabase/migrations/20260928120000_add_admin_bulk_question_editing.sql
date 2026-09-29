begin;

-- A edição em lote fica no banco para que a conferência da prévia, a atualização
-- e a auditoria sejam uma única transação. A função não é exposta a clientes.
create or replace function public.admin_bulk_update_law_questions(
  p_lei_id bigint,
  p_question_ids uuid[],
  p_field text,
  p_value jsonb,
  p_expected jsonb,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_text text;
  v_integer integer;
  v_structure_id bigint;
  v_before jsonb := '[]'::jsonb;
  v_after jsonb := '[]'::jsonb;
  v_changed integer := 0;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users u where u.id = p_actor_user_id) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode = '42501';
  end if;
  if p_field not in ('structure_id','pergunta','resposta','justificativa','assunto','legislacao','ordem','titulo','total_artigos','capitulo','secao','subsecao','artigo') then
    raise exception 'Campo nao permitido para edicao em lote.' using errcode = '22023';
  end if;
  if p_question_ids is null or pg_catalog.cardinality(p_question_ids) = 0 or p_expected is null or pg_catalog.jsonb_typeof(p_expected) <> 'array' then
    raise exception 'Previa de edicao em lote obrigatoria.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  if not exists (select 1 from public.leis l where l.id = p_lei_id) then
    raise exception 'Lei nao encontrada.' using errcode = 'P0002';
  end if;
  lock table public.questions in share row exclusive mode;

  select coalesce(pg_catalog.array_agg(q.id order by q.id), '{}'::uuid[])
    into v_ids
    from public.questions q
   where q.lei_id = p_lei_id and q.ativo and q.id = any(p_question_ids);
  if pg_catalog.cardinality(v_ids) <> pg_catalog.cardinality(p_question_ids)
    or pg_catalog.cardinality(v_ids) <> (select count(*) from pg_catalog.jsonb_array_elements(p_expected)) then
    raise exception 'A selecao mudou ou contem questao de outra lei. Gere uma nova previa.' using errcode = '40001';
  end if;
  if exists (
    select 1
      from public.questions q
      join pg_catalog.jsonb_to_recordset(p_expected) as e(id uuid, before jsonb) on e.id = q.id
     where q.id = any(v_ids)
       and coalesce((case p_field
          when 'structure_id' then pg_catalog.to_jsonb(q.structure_id)
          when 'pergunta' then pg_catalog.to_jsonb(q.pergunta)
          when 'resposta' then pg_catalog.to_jsonb(q.resposta)
          when 'justificativa' then pg_catalog.to_jsonb(q.justificativa)
          when 'assunto' then pg_catalog.to_jsonb(q.assunto)
          when 'legislacao' then pg_catalog.to_jsonb(q.legislacao)
          when 'ordem' then pg_catalog.to_jsonb(q.ordem)
          when 'titulo' then pg_catalog.to_jsonb(q.titulo)
          when 'total_artigos' then pg_catalog.to_jsonb(q.total_artigos)
          when 'capitulo' then pg_catalog.to_jsonb(q.capitulo)
          when 'secao' then pg_catalog.to_jsonb(q.secao)
          when 'subsecao' then pg_catalog.to_jsonb(q.subsecao)
          when 'artigo' then pg_catalog.to_jsonb(q.artigo)
        end), 'null'::jsonb) is distinct from e.before
  ) then
    raise exception 'As questoes foram alteradas desde a previa. Gere uma nova previa.' using errcode = '40001';
  end if;

  if p_field in ('structure_id','total_artigos') then
    if p_value is null or pg_catalog.jsonb_typeof(p_value) = 'null' then
      v_integer := null;
    elsif pg_catalog.jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]+$' then
      v_integer := (p_value #>> '{}')::integer;
    else
      raise exception 'Valor numerico invalido.' using errcode = '22023';
    end if;
    if v_integer is not null and v_integer < 0 then raise exception 'Valor numerico invalido.' using errcode = '22023'; end if;
    if p_field = 'structure_id' then
      v_structure_id := v_integer;
      if v_structure_id is not null and not exists (select 1 from public.law_structure s where s.id = v_structure_id and s.lei_id = p_lei_id and s.ativo) then
        raise exception 'A estrutura selecionada nao pertence a esta lei.' using errcode = '23503';
      end if;
    end if;
  else
    if p_value is null or pg_catalog.jsonb_typeof(p_value) = 'null' then
      if p_field in ('pergunta','resposta','ordem') then raise exception 'Este campo nao pode ficar vazio.' using errcode = '22023'; end if;
      v_text := null;
    elsif pg_catalog.jsonb_typeof(p_value) = 'string' then
      v_text := nullif(pg_catalog.btrim(p_value #>> '{}'), '');
    else
      raise exception 'Valor textual invalido.' using errcode = '22023';
    end if;
    if p_field in ('pergunta','resposta','ordem') and v_text is null then raise exception 'Este campo nao pode ficar vazio.' using errcode = '22023'; end if;
    if p_field = 'pergunta' and pg_catalog.length(v_text) > 12000 then raise exception 'Pergunta excede o limite permitido.' using errcode = '22023'; end if;
    if p_field in ('justificativa','legislacao') and v_text is not null and pg_catalog.length(v_text) > 12000 then raise exception 'Conteudo excede o limite permitido.' using errcode = '22023'; end if;
    if p_field in ('assunto','titulo','capitulo','secao','subsecao','artigo') and v_text is not null and pg_catalog.length(v_text) > 500 then raise exception 'Texto excede o limite permitido.' using errcode = '22023'; end if;
    if p_field = 'resposta' and v_text not in ('Certo','Errado') then raise exception 'Resposta deve ser Certo ou Errado.' using errcode = '22023'; end if;
    if p_field = 'ordem' and v_text !~ '^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$' then raise exception 'Ordem invalida.' using errcode = '22023'; end if;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'before', case p_field
    when 'structure_id' then pg_catalog.to_jsonb(q.structure_id) when 'pergunta' then pg_catalog.to_jsonb(q.pergunta) when 'resposta' then pg_catalog.to_jsonb(q.resposta) when 'justificativa' then pg_catalog.to_jsonb(q.justificativa) when 'assunto' then pg_catalog.to_jsonb(q.assunto) when 'legislacao' then pg_catalog.to_jsonb(q.legislacao) when 'ordem' then pg_catalog.to_jsonb(q.ordem) when 'titulo' then pg_catalog.to_jsonb(q.titulo) when 'total_artigos' then pg_catalog.to_jsonb(q.total_artigos) when 'capitulo' then pg_catalog.to_jsonb(q.capitulo) when 'secao' then pg_catalog.to_jsonb(q.secao) when 'subsecao' then pg_catalog.to_jsonb(q.subsecao) when 'artigo' then pg_catalog.to_jsonb(q.artigo) end) order by q.id), '[]'::jsonb)
    into v_before from public.questions q where q.id = any(v_ids);

  update public.questions q set
    structure_id = case when p_field = 'structure_id' then v_structure_id else q.structure_id end,
    pergunta = case when p_field = 'pergunta' then v_text else q.pergunta end,
    resposta = case when p_field = 'resposta' then v_text else q.resposta end,
    justificativa = case when p_field = 'justificativa' then v_text else q.justificativa end,
    assunto = case when p_field = 'assunto' then v_text else q.assunto end,
    legislacao = case when p_field = 'legislacao' then v_text else q.legislacao end,
    ordem = case when p_field = 'ordem' then v_text else q.ordem end,
    titulo = case when p_field = 'titulo' then v_text else q.titulo end,
    total_artigos = case when p_field = 'total_artigos' then v_integer else q.total_artigos end,
    capitulo = case when p_field = 'capitulo' then v_text else q.capitulo end,
    secao = case when p_field = 'secao' then v_text else q.secao end,
    subsecao = case when p_field = 'subsecao' then v_text else q.subsecao end,
    artigo = case when p_field = 'artigo' then v_text else q.artigo end,
    updated_at = pg_catalog.now()
   where q.id = any(v_ids)
     and (case p_field
       when 'structure_id' then q.structure_id is distinct from v_structure_id
       when 'total_artigos' then q.total_artigos is distinct from v_integer
       else (case p_field when 'pergunta' then q.pergunta when 'resposta' then q.resposta when 'justificativa' then q.justificativa when 'assunto' then q.assunto when 'legislacao' then q.legislacao when 'ordem' then q.ordem when 'titulo' then q.titulo when 'capitulo' then q.capitulo when 'secao' then q.secao when 'subsecao' then q.subsecao when 'artigo' then q.artigo end) is distinct from v_text
     end);
  get diagnostics v_changed = row_count;

  if p_field in ('pergunta','ordem') and exists (select 1 from public.questions q join public.questions other on other.lei_id = q.lei_id and other.ativo and other.id <> q.id and other.ordem = q.ordem and other.pergunta = q.pergunta where q.id = any(v_ids)) then
    raise exception 'A alteracao criaria questoes duplicadas nesta lei.' using errcode = '23505';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'after', case p_field
    when 'structure_id' then pg_catalog.to_jsonb(q.structure_id) when 'pergunta' then pg_catalog.to_jsonb(q.pergunta) when 'resposta' then pg_catalog.to_jsonb(q.resposta) when 'justificativa' then pg_catalog.to_jsonb(q.justificativa) when 'assunto' then pg_catalog.to_jsonb(q.assunto) when 'legislacao' then pg_catalog.to_jsonb(q.legislacao) when 'ordem' then pg_catalog.to_jsonb(q.ordem) when 'titulo' then pg_catalog.to_jsonb(q.titulo) when 'total_artigos' then pg_catalog.to_jsonb(q.total_artigos) when 'capitulo' then pg_catalog.to_jsonb(q.capitulo) when 'secao' then pg_catalog.to_jsonb(q.secao) when 'subsecao' then pg_catalog.to_jsonb(q.subsecao) when 'artigo' then pg_catalog.to_jsonb(q.artigo) end) order by q.id), '[]'::jsonb)
    into v_after from public.questions q where q.id = any(v_ids);

  insert into public.auditoria_administrativa(ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values (p_actor_user_id, 'editar_lote', 'questao', p_lei_id::text, v_before, v_after, pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'campo', p_field, 'selecionadas', pg_catalog.cardinality(v_ids), 'alteradas', v_changed));

  return pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'field', p_field, 'selected_count', pg_catalog.cardinality(v_ids), 'changed_count', v_changed);
end;
$function$;

revoke all on function public.admin_bulk_update_law_questions(bigint,uuid[],text,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.admin_bulk_update_law_questions(bigint,uuid[],text,jsonb,jsonb,uuid) to service_role;

commit;
