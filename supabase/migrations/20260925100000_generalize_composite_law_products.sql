begin;

-- Editais e combos têm a mesma composição acadêmica; diferem apenas na oferta comercial.
create or replace function public.is_composite_law_product(p_type text)
returns boolean language sql immutable parallel safe set search_path=pg_catalog
as $$ select p_type in ('edital','combo'); $$;

create or replace function public.admin_sincronizar_composicao_edital_produto(
  p_ator_user_id uuid, p_produto_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare v_produto public.produtos; v_liberacoes integer := 0; v_compras_ignoradas integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  if not public.is_composite_law_product(v_produto.tipo_produto) then
    return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'sincronizado',false,'liberacoes_garantidas',0,'compras_sem_aluno_ignoradas',0);
  end if;
  select count(*) into v_compras_ignoradas from public.compras c where c.produto_id=v_produto.id and c.status_acesso='ativo' and c.aluno_id is null;
  insert into public.liberacoes_leis(aluno_id,lei_id,compra_id,produto_id,origem,status,motivo,concedida_por)
  select c.aluno_id,pl.lei_id,c.id,v_produto.id,case when c.origem='hotmart' then 'hotmart' else 'produto' end,'ativo','Composicao do produto composto sincronizada',p_ator_user_id
  from public.compras c join public.produto_leis pl on pl.produto_id=v_produto.id join public.leis l on l.id=pl.lei_id and l.ativo=true
  where c.produto_id=v_produto.id and c.status_acesso='ativo' and c.aluno_id is not null
  on conflict (compra_id,lei_id) where compra_id is not null do update set status='ativo',motivo=null,revogada_por=null,revogada_em=null
  where public.liberacoes_leis.status is distinct from 'ativo';
  get diagnostics v_liberacoes=row_count;
  return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'sincronizado',true,'liberacoes_garantidas',v_liberacoes,'compras_sem_aluno_ignoradas',v_compras_ignoradas);
end;
$function$;

create or replace function public.admin_definir_leis_produto_recortes(
  p_ator_user_id uuid, p_produto_id uuid, p_vinculos jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_total integer; v_valid integer; v_produto public.produtos; v_sincronizacao jsonb := '{}'::jsonb;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  if jsonb_typeof(p_vinculos) <> 'array' then raise exception using errcode='22023',message='Composicao invalida.'; end if;
  select count(*),count(distinct (item->>'lei_id')::bigint) into v_total,v_valid from jsonb_array_elements(p_vinculos) item;
  if v_total<>v_valid then raise exception using errcode='22023',message='Composicao contem lei duplicada.'; end if;
  if exists(select 1 from jsonb_array_elements(p_vinculos) item where jsonb_typeof(item) <> 'object' or coalesce(item->>'lei_id','') !~ '^\\d+$' or (item ? 'recorte_id' and item->>'recorte_id' <> '' and not exists(select 1 from public.recortes_leis r where r.id=(item->>'recorte_id')::uuid and r.lei_id=(item->>'lei_id')::bigint and r.ativo))) then raise exception using errcode='22023',message='Recorte invalido ou inativo para a lei selecionada.'; end if;
  delete from public.produto_leis where produto_id=p_produto_id;
  insert into public.produto_leis(produto_id,lei_id,ordem,recorte_id,recorte_lei_id)
  select p_produto_id,(item->>'lei_id')::bigint,ord::integer-1,nullif(item->>'recorte_id','')::uuid,case when nullif(item->>'recorte_id','') is null then null else (item->>'lei_id')::bigint end
  from jsonb_array_elements(p_vinculos) with ordinality as x(item,ord);
  if public.is_composite_law_product(v_produto.tipo_produto) then v_sincronizacao:=public.admin_sincronizar_composicao_edital_produto(p_ator_user_id,p_produto_id); end if;
  return jsonb_build_object('produto_id',p_produto_id,'vinculos',p_vinculos,'sincronizacao_composta',v_sincronizacao);
end;
$function$;

create or replace function public.admin_reconciliar_liberacoes_editais_ativos(p_ator_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_produto record; v_resultado jsonb; v_produtos integer := 0; v_liberacoes integer := 0; v_ignoradas integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  for v_produto in select id from public.produtos where public.is_composite_law_product(tipo_produto) loop
    v_resultado:=public.admin_sincronizar_composicao_edital_produto(p_ator_user_id,v_produto.id);
    v_produtos:=v_produtos+1; v_liberacoes:=v_liberacoes+coalesce((v_resultado->>'liberacoes_garantidas')::integer,0); v_ignoradas:=v_ignoradas+coalesce((v_resultado->>'compras_sem_aluno_ignoradas')::integer,0);
  end loop;
  perform public.admin_comercial_auditar(p_ator_user_id,'reconciliar_liberacoes_compostas','produto','todos_compostos',null,null,pg_catalog.jsonb_build_object('produtos_processados',v_produtos,'liberacoes_garantidas',v_liberacoes,'compras_sem_aluno_ignoradas',v_ignoradas));
  return pg_catalog.jsonb_build_object('produtos_processados',v_produtos,'liberacoes_garantidas',v_liberacoes,'compras_sem_aluno_ignoradas',v_ignoradas);
end;
$function$;

create or replace function public.obter_meus_editais()
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with aluno as (select id from public.alunos where user_id=auth.uid()),
  personalizado as (select e.id,e.nome from public.editais_personalizados_alunos e join aluno a on a.id=e.aluno_id),
  progresso as (select p.lei_id,p.em_estudo,p.questoes_finalizadas from public.progresso_leis_alunos p join aluno a on a.id=p.aluno_id),
  meu as (select jsonb_build_object('id',coalesce((select id from personalizado limit 1),0),'tipo','personalizado','nome',coalesce((select nome from personalizado limit 1),'Meu Edital'),'leis',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'recorte_id',pl.recorte_id,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id) from personalizado p join public.editais_personalizados_leis pl on pl.edital_id=p.id join public.leis l on l.id=pl.lei_id and l.ativo=true left join progresso pr on pr.lei_id=l.id),'[]'::jsonb)) as item),
  produtos as (select jsonb_build_object('id',p.id::text,'tipo','produto','nome',p.nome,'leis',coalesce(jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'recorte_id',pl.recorte_id,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id),'[]'::jsonb)) as item from public.produtos p join public.produto_leis pl on pl.produto_id=p.id join public.leis l on l.id=pl.lei_id and l.ativo=true left join progresso pr on pr.lei_id=l.id where public.is_composite_law_product(p.tipo_produto) and p.ativo=true and exists(select 1 from public.compras c join aluno a on a.id=c.aluno_id where c.produto_id=p.id and c.status_acesso='ativo') group by p.id,p.nome,p.ordem)
  select jsonb_build_object('editais',coalesce((select jsonb_agg(item order by pos) from (select 0 pos,item from meu union all select 1,item from produtos) x),'[]'::jsonb));
$function$;

revoke all on function public.is_composite_law_product(text), public.admin_sincronizar_composicao_edital_produto(uuid,uuid), public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb), public.admin_reconciliar_liberacoes_editais_ativos(uuid) from public,anon,authenticated;
grant execute on function public.is_composite_law_product(text) to service_role,authenticated;
grant execute on function public.admin_sincronizar_composicao_edital_produto(uuid,uuid), public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb), public.admin_reconciliar_liberacoes_editais_ativos(uuid) to service_role;
revoke all on function public.obter_meus_editais() from public,anon,service_role;
grant execute on function public.obter_meus_editais() to authenticated;

commit;
