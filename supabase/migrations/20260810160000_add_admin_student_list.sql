begin;
create or replace function public.admin_listar_alunos(p_q text default '', p_filtro text default 'todos', p_limit integer default 25, p_offset integer default 0)
returns table(id uuid,user_id uuid,nome text,email text,telefone text,criado_em timestamptz,duplicados bigint,produtos_ativos bigint,total_count bigint)
language sql security definer set search_path = pg_catalog as $$
 with base as (select a.*, pg_catalog.lower(pg_catalog.btrim(a.email)) as email_normalizado from public.alunos a),
 grouped as (select base.*, pg_catalog.count(*) over(partition by email_normalizado) as duplicados from base),
 filtered as (select * from grouped where (p_q='' or nome ilike '%'||p_q||'%' or email ilike '%'||p_q||'%' or telefone ilike '%'||p_q||'%' or id::text=p_q) and (p_filtro='todos' or (p_filtro='com_auth' and user_id is not null) or (p_filtro='sem_auth' and user_id is null) or (p_filtro='duplicados' and duplicados>1))),
 counted as (select filtered.*, pg_catalog.count(*) over() as total_count from filtered)
 select c.id,c.user_id,c.nome,c.email,c.telefone,c.criado_em,c.duplicados,coalesce(p.quantidade,0),c.total_count
 from counted c left join lateral (select pg_catalog.count(distinct produto_id) as quantidade from public.compras where aluno_id=c.id and status_acesso='ativo') p on true
 order by case when p_filtro='duplicados' then c.email_normalizado end, c.criado_em desc nulls last, c.id limit greatest(1,least(p_limit,50)) offset greatest(p_offset,0)
$$;
revoke all on function public.admin_listar_alunos(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.admin_listar_alunos(text,text,integer,integer) to service_role;
commit;
