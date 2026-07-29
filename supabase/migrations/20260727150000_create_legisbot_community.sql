begin;

create extension if not exists pgcrypto;

create table public.perfis_publicos (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_publico text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfis_publicos_nome_tamanho check (char_length(btrim(nome_publico)) between 3 and 50),
  constraint perfis_publicos_nome_formato check (
    nome_publico !~ '[<>[:cntrl:]]'
    and nome_publico !~* '(https?://|www\.)'
  )
);
create unique index perfis_publicos_nome_unique on public.perfis_publicos (lower(btrim(nome_publico)));

create table public.legisbot_comentarios_comunidade (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  slug varchar(50) not null,
  ordem varchar(20) not null,
  conteudo text,
  trecho_citado text,
  trecho_destacado_inicio integer,
  trecho_destacado_fim integer,
  parent_id uuid references public.legisbot_comentarios_comunidade(id) on delete restrict,
  respondendo_a_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'publicado',
  curtidas_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint legisbot_comunidade_status check (status in ('publicado', 'oculto', 'removido', 'em_analise')),
  constraint legisbot_comunidade_slug check (slug ~ '^[A-Z0-9_-]{1,50}$'),
  constraint legisbot_comunidade_ordem check (ordem ~ '^[A-Za-z0-9._-]{1,20}$'),
  constraint legisbot_comunidade_conteudo check (
    (status = 'removido' and conteudo is null and deleted_at is not null)
    or (status <> 'removido' and char_length(btrim(conteudo)) between 3 and 3000)
  ),
  constraint legisbot_comunidade_sem_html_links check (
    conteudo is null or (conteudo !~* '<[^>]+>' and conteudo !~* '(https?://|www\.)')
  ),
  constraint legisbot_comunidade_trecho_tamanho check (trecho_citado is null or char_length(trecho_citado) between 1 and 1000),
  constraint legisbot_comunidade_trecho_posicoes check (
    (trecho_citado is null and trecho_destacado_inicio is null and trecho_destacado_fim is null)
    or (
      trecho_citado is not null
      and trecho_destacado_inicio is not null
      and trecho_destacado_fim is not null
      and trecho_destacado_inicio >= 0
      and trecho_destacado_fim > trecho_destacado_inicio
    )
  ),
  constraint legisbot_comunidade_curtidas_nao_negativas check (curtidas_count >= 0)
);

create index legisbot_comunidade_slug_idx on public.legisbot_comentarios_comunidade (slug);
create index legisbot_comunidade_ordem_idx on public.legisbot_comentarios_comunidade (ordem);
create index legisbot_comunidade_thread_idx on public.legisbot_comentarios_comunidade (slug, ordem, status, created_at desc);
create index legisbot_comunidade_relevancia_idx on public.legisbot_comentarios_comunidade (slug, ordem, curtidas_count desc, created_at desc) where parent_id is null;
create index legisbot_comunidade_parent_idx on public.legisbot_comentarios_comunidade (parent_id, created_at);
create index legisbot_comunidade_user_idx on public.legisbot_comentarios_comunidade (user_id, created_at desc);
create index legisbot_comunidade_status_idx on public.legisbot_comentarios_comunidade (status);

create table public.legisbot_comentarios_curtidas (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.legisbot_comentarios_comunidade(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comentario_id, user_id)
);
create index legisbot_curtidas_comentario_idx on public.legisbot_comentarios_curtidas (comentario_id);
create index legisbot_curtidas_user_idx on public.legisbot_comentarios_curtidas (user_id);

create table public.legisbot_comentarios_denuncias (
  id uuid primary key default gen_random_uuid(),
  comentario_id uuid not null references public.legisbot_comentarios_comunidade(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  motivo text not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comentario_id, user_id),
  constraint legisbot_denuncias_motivo check (motivo in ('incorreto', 'ofensivo', 'spam', 'fora_do_tema', 'outro')),
  constraint legisbot_denuncias_status check (status in ('pendente', 'em_analise', 'resolvida', 'descartada'))
);
create index legisbot_denuncias_comentario_idx on public.legisbot_comentarios_denuncias (comentario_id);
create index legisbot_denuncias_status_idx on public.legisbot_comentarios_denuncias (status, created_at desc);

