begin;

-- Operation IDs let a lost response be reconciled without repeating writes or audit.
create table public.admin_question_uuid_patch_operations (
  operation_id uuid primary key,
  actor_id uuid not null,
  law_id bigint not null references public.leis(id),
  patch_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_question_uuid_patch_operations enable row level security;
revoke all on public.admin_question_uuid_patch_operations from public, anon, authenticated;
grant select, insert on public.admin_question_uuid_patch_operations to service_role;

create function public.admin_apply_question_uuid_patch(
  p_operation_id uuid, p_actor_id uuid, p_law_id bigint, p_patch_hash text,
  p_updates jsonb, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_existing public.admin_question_uuid_patch_operations%rowtype;
  v_item jsonb; v_snap jsonb; v_question public.questions%rowtype;
  v_assunto text; v_ordem text; v_status text; v_changed integer := 0; v_already integer := 0;
  v_results jsonb := '[]'::jsonb; v_before jsonb := '[]'::jsonb; v_after jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_operation_id is null or p_actor_id is null or p_law_id is null or p_patch_hash !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'Contexto invalido.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) < 1 or jsonb_array_length(p_updates) > 5000
     or jsonb_typeof(p_snapshot) <> 'array' or jsonb_array_length(p_snapshot) <> jsonb_array_length(p_updates) then
    raise exception 'Patch ou previa invalidos.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(p_law_id);
  select * into v_existing from public.admin_question_uuid_patch_operations where operation_id = p_operation_id;
  if found then
    if v_existing.actor_id <> p_actor_id or v_existing.law_id <> p_law_id or v_existing.patch_hash <> p_patch_hash then
      raise exception 'Operacao incompatível.' using errcode = '42501';
    end if;
    return v_existing.result;
  end if;
  if not exists (select 1 from public.leis l where l.id = p_law_id and l.ativo) then raise exception 'Lei invalida.' using errcode = '40001'; end if;
  if (select count(distinct x->>'uuid') from jsonb_array_elements(p_updates) x) <> jsonb_array_length(p_updates)
     or (select count(distinct x->>'id') from jsonb_array_elements(p_snapshot) x) <> jsonb_array_length(p_snapshot) then
    raise exception 'UUID duplicado.' using errcode = '22023';
  end if;
  -- Serialize all question mutations while comparing both fields and version.
  lock table public.questions in share row exclusive mode;
  for v_item in select value from jsonb_array_elements(p_updates) order by value->>'uuid' loop
    if (v_item->>'uuid') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item->'changes') <> 'object' or v_item->'changes' = '{}'::jsonb
       or exists(select 1 from jsonb_object_keys(v_item->'changes') k where k not in ('assunto','ordem'))
       or jsonb_typeof(v_item->'expected_before') <> 'object'
       or jsonb_typeof(v_item->'expected_before'->'assunto') <> 'string'
       or jsonb_typeof(v_item->'expected_before'->'ordem') <> 'string' then
      raise exception 'Patch invalido.' using errcode = '22023';
    end if;
    select value into v_snap from jsonb_array_elements(p_snapshot) where value->>'id' = v_item->>'uuid';
    select * into v_question from public.questions where id = (v_item->>'uuid')::uuid and lei_id = p_law_id and ativo for update;
    if not found or v_snap is null or v_question.assunto is distinct from (v_snap->>'assunto')
       or v_question.ordem is distinct from (v_snap->>'ordem')
       or v_question.updated_at is distinct from (v_snap->>'updated_at')::timestamptz then
      raise exception 'Questao alterada desde a previa ou indisponivel.' using errcode = '40001';
    end if;
    v_assunto := case when v_item->'changes' ? 'assunto' then v_item->'changes'->>'assunto' else v_item->'expected_before'->>'assunto' end;
    v_ordem := case when v_item->'changes' ? 'ordem' then v_item->'changes'->>'ordem' else v_item->'expected_before'->>'ordem' end;
    if v_assunto is null or btrim(v_assunto) = '' or length(v_assunto) > 500 or v_ordem is null or v_ordem !~ '^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$' or length(v_ordem) > 100 then
      raise exception 'Valor de patch invalido.' using errcode = '22023';
    end if;
    if v_question.assunto is not distinct from v_assunto and v_question.ordem is not distinct from v_ordem then
      v_status := 'ja_aplicado'; v_already := v_already + 1;
    elsif v_question.assunto is not distinct from (v_item->'expected_before'->>'assunto') and v_question.ordem is not distinct from (v_item->'expected_before'->>'ordem') then
      v_status := 'alterado'; v_changed := v_changed + 1;
      v_before := v_before || jsonb_build_array(jsonb_build_object('id', v_question.id, 'assunto', v_question.assunto, 'ordem', v_question.ordem));
      update public.questions set assunto = v_assunto, ordem = v_ordem, updated_at = now() where id = v_question.id;
      update public.legisbot_comentarios set precisa_revisao = true where slug = upper(v_question.slug) and ordem in (v_question.ordem, v_ordem);
      v_after := v_after || jsonb_build_array(jsonb_build_object('id', v_question.id, 'assunto', v_assunto, 'ordem', v_ordem));
    else raise exception 'Valores esperados divergem.' using errcode = '40001';
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('uuid', v_question.id, 'status', v_status, 'assunto', v_assunto, 'ordem', v_ordem));
  end loop;
  if exists (select 1 from jsonb_array_elements(v_before) b join jsonb_array_elements(v_after) a on a->>'id' = b->>'id'
      join public.questions q on q.id = (a->>'id')::uuid
      join public.questions other on other.lei_id = q.lei_id and other.ativo and other.id <> q.id and other.ordem = q.ordem and other.pergunta = q.pergunta
      where b->>'ordem' is distinct from a->>'ordem') then
    raise exception 'A alteracao criaria questoes duplicadas.' using errcode = '23505';
  end if;
  if v_changed > 0 then
    insert into public.auditoria_administrativa(ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
    values (p_actor_id, 'patch_uuid', 'questao', p_law_id::text, v_before, v_after, jsonb_build_object('operation_id',p_operation_id,'patch_hash',p_patch_hash,'alteradas',v_changed,'ja_aplicadas',v_already));
  end if;
  v_result := jsonb_build_object('operation_id',p_operation_id,'changed_count',v_changed,'already_count',v_already,'items',v_results);
  insert into public.admin_question_uuid_patch_operations(operation_id,actor_id,law_id,patch_hash,result) values (p_operation_id,p_actor_id,p_law_id,p_patch_hash,v_result);
  return v_result;
end;
$function$;
revoke all on function public.admin_apply_question_uuid_patch(uuid,uuid,bigint,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_apply_question_uuid_patch(uuid,uuid,bigint,text,jsonb,jsonb) to service_role;
commit;
