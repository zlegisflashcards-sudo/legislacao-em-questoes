begin;

create extension if not exists pgcrypto;

create type public.student_account_status as enum ('pending', 'active', 'blocked', 'merged');
create type public.acquisition_status as enum ('active', 'cancelled', 'refunded', 'chargeback', 'pending', 'manual');
create type public.community_content_status as enum ('public', 'hidden', 'deleted');
create type public.community_report_reason as enum ('incorrect', 'offensive', 'spam', 'unrelated', 'other');

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  merged_into_id uuid references public.student_profiles(id) on delete restrict,
  full_name text,
  email text not null,
  public_name text,
  instagram text,
  status public.student_account_status not null default 'pending',
  origin text not null default 'site',
  external_import_id text,
  is_staff boolean not null default false,
  is_admin boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_profiles_email_not_blank check (btrim(email) <> ''),
  constraint student_profiles_public_name_format check (
    public_name is null or public_name ~ '^[A-Za-z0-9_.]{3,30}$'
  ),
  constraint student_profiles_instagram_format check (
    instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'
  ),
  constraint student_profiles_merge_not_self check (merged_into_id is null or merged_into_id <> id)
);

create unique index student_profiles_email_unique on public.student_profiles (lower(btrim(email)));
create unique index student_profiles_public_name_unique on public.student_profiles (lower(public_name)) where public_name is not null;
create unique index student_profiles_instagram_unique on public.student_profiles (lower(instagram)) where instagram is not null;

create table public.laws_catalog (
  slug text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint laws_catalog_slug_format check (slug ~ '^[A-Z0-9_-]{1,50}$'),
  constraint laws_catalog_name_not_blank check (btrim(name) <> '')
);

create table public.products_catalog (
  id uuid primary key default gen_random_uuid(),
  hotmart_product_id text unique,
  name text not null,
  product_type text not null default 'single_law',
  active boolean not null default true,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_catalog_name_not_blank check (btrim(name) <> '')
);

create table public.product_laws (
  product_id uuid not null references public.products_catalog(id) on delete cascade,
  law_slug text not null references public.laws_catalog(slug) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, law_slug)
);

create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete restrict,
  product_id uuid references public.products_catalog(id) on delete restrict,
  hotmart_product_id text,
  product_name text not null,
  purchased_at timestamptz,
  status public.acquisition_status not null default 'pending',
  origin text not null default 'hotmart',
  external_transaction_id text,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acquisitions_product_name_not_blank check (btrim(product_name) <> '')
);

create unique index acquisitions_external_transaction_unique
  on public.acquisitions (external_transaction_id)
  where external_transaction_id is not null;
create index acquisitions_student_idx on public.acquisitions (student_id, purchased_at desc);

create table public.acquisition_laws (
  acquisition_id uuid not null references public.acquisitions(id) on delete cascade,
  law_slug text not null references public.laws_catalog(slug) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (acquisition_id, law_slug)
);

create table public.student_law_manual_links (
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  law_slug text not null references public.laws_catalog(slug) on update cascade on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (student_id, law_slug)
);

create view public.student_owned_laws with (security_barrier = true) as
select distinct a.student_id, al.law_slug
from public.acquisitions a
join public.acquisition_laws al on al.acquisition_id = a.id
where a.status in ('active', 'manual')
union
select student_id, law_slug from public.student_law_manual_links;

create table public.hotmart_webhook_events (
  id uuid primary key default gen_random_uuid(),
  hotmart_event_id text not null unique,
  event_name text not null,
  transaction_id text,
  payload jsonb not null,
  processing_status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint hotmart_event_processing_status check (processing_status in ('received', 'processing', 'processed', 'error'))
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  ordem text not null,
  author_id uuid not null references public.student_profiles(id) on delete restrict,
  parent_id uuid references public.community_comments(id) on delete restrict,
  content text,
  status public.community_content_status not null default 'public',
  is_pinned boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_slug_format check (slug ~ '^[A-Z0-9_-]{1,50}$'),
  constraint community_comments_ordem_format check (ordem ~ '^[A-Za-z0-9._-]{1,20}$'),
  constraint community_comments_content_check check (
    (status = 'public' and content is not null and length(btrim(content)) between 1 and 5000)
    or (status <> 'public')
  ),
  constraint community_comments_no_html_or_links check (
    content is null or (
      content !~* '<[^>]+>'
      and content !~* '(https?://|www\.)'
    )
  )
);

create index community_comments_thread_idx on public.community_comments (slug, ordem, created_at desc);
create index community_comments_parent_idx on public.community_comments (parent_id, created_at);
create unique index community_one_pinned_per_thread
  on public.community_comments (slug, ordem)
  where is_pinned and parent_id is null and status = 'public';

