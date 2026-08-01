create table if not exists public.legisbot_alertas_administrativos (
  chave text primary key,
  ultimo_envio timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legisbot_alertas_administrativos enable row level security;

revoke all on table public.legisbot_alertas_administrativos from anon, authenticated;

create or replace function public.reservar_alerta_legisbot(
  p_chave text,
  p_janela_segundos integer default 1800
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas_afetadas integer;
begin
  if nullif(btrim(p_chave), '') is null then
    raise exception 'chave obrigatoria';
  end if;

  if p_janela_segundos < 1 then
    raise exception 'janela invalida';
  end if;

  insert into public.legisbot_alertas_administrativos as alerta (
    chave,
    ultimo_envio,
    created_at,
    updated_at
  )
  values (btrim(p_chave), now(), now(), now())
  on conflict (chave) do update
    set ultimo_envio = excluded.ultimo_envio,
        updated_at = excluded.updated_at
    where alerta.ultimo_envio <= now() - make_interval(secs => p_janela_segundos);

  get diagnostics linhas_afetadas = row_count;
  return linhas_afetadas = 1;
end;
$$;

revoke all on function public.reservar_alerta_legisbot(text, integer) from public, anon, authenticated;
grant execute on function public.reservar_alerta_legisbot(text, integer) to service_role;

comment on table public.legisbot_alertas_administrativos is
  'Controle server-side da deduplicação de alertas administrativos do LegisBot.';

