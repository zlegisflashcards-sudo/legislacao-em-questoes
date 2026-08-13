begin;

-- Kept here (rather than changing an old migration) so an existing remote schema
-- receives the refund-request state together with the single access lifecycle.
alter table public.compras
  add column if not exists reembolso_solicitado_em timestamptz;

alter table public.compras drop constraint if exists compras_status_acesso_check;
alter table public.compras add constraint compras_status_acesso_check check (
  status_acesso is null or status_acesso in ('ativo', 'cancelado', 'reembolsado', 'reembolso_solicitado')
);

create or replace function public.definir_status_acesso_compra(
  p_compra_id uuid,
  p_status_acesso text,
  p_status_legado text,
  p_acao text,
  p_ator_user_id uuid default null,
  p_motivo text default null,
  p_ocorrido_em timestamptz default pg_catalog.now()
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_role text;
  v_before public.compras;
  v_after public.compras;
  v_release_status text;
  v_count integer;
begin
  v_role := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  if v_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Contexto de acesso invalido.';
  end if;
  if p_ator_user_id is not null and not exists(select 1 from auth.users where id = p_ator_user_id) then
    raise exception using errcode = '42501', message = 'Ator administrativo invalido.';
  end if;
  if p_status_acesso not in ('ativo', 'cancelado', 'reembolsado', 'reembolso_solicitado') then
    raise exception using errcode = '22023', message = 'Status de acesso invalido.';
  end if;

  select * into v_before from public.compras where id = p_compra_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Aquisicao nao encontrada.'; end if;

  -- A release is the origin of the effective entitlement. Only rows tied to this
  -- purchase are changed, so another purchase or a manual release remains active.
  v_release_status := case when p_status_acesso = 'ativo' then 'ativo'
                           when p_status_acesso = 'cancelado' then 'cancelado'
                           else 'reembolsado' end;
  if v_before.status_acesso = p_status_acesso and v_before.status = p_status_legado
    and not exists(select 1 from public.liberacoes_leis where compra_id = p_compra_id and status is distinct from v_release_status) then
    return pg_catalog.jsonb_build_object('compra', pg_catalog.to_jsonb(v_before), 'liberacoes_atualizadas', 0, 'idempotente', true);
  end if;
  update public.compras set
    status_acesso = p_status_acesso,
    status = p_status_legado,
    cancelada_em = case when p_status_acesso = 'cancelado' then p_ocorrido_em else cancelada_em end,
    reembolsada_em = case when p_status_acesso = 'reembolsado' then p_ocorrido_em else reembolsada_em end,
    reativada_em = case when p_status_acesso = 'ativo' then p_ocorrido_em else reativada_em end,
    reembolso_solicitado_em = case when p_status_acesso = 'reembolso_solicitado' then p_ocorrido_em
                                    when p_status_acesso = 'ativo' then null else reembolso_solicitado_em end,
    administrador_user_id = coalesce(p_ator_user_id, administrador_user_id)
  where id = p_compra_id returning * into v_after;

  update public.liberacoes_leis set
    status = v_release_status,
    motivo = case when v_release_status = 'ativo' then null else coalesce(p_motivo, motivo) end,
    revogada_por = case when v_release_status = 'ativo' then null else p_ator_user_id end,
    revogada_em = case when v_release_status = 'ativo' then null else p_ocorrido_em end
  where compra_id = p_compra_id
    and status is distinct from v_release_status;
  get diagnostics v_count = row_count;

  insert into public.auditoria_administrativa
    (ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes)
  values
    (p_ator_user_id, p_acao, 'compra', p_compra_id::text, pg_catalog.to_jsonb(v_before), pg_catalog.to_jsonb(v_after),
      pg_catalog.jsonb_build_object('liberacoes_atualizadas', v_count, 'motivo', p_motivo, 'somente_compra', true));
  return pg_catalog.jsonb_build_object('compra', pg_catalog.to_jsonb(v_after), 'liberacoes_atualizadas', v_count);
end;
$function$;

create or replace function public.admin_alterar_status_aquisicao(p_ator_user_id uuid,p_compra_id uuid,p_status_acesso text,p_status_legado text,p_acao text)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  return public.definir_status_acesso_compra(p_compra_id,p_status_acesso,p_status_legado,p_acao,p_ator_user_id);
end;
$function$;

create or replace function public.admin_solicitar_reembolso_aquisicao(p_ator_user_id uuid,p_compra_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  return public.definir_status_acesso_compra(p_compra_id,'reembolso_solicitado','reembolso_solicitado','solicitar_reembolso',p_ator_user_id,'Solicitacao de reembolso');
end;
$function$;

revoke all on function public.definir_status_acesso_compra(uuid,text,text,text,uuid,text,timestamptz), public.admin_solicitar_reembolso_aquisicao(uuid,uuid) from public, anon, authenticated;
grant execute on function public.definir_status_acesso_compra(uuid,text,text,text,uuid,text,timestamptz), public.admin_solicitar_reembolso_aquisicao(uuid,uuid) to service_role;

commit;
