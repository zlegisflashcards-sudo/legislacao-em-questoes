begin;

-- A legislação pública possui uma única fonte: legislative_references.
-- As colunas slug/ordem permanecem durante a transição para compatibilidade
-- com links e registros legados.
alter table public.legisbot_comentarios
  add column if not exists reference_id uuid null
    references public.legislative_references(id) on delete restrict;

alter table public.legisbot_comentarios
  alter column legislacao drop not null;

create index if not exists legisbot_comentarios_reference_idx
  on public.legisbot_comentarios(reference_id);

update public.legisbot_comentarios as comment
set reference_id = reference.id
from public.legislative_references as reference
where comment.reference_id is null
  and lower(reference.slug) = lower(comment.slug)
  and reference.ordem = comment.ordem;

update public.legisbot_comentarios as comment
set reference_id = reference.id
from public.legislative_references as reference
where comment.reference_id is null
  and array_length(string_to_array(comment.ordem, '.'), 1) = 4
  and lower(reference.slug) = lower(comment.slug)
  and reference.ordem = concat_ws('.',
    split_part(comment.ordem, '.', 1),
    split_part(comment.ordem, '.', 2),
    split_part(comment.ordem, '.', 3),
    '0',
    split_part(comment.ordem, '.', 4),
    '0'
  );

alter table public.legisbot_destaques_usuario
  add column if not exists reference_id uuid null
    references public.legislative_references(id) on delete restrict;

create index if not exists legisbot_destaques_reference_idx
  on public.legisbot_destaques_usuario(user_id, reference_id, inicio);

update public.legisbot_destaques_usuario as highlight
set reference_id = reference.id
from public.legislative_references as reference
where highlight.reference_id is null
  and lower(reference.slug) = lower(highlight.slug)
  and reference.ordem = highlight.ordem;

update public.legisbot_destaques_usuario as highlight
set reference_id = reference.id
from public.legislative_references as reference
where highlight.reference_id is null
  and array_length(string_to_array(highlight.ordem, '.'), 1) = 4
  and lower(reference.slug) = lower(highlight.slug)
  and reference.ordem = concat_ws('.',
    split_part(highlight.ordem, '.', 1),
    split_part(highlight.ordem, '.', 2),
    split_part(highlight.ordem, '.', 3),
    '0',
    split_part(highlight.ordem, '.', 4),
    '0'
  );

create or replace function public.legisbot_destaques_validate_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference public.legislative_references%rowtype;
  legislation_text text;
begin
  new.slug := upper(btrim(new.slug));
  new.ordem := btrim(new.ordem);

  if new.reference_id is not null then
    select * into reference
    from public.legislative_references
    where id = new.reference_id;
  else
    select * into reference
    from public.legislative_references
    where lower(slug) = lower(new.slug)
      and ordem = new.ordem
    order by id
    limit 1;
  end if;

  if reference.id is null then
    raise exception 'Referência legislativa não encontrada.';
  end if;

  new.reference_id := reference.id;
  new.slug := upper(reference.slug);
  new.ordem := reference.ordem;
  legislation_text := public.legisbot_destaques_plain_legal(reference.legislacao);

  if legislation_text is null
    or new.fim > char_length(legislation_text)
    or substring(legislation_text from new.inicio + 1 for new.fim - new.inicio) <> new.trecho
  then
    raise exception 'Trecho destacado não corresponde à legislação original.';
  end if;
  return new;
end;
$$;

-- Citações da comunidade também deixam de depender da existência de comentário
-- gerado pelo LegisBot.
create or replace function public.legisbot_community_validate_comment()
returns trigger language plpgsql set search_path = public as $$
declare
  parent_row public.legisbot_comentarios_comunidade%rowtype;
  legal_text text;
  previous_row public.legisbot_comentarios_comunidade%rowtype;
begin
  new.slug := upper(btrim(new.slug));
  new.ordem := btrim(new.ordem);
  new.conteudo := nullif(btrim(replace(new.conteudo, E'\r\n', E'\n')), '');

  if new.parent_id is not null then
    select * into parent_row from public.legisbot_comentarios_comunidade where id = new.parent_id;
    if not found or parent_row.status <> 'publicado' then raise exception 'Comentário respondido indisponível.'; end if;
    if parent_row.slug <> new.slug or parent_row.ordem <> new.ordem then raise exception 'Resposta vinculada a outro artigo.'; end if;
    new.respondendo_a_user_id := parent_row.user_id;
    if parent_row.parent_id is not null then new.parent_id := parent_row.parent_id; end if;
  else
    new.respondendo_a_user_id := null;
  end if;

  if new.trecho_citado is not null then
    select public.legisbot_community_plain_legal(reference.legislacao)
      into legal_text
    from public.legislative_references as reference
    where lower(reference.slug) = lower(new.slug)
      and reference.ordem = new.ordem
    order by reference.id
    limit 1;
    if legal_text is null
      or substring(legal_text from new.trecho_destacado_inicio + 1 for new.trecho_destacado_fim - new.trecho_destacado_inicio) <> new.trecho_citado
    then raise exception 'Trecho citado não corresponde à legislação original.'; end if;
  end if;

  select * into previous_row
  from public.legisbot_comentarios_comunidade
  where user_id = new.user_id
  order by created_at desc limit 1;
  if found and previous_row.created_at > now() - interval '15 seconds' then
    raise exception 'Aguarde antes de publicar novamente.';
  end if;
  if found and previous_row.created_at > now() - interval '10 minutes' and previous_row.conteudo = new.conteudo then
    raise exception 'Comentário duplicado.';
  end if;
  return new;
