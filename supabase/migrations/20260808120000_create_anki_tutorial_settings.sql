begin;

create table if not exists public.configuracao_anki_tutoriais (
  id smallint primary key default 1 check (id = 1),
  computador_app_url text,
  computador_tutorial_url text,
  android_app_url text,
  android_tutorial_url text,
  ios_app_url text,
  ios_tutorial_url text,
  navegador_app_url text,
  navegador_tutorial_url text,
  tutorial_questoes_url text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.configuracao_anki_tutoriais (id)
values (1)
on conflict (id) do nothing;

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.configuracao_anki_tutoriais'::pg_catalog.regclass
      and tgname = 'configuracao_anki_tutoriais_definir_updated_at'
  ) then
    create trigger configuracao_anki_tutoriais_definir_updated_at
      before update on public.configuracao_anki_tutoriais
      for each row execute function public.definir_updated_at();
  end if;
end;
$do$;

alter table public.configuracao_anki_tutoriais enable row level security;
revoke all on table public.configuracao_anki_tutoriais from public, anon, authenticated;
grant all on table public.configuracao_anki_tutoriais to service_role;

create or replace function public.admin_atualizar_configuracao_anki_tutoriais(
  p_ator_user_id uuid,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_before public.configuracao_anki_tutoriais;
  v_after public.configuracao_anki_tutoriais;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);

  if p_dados is null
    or p_dados - array[
      'computador_app_url', 'computador_tutorial_url',
      'android_app_url', 'android_tutorial_url',
      'ios_app_url', 'ios_tutorial_url',
      'navegador_app_url', 'navegador_tutorial_url',
      'tutorial_questoes_url'
    ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Campos da configuracao do Anki invalidos.';
  end if;

  select * into v_before
  from public.configuracao_anki_tutoriais
  where id = 1
  for update;

  update public.configuracao_anki_tutoriais
  set
    computador_app_url = case when p_dados ? 'computador_app_url' then nullif(p_dados->>'computador_app_url', '') else computador_app_url end,
    computador_tutorial_url = case when p_dados ? 'computador_tutorial_url' then nullif(p_dados->>'computador_tutorial_url', '') else computador_tutorial_url end,
    android_app_url = case when p_dados ? 'android_app_url' then nullif(p_dados->>'android_app_url', '') else android_app_url end,
    android_tutorial_url = case when p_dados ? 'android_tutorial_url' then nullif(p_dados->>'android_tutorial_url', '') else android_tutorial_url end,
    ios_app_url = case when p_dados ? 'ios_app_url' then nullif(p_dados->>'ios_app_url', '') else ios_app_url end,
    ios_tutorial_url = case when p_dados ? 'ios_tutorial_url' then nullif(p_dados->>'ios_tutorial_url', '') else ios_tutorial_url end,
    navegador_app_url = case when p_dados ? 'navegador_app_url' then nullif(p_dados->>'navegador_app_url', '') else navegador_app_url end,
    navegador_tutorial_url = case when p_dados ? 'navegador_tutorial_url' then nullif(p_dados->>'navegador_tutorial_url', '') else navegador_tutorial_url end,
    tutorial_questoes_url = case when p_dados ? 'tutorial_questoes_url' then nullif(p_dados->>'tutorial_questoes_url', '') else tutorial_questoes_url end
  where id = 1
  returning * into v_after;

  perform public.admin_comercial_auditar(
    p_ator_user_id, 'atualizar', 'configuracao_anki_tutoriais', '1',
    pg_catalog.to_jsonb(v_before), pg_catalog.to_jsonb(v_after)
  );
  return pg_catalog.to_jsonb(v_after);
end;
$function$;

revoke all on function public.admin_atualizar_configuracao_anki_tutoriais(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_atualizar_configuracao_anki_tutoriais(uuid, jsonb) to service_role;

commit;
