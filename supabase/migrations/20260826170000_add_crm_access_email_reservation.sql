begin;

create or replace function public.claim_crm_access_email(p_compra_id uuid, p_aluno_id uuid, p_descricao text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_compra public.compras;
  v_key text;
  v_existing_key text;
  v_external_key text;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_compra_id::text, 0));
  select * into v_compra from public.compras where id=p_compra_id for update;
  if not found or v_compra.aluno_id is distinct from p_aluno_id then return jsonb_build_object('status','inconsistent'); end if;
  if v_compra.status_acesso <> 'ativo' then return jsonb_build_object('status','access_inactive'); end if;
  if exists (select 1 from public.compras_pos_venda_overrides o where o.compra_id=p_compra_id and o.etapa=3) then return jsonb_build_object('status','e3_completed'); end if;
  v_key := 'administrativo:' || p_compra_id::text;
  v_external_key := case when coalesce(v_compra.identificador_externo,'') <> '' then 'hotmart:' || v_compra.identificador_externo else null end;
  select n.idempotency_key,n.status into v_existing_key,v_status
  from public.alunos_notificacoes_acesso n
  where n.aluno_id=p_aluno_id and n.idempotency_key in (v_key, coalesce(v_external_key,''))
  order by n.criado_em desc
  limit 1;
  if found then v_key := v_existing_key; end if;
  if found and v_status='enviado' then return jsonb_build_object('status','already_sent'); end if;
  if found and v_status='reservado' then return jsonb_build_object('status','processing'); end if;
  if found and v_status='falhou' then
    update public.alunos_notificacoes_acesso set status='reservado',erro=null,enviado_em=null where idempotency_key=v_key and status='falhou';
    return jsonb_build_object('status','claimed','idempotency_key',v_key);
  end if;
  insert into public.alunos_notificacoes_acesso(aluno_id,idempotency_key,tipo,status,origem,descricao)
  values(p_aluno_id,v_key,'nova_aquisicao','reservado','administrativo_lote',nullif(btrim(p_descricao),''));
  return jsonb_build_object('status','claimed','idempotency_key',v_key);
end;
$$;

create or replace function public.finish_crm_access_email(p_idempotency_key text, p_success boolean, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog
as $$
begin
  update public.alunos_notificacoes_acesso
  set status=case when p_success then 'enviado' else 'falhou' end,
      enviado_em=case when p_success then now() else null end,
      erro=case when p_success then null else left(coalesce(p_error,'Falha ao enviar e-mail.'),500) end
  where idempotency_key=p_idempotency_key and status='reservado';
  return found;
end;
$$;

revoke all on function public.claim_crm_access_email(uuid,uuid,text), public.finish_crm_access_email(text,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_crm_access_email(uuid,uuid,text), public.finish_crm_access_email(text,boolean,text) to service_role;

commit;
