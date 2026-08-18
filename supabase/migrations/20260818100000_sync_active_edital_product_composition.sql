begin;

-- A compra ativa define quem possui o direito ao produto. Para produtos do tipo
-- edital, produto_leis permanece a composição viva e esta função só cria ou
-- reativa a liberação da nova lei na mesma compra, sem tocar em progresso.
create or replace function public.admin_sincronizar_composicao_edital_produto(
  p_ator_user_id uuid,
  p_produto_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare
  v_produto public.produtos;
  v_liberacoes integer := 0;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  if v_produto.tipo_produto <> 'edital' then
    return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'sincronizado',false,'liberacoes_garantidas',0);
  end if;

  insert into public.liberacoes_leis(aluno_id,lei_id,compra_id,produto_id,origem,status,motivo,concedida_por)
  select c.aluno_id,pl.lei_id,c.id,v_produto.id,
    case when c.origem='hotmart' then 'hotmart' else 'produto' end,
    'ativo','Composicao do edital sincronizada',p_ator_user_id
  from public.compras c
  join public.produto_leis pl on pl.produto_id=v_produto.id
  join public.leis l on l.id=pl.lei_id and l.ativo=true
  where c.produto_id=v_produto.id and c.status_acesso='ativo'
  on conflict (compra_id,lei_id) where compra_id is not null do update set
    status='ativo',
    motivo=null,
    revogada_por=null,
    revogada_em=null
  where public.liberacoes_leis.status is distinct from 'ativo';
  get diagnostics v_liberacoes=row_count;

  return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'sincronizado',true,'liberacoes_garantidas',v_liberacoes);
end;
$function$;

create or replace function public.admin_definir_leis_produto(p_ator_user_id uuid, p_produto_id uuid, p_lei_ids bigint[])
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_total integer;
  v_expected integer;
  v_found integer;
  v_produto public.produtos;
  v_sincronizacao jsonb := '{}'::jsonb;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  select * into v_produto from public.produtos where id=p_produto_id for update;
  if not found then raise exception using errcode='P0002',message='Produto nao encontrado.'; end if;
  select pg_catalog.count(x),pg_catalog.count(distinct x),pg_catalog.count(distinct l.id) into v_total,v_expected,v_found
  from pg_catalog.unnest(coalesce(p_lei_ids,array[]::bigint[])) x
  left join public.leis l on l.id=x;
  if v_total<>v_expected or v_expected<>v_found then raise exception using errcode='22023',message='Composicao contem lei duplicada ou inexistente.'; end if;

  select coalesce(pg_catalog.jsonb_agg(lei_id order by ordem,lei_id),'[]'::jsonb) into v_before
  from public.produto_leis where produto_id=p_produto_id;
  delete from public.produto_leis where produto_id=p_produto_id;
  insert into public.produto_leis(produto_id,lei_id,ordem)
  select p_produto_id,x.id,x.ordem::integer-1
  from pg_catalog.unnest(coalesce(p_lei_ids,array[]::bigint[])) with ordinality x(id,ordem);
  select coalesce(pg_catalog.jsonb_agg(lei_id order by ordem,lei_id),'[]'::jsonb) into v_after
  from public.produto_leis where produto_id=p_produto_id;

  if v_produto.tipo_produto='edital' then
    v_sincronizacao:=public.admin_sincronizar_composicao_edital_produto(p_ator_user_id,p_produto_id);
  end if;
  perform public.admin_comercial_auditar(
    p_ator_user_id,'definir_leis','produto',p_produto_id::text,v_before,v_after,
    pg_catalog.jsonb_build_object('sincronizacao_edital',v_sincronizacao)
  );
  return pg_catalog.jsonb_build_object('produto_id',p_produto_id,'lei_ids',v_after,'sincronizacao_edital',v_sincronizacao);
end;
$function$;

-- O edital de produto não é uma cópia por aluno: sua composição e ordem são
-- sempre lidas de produto_leis, enquanto o progresso permanece em sua tabela.
create or replace function public.obter_meus_editais()
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with aluno as (select id from public.alunos where user_id=auth.uid()),
  personalizado as (select e.id,e.nome from public.editais_personalizados_alunos e join aluno a on a.id=e.aluno_id),
  progresso as (select p.lei_id,p.em_estudo,p.questoes_finalizadas from public.progresso_leis_alunos p join aluno a on a.id=p.aluno_id),
  meu as (
    select jsonb_build_object('id',coalesce((select id from personalizado limit 1),0),'tipo','personalizado','nome',coalesce((select nome from personalizado limit 1),'Meu Edital'),'leis',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id) from personalizado p join public.editais_personalizados_leis pl on pl.edital_id=p.id join public.leis l on l.id=pl.lei_id and l.ativo=true left join progresso pr on pr.lei_id=l.id),'[]'::jsonb)) as item
  ),
  produtos as (
    select jsonb_build_object('id',p.id::text,'tipo','produto','nome',p.nome,'leis',coalesce(jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id),'[]'::jsonb)) as item
    from public.produtos p
    join public.produto_leis pl on pl.produto_id=p.id
    join public.leis l on l.id=pl.lei_id and l.ativo=true
    left join progresso pr on pr.lei_id=l.id
    where p.tipo_produto='edital' and p.ativo=true
      and exists(select 1 from public.compras c join aluno a on a.id=c.aluno_id where c.produto_id=p.id and c.status_acesso='ativo')
    group by p.id,p.nome,p.ordem
  )
  select jsonb_build_object('editais',coalesce((select jsonb_agg(item order by pos) from (select 0 pos,item from meu union all select 1,item from produtos) x),'[]'::jsonb));
$function$;

create index if not exists compras_produto_ativo_aluno_idx
  on public.compras(produto_id,aluno_id,id)
  where status_acesso='ativo';

revoke all on function public.admin_sincronizar_composicao_edital_produto(uuid,uuid), public.admin_definir_leis_produto(uuid,uuid,bigint[]) from public, anon, authenticated;
grant execute on function public.admin_sincronizar_composicao_edital_produto(uuid,uuid), public.admin_definir_leis_produto(uuid,uuid,bigint[]) to service_role;
revoke all on function public.obter_meus_editais() from public, anon, service_role;
grant execute on function public.obter_meus_editais() to authenticated;

commit;
