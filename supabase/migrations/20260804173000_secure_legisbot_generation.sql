-- Protege a geração do LegisBot com reserva atômica, lease e limites persistentes.

alter table public.legisbot_comentarios
  add column if not exists processing_started_at timestamptz,
  add column if not exists retry_after timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error_category text;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.legisbot_comentarios'::regclass
       and conname = 'legisbot_comentarios_attempt_count_nonnegative'
  ) then
    alter table public.legisbot_comentarios
      add constraint legisbot_comentarios_attempt_count_nonnegative
      check (attempt_count >= 0);
  end if;
end
$$;

create table if not exists public.legisbot_generation_rate_limits (
  chave text not null,
  janela_inicio timestamptz not null,
  quantidade integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legisbot_generation_rate_limits_pkey primary key (chave, janela_inicio),
  constraint legisbot_generation_rate_limits_chave_not_blank check (btrim(chave) <> ''),
  constraint legisbot_generation_rate_limits_quantidade_nonnegative check (quantidade >= 0),
  constraint legisbot_generation_rate_limits_expiry_valid check (expires_at > janela_inicio)
);

create index if not exists legisbot_generation_rate_limits_expires_idx
  on public.legisbot_generation_rate_limits (expires_at);

alter table public.legisbot_generation_rate_limits enable row level security;

revoke all on table public.legisbot_generation_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.legisbot_generation_rate_limits to service_role;

create or replace function public.reservar_geracao_legisbot(
  p_user_id uuid,
  p_slug text,
  p_ordem text,
  p_titulo text default null,
  p_assunto text default null,
  p_legislacao text default null
)
returns table (
  decisao text,
  comentario_id bigint,
  tentar_apos timestamptz,
  reservation_started_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_item public.legisbot_comentarios%rowtype;
  v_window_10m timestamptz;
  v_window_day timestamptz;
  v_count integer;
  v_user_key text := p_user_id::text;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'authenticated user is required';
  end if;
  if p_slug is null or p_slug !~ '^[A-Z0-9_-]{1,50}$' then
    raise exception using errcode = '22023', message = 'invalid slug';
  end if;
  if p_ordem is null or p_ordem !~ '^[A-Za-z0-9._-]{1,20}$' then
    raise exception using errcode = '22023', message = 'invalid order';
  end if;

  -- Serializa criação e recuperação do mesmo item, inclusive quando a linha ainda não existe.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_slug || chr(31) || p_ordem, 0)
  );

  select *
    into v_item
    from public.legisbot_comentarios
   where slug = p_slug and ordem = p_ordem
   for update;

  if found and v_item.status = 'concluido' and nullif(btrim(v_item.comentario), '') is not null then
    return query select 'completed'::text, v_item.id, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Um comentário pendente preenchido é rascunho manual do painel e nunca deve ser sobrescrito pela IA.
  if found and v_item.status = 'pendente' and nullif(btrim(v_item.comentario), '') is not null then
    return query select 'attempts_exhausted'::text, v_item.id, null::timestamptz, null::timestamptz;
    return;
  end if;

  if found
     and v_item.status = 'processando'
     and v_item.processing_started_at is not null
     and v_item.processing_started_at > v_now - interval '2 minutes' then
    return query select 'processing'::text, v_item.id, v_item.processing_started_at + interval '2 minutes', null::timestamptz;
    return;
  end if;

  if found and v_item.retry_after is not null and v_item.retry_after > v_now then
    return query select 'cooldown'::text, v_item.id, v_item.retry_after, null::timestamptz;
    return;
  end if;

  if found and v_item.attempt_count >= 3 then
    return query select 'attempts_exhausted'::text, v_item.id, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not found and (
    p_titulo is null or btrim(p_titulo) = '' or char_length(p_titulo) > 255
    or p_assunto is null or btrim(p_assunto) = '' or char_length(p_assunto) > 255
    or p_legislacao is null or btrim(p_legislacao) = '' or char_length(p_legislacao) > 16000
  ) then
    raise exception using errcode = '22023', message = 'complete generation data is required';
  end if;

  delete from public.legisbot_generation_rate_limits
   where chave in ('user:' || v_user_key || ':10m', 'user:' || v_user_key || ':day')
     and expires_at <= v_now;

  v_window_10m := date_trunc('hour', v_now)
    + make_interval(mins => (extract(minute from v_now)::integer / 10) * 10);
  insert into public.legisbot_generation_rate_limits
    (chave, janela_inicio, quantidade, expires_at, updated_at)
  values
    ('user:' || v_user_key || ':10m', v_window_10m, 1, v_window_10m + interval '10 minutes', v_now)
  on conflict (chave, janela_inicio) do update
    set quantidade = public.legisbot_generation_rate_limits.quantidade + 1,
        expires_at = excluded.expires_at,
        updated_at = v_now
  returning quantidade into v_count;

  if v_count > 5 then
    return query select 'rate_limited'::text, v_item.id,
      v_window_10m + interval '10 minutes', null::timestamptz;
    return;
  end if;

  v_window_day := date_trunc('day', v_now);
  insert into public.legisbot_generation_rate_limits
    (chave, janela_inicio, quantidade, expires_at, updated_at)
  values
    ('user:' || v_user_key || ':day', v_window_day, 1, v_window_day + interval '1 day', v_now)
  on conflict (chave, janela_inicio) do update
    set quantidade = public.legisbot_generation_rate_limits.quantidade + 1,
        expires_at = excluded.expires_at,
        updated_at = v_now
  returning quantidade into v_count;

  if v_count > 20 then
    return query select 'rate_limited'::text, v_item.id,
      v_window_day + interval '1 day', null::timestamptz;
    return;
  end if;

  if v_item.id is null then
    insert into public.legisbot_comentarios
      (slug, ordem, titulo, assunto, legislacao, status, comentario, modelo_ia)
    values
      (p_slug, p_ordem, p_titulo, p_assunto, p_legislacao, 'pendente', null, null)
    returning * into v_item;
  end if;

  update public.legisbot_comentarios
     set status = 'processando',
         processing_started_at = v_now,
         retry_after = null,
         last_error_category = null,
         attempt_count = attempt_count + 1
   where id = v_item.id
  returning * into v_item;

  return query select 'reserved'::text, v_item.id, null::timestamptz, v_item.processing_started_at;
end;
$$;

revoke all on function public.reservar_geracao_legisbot(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reservar_geracao_legisbot(uuid, text, text, text, text, text)
  to service_role;

comment on table public.legisbot_generation_rate_limits is
  'Janelas persistentes de rate limit da geração do LegisBot; acesso exclusivo do servidor.';
comment on function public.reservar_geracao_legisbot(uuid, text, text, text, text, text) is
  'Reserva atomicamente uma geração autenticada, aplicando lease, cooldown, tentativas e limites por usuário.';