create function public.legisbot_community_is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.role() = 'service_role'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'admin' = 'true', false);
$$;

create function public.legisbot_community_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at = old.created_at;
  new.updated_at = now();
  return new;
end;
$$;
create trigger perfis_publicos_updated_at before update on public.perfis_publicos for each row execute function public.legisbot_community_set_updated_at();
create trigger legisbot_comunidade_updated_at before update on public.legisbot_comentarios_comunidade for each row execute function public.legisbot_community_set_updated_at();
create trigger legisbot_denuncias_updated_at before update on public.legisbot_comentarios_denuncias for each row execute function public.legisbot_community_set_updated_at();

create function public.legisbot_community_create_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare suggested_name text;
begin
  suggested_name := nullif(btrim(new.raw_user_meta_data ->> 'nome_publico'), '');
  if suggested_name is null or exists (
    select 1 from public.perfis_publicos where lower(nome_publico) = lower(suggested_name)
  ) then suggested_name := 'Estudante-' || left(new.id::text, 8); end if;
  insert into public.perfis_publicos (id, nome_publico)
  values (new.id, suggested_name)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger legisbot_community_auth_user_created after insert on auth.users for each row execute function public.legisbot_community_create_profile();

insert into public.perfis_publicos (id, nome_publico)
select u.id,
       case
         when nullif(btrim(u.raw_user_meta_data ->> 'nome_publico'), '') is not null
           and 1 = (
             select count(*) from auth.users matching
             where lower(btrim(matching.raw_user_meta_data ->> 'nome_publico')) = lower(btrim(u.raw_user_meta_data ->> 'nome_publico'))
           )
           and not exists (
             select 1 from public.perfis_publicos p
             where lower(p.nome_publico) = lower(btrim(u.raw_user_meta_data ->> 'nome_publico'))
           )
         then btrim(u.raw_user_meta_data ->> 'nome_publico')
         else 'Estudante-' || left(u.id::text, 8)
       end
from auth.users u
on conflict (id) do nothing;