create table public.community_likes (
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, student_id)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  reporter_id uuid not null references public.student_profiles(id) on delete cascade,
  reason public.community_report_reason not null,
  details text,
  status text not null default 'open',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id),
  constraint community_reports_status check (status in ('open', 'reviewed', 'dismissed', 'actioned'))
);

create table public.league_medals (
  id uuid primary key default gen_random_uuid(),
  law_slug text not null unique references public.laws_catalog(slug) on update cascade on delete restrict,
  emoji text not null,
  tooltip text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_medals_emoji_not_blank check (btrim(emoji) <> ''),
  constraint league_medals_tooltip_not_blank check (btrim(tooltip) <> '')
);

create table public.student_medals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  medal_id uuid not null references public.league_medals(id) on delete restrict,
  granted_by uuid not null references auth.users(id) on delete restrict,
  admin_notes text,
  granted_at timestamptz not null default now(),
  unique (student_id, medal_id)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  previous_value jsonb,
  new_value jsonb,
  justification text,
  created_at timestamptz not null default now()
);

create function public.legisflashcards_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger student_profiles_updated_at before update on public.student_profiles for each row execute function public.legisflashcards_set_updated_at();
create trigger laws_catalog_updated_at before update on public.laws_catalog for each row execute function public.legisflashcards_set_updated_at();
create trigger products_catalog_updated_at before update on public.products_catalog for each row execute function public.legisflashcards_set_updated_at();
create trigger acquisitions_updated_at before update on public.acquisitions for each row execute function public.legisflashcards_set_updated_at();
create trigger community_comments_updated_at before update on public.community_comments for each row execute function public.legisflashcards_set_updated_at();
create trigger league_medals_updated_at before update on public.league_medals for each row execute function public.legisflashcards_set_updated_at();

create function public.legisflashcards_normalize_student_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  new.public_name := nullif(btrim(new.public_name), '');
  new.instagram := lower(regexp_replace(coalesce(new.instagram, ''), '^@|\s', '', 'g'));
  new.instagram := nullif(new.instagram, '');
  return new;
end;
$$;
create trigger normalize_student_profile before insert or update on public.student_profiles for each row execute function public.legisflashcards_normalize_student_profile();

create function public.legisflashcards_is_community_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_profiles
    where user_id = auth.uid() and is_admin and status = 'active'
  );
$$;

create function public.legisflashcards_community_level(received_likes bigint)
returns integer language sql immutable as $$
  select case
    when greatest(received_likes, 0) < 10 then 1
    when received_likes < 30 then 2
    when received_likes < 60 then 3
    when received_likes < 100 then 4
    when received_likes < 200 then 5
    else 6 + floor((received_likes - 200) / 150.0)::integer
  end;
$$;

create function public.legisflashcards_validate_community_reply_depth()
returns trigger language plpgsql set search_path = public as $$
declare parent_parent uuid; parent_slug text; parent_ordem text;
begin
  if new.parent_id is null then return new; end if;
  select parent_id, slug, ordem into parent_parent, parent_slug, parent_ordem
  from public.community_comments where id = new.parent_id;
  if not found then raise exception 'Comentário principal inexistente.'; end if;
  if parent_parent is not null then raise exception 'Respostas aninhadas não são permitidas.'; end if;
  if parent_slug <> new.slug or parent_ordem <> new.ordem then raise exception 'Resposta vinculada a outro artigo.'; end if;
  new.is_pinned := false;
  return new;
end;
$$;
create trigger validate_community_reply before insert or update of parent_id, slug, ordem on public.community_comments for each row execute function public.legisflashcards_validate_community_reply_depth();

create function public.legisflashcards_prevent_self_like()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.community_comments where id = new.comment_id and author_id = new.student_id) then
    raise exception 'Não é permitido curtir o próprio conteúdo.';
  end if;
  return new;
end;
$$;
create trigger prevent_self_like before insert on public.community_likes for each row execute function public.legisflashcards_prevent_self_like();

create function public.legisflashcards_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.student_profiles
  set user_id = new.id,
      status = case when status = 'pending' then 'active' else status end,
      updated_at = now()
  where lower(btrim(email)) = lower(btrim(new.email)) and user_id is null;

  if not found then
    insert into public.student_profiles (user_id, email, full_name, public_name, instagram, status, origin)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'public_name', ''),
    nullif(new.raw_user_meta_data ->> 'instagram', ''),
    'active',
    'site'
    );
  end if;
  return new;
end;
$$;
create trigger legisflashcards_auth_user_created after insert on auth.users for each row execute function public.legisflashcards_handle_new_auth_user();

