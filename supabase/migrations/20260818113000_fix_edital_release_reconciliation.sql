begin;

-- Compras históricas sem aluno não podem gerar uma liberação (aluno_id é NOT
-- NULL). Elas são ignoradas para não abortar a sincronização dos compradores
-- válidos do mesmo edital.
create or replace function public.admin_sincronizar_composicao_edital_produto(
  p_ator_user_id uuid,
  p_produto_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare
  v_produto public.produtos;
  v_liberacoes integer := 0;
  v_compras_ignoradas integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  if v_produto.tipo_produto <> 'edital' then
    return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'sincronizado',false,'liberacoes_garantidas',0,'compras_sem_aluno_ignoradas',0);
  end if;

  select count(*) into v_compras_ignoradas
  from public.compras c
  where c.produto_id=v_produto.id and c.status_acesso='ativo' and c.aluno_id is null;

  insert into public.liberacoes_leis(aluno_id,lei_id,compra_id,produto_id,origem,status,motivo,concedida_por)
  select c.aluno_id,pl.lei_id,c.id,v_produto.id,
    case when c.origem='hotmart' then 'hotmart' else 'produto' end,
    'ativo','Composicao do edital sincronizada',p_ator_user_id
  from public.compras c
  join public.produto_leis pl on pl.produto_id=v_produto.id
  join public.leis l on l.id=pl.lei_id and l.ativo=true
  where c.produto_id=v_produto.id
    and c.status_acesso='ativo'
    and c.aluno_id is not null
  on conflict (compra_id,lei_id) where compra_id is not null do update set
    status='ativo',
    motivo=null,
    revogada_por=null,
    revogada_em=null
  where public.liberacoes_leis.status is distinct from 'ativo';
  get diagnostics v_liberacoes=row_count;

  return pg_catalog.jsonb_build_object(
    'produto_id',p_produto_id,
    'sincronizado',true,
    'liberacoes_garantidas',v_liberacoes,
    'compras_sem_aluno_ignoradas',v_compras_ignoradas
  );
end;
$function$;

create or replace function public.admin_reconciliar_liberacoes_editais_ativos(p_ator_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare
  v_produto record;
  v_resultado jsonb;
  v_produtos integer := 0;
  v_liberacoes integer := 0;
  v_ignoradas integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  for v_produto in select id from public.produtos where tipo_produto='edital' loop
    v_resultado:=public.admin_sincronizar_composicao_edital_produto(p_ator_user_id,v_produto.id);
    v_produtos:=v_produtos+1;
    v_liberacoes:=v_liberacoes+coalesce((v_resultado->>'liberacoes_garantidas')::integer,0);
    v_ignoradas:=v_ignoradas+coalesce((v_resultado->>'compras_sem_aluno_ignoradas')::integer,0);
  end loop;
  perform public.admin_comercial_auditar(
    p_ator_user_id,'reconciliar_liberacoes_editais','produto','todos_editais',null,null,
    pg_catalog.jsonb_build_object('produtos_processados',v_produtos,'liberacoes_garantidas',v_liberacoes,'compras_sem_aluno_ignoradas',v_ignoradas)
  );
  return pg_catalog.jsonb_build_object('produtos_processados',v_produtos,'liberacoes_garantidas',v_liberacoes,'compras_sem_aluno_ignoradas',v_ignoradas);
end;
$function$;

revoke all on function public.admin_sincronizar_composicao_edital_produto(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_sincronizar_composicao_edital_produto(uuid,uuid) to service_role;
revoke all on function public.admin_reconciliar_liberacoes_editais_ativos(uuid) from public, anon, authenticated;
grant execute on function public.admin_reconciliar_liberacoes_editais_ativos(uuid) to service_role;

commit;
