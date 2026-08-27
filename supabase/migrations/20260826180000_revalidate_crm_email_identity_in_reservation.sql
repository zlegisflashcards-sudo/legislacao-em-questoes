begin;

create or replace function public.claim_crm_access_email(p_compra_id uuid, p_aluno_id uuid, p_descricao text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_compra public.compras;
  v_aluno public.alunos;
  v_key text;
  v_existing_key text;
  v_external_key text;
  v_status text;
  v_auth_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_compra_id::text, 0));
  select * into v_compra from public.compras where id=p_compra_id for update;
  if not found or v_compra.aluno_id is distinct from p_aluno_id then return jsonb_build_object('status','inconsistent'); end if;
  if v_compra.status_acesso <> 'ativo' then return jsonb_build_object('status','access_inactive'); end if;
  if exists (select 1 from public.compras_pos_venda_overrides o where o.compra_id=p_compra_id and o.etapa=3) then return jsonb_build_object('status','e3_completed'); end if;
  select * into v_aluno from public.alunos where id=p_aluno_id;
  if not found or coalesce(btrim(v_aluno.email),'')='' or v_aluno.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('status','invalid_email'); end if;
  if exists (select 1 from public.alunos a where a.id<>p_aluno_id and lower(btrim(a.email))=lower(btrim(v_aluno.email))) then return jsonb_build_object('status','email_conflict'); end if;
  select u.id into v_auth_user_id from auth.users u where lower(u.email)=lower(btrim(v_aluno.email)) limit 1;
  if v_auth_user_id is not null and v_aluno.user_id is not null and v_auth_user_id<>v_aluno.user_id then return jsonb_build_object('status','email_conflict'); end if;
  if v_auth_user_id is not null and exists (select 1 from public.alunos a where a.id<>p_aluno_id and a.user_id=v_auth_user_id) then return jsonb_build_object('status','email_conflict'); end if;
  v_key := 'administrativo:' || p_compra_id::text;
  v_external_key := case when coalesce(v_compra.identificador_externo,'') <> '' then 'hotmart:' || v_compra.identificador_externo else null end;
  select n.idempotency_key,n.status into v_existing_key,v_status from public.alunos_notificacoes_acesso n where n.aluno_id=p_aluno_id and n.idempotency_key in (v_key,coalesce(v_external_key,'')) order by n.criado_em desc limit 1;
  if found then v_key:=v_existing_key; end if;
  if found and v_status='enviado' then return jsonb_build_object('status','already_sent'); end if;
  if found and v_status='reservado' then return jsonb_build_object('status','processing'); end if;
  if found and v_status='falhou' then update public.alunos_notificacoes_acesso set status='reservado',erro=null,enviado_em=null where idempotency_key=v_key and status='falhou'; return jsonb_build_object('status','claimed','idempotency_key',v_key); end if;
  insert into public.alunos_notificacoes_acesso(aluno_id,idempotency_key,tipo,status,origem,descricao) values(p_aluno_id,v_key,'nova_aquisicao','reservado','administrativo_lote',nullif(btrim(p_descricao),''));
  return jsonb_build_object('status','claimed','idempotency_key',v_key);
end;
$$;

commit;
