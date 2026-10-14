begin;

-- Uma única configuração global, sem afetar os comentários já publicados.
create table if not exists public.legisbot_configuracoes (
  chave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.legisbot_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (btrim(slug) <> ''),
  ordem text not null check (btrim(ordem) <> ''),
  tipo text not null check (tipo in ('vinculacao', 'sem_conteudo', 'legislacao_ausente', 'falha_tecnica')),
  usuario_id uuid references auth.users(id) on delete set null,
  ocorrencias integer not null default 1 check (ocorrencias > 0),
  primeira_ocorrencia_em timestamptz not null default now(),
  ultima_ocorrencia_em timestamptz not null default now(),
  unique (slug, ordem, tipo)
);

create index if not exists legisbot_ocorrencias_ultima_idx
  on public.legisbot_ocorrencias (ultima_ocorrencia_em desc);

create or replace function public.registrar_ocorrencia_legisbot(
  p_slug text,
  p_ordem text,
  p_tipo text,
  p_usuario_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.legisbot_ocorrencias (slug, ordem, tipo, usuario_id)
  values (lower(btrim(p_slug)), btrim(p_ordem), p_tipo, p_usuario_id)
  on conflict (slug, ordem, tipo) do update
  set ocorrencias = public.legisbot_ocorrencias.ocorrencias + 1,
      ultima_ocorrencia_em = now(),
      usuario_id = coalesce(excluded.usuario_id, public.legisbot_ocorrencias.usuario_id);
end;
$$;
revoke all on function public.registrar_ocorrencia_legisbot(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.registrar_ocorrencia_legisbot(text, text, text, uuid) to service_role;

alter table public.legisbot_configuracoes enable row level security;
alter table public.legisbot_ocorrencias enable row level security;
revoke all on public.legisbot_configuracoes, public.legisbot_ocorrencias from public, anon, authenticated;
grant select, insert, update, delete on public.legisbot_configuracoes, public.legisbot_ocorrencias to service_role;

commit;
