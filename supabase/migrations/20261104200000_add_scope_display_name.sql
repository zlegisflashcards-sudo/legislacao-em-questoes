begin;

alter table public.recortes_leis
  add column if not exists nome_exibicao text;

comment on column public.recortes_leis.nome_exibicao is
  'Nome completo exibido ao aluno; distinto do código curto do recorte.';

create or replace function public.admin_salvar_recorte_lei(
  p_recorte_id uuid,
  p_lei_id bigint,
  p_nome text,
  p_nome_exibicao text,
  p_descricao text,
  p_ativo boolean,
  p_status_publicacao text,
  p_acesso_gratuito boolean,
  p_structure_ids bigint[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_total integer;
  v_valid integer;
  v_status text := coalesce(p_status_publicacao, case when p_ativo then 'ativa' else 'inativa' end);
begin
  if pg_catalog.btrim(coalesce(p_nome, '')) = '' or v_status not in ('ativa', 'em_breve', 'inativa') then
    raise exception using errcode = '22023', message = 'Dados do recorte invalidos.';
  end if;
  if coalesce(p_acesso_gratuito, false) and v_status <> 'ativa' then
    raise exception using errcode = '22023', message = 'Somente recorte ativo pode ter acesso gratuito.';
  end if;
  if cardinality(coalesce(p_structure_ids, array[]::bigint[])) = 0 then
    raise exception using errcode = '22023', message = 'Selecione ao menos uma estrutura.';
  end if;
  select count(*), count(distinct x) into v_total, v_valid from pg_catalog.unnest(p_structure_ids) x;
  if v_total <> v_valid then
    raise exception using errcode = '22023', message = 'Estrutura duplicada no recorte.';
  end if;
  select count(*) into v_valid from public.law_structure where lei_id = p_lei_id and ativo and id = any(p_structure_ids);
  if v_valid <> v_total then
    raise exception using errcode = '22023', message = 'A estrutura selecionada nao pertence a esta lei.';
  end if;

  if p_recorte_id is null then
    insert into public.recortes_leis(lei_id, nome, nome_exibicao, descricao, ativo, status_publicacao, acesso_gratuito)
    values (p_lei_id, pg_catalog.btrim(p_nome), nullif(pg_catalog.btrim(coalesce(p_nome_exibicao, '')), ''), nullif(pg_catalog.btrim(coalesce(p_descricao, '')), ''), v_status <> 'inativa', v_status, coalesce(p_acesso_gratuito, false))
    returning id into v_id;
  else
    update public.recortes_leis
    set nome = pg_catalog.btrim(p_nome),
        nome_exibicao = nullif(pg_catalog.btrim(coalesce(p_nome_exibicao, '')), ''),
        descricao = nullif(pg_catalog.btrim(coalesce(p_descricao, '')), ''),
        ativo = v_status <> 'inativa',
        status_publicacao = v_status,
        acesso_gratuito = coalesce(p_acesso_gratuito, false)
    where id = p_recorte_id and lei_id = p_lei_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = 'P0002', message = 'Recorte nao encontrado para esta lei.';
    end if;
    delete from public.recortes_leis_estrutura where recorte_id = v_id;
  end if;

  insert into public.recortes_leis_estrutura(recorte_id, structure_id, lei_id)
  select v_id, x, p_lei_id from pg_catalog.unnest(p_structure_ids) x;
  return v_id;
end;
$function$;

revoke all on function public.admin_salvar_recorte_lei(uuid, bigint, text, text, text, boolean, text, boolean, bigint[]) from public, anon, authenticated;
grant execute on function public.admin_salvar_recorte_lei(uuid, bigint, text, text, text, boolean, text, boolean, bigint[]) to service_role;

commit;
