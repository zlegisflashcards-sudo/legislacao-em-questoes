begin;

create extension if not exists pgcrypto;

create table if not exists public.registros_revisao_diaria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_revisao date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists registros_revisao_diaria_usuario_data_unique
  on public.registros_revisao_diaria (user_id, data_revisao);

alter table public.registros_revisao_diaria enable row level security;

drop policy if exists registros_revisao_diaria_ler_proprios
  on public.registros_revisao_diaria;
create policy registros_revisao_diaria_ler_proprios
  on public.registros_revisao_diaria
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.registros_revisao_diaria from public, anon, authenticated;
grant select on table public.registros_revisao_diaria to authenticated;
grant all on table public.registros_revisao_diaria to service_role;

create or replace function public.calcular_streak_revisao(
  p_user_id uuid,
  p_data_referencia date
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with dias_ordenados as (
    select
      data_revisao,
      row_number() over (order by data_revisao desc) as posicao
    from public.registros_revisao_diaria
    where user_id = p_user_id
      and data_revisao <= p_data_referencia
  )
  select count(*)::integer
  from dias_ordenados
  where data_revisao = p_data_referencia - ((posicao - 1)::integer);
$$;

revoke all on function public.calcular_streak_revisao(uuid, date) from public, anon, authenticated;
grant execute on function public.calcular_streak_revisao(uuid, date) to service_role;

create or replace function public.obter_sequencia_revisao()
returns table (
  data_revisao date,
  hoje_concluida boolean,
  streak_atual integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_hoje date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_ancora date;
  v_hoje_concluida boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.registros_revisao_diaria r
    where r.user_id = v_user_id and r.data_revisao = v_hoje
  ) into v_hoje_concluida;

  if v_hoje_concluida then
    v_ancora := v_hoje;
  elsif exists (
    select 1
    from public.registros_revisao_diaria r
    where r.user_id = v_user_id and r.data_revisao = v_hoje - 1
  ) then
    v_ancora := v_hoje - 1;
  end if;

  return query select
    case when v_hoje_concluida then v_hoje else null::date end,
    v_hoje_concluida,
    case when v_ancora is null then 0 else public.calcular_streak_revisao(v_user_id, v_ancora) end;
end;
$$;

create or replace function public.registrar_revisao_diaria()
returns table (
  data_revisao date,
  hoje_concluida boolean,
  streak_atual integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_hoje date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  insert into public.registros_revisao_diaria (user_id, data_revisao)
  values (v_user_id, v_hoje)
  on conflict do nothing;

  return query select v_hoje, true, public.calcular_streak_revisao(v_user_id, v_hoje);
end;
$$;

revoke all on function public.obter_sequencia_revisao() from public, anon;
revoke all on function public.registrar_revisao_diaria() from public, anon;
grant execute on function public.obter_sequencia_revisao() to authenticated, service_role;
grant execute on function public.registrar_revisao_diaria() to authenticated, service_role;

comment on table public.registros_revisao_diaria is
  'Registro manual de uma revisão diária por usuário, usando a data de America/Sao_Paulo.';
comment on function public.registrar_revisao_diaria() is
  'Registra atomicamente a revisão do dia do usuário autenticado e devolve o streak calculado.';

commit;
