-- Whole-law duplicate cleanup. Reversible inactivation only: no DELETE,
-- no merging of student history, no changes to UUIDs or reference links.
begin;

create or replace function public.admin_deactivate_law_duplicate_questions(
  p_lei_id bigint, p_slug text, p_expected jsonb, p_groups jsonb, p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $function$
declare
  v_candidates uuid[];
  v_keepers uuid[];
  v_before jsonb;
  v_after jsonb;
  v_count integer;
begin
  -- Only the existing service-role backend may invoke this function. The
  -- endpoint verifies admin identity and regenerates the preview before RPC.
  if p_actor_user_id is null or not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode = '42501';
  end if;
  if p_expected is null or pg_catalog.jsonb_typeof(p_expected) <> 'array'
    or p_groups is null or pg_catalog.jsonb_typeof(p_groups) <> 'array'
    or pg_catalog.jsonb_array_length(p_groups) = 0 then
    raise exception 'Previa completa obrigatoria.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_groups) g
    where pg_catalog.jsonb_typeof(g->'candidate_ids') is distinct from 'array'
       or g->>'retained_id' is null) then
    raise exception 'Grupos invalidos.' using errcode = '22023';
  end if;
  select pg_catalog.array_agg((g->>'retained_id')::uuid order by g->>'retained_id') into v_keepers
    from pg_catalog.jsonb_array_elements(p_groups) g;
  select pg_catalog.array_agg(c::uuid order by c) into v_candidates
    from pg_catalog.jsonb_array_elements(p_groups) g
    cross join lateral pg_catalog.jsonb_array_elements_text(g->'candidate_ids') c;
  if v_candidates is null or exists (select 1 from pg_catalog.jsonb_array_elements(p_groups) g where pg_catalog.jsonb_array_length(g->'candidate_ids') = 0)
    or pg_catalog.cardinality(v_candidates) <> (select count(distinct id) from pg_catalog.unnest(v_candidates) id)
    or pg_catalog.cardinality(v_keepers) <> (select count(distinct id) from pg_catalog.unnest(v_keepers) id)
    or v_candidates && v_keepers then
    raise exception 'Cada grupo deve preservar exatamente uma questao distinta.' using errcode = '22023';
  end if;

  -- Same lock convention as the existing atomic APKG update RPC. Prevents
  -- edits, inserts or inactivation from invalidating a keeper between the
  -- final snapshot check and the batch write. The lock is transaction-local.
  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  lock table public.questions in share row exclusive mode;
  if not exists (select 1 from public.leis where id = p_lei_id and slug = p_slug and ativo) then
    raise exception 'Baralho ativo nao encontrado.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.questions where lei_id = p_lei_id and slug = p_slug and ativo) <> pg_catalog.jsonb_array_length(p_expected)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_expected) e group by e->>'id' having count(*) <> 1)
    or exists (
      select 1 from pg_catalog.jsonb_array_elements(p_expected) e
      left join public.questions q on q.id = (e->>'id')::uuid and q.lei_id = p_lei_id and q.slug = p_slug and q.ativo
      where q.id is null
        or (pg_catalog.jsonb_build_object(
          'id',q.id,'lei_id',q.lei_id,'slug',q.slug,'ordem',q.ordem,'pergunta',q.pergunta,
          'resposta',q.resposta,'justificativa',q.justificativa,'assunto',q.assunto,
          'legislacao',q.legislacao,'titulo',q.titulo,'structure_id',q.structure_id,'ativo',q.ativo
        ) is distinct from (e - 'updated_at'))
        or q.updated_at is distinct from (e->>'updated_at')::timestamptz
    ) then
    raise exception 'O baralho mudou desde a previa.' using errcode = '40001';
  end if;
  if (select count(*) from public.questions where lei_id = p_lei_id and slug = p_slug and ativo and id = any(v_candidates || v_keepers))
      <> pg_catalog.cardinality(v_candidates) + pg_catalog.cardinality(v_keepers) then
    raise exception 'Selecao fora do baralho ou questao inativa.' using errcode = '40001';
  end if;
  -- The plan comes from the authenticated server's shared assertion grouper.
  -- Preserve its deterministic keeper: lexicographically smallest UUID.
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_groups) g
    cross join lateral pg_catalog.jsonb_array_elements_text(g->'candidate_ids') c
    where c <= g->>'retained_id'
  ) then
    raise exception 'A questao principal da previa nao foi preservada.' using errcode = '22023';
  end if;

  -- Defense in depth: the database also rejects nonidentical assertions.
  -- This does not compare answers, explanations, order or structure.
  if exists (
    with keys as (
      select q.id, pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
        pg_catalog.normalize(
          pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(q.pergunta, '<br\s*/?\s*>', E'\n', 'gi'), '<[^>]*>', ' ', 'g'), '&nbsp;', ' ', 'gi'), '&amp;', '&', 'gi'), '&lt;', '<', 'gi'), '&gt;', '>', 'gi'), '&quot;', '"', 'gi'), '&#39;', '''', 'gi'), 'NFC'),
        U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'))) as statement_key
      from public.questions q where q.id = any(v_candidates || v_keepers)
    )
    select 1 from pg_catalog.jsonb_array_elements(p_groups) g
    join keys keeper on keeper.id = (g->>'retained_id')::uuid
    cross join lateral pg_catalog.jsonb_array_elements_text(g->'candidate_ids') c
    join keys candidate on candidate.id = c::uuid
    where keeper.statement_key = '' or candidate.statement_key is distinct from keeper.statement_key
  ) then
    raise exception 'As assertivas do grupo nao sao identicas.' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) order by q.id) into v_before
    from public.questions q where q.id = any(v_candidates);
  update public.questions set ativo = false, updated_at = pg_catalog.now()
    where lei_id = p_lei_id and slug = p_slug and ativo and id = any(v_candidates);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.cardinality(v_candidates) then
    raise exception 'O lote mudou durante a inativacao.' using errcode = '40001';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) order by q.id) into v_after
    from public.questions q where q.id = any(v_candidates);
  -- An audit failure rolls the inactivation back too; no partial batch.
  insert into public.auditoria_administrativa(ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values (p_actor_user_id, 'inativar_duplicatas_baralho', 'questao', p_lei_id::text, v_before, v_after,
    pg_catalog.jsonb_build_object('origem','conflitos_questoes','lei_id',p_lei_id,'slug',p_slug,
      'inativadas',v_count,'preservadas',pg_catalog.to_jsonb(v_keepers),'reversivel',true));
  return pg_catalog.jsonb_build_object('applied',v_count,'groups',pg_catalog.cardinality(v_keepers),'reversible',true);
end;
$function$;

revoke all on function public.admin_deactivate_law_duplicate_questions(bigint,text,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.admin_deactivate_law_duplicate_questions(bigint,text,jsonb,jsonb,uuid) to service_role;
comment on function public.admin_deactivate_law_duplicate_questions(bigint,text,jsonb,jsonb,uuid) is
  'Inativa cópias aprovadas da mesma assertiva no baralho, preservando UUIDs, histórico e vínculos. Executada somente pelo backend administrativo após prévia.';
commit;
