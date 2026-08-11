begin;

create table if not exists public.admin_notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  mensagem text not null,
  link text,
  entidade_tipo text,
  entidade_id text,
  lida boolean not null default false,
  created_at timestamptz not null default now(),
  lida_em timestamptz,
  constraint admin_notificacoes_entidade_unica unique (entidade_tipo, entidade_id)
);

create index if not exists admin_notificacoes_nao_lidas_idx
  on public.admin_notificacoes(created_at desc) where lida = false;
create index if not exists admin_notificacoes_lista_idx
  on public.admin_notificacoes(created_at desc);

alter table public.admin_notificacoes enable row level security;
revoke all on public.admin_notificacoes from public, anon, authenticated;
grant select, insert, update on public.admin_notificacoes to service_role;

create or replace function public.criar_notificacao_admin_novo_comentario()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_autor text;
begin
  select coalesce(nullif(btrim(p.nome_publico), ''), 'Estudante Legis') into v_autor
  from public.perfis_publicos p where p.id = new.user_id;

  insert into public.admin_notificacoes(tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
  values (
    'novo_comentario',
    'Novo comentário',
    coalesce(v_autor, 'Estudante Legis') || ' comentou em ' || new.slug || ' / ' || new.ordem,
    '/admin/comunidade?q=' || replace(new.slug, ' ', '%20'),
    'legisbot_comentario_comunidade',
    new.id::text
  )
  on conflict (entidade_tipo, entidade_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists criar_notificacao_admin_novo_comentario on public.legisbot_comentarios_comunidade;
create trigger criar_notificacao_admin_novo_comentario
after insert on public.legisbot_comentarios_comunidade
for each row execute function public.criar_notificacao_admin_novo_comentario();

comment on table public.admin_notificacoes is
  'Central administrativa. A primeira versao registra somente novo_comentario.';

commit;