create function public.get_community_thread(p_slug text, p_ordem text)
returns table (
  id uuid,
  parent_id uuid,
  content text,
  status public.community_content_status,
  is_pinned boolean,
  edited_at timestamptz,
  created_at timestamptz,
  public_identity text,
  community_level integer,
  medals jsonb,
  like_count bigint,
  reply_count bigint,
  liked_by_me boolean,
  is_own boolean,
  is_staff boolean
)
language sql stable security definer set search_path = public as $$
  with received as (
    select c.author_id, count(l.*)::bigint as total
    from public.community_comments c
    left join public.community_likes l on l.comment_id = c.id
    where c.status = 'public'
    group by c.author_id
  )
  select
    c.id,
    c.parent_id,
    case when c.status = 'public' then c.content else null end,
    c.status,
    c.is_pinned,
    c.edited_at,
    c.created_at,
    case
      when p.instagram is not null then '@' || p.instagram
      when p.public_name is not null then p.public_name
      when p.is_staff then 'Legis Flashcards'
      else 'Estudante Legis'
    end,
    public.legisflashcards_community_level(coalesce(r.total, 0)),
    coalesce((
      select jsonb_agg(jsonb_build_object('emoji', m.emoji, 'tooltip', m.tooltip, 'slug', m.law_slug) order by sm.granted_at)
      from public.student_medals sm
      join public.league_medals m on m.id = sm.medal_id and m.active
      where sm.student_id = c.author_id
    ), '[]'::jsonb),
    (select count(*) from public.community_likes cl where cl.comment_id = c.id),
    (select count(*) from public.community_comments cr where cr.parent_id = c.id and cr.status in ('public', 'deleted')),
    exists (
      select 1 from public.community_likes ml
      join public.student_profiles me on me.id = ml.student_id
      where ml.comment_id = c.id and me.user_id = auth.uid()
    ),
    exists (select 1 from public.student_profiles me where me.id = c.author_id and me.user_id = auth.uid()),
    p.is_staff
  from public.community_comments c
  join public.student_profiles p on p.id = c.author_id
  left join received r on r.author_id = c.author_id
  where c.slug = upper(btrim(p_slug))
    and c.ordem = btrim(p_ordem)
    and c.status in ('public', 'deleted')
  order by c.is_pinned desc, c.parent_id nulls first, c.created_at asc;
$$;

alter table public.student_profiles enable row level security;
alter table public.laws_catalog enable row level security;
alter table public.products_catalog enable row level security;
alter table public.product_laws enable row level security;
alter table public.acquisitions enable row level security;
alter table public.acquisition_laws enable row level security;
alter table public.student_law_manual_links enable row level security;
alter table public.hotmart_webhook_events enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;
alter table public.league_medals enable row level security;
alter table public.student_medals enable row level security;
alter table public.admin_audit_log enable row level security;

create policy student_read_own on public.student_profiles for select to authenticated using (user_id = auth.uid() or public.legisflashcards_is_community_admin());
create policy student_update_own on public.student_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and not is_admin and not is_staff);
create policy laws_read_authenticated on public.laws_catalog for select to authenticated using (true);
create policy products_read_authenticated on public.products_catalog for select to authenticated using (true);
create policy product_laws_read_authenticated on public.product_laws for select to authenticated using (true);
create policy acquisitions_read_own on public.acquisitions for select to authenticated using (student_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy acquisition_laws_read_own on public.acquisition_laws for select to authenticated using (acquisition_id in (select a.id from public.acquisitions a join public.student_profiles s on s.id = a.student_id where s.user_id = auth.uid()));
create policy manual_laws_read_own on public.student_law_manual_links for select to authenticated using (student_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy comments_read_public on public.community_comments for select to anon, authenticated using (status in ('public', 'deleted'));
create policy comments_insert_own on public.community_comments for insert to authenticated with check (author_id in (select id from public.student_profiles where user_id = auth.uid() and status = 'active') and status = 'public' and not is_pinned);
create policy comments_update_own on public.community_comments for update to authenticated using (author_id in (select id from public.student_profiles where user_id = auth.uid())) with check (author_id in (select id from public.student_profiles where user_id = auth.uid()) and not is_pinned);
create policy likes_read_public on public.community_likes for select to anon, authenticated using (true);
create policy likes_insert_own on public.community_likes for insert to authenticated with check (student_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy likes_delete_own on public.community_likes for delete to authenticated using (student_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy reports_insert_own on public.community_reports for insert to authenticated with check (reporter_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy medals_read_public on public.league_medals for select to anon, authenticated using (active);
create policy student_medals_read_public on public.student_medals for select to anon, authenticated using (true);

revoke all on public.hotmart_webhook_events, public.admin_audit_log from anon, authenticated;
revoke all on public.community_reports from anon;
revoke select on public.student_profiles, public.community_comments, public.community_likes, public.student_medals from anon, authenticated;
grant select, update on public.student_profiles to authenticated;
grant insert, update on public.community_comments to authenticated;
grant insert, delete on public.community_likes to authenticated;
grant insert on public.community_reports to authenticated;
grant execute on function public.get_community_thread(text, text) to anon, authenticated;

commit;
