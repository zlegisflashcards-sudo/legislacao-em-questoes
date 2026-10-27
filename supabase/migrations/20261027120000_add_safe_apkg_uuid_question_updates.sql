-- Atualizações vindas de APKG exportado pelo LegisFlashcards.
-- A função é deliberadamente separada da inserção de notas novas: UUID nunca
-- pode cair no caminho de INSERT, e a confirmação é atômica para o lote.
begin;

create or replace function public.admin_apply_apkg_uuid_question_updates(
  p_lei_id bigint,
  p_updates jsonb,
  p_review_conflicts jsonb,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_count integer;
begin
  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode = '42501';
  end if;
  if p_updates is null or pg_catalog.jsonb_typeof(p_updates) <> 'array' or pg_catalog.jsonb_array_length(p_updates) = 0 then
    raise exception 'A previa de atualizacao e obrigatoria.' using errcode = '22023';
  end if;
  if p_review_conflicts is null or pg_catalog.jsonb_typeof(p_review_conflicts) <> 'array' then
    raise exception 'Avisos editoriais invalidos.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb)
    where pg_catalog.jsonb_typeof(u.expected) <> 'object' or pg_catalog.jsonb_typeof(u.proposed) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(u.expected)) <> 9
      or (select count(*) from pg_catalog.jsonb_object_keys(u.proposed)) <> 9
      or not (u.expected ?& array['pergunta','resposta','justificativa','titulo','assunto','legislacao','ordem','total_artigos','ultima_alteracao_legislativa'])
      or not (u.proposed ?& array['pergunta','resposta','justificativa','titulo','assunto','legislacao','ordem','total_artigos','ultima_alteracao_legislativa'])
      or pg_catalog.jsonb_typeof(u.proposed->'pergunta') <> 'string' or coalesce(u.proposed->>'pergunta', '') = ''
      or u.proposed->>'resposta' not in ('Certo', 'Errado')
      or pg_catalog.jsonb_typeof(u.proposed->'ordem') <> 'string' or coalesce(u.proposed->>'ordem', '') !~ '^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$'
      or (u.proposed->'total_artigos' is not null and pg_catalog.jsonb_typeof(u.proposed->'total_artigos') not in ('number','null'))
  ) then
    raise exception 'Previa de atualizacao invalida.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  lock table public.questions in share row exclusive mode;
  if not exists (select 1 from public.leis where id = p_lei_id and ativo) then
    raise exception 'Lei ativa nao encontrada.' using errcode = 'P0002';
  end if;

  -- ID repetido, UUID desconhecido, de outra lei ou inativo invalida todo o lote.
  if exists (select 1 from pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb) group by id having count(*) <> 1)
     or (select count(*) from public.questions q join pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb) on u.id = q.id where q.lei_id = p_lei_id and q.ativo) <> pg_catalog.jsonb_array_length(p_updates) then
    raise exception 'A selecao mudou, contem UUID desconhecido, inativo ou de outra lei. Gere uma nova previa.' using errcode = '40001';
  end if;

  -- Proteção contra escrita concorrente: todos os valores lidos na prévia
  -- devem continuar idênticos, inclusive gabarito, enunciado e justificativa.
  if exists (
    select 1 from public.questions q
    join pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb) on u.id = q.id
    where q.lei_id = p_lei_id and q.ativo and pg_catalog.jsonb_build_object(
      'pergunta', q.pergunta, 'resposta', q.resposta, 'justificativa', q.justificativa,
      'titulo', q.titulo, 'assunto', q.assunto, 'legislacao', q.legislacao,
      'ordem', q.ordem, 'total_artigos', q.total_artigos,
      'ultima_alteracao_legislativa', q.ultima_alteracao_legislativa
    ) is distinct from u.expected
  ) then
    raise exception 'Uma ou mais questoes foram alteradas desde a previa. Gere uma nova previa.' using errcode = '40001';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'before', u.expected) order by q.id)
    into v_before from public.questions q join pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb) on u.id = q.id;

  update public.questions q set
    pergunta = u.proposed->>'pergunta', resposta = u.proposed->>'resposta',
    justificativa = nullif(u.proposed->>'justificativa', ''), titulo = nullif(u.proposed->>'titulo', ''),
    assunto = nullif(u.proposed->>'assunto', ''), legislacao = nullif(u.proposed->>'legislacao', ''),
    ordem = u.proposed->>'ordem', total_artigos = case when u.proposed->>'total_artigos' is null then null else (u.proposed->>'total_artigos')::integer end,
    ultima_alteracao_legislativa = nullif(u.proposed->>'ultima_alteracao_legislativa', ''), updated_at = pg_catalog.now()
  from pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb)
  where q.id = u.id and q.lei_id = p_lei_id and q.ativo;
  get diagnostics v_count = row_count;

  -- Conflitos editoriais são preservados como pendência de revisão. Eles
  -- não rejeitam a atualização identificada por UUID e tampouco recebem
  -- qualquer correção automática de Assunto ou Ordem.
  update public.legisbot_comentarios c
     set precisa_revisao = true
    from pg_catalog.jsonb_to_recordset(p_review_conflicts) as w(slug text, ordem text, kind text)
   where c.slug = w.slug and c.ordem = w.ordem
     and w.kind in ('legislacao', 'estrutural');

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', q.id, 'after', u.proposed) order by q.id)
    into v_after from public.questions q join pg_catalog.jsonb_to_recordset(p_updates) as u(id uuid, expected jsonb, proposed jsonb) on u.id = q.id;
  insert into public.auditoria_administrativa(ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values (p_actor_user_id, 'importar_apkg_uuid', 'questao', p_lei_id::text, v_before, v_after,
    pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'atualizadas', v_count, 'origem', 'apkg'));
  return pg_catalog.jsonb_build_object('lei_id', p_lei_id, 'updated_count', v_count);
end;
$function$;

revoke all on function public.admin_apply_apkg_uuid_question_updates(bigint,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_apkg_uuid_question_updates(bigint,jsonb,jsonb,uuid) to service_role;
commit;