end;
$$;

-- Substitui a reserva antiga: novos comentários guardam somente a referência,
-- a explicação e a assinatura da fonte, nunca outra cópia funcional da lei.
drop function if exists public.reservar_geracao_legisbot(uuid, text, text, text, text, text);

create function public.reservar_geracao_legisbot(
  p_user_id uuid,
  p_slug text,
  p_ordem text,
  p_reference_id uuid,
  p_titulo text default null,
  p_assunto text default null
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
  v_reference public.legislative_references%rowtype;
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

  select * into v_reference
  from public.legislative_references
  where id = p_reference_id;
  if not found
    or upper(v_reference.slug) <> p_slug
    or v_reference.ordem <> p_ordem
    or nullif(btrim(v_reference.legislacao), '') is null
  then
    raise exception using errcode = '22023', message = 'invalid legislative reference';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_reference_id::text, 0));

  select * into v_item
  from public.legisbot_comentarios
  where reference_id = p_reference_id
     or (slug = p_slug and ordem = p_ordem)
  order by (reference_id = p_reference_id) desc, id
  limit 1
  for update;

  if found and v_item.reference_id is null then
    update public.legisbot_comentarios
    set reference_id = p_reference_id
    where id = v_item.id
    returning * into v_item;
  end if;

  if found and v_item.status = 'concluido' and nullif(btrim(v_item.comentario), '') is not null then
    return query select 'completed'::text, v_item.id, null::timestamptz, null::timestamptz;
    return;
  end if;
  if found and v_item.status = 'pendente' and nullif(btrim(v_item.comentario), '') is not null then
    return query select 'attempts_exhausted'::text, v_item.id, null::timestamptz, null::timestamptz;
    return;
  end if;
  if found and v_item.status = 'processando' and v_item.processing_started_at is not null
    and v_item.processing_started_at > v_now - interval '2 minutes'
  then
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
  values ('user:' || v_user_key || ':10m', v_window_10m, 1, v_window_10m + interval '10 minutes', v_now)
  on conflict (chave, janela_inicio) do update
    set quantidade = public.legisbot_generation_rate_limits.quantidade + 1,
        expires_at = excluded.expires_at,
        updated_at = v_now
  returning quantidade into v_count;
  if v_count > 5 then
    return query select 'rate_limited'::text, v_item.id, v_window_10m + interval '10 minutes', null::timestamptz;
    return;
  end if;

  v_window_day := date_trunc('day', v_now);
  insert into public.legisbot_generation_rate_limits
    (chave, janela_inicio, quantidade, expires_at, updated_at)
  values ('user:' || v_user_key || ':day', v_window_day, 1, v_window_day + interval '1 day', v_now)
  on conflict (chave, janela_inicio) do update
    set quantidade = public.legisbot_generation_rate_limits.quantidade + 1,
        expires_at = excluded.expires_at,
        updated_at = v_now
  returning quantidade into v_count;
  if v_count > 20 then
    return query select 'rate_limited'::text, v_item.id, v_window_day + interval '1 day', null::timestamptz;
    return;
  end if;

  if v_item.id is null then
    insert into public.legisbot_comentarios
      (reference_id, slug, ordem, titulo, assunto, legislacao, status, comentario, modelo_ia)
    values
      (p_reference_id, p_slug, p_ordem, p_titulo, p_assunto, null, 'pendente', null, null)
    returning * into v_item;
  end if;

  update public.legisbot_comentarios
  set status = 'processando', processing_started_at = v_now,
      retry_after = null, last_error_category = null,
      attempt_count = attempt_count + 1
  where id = v_item.id
  returning * into v_item;

  return query select 'reserved'::text, v_item.id, null::timestamptz, v_item.processing_started_at;
end;
$$;

revoke all on function public.reservar_geracao_legisbot(uuid, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reservar_geracao_legisbot(uuid, text, text, uuid, text, text)
  to service_role;

create or replace function public.reset_legisbot_dependents_on_reference_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.legisbot_destaques_plain_legal(old.legislacao)
     is not distinct from public.legisbot_destaques_plain_legal(new.legislacao)
  then
    return new;
  end if;

  delete from public.legisbot_destaques_usuario
  where reference_id = new.id;

  update public.legisbot_comentarios
  set comentario = null,
      status = 'pendente',
      modelo_ia = null,
      legislacao = null,
      processing_started_at = null,
      retry_after = null,
      attempt_count = 0,
      last_error_category = null,
      source_signature = null,
      precisa_revisao = false,
      assunto = new.identificacao
  where reference_id = new.id;

  update public.legisbot_comentarios_comunidade
  set trecho_citado = null,
      trecho_destacado_inicio = null,
      trecho_destacado_fim = null
  where lower(slug) = lower(new.slug)
    and ordem = new.ordem
    and trecho_citado is not null;

  return new;
end;
$$;

drop trigger if exists reset_legisbot_dependents_on_reference_change
  on public.legislative_references;
create trigger reset_legisbot_dependents_on_reference_change
after update of legislacao on public.legislative_references
for each row execute function public.reset_legisbot_dependents_on_reference_change();

commit;
