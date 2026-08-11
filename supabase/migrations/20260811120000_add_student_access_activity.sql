begin;

alter table public.alunos
  add column if not exists primeiro_acesso_em timestamptz,
  add column if not exists ultimo_acesso_em timestamptz,
  add column if not exists total_logins integer not null default 0;

create index if not exists alunos_ultimo_acesso_em_idx on public.alunos (ultimo_acesso_em desc nulls last);
create index if not exists alunos_user_id_ultimo_acesso_idx on public.alunos (user_id, ultimo_acesso_em desc nulls last);

create or replace function public.registrar_acesso_aluno(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  update public.alunos
  set primeiro_acesso_em = coalesce(primeiro_acesso_em, pg_catalog.now()),
      ultimo_acesso_em = pg_catalog.now(),
      total_logins = coalesce(total_logins, 0) + 1
  where user_id = p_user_id;
  return found;
end;
$function$;

create or replace function public.admin_resumo_acessos_alunos()
returns table(total_alunos bigint, com_auth bigint, entraram_hoje bigint, ultimos_7_dias bigint, nunca_entraram bigint)
language sql security definer set search_path = pg_catalog as $$
  select count(*)::bigint,
    count(*) filter (where user_id is not null)::bigint,
    count(*) filter (where ultimo_acesso_em >= current_date)::bigint,
    count(*) filter (where ultimo_acesso_em >= now() - interval '7 days')::bigint,
    count(*) filter (where ultimo_acesso_em is null)::bigint
  from public.alunos
$$;

create or replace function public.admin_listar_alunos(p_q text default '', p_filtro text default 'todos', p_limit integer default 25, p_offset integer default 0)
returns table(id uuid,user_id uuid,nome text,email text,telefone text,criado_em timestamptz,duplicados bigint,produtos_ativos bigint,primeiro_acesso_em timestamptz,ultimo_acesso_em timestamptz,total_logins integer,total_count bigint)
language sql security definer set search_path = pg_catalog as $$
 with base as (select a.*, pg_catalog.lower(pg_catalog.btrim(a.email)) as email_normalizado from public.alunos a),
 grouped as (select base.*, pg_catalog.count(*) over(partition by email_normalizado) as duplicados from base),
 filtered as (select * from grouped where
   (p_q='' or nome ilike '%'||p_q||'%' or email ilike '%'||p_q||'%' or telefone ilike '%'||p_q||'%' or id::text=p_q)
   and (p_filtro='todos'
     or (p_filtro='com_auth' and user_id is not null)
     or (p_filtro='sem_auth' and user_id is null)
     or (p_filtro='duplicados' and duplicados>1)
     or (p_filtro='entrou_hoje' and ultimo_acesso_em >= current_date)
     or (p_filtro='ultimos_7_dias' and ultimo_acesso_em >= now() - interval '7 days')
     or (p_filtro='ultimos_30_dias' and ultimo_acesso_em >= now() - interval '30 days')
     or (p_filtro='nunca_entrou' and ultimo_acesso_em is null))),
 counted as (select filtered.*, pg_catalog.count(*) over() as total_count from filtered)
 select c.id,c.user_id,c.nome,c.email,c.telefone,c.criado_em,c.duplicados,coalesce(p.quantidade,0),c.primeiro_acesso_em,c.ultimo_acesso_em,coalesce(c.total_logins,0),c.total_count
 from counted c left join lateral (select pg_catalog.count(distinct produto_id) as quantidade from public.compras where aluno_id=c.id and status_acesso='ativo') p on true
 order by case when p_filtro='duplicados' then c.email_normalizado end, c.criado_em desc nulls last, c.id limit greatest(1,least(p_limit,50)) offset greatest(p_offset,0)
$$;

revoke all on function public.registrar_acesso_aluno(uuid) from public, anon, authenticated;
revoke all on function public.admin_resumo_acessos_alunos() from public, anon, authenticated;
revoke all on function public.admin_listar_alunos(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.registrar_acesso_aluno(uuid), public.admin_resumo_acessos_alunos(), public.admin_listar_alunos(text,text,integer,integer) to service_role;

commit;
