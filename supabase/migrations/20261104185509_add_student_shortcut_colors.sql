begin;

alter table public.editais_personalizados_leis
  add column if not exists atalho_cor text not null default 'azul'
  check (atalho_cor in ('azul', 'verde', 'lilas', 'amarelo', 'coral', 'turquesa'));

create or replace function public.definir_cor_atalho_meu_edital(
  p_lei_id bigint,
  p_cor text
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_aluno_id uuid;
begin
  select id into v_aluno_id
  from public.alunos
  where user_id = auth.uid();

  if v_aluno_id is null then
    raise exception using errcode = '42501', message = 'Aluno nao autenticado.';
  end if;

  if p_cor not in ('azul', 'verde', 'lilas', 'amarelo', 'coral', 'turquesa') then
    raise exception using errcode = '22023', message = 'Cor de atalho invalida.';
  end if;

  update public.editais_personalizados_leis atalho
  set atalho_cor = p_cor
  from public.editais_personalizados_alunos edital
  where atalho.edital_id = edital.id
    and edital.aluno_id = v_aluno_id
    and atalho.lei_id = p_lei_id;

  if not found then
    raise exception using errcode = '42501', message = 'Atalho indisponivel.';
  end if;
end;
$function$;

revoke all on function public.definir_cor_atalho_meu_edital(bigint, text) from public, anon, service_role;
grant execute on function public.definir_cor_atalho_meu_edital(bigint, text) to authenticated;

create or replace function public.obter_meus_atalhos()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with aluno as (
    select id from public.alunos where user_id = auth.uid()
  ),
  liberacoes as (
    select l.lei_id, l.produto_id
    from public.liberacoes_leis l join aluno a on a.id = l.aluno_id
    where l.status = 'ativo'
  ),
  personalizados as (
    select e.id, e.nome from public.editais_personalizados_alunos e
    join aluno a on a.id = e.aluno_id
  ),
  atalhos_pessoais as (
    select ep.lei_id, lei.slug, lei.titulo, ep.ordem, ep.recorte_id,
      recorte.nome recorte_nome, ep.atalho_cor,
      lei.acesso_gratuito or exists (
        select 1 from liberacoes r
        left join public.produto_leis pl on pl.produto_id = r.produto_id and pl.lei_id = ep.lei_id
        where r.lei_id = ep.lei_id
          and (r.produto_id is null or pl.recorte_id is null or pl.recorte_id is not distinct from ep.recorte_id)
      ) as tem_acesso
    from personalizados e
    join public.editais_personalizados_leis ep on ep.edital_id = e.id
    join public.leis lei on lei.id = ep.lei_id and lei.ativo and lei.status_publicacao = 'ativa'
    left join public.recortes_leis recorte on recorte.id = ep.recorte_id and recorte.lei_id = ep.lei_id and recorte.ativo and recorte.status_publicacao = 'ativa'
  ),
  editais_prontos as (
    select p.id, p.nome,
      coalesce(jsonb_agg(jsonb_build_object(
        'leiId', lei.id, 'slug', lei.slug, 'titulo', lei.titulo,
        'recorteId', pl.recorte_id, 'recorteNome', recorte.nome,
        'temAcesso', lei.acesso_gratuito or exists (
          select 1 from liberacoes r
          left join public.produto_leis acesso on acesso.produto_id = r.produto_id and acesso.lei_id = lei.id
          where r.lei_id = lei.id
            and (r.produto_id is null or acesso.recorte_id is null or acesso.recorte_id is not distinct from pl.recorte_id)
        )
      ) order by pl.ordem, lei.id), '[]'::jsonb) as leis
    from public.produtos p
    join public.produto_leis pl on pl.produto_id = p.id
    join public.leis lei on lei.id = pl.lei_id and lei.ativo and lei.status_publicacao = 'ativa'
    left join public.recortes_leis recorte on recorte.id = pl.recorte_id and recorte.lei_id = lei.id and recorte.ativo and recorte.status_publicacao = 'ativa'
    where p.tipo_produto = 'edital' and p.ativo
      and (pl.recorte_id is null or recorte.id is not null)
    group by p.id, p.nome, p.ordem
  ),
  disponiveis as (
    select distinct lei.id as lei_id, lei.slug, lei.titulo, null::uuid as recorte_id, null::text as recorte_nome
    from public.leis lei
    where lei.ativo and lei.status_publicacao = 'ativa' and (
      lei.acesso_gratuito or exists (
        select 1 from liberacoes r
        left join public.produto_leis pl on pl.produto_id = r.produto_id and pl.lei_id = lei.id
        where r.lei_id = lei.id and (r.produto_id is null or pl.recorte_id is null)
      )
    )
    union
    select distinct lei.id, lei.slug, lei.titulo, recorte.id, recorte.nome
    from public.leis lei
    join public.produto_leis pl on pl.lei_id = lei.id and pl.recorte_id is not null
    join public.recortes_leis recorte on recorte.id = pl.recorte_id and recorte.ativo and recorte.status_publicacao = 'ativa'
    join liberacoes r on r.lei_id = lei.id and r.produto_id = pl.produto_id
    where lei.ativo and lei.status_publicacao = 'ativa'
  )
  select jsonb_build_object(
    'minhaSelecao', jsonb_build_object(
      'nome', coalesce((select nome from personalizados limit 1), 'Minha seleção'),
      'leis', coalesce((select jsonb_agg(jsonb_build_object(
        'leiId', lei_id, 'slug', slug, 'titulo', titulo, 'ordem', ordem,
        'recorteId', recorte_id, 'recorteNome', recorte_nome,
        'cor', atalho_cor, 'temAcesso', tem_acesso
      ) order by ordem, lei_id) from atalhos_pessoais), '[]'::jsonb)
    ),
    'selecoesProntas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'leis', leis) order by nome) from editais_prontos), '[]'::jsonb),
    'leisDisponiveis', coalesce((select jsonb_agg(jsonb_build_object('leiId', lei_id, 'slug', slug, 'titulo', titulo, 'recorteId', recorte_id, 'recorteNome', recorte_nome) order by titulo, recorte_nome) from disponiveis), '[]'::jsonb)
  );
$function$;

revoke all on function public.obter_meus_atalhos() from public, anon, service_role;
grant execute on function public.obter_meus_atalhos() to authenticated;

commit;
