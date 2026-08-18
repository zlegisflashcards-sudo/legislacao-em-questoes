begin;

create extension if not exists btree_gist;

create table public.legisbot_destaques_usuario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug varchar(50) not null,
  ordem varchar(20) not null,
  inicio integer not null,
  fim integer not null,
  trecho text not null,
  cor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legisbot_destaques_slug check (slug ~ '^[A-Z0-9_-]{1,50}$'),
  constraint legisbot_destaques_ordem check (ordem ~ '^[A-Za-z0-9._-]{1,20}$'),
  constraint legisbot_destaques_posicoes check (inicio >= 0 and fim > inicio),
  constraint legisbot_destaques_trecho check (char_length(btrim(trecho)) > 0),
  constraint legisbot_destaques_cor check (cor in ('amarelo', 'rosa')),
  constraint legisbot_destaques_intervalo_unico unique (user_id, slug, ordem, inicio, fim),
  constraint legisbot_destaques_sem_sobreposicao exclude using gist (
    user_id with =,
    slug with =,
    ordem with =,
    int4range(inicio, fim, '[)') with &&
  )
);

create index legisbot_destaques_usuario_artigo_idx
  on public.legisbot_destaques_usuario (user_id, slug, ordem, inicio);

create function public.legisbot_destaques_plain_legal(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  result text := coalesce(value, '');
  entity_match text[];
  codepoint integer;
begin
  result := regexp_replace(result, E'\r\n?', E'\n', 'g');
  result := regexp_replace(result, '<br\s*/?>', E'\n', 'gi');
  result := regexp_replace(result, '</p\s*>\s*<p(\s[^>]*)?>', E'\n\n', 'gi');
  result := regexp_replace(result, '</(div|li)\s*>\s*<p(\s[^>]*)?>', E'\n\n', 'gi');
  result := regexp_replace(result, '</p\s*>\s*<(div|li)(\s[^>]*)?>', E'\n', 'gi');
  result := regexp_replace(result, '</(div|li)\s*>\s*<(div|li)(\s[^>]*)?>', E'\n', 'gi');
  result := regexp_replace(result, '</(ul|ol|table|blockquote)\s*>\s*<p(\s[^>]*)?>', E'\n\n', 'gi');
  result := regexp_replace(result, '</(p|div|li|h[1-6]|blockquote|tr|th|td|ul|ol|table|section|article)\s*>', E'\n', 'gi');
  result := regexp_replace(result, '<[^>]*>', '', 'g');
  result := replace(result, '&nbsp;', ' ');
  result := replace(result, '&amp;', '&');
  result := replace(result, '&lt;', '<');
  result := replace(result, '&gt;', '>');
  result := replace(result, '&quot;', '"');
  result := replace(result, '&#39;', '''');
  result := replace(result, '&apos;', '''');
  result := replace(result, '&ordm;', 'º');
  result := replace(result, '&ordf;', 'ª');
  result := replace(result, '&sect;', '§');
  result := replace(result, '&para;', '¶');
  result := replace(result, '&deg;', '°');
  result := replace(result, '&ndash;', '–');
  result := replace(result, '&mdash;', '—');
  result := replace(result, '&hellip;', '…');
  result := replace(result, '&laquo;', '«');
  result := replace(result, '&raquo;', '»');
  result := replace(result, '&lsquo;', '‘');
  result := replace(result, '&rsquo;', '’');
  result := replace(result, '&ldquo;', '“');
  result := replace(result, '&rdquo;', '”');
  result := replace(result, '&middot;', '·');
  result := replace(result, '&copy;', '©');
  result := replace(result, '&reg;', '®');
  result := replace(result, '&euro;', '€');
  result := replace(result, '&Aacute;', 'Á');
  result := replace(result, '&Acirc;', 'Â');
  result := replace(result, '&Agrave;', 'À');
  result := replace(result, '&Atilde;', 'Ã');
  result := replace(result, '&Eacute;', 'É');
  result := replace(result, '&Ecirc;', 'Ê');
  result := replace(result, '&Iacute;', 'Í');
  result := replace(result, '&Oacute;', 'Ó');
  result := replace(result, '&Ocirc;', 'Ô');
  result := replace(result, '&Otilde;', 'Õ');
  result := replace(result, '&Uacute;', 'Ú');
  result := replace(result, '&Ccedil;', 'Ç');
  result := replace(result, '&aacute;', 'á');
  result := replace(result, '&acirc;', 'â');
  result := replace(result, '&agrave;', 'à');
  result := replace(result, '&atilde;', 'ã');
  result := replace(result, '&eacute;', 'é');
  result := replace(result, '&ecirc;', 'ê');
  result := replace(result, '&iacute;', 'í');
  result := replace(result, '&oacute;', 'ó');
  result := replace(result, '&ocirc;', 'ô');
  result := replace(result, '&otilde;', 'õ');
  result := replace(result, '&uacute;', 'ú');
  result := replace(result, '&ccedil;', 'ç');

  loop
    entity_match := regexp_match(result, '&#([0-9]+);');
    exit when entity_match is null;
    codepoint := entity_match[1]::integer;
    exit when codepoint < 0 or codepoint > 1114111 or codepoint between 55296 and 57343;
    result := replace(result, '&#' || entity_match[1] || ';', chr(codepoint));
  end loop;

  loop
    entity_match := regexp_match(result, '&#x([0-9a-f]+);', 'i');
    exit when entity_match is null;
    codepoint := (('x' || lpad(entity_match[1], 8, '0'))::bit(32))::integer;
    exit when codepoint < 0 or codepoint > 1114111 or codepoint between 55296 and 57343;
    result := regexp_replace(result, '&#x' || entity_match[1] || ';', chr(codepoint), 'gi');
  end loop;

  result := replace(result, E'\u00a0', ' ');
  result := regexp_replace(result, E'[ \t]+\n', E'\n', 'g');
  result := regexp_replace(result, E'\n{3,}', E'\n\n', 'g');
  return btrim(result);
end;
$$;

create function public.legisbot_destaques_validate_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare legislation_text text;
begin
  new.slug := upper(btrim(new.slug));
  new.ordem := btrim(new.ordem);
  select public.legisbot_destaques_plain_legal(legislacao)
    into legislation_text
    from public.legisbot_comentarios
    where slug = new.slug and ordem = new.ordem;

  if legislation_text is null
    or new.fim > char_length(legislation_text)
    or substring(legislation_text from new.inicio + 1 for new.fim - new.inicio) <> new.trecho
  then
    raise exception 'Trecho destacado não corresponde à legislação original.';
  end if;
  return new;
end;
$$;

create trigger legisbot_destaques_before_insert
before insert on public.legisbot_destaques_usuario
for each row execute function public.legisbot_destaques_validate_insert();

create function public.legisbot_destaques_protect_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.role() = 'service_role' then return new; end if;
  if old.user_id <> auth.uid()
    or new.user_id <> old.user_id
    or new.slug <> old.slug
    or new.ordem <> old.ordem
    or new.inicio <> old.inicio
    or new.fim <> old.fim
    or new.trecho <> old.trecho
    or new.created_at <> old.created_at
  then
    raise exception 'Campos protegidos não podem ser alterados.';
  end if;
  return new;
end;
$$;

create trigger legisbot_destaques_before_update
before update on public.legisbot_destaques_usuario
for each row execute function public.legisbot_destaques_protect_update();

alter table public.legisbot_destaques_usuario enable row level security;

create policy legisbot_destaques_ler_proprios
on public.legisbot_destaques_usuario for select to authenticated
using (user_id = auth.uid());

create policy legisbot_destaques_criar_proprios
on public.legisbot_destaques_usuario for insert to authenticated
with check (user_id = auth.uid());

create policy legisbot_destaques_atualizar_proprios
on public.legisbot_destaques_usuario for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy legisbot_destaques_excluir_proprios
on public.legisbot_destaques_usuario for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.legisbot_destaques_usuario to authenticated;

commit;
