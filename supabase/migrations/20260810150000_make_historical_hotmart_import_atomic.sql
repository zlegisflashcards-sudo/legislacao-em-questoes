begin;

create or replace function public.admin_importar_aquisicao_hotmart_historica(
  p_ator_user_id uuid, p_email text, p_nome text, p_telefone text, p_hotmart_product_id text,
  p_transaction_id text, p_adquirida_em timestamptz, p_status_acesso text
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email)); v_student_id uuid; v_student_created boolean := false;
  v_product public.produtos%rowtype; v_purchase public.compras%rowtype; v_student_count integer; v_release_count integer;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if v_email = '' or p_transaction_id is null or pg_catalog.btrim(p_transaction_id) = '' then raise exception using errcode='22023', message='E-mail e transacao Hotmart sao obrigatorios.'; end if;
  if p_status_acesso not in ('ativo','cancelado','reembolsado') then raise exception using errcode='22023', message='Status de acesso invalido.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hotmart:' || pg_catalog.btrim(p_transaction_id), 0));
  select * into v_purchase from public.compras where origem='hotmart' and identificador_externo=pg_catalog.btrim(p_transaction_id);
  if found then return pg_catalog.jsonb_build_object('duplicada',true,'aluno_id',v_purchase.aluno_id,'compra_id',v_purchase.id); end if;
  select * into v_product from public.produtos where hotmart_product_id=pg_catalog.btrim(p_hotmart_product_id) and ativo=true;
  if not found then raise exception using errcode='P0002', message='Produto interno ativo nao encontrado para o codigo Hotmart.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  select pg_catalog.count(*) into v_student_count from public.alunos where pg_catalog.lower(pg_catalog.btrim(email))=v_email;
  if v_student_count > 1 then raise exception using errcode='23505', message='Duplicidade historica de aluno para o e-mail normalizado.'; end if;
  if v_student_count = 0 then
    insert into public.alunos(nome,email,telefone) values(nullif(pg_catalog.btrim(p_nome),''),v_email,nullif(pg_catalog.btrim(p_telefone),'')) returning id into v_student_id;
    v_student_created := true;
  else
    select id into v_student_id from public.alunos where pg_catalog.lower(pg_catalog.btrim(email))=v_email limit 1;
    update public.alunos set nome=coalesce(nome,nullif(pg_catalog.btrim(p_nome),'')), telefone=coalesce(telefone,nullif(pg_catalog.btrim(p_telefone),'')) where id=v_student_id;
  end if;
  insert into public.compras(aluno_id,produto_id,hotmart_product_id,hotmart_transaction_id,status,origem,identificador_externo,observacao_administrativa,administrador_user_id,status_acesso,adquirida_em,comprada_em,cancelada_em,reembolsada_em)
  values(v_student_id,v_product.id,v_product.hotmart_product_id,pg_catalog.btrim(p_transaction_id),case p_status_acesso when 'ativo' then 'aprovada' when 'cancelado' then 'cancelada' else 'reembolsada' end,'hotmart',pg_catalog.btrim(p_transaction_id),'Importação histórica Hotmart',p_ator_user_id,p_status_acesso,p_adquirida_em,p_adquirida_em,case when p_status_acesso='cancelado' then p_adquirida_em else null end,case when p_status_acesso='reembolsado' then p_adquirida_em else null end) returning * into v_purchase;
  if p_status_acesso='ativo' then
    insert into public.liberacoes_leis(aluno_id,lei_id,compra_id,produto_id,origem,status,motivo,concedida_por)
    select v_student_id,pl.lei_id,v_purchase.id,v_product.id,'hotmart','ativo','Importação histórica Hotmart',p_ator_user_id from public.produto_leis pl join public.leis l on l.id=pl.lei_id and l.ativo=true where pl.produto_id=v_product.id;
    get diagnostics v_release_count = row_count;
  else v_release_count := 0; end if;
  perform public.admin_comercial_auditar(p_ator_user_id,'importar_historico','compra',v_purchase.id::text,null,pg_catalog.to_jsonb(v_purchase),pg_catalog.jsonb_build_object('aluno_criado',v_student_created,'liberacoes_criadas',v_release_count));
  return pg_catalog.jsonb_build_object('duplicada',false,'aluno_id',v_student_id,'aluno_criado',v_student_created,'compra_id',v_purchase.id,'liberacoes_criadas',v_release_count);
end;
$function$;

revoke all on function public.admin_importar_aquisicao_hotmart_historica(uuid,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_importar_aquisicao_hotmart_historica(uuid,text,text,text,text,text,timestamptz,text) to service_role;

commit;
