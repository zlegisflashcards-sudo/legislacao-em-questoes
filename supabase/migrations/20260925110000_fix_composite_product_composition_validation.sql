begin;

-- Corrige o escape do regex instalado na generalização inicial: `\\d` procurava
-- uma barra literal antes do dígito e rejeitava todo lei_id numérico.
-- A composição é exclusiva de produtos acadêmicos compostos.
create or replace function public.admin_definir_leis_produto_recortes(
  p_ator_user_id uuid, p_produto_id uuid, p_vinculos jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_total integer; v_valid integer; v_produto public.produtos; v_sincronizacao jsonb := '{}'::jsonb;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  if not public.is_composite_law_product(v_produto.tipo_produto) then
    raise exception using errcode='22023',message='Composicao de leis disponivel somente para produto composto.';
  end if;
  if jsonb_typeof(p_vinculos) <> 'array' then raise exception using errcode='22023',message='Composicao invalida.'; end if;
  select count(*),count(distinct (item->>'lei_id')::bigint) into v_total,v_valid from jsonb_array_elements(p_vinculos) item;
  if v_total<>v_valid then raise exception using errcode='22023',message='Composicao contem lei duplicada.'; end if;
  if exists(select 1 from jsonb_array_elements(p_vinculos) item where jsonb_typeof(item) <> 'object' or coalesce(item->>'lei_id','') !~ '^\d+$' or (item ? 'recorte_id' and item->>'recorte_id' <> '' and not exists(select 1 from public.recortes_leis r where r.id=(item->>'recorte_id')::uuid and r.lei_id=(item->>'lei_id')::bigint and r.ativo))) then raise exception using errcode='22023',message='Recorte invalido ou inativo para a lei selecionada.'; end if;
  delete from public.produto_leis where produto_id=p_produto_id;
  insert into public.produto_leis(produto_id,lei_id,ordem,recorte_id,recorte_lei_id)
  select p_produto_id,(item->>'lei_id')::bigint,ord::integer-1,nullif(item->>'recorte_id','')::uuid,case when nullif(item->>'recorte_id','') is null then null else (item->>'lei_id')::bigint end
  from jsonb_array_elements(p_vinculos) with ordinality as x(item,ord);
  v_sincronizacao:=public.admin_sincronizar_composicao_edital_produto(p_ator_user_id,p_produto_id);
  return jsonb_build_object('produto_id',p_produto_id,'vinculos',p_vinculos,'sincronizacao_composta',v_sincronizacao);
end;
$function$;

revoke all on function public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb) to service_role;

commit;
