begin;

-- Estado editorial explícito por faixa. A publicação do áudio continua
-- imutável: uma marcação não desativa, não substitui e não remove o arquivo.
alter table public.legiscast_audios
  add column if not exists situacao_atualizacao_manual text,
  add column if not exists situacao_atualizacao_em timestamptz,
  add column if not exists situacao_atualizacao_motivo text,
  add column if not exists situacao_atualizacao_alteracao_referencia text,
  add column if not exists situacao_atualizacao_alteracao_data date,
  add column if not exists situacao_atualizacao_por uuid references auth.users(id) on delete set null;

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legiscast_audios'::regclass
      and conname = 'legiscast_audios_situacao_atualizacao_manual_check'
  ) then
    alter table public.legiscast_audios
      add constraint legiscast_audios_situacao_atualizacao_manual_check
      check (situacao_atualizacao_manual is null or situacao_atualizacao_manual in ('atual', 'desatualizado'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legiscast_audios'::regclass
      and conname = 'legiscast_audios_situacao_atualizacao_manual_coerente_check'
  ) then
    alter table public.legiscast_audios
      add constraint legiscast_audios_situacao_atualizacao_manual_coerente_check
      check (
        (situacao_atualizacao_manual is null
          and situacao_atualizacao_em is null
          and situacao_atualizacao_motivo is null
          and situacao_atualizacao_alteracao_referencia is null
          and situacao_atualizacao_alteracao_data is null
          and situacao_atualizacao_por is null)
        or (situacao_atualizacao_manual is not null and situacao_atualizacao_em is not null)
      );
  end if;
end
$do$;

create or replace function public.admin_set_legiscast_audio_freshness(
  p_actor_user_id uuid,
  p_audio_id uuid,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.legiscast_audios;
  v_after public.legiscast_audios;
  v_law public.leis;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_status text;
  v_action text;
begin
  if p_action not in ('mark_outdated', 'mark_current', 'clear') then
    raise exception using errcode = '22023', message = 'Ação de atualização do áudio inválida.';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'O motivo da atualização deve ter no máximo 2.000 caracteres.';
  end if;

  select * into v_before
    from public.legiscast_audios
   where id = p_audio_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Áudio não encontrado.';
  end if;

  select * into v_law
    from public.leis
   where id = v_before.lei_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Lei do áudio não encontrada.';
  end if;

  if p_action = 'clear' then
    update public.legiscast_audios
       set situacao_atualizacao_manual = null,
           situacao_atualizacao_em = null,
           situacao_atualizacao_motivo = null,
           situacao_atualizacao_alteracao_referencia = null,
           situacao_atualizacao_alteracao_data = null,
           situacao_atualizacao_por = null,
           updated_at = pg_catalog.now()
     where id = v_before.id
     returning * into v_after;
    v_action := 'limpar_controle_atualizacao_legiscast';
  else
    v_status := case when p_action = 'mark_outdated' then 'desatualizado' else 'atual' end;
    update public.legiscast_audios
       set situacao_atualizacao_manual = v_status,
           situacao_atualizacao_em = pg_catalog.now(),
           situacao_atualizacao_motivo = v_reason,
           situacao_atualizacao_alteracao_referencia = case when v_law.houve_alteracao_legislativa then v_law.ultima_alteracao_referencia else null end,
           situacao_atualizacao_alteracao_data = case when v_law.houve_alteracao_legislativa then v_law.ultima_alteracao_data else null end,
           situacao_atualizacao_por = p_actor_user_id,
           updated_at = pg_catalog.now()
     where id = v_before.id
     returning * into v_after;
    v_action := case when v_status = 'desatualizado' then 'marcar_legiscast_desatualizado' else 'confirmar_legiscast_atualizado' end;
  end if;

  insert into public.auditoria_administrativa(
    ator_user_id, acao, entidade, entidade_id, estado_anterior, estado_posterior, detalhes
  ) values (
    p_actor_user_id, v_action, 'legiscast_audio', v_before.id::text,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('lei_id', v_before.lei_id, 'motivo_informado', v_reason)
  );

  return jsonb_build_object('audio', to_jsonb(v_after));
end;
$function$;

revoke all on function public.admin_set_legiscast_audio_freshness(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_legiscast_audio_freshness(uuid, uuid, text, text)
  to service_role;

commit;
