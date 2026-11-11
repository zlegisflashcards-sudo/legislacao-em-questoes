begin;

-- Blocos compostos permanecem armazenados para preservar UUIDs, comentários,
-- destaques e links antigos. Consultas públicas devem ignorar situacao=arquivada.
alter table public.legislative_references
  drop constraint if exists legislative_references_situacao_check;
alter table public.legislative_references
  add constraint legislative_references_situacao_check
  check (situacao in ('pendente', 'preparada', 'revogada', 'arquivada'));
alter table public.legislative_references
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references auth.users(id) on delete set null,
  add column if not exists motivo_arquivamento text;

create table if not exists public.legislative_reference_compositions (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete restrict,
  slug text not null,
  operacao jsonb not null,
  antes jsonb not null,
  depois jsonb not null,
  ator_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.legislative_reference_compositions enable row level security;
revoke all on public.legislative_reference_compositions from public, anon, authenticated;
grant select, insert on public.legislative_reference_compositions to service_role;

-- A função é deliberadamente conservadora: aplica somente uma prévia cujo
-- snapshot ainda corresponda ao banco e nunca transfere comentários para outro
-- dispositivo. Comentários filhos são mantidos e marcados para revisão.
create or replace function public.admin_apply_legislative_block_composition(
  p_actor_user_id uuid,
  p_operation jsonb,
  p_expected jsonb,
  p_comment_treatment text
) returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_kind text := p_operation->>'kind';
  v_target uuid;
  v_law_id bigint;
  v_slug text;
  v_source jsonb;
  v_reference public.legislative_references%rowtype;
  v_expected_updated text;
  v_archived uuid[] := array[]::uuid[];
  v_piece jsonb;
begin
  if p_actor_user_id is null or p_comment_treatment <> 'preservar_e_sinalizar_revisao' then
    raise exception 'confirmação de tratamento dos comentários é obrigatória' using errcode = '22023';
  end if;
  if v_kind not in ('unificar', 'separar') then raise exception 'operação inválida' using errcode = '22023'; end if;
  v_target := coalesce((p_operation->'target'->>'id')::uuid, (p_operation->'source'->>'id')::uuid);
  select * into v_reference from public.legislative_references where id = v_target for update;
  if not found or v_reference.situacao = 'arquivada' then raise exception 'bloco de origem indisponível' using errcode = '40001'; end if;
  v_law_id := v_reference.lei_id; v_slug := v_reference.slug;

  for v_source in select value from jsonb_array_elements(coalesce(p_expected->'sources', '[]'::jsonb)) loop
    select * into v_reference from public.legislative_references where id = (v_source->>'id')::uuid for update;
    if not found or v_reference.lei_id <> v_law_id or v_reference.situacao = 'arquivada' then raise exception 'um bloco da prévia não está mais disponível' using errcode = '40001'; end if;
    v_expected_updated := v_source->>'updatedAt';
    if v_expected_updated is null or v_reference.updated_at::text <> v_expected_updated then raise exception 'um bloco foi alterado desde a prévia; gere outra prévia' using errcode = '40001'; end if;
  end loop;

  if v_kind = 'unificar' then
    update public.legislative_references
       set legislacao = p_operation->'target'->>'legislation', situacao = 'preparada', preparado_em = now()
     where id = v_target;
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into v_archived from jsonb_array_elements_text(coalesce(p_operation->'archiveIds', '[]'::jsonb));
    if exists (select 1 from public.legislative_references where id = any(v_archived) and lei_id <> v_law_id) then raise exception 'a prévia mistura leis diferentes' using errcode = '22023'; end if;
    update public.legislative_references set situacao = 'arquivada', arquivado_em = now(), arquivado_por = p_actor_user_id, motivo_arquivamento = 'unificação de blocos'
     where id = any(v_archived);
    update public.legisbot_comentarios set precisa_revisao = true where reference_id = any(v_archived);
  else
    for v_piece in select value from jsonb_array_elements(p_operation->'pieces') loop
      if v_piece->>'ordem' = v_reference.ordem then
        update public.legislative_references set identificacao = v_piece->>'identificacao', legislacao = v_piece->>'legislacao', preparado_em = now(), situacao = 'preparada' where id = v_target;
      else
        insert into public.legislative_references (lei_id, slug, ordem, identificacao, legislacao, preparado_em, situacao)
        values (v_law_id, v_slug, v_piece->>'ordem', v_piece->>'identificacao', v_piece->>'legislacao', now(), 'preparada');
      end if;
    end loop;
    -- O comentário permanece somente no bloco original, cujo UUID é mantido.
    update public.legisbot_comentarios set precisa_revisao = true where reference_id = v_target;
  end if;
  insert into public.legislative_reference_compositions (lei_id, slug, operacao, antes, depois, ator_user_id)
  values (v_law_id, v_slug, p_operation, p_expected, p_operation, p_actor_user_id);
  return jsonb_build_object('status', 'aplicada', 'kind', v_kind);
end;
$$;

revoke all on function public.admin_apply_legislative_block_composition(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_apply_legislative_block_composition(uuid, jsonb, jsonb, text) to service_role;

-- Destaques e novas citações nunca podem nascer em referências arquivadas.
create or replace function public.legisbot_destaques_validate_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare reference public.legislative_references%rowtype; legislation_text text;
begin
  new.slug := upper(btrim(new.slug)); new.ordem := btrim(new.ordem);
  select * into reference from public.legislative_references
   where (id = new.reference_id or (new.reference_id is null and lower(slug) = lower(new.slug) and ordem = new.ordem))
     and situacao <> 'arquivada' order by (id = new.reference_id) desc nulls last, id limit 1;
  if reference.id is null then raise exception 'Referência legislativa ativa não encontrada.'; end if;
  new.reference_id := reference.id; new.slug := upper(reference.slug); new.ordem := reference.ordem;
  legislation_text := public.legisbot_destaques_plain_legal(reference.legislacao);
  if legislation_text is null or new.fim > char_length(legislation_text) or substring(legislation_text from new.inicio + 1 for new.fim - new.inicio) <> new.trecho then raise exception 'Trecho destacado não corresponde à legislação original.'; end if;
  return new;
end;
$$;

commit;