create function public.legisbot_community_plain_legal(value text)
returns text language sql immutable as $$
  select btrim(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(value, ''), '<br\s*/?>', E'\n', 'gi'),
          '</p\s*>', E'\n', 'gi'
        ),
        '<[^>]*>', '', 'g'
      ),
      '&nbsp;', ' '
    ), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', '''')
  );
$$;

create function public.legisbot_community_validate_comment()
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
    select public.legisbot_community_plain_legal(l.legislacao) into legal_text
    from public.legisbot_comentarios l where l.slug = new.slug and l.ordem = new.ordem;
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
create trigger legisbot_comunidade_validate_before_insert before insert on public.legisbot_comentarios_comunidade for each row execute function public.legisbot_community_validate_comment();

create function public.legisbot_community_protect_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1
    and new.user_id = old.user_id
    and new.slug = old.slug
    and new.ordem = old.ordem
    and new.parent_id is not distinct from old.parent_id
    and new.respondendo_a_user_id is not distinct from old.respondendo_a_user_id
    and new.conteudo is not distinct from old.conteudo
    and new.trecho_citado is not distinct from old.trecho_citado
    and new.trecho_destacado_inicio is not distinct from old.trecho_destacado_inicio
    and new.trecho_destacado_fim is not distinct from old.trecho_destacado_fim
    and new.status = old.status
    and new.deleted_at is not distinct from old.deleted_at
  then return new; end if;
  if public.legisbot_community_is_admin() then return new; end if;
  if old.user_id <> auth.uid() then raise exception 'Operação não autorizada.'; end if;
  if new.user_id <> old.user_id or new.slug <> old.slug or new.ordem <> old.ordem
    or new.parent_id is distinct from old.parent_id
    or new.respondendo_a_user_id is distinct from old.respondendo_a_user_id
    or new.trecho_citado is distinct from old.trecho_citado
    or new.trecho_destacado_inicio is distinct from old.trecho_destacado_inicio
    or new.trecho_destacado_fim is distinct from old.trecho_destacado_fim
    or new.curtidas_count <> old.curtidas_count
    or new.created_at <> old.created_at
  then raise exception 'Campos protegidos não podem ser alterados.'; end if;
  if old.status <> 'publicado' or new.status not in ('publicado', 'removido') then raise exception 'Status não permitido.'; end if;
  if new.status = 'publicado' and new.deleted_at is distinct from old.deleted_at then raise exception 'Exclusão inválida.'; end if;
  return new;
end;
$$;
create trigger legisbot_comunidade_protect_before_update before update on public.legisbot_comentarios_comunidade for each row execute function public.legisbot_community_protect_update();

create function public.legisbot_community_validate_like()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.legisbot_comentarios_comunidade where id = new.comentario_id and user_id = new.user_id) then
    raise exception 'Não é permitido curtir o próprio comentário.';
  end if;
  return new;
end;
$$;
create trigger legisbot_curtidas_validate_before_insert before insert on public.legisbot_comentarios_curtidas for each row execute function public.legisbot_community_validate_like();

create function public.legisbot_community_update_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.legisbot_comentarios_comunidade set curtidas_count = curtidas_count + 1 where id = new.comentario_id;
    return new;
  end if;
  update public.legisbot_comentarios_comunidade set curtidas_count = greatest(curtidas_count - 1, 0) where id = old.comentario_id;
  return old;
end;
$$;
create trigger legisbot_curtidas_count_after_change after insert or delete on public.legisbot_comentarios_curtidas for each row execute function public.legisbot_community_update_like_count();

alter table public.perfis_publicos enable row level security;
alter table public.legisbot_comentarios_comunidade enable row level security;
alter table public.legisbot_comentarios_curtidas enable row level security;
alter table public.legisbot_comentarios_denuncias enable row level security;

create policy perfis_publicos_leitura on public.perfis_publicos for select to anon, authenticated using (true);
create policy perfis_publicos_criar_proprio on public.perfis_publicos for insert to authenticated with check (id = auth.uid());
create policy perfis_publicos_editar_proprio on public.perfis_publicos for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy perfis_publicos_admin on public.perfis_publicos for all to authenticated using (public.legisbot_community_is_admin()) with check (public.legisbot_community_is_admin());

create policy comunidade_leitura_publica on public.legisbot_comentarios_comunidade for select to anon, authenticated using (status in ('publicado', 'removido'));
create policy comunidade_criar_proprio on public.legisbot_comentarios_comunidade for insert to authenticated with check (user_id = auth.uid() and status = 'publicado' and curtidas_count = 0);
create policy comunidade_editar_proprio on public.legisbot_comentarios_comunidade for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and status in ('publicado', 'removido'));
create policy comunidade_admin on public.legisbot_comentarios_comunidade for all to authenticated using (public.legisbot_community_is_admin()) with check (public.legisbot_community_is_admin());

create policy curtidas_ler_proprias on public.legisbot_comentarios_curtidas for select to authenticated using (user_id = auth.uid());
create policy curtidas_criar_propria on public.legisbot_comentarios_curtidas for insert to authenticated with check (user_id = auth.uid());
create policy curtidas_remover_propria on public.legisbot_comentarios_curtidas for delete to authenticated using (user_id = auth.uid());
create policy curtidas_admin on public.legisbot_comentarios_curtidas for all to authenticated using (public.legisbot_community_is_admin()) with check (public.legisbot_community_is_admin());

create policy denuncias_criar_propria on public.legisbot_comentarios_denuncias for insert to authenticated with check (
  user_id = auth.uid()
  and not exists (
    select 1 from public.legisbot_comentarios_comunidade c
    where c.id = comentario_id and c.user_id = auth.uid()
  )
);
create policy denuncias_ler_propria on public.legisbot_comentarios_denuncias for select to authenticated using (user_id = auth.uid());
create policy denuncias_admin on public.legisbot_comentarios_denuncias for all to authenticated using (public.legisbot_community_is_admin()) with check (public.legisbot_community_is_admin());

grant select on public.perfis_publicos, public.legisbot_comentarios_comunidade to anon, authenticated;
grant insert, update on public.perfis_publicos, public.legisbot_comentarios_comunidade to authenticated;
grant select, insert, delete on public.legisbot_comentarios_curtidas to authenticated;
grant select, insert, update on public.legisbot_comentarios_denuncias to authenticated;

commit;
