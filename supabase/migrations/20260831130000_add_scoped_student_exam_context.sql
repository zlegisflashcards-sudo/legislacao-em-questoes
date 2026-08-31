begin;

-- O Meu Edital mantém uma única linha por lei canônica. Esta RPC troca o
-- contexto dessa linha de forma explícita, sem permitir que o navegador use
-- um recorte que não tenha sido liberado para o aluno autenticado.
create or replace function public.definir_contexto_lei_meu_edital(
  p_lei_id bigint,
  p_recorte_id uuid,
  p_confirmar_substituicao boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_aluno_id uuid;
  v_edital_id bigint;
  v_recorte_atual uuid;
  v_ordem integer;
  v_acesso_valido boolean := false;
begin
  select id into v_aluno_id from public.alunos where user_id = auth.uid();
  if v_aluno_id is null then
    raise exception using errcode = '42501', message = 'Aluno nao autenticado.';
  end if;

  if p_recorte_id is null then
    select exists(
      select 1
      from public.liberacoes_leis liberacao
      left join public.produto_leis produto_lei
        on produto_lei.produto_id = liberacao.produto_id
       and produto_lei.lei_id = p_lei_id
      where liberacao.aluno_id = v_aluno_id
        and liberacao.lei_id = p_lei_id
        and liberacao.status = 'ativo'
        and (liberacao.produto_id is null or (produto_lei.produto_id is not null and produto_lei.recorte_id is null))
    ) into v_acesso_valido;
  else
    select exists(
      select 1
      from public.liberacoes_leis liberacao
      join public.produto_leis produto_lei
        on produto_lei.produto_id = liberacao.produto_id
       and produto_lei.lei_id = p_lei_id
       and produto_lei.recorte_id = p_recorte_id
      join public.recortes_leis recorte
        on recorte.id = produto_lei.recorte_id
       and recorte.lei_id = p_lei_id
       and recorte.ativo
      where liberacao.aluno_id = v_aluno_id
        and liberacao.lei_id = p_lei_id
        and liberacao.status = 'ativo'
    ) into v_acesso_valido;
  end if;

  if not v_acesso_valido then
    raise exception using errcode = '42501', message = 'Contexto de estudo nao liberado.';
  end if;

  v_edital_id := public.meu_edital_id();
  select recorte_id, ordem into v_recorte_atual, v_ordem
  from public.editais_personalizados_leis
  where edital_id = v_edital_id and lei_id = p_lei_id;

  if found and v_recorte_atual is not distinct from p_recorte_id then
    return jsonb_build_object('status', 'ja_existente', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id);
  end if;

  if found then
    if not p_confirmar_substituicao then
      raise exception using errcode = '22023', message = 'A lei ja existe no edital com outro contexto.';
    end if;
    update public.editais_personalizados_leis
    set recorte_id = p_recorte_id,
        recorte_lei_id = case when p_recorte_id is null then null else p_lei_id end
    where edital_id = v_edital_id and lei_id = p_lei_id;
    return jsonb_build_object('status', 'substituido', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id, 'ordem', v_ordem);
  end if;

  insert into public.editais_personalizados_leis(edital_id, lei_id, ordem, recorte_id, recorte_lei_id)
  select v_edital_id, p_lei_id, coalesce(max(ordem) + 1, 0), p_recorte_id,
         case when p_recorte_id is null then null else p_lei_id end
  from public.editais_personalizados_leis
  where edital_id = v_edital_id;

  return jsonb_build_object('status', 'adicionado', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id);
end;
$function$;

revoke all on function public.definir_contexto_lei_meu_edital(bigint, uuid, boolean) from public, anon, service_role;
grant execute on function public.definir_contexto_lei_meu_edital(bigint, uuid, boolean) to authenticated;

commit;
