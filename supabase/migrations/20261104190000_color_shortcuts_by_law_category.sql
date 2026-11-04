begin;

create or replace function public.cor_atalho_por_categoria(p_categoria text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select case
    when pg_catalog.lower(coalesce(p_categoria, '')) like 'constitui%' then 'verde'
    when pg_catalog.lower(coalesce(p_categoria, '')) like 'código%'
      or pg_catalog.lower(coalesce(p_categoria, '')) like 'codigo%' then 'amarelo'
    when pg_catalog.lower(coalesce(p_categoria, '')) like 'tratad%'
      or pg_catalog.lower(coalesce(p_categoria, '')) like 'direito internacional%' then 'azul'
    when pg_catalog.lower(coalesce(p_categoria, '')) like 'legisla%'
      and pg_catalog.lower(coalesce(p_categoria, '')) like '%especific%' then 'vermelho'
    when pg_catalog.lower(coalesce(p_categoria, '')) like 'legisla%' then 'laranja'
    else 'lilas'
  end;
$function$;

revoke all on function public.cor_atalho_por_categoria(text) from public, anon, authenticated, service_role;

alter table public.editais_personalizados_leis
  drop constraint if exists editais_personalizados_leis_atalho_cor_check;

alter table public.editais_personalizados_leis
  add constraint editais_personalizados_leis_atalho_cor_check
  check (atalho_cor in ('azul', 'verde', 'lilas', 'amarelo', 'laranja', 'vermelho', 'coral', 'turquesa'));

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

  if p_cor not in ('azul', 'verde', 'lilas', 'amarelo', 'laranja', 'vermelho', 'coral', 'turquesa') then
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

create or replace function public.definir_contexto_lei_meu_edital(
  p_lei_id bigint,
  p_recorte_id uuid,
  p_confirmar_substituicao boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_aluno_id uuid;
  v_edital_id bigint;
  v_recorte_atual uuid;
  v_ordem integer;
  v_acesso_valido boolean := false;
  v_cor text;
begin
  select id into v_aluno_id from public.alunos where user_id = auth.uid();
  if v_aluno_id is null then
    raise exception using errcode = '42501', message = 'Aluno nao autenticado.';
  end if;

  if p_recorte_id is null then
    select exists(
      select 1
      from public.liberacoes_leis liberacao
      left join public.produto_leis produto_lei
        on produto_lei.produto_id = liberacao.produto_id
       and produto_lei.lei_id = p_lei_id
      where liberacao.aluno_id = v_aluno_id
        and liberacao.lei_id = p_lei_id
        and liberacao.status = 'ativo'
        and (liberacao.produto_id is null or (produto_lei.produto_id is not null and produto_lei.recorte_id is null))
    ) into v_acesso_valido;
  else
    select exists(
      select 1
      from public.liberacoes_leis liberacao
      join public.produto_leis produto_lei
        on produto_lei.produto_id = liberacao.produto_id
       and produto_lei.lei_id = p_lei_id
       and produto_lei.recorte_id = p_recorte_id
      join public.recortes_leis recorte
        on recorte.id = produto_lei.recorte_id
       and recorte.lei_id = p_lei_id
       and recorte.ativo
      where liberacao.aluno_id = v_aluno_id
        and liberacao.lei_id = p_lei_id
        and liberacao.status = 'ativo'
    ) into v_acesso_valido;
  end if;

  if not v_acesso_valido then
    raise exception using errcode = '42501', message = 'Contexto de estudo nao liberado.';
  end if;

  v_edital_id := public.meu_edital_id();
  select recorte_id, ordem into v_recorte_atual, v_ordem
  from public.editais_personalizados_leis
  where edital_id = v_edital_id and lei_id = p_lei_id;

  if found and v_recorte_atual is not distinct from p_recorte_id then
    return jsonb_build_object('status', 'ja_existente', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id);
  end if;

  if found then
    if not p_confirmar_substituicao then
      raise exception using errcode = '22023', message = 'A lei ja existe no edital com outro contexto.';
    end if;
    update public.editais_personalizados_leis
    set recorte_id = p_recorte_id,
        recorte_lei_id = case when p_recorte_id is null then null else p_lei_id end
    where edital_id = v_edital_id and lei_id = p_lei_id;
    return jsonb_build_object('status', 'substituido', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id, 'ordem', v_ordem);
  end if;

  select public.cor_atalho_por_categoria(categoria) into v_cor
  from public.leis
  where id = p_lei_id;

  insert into public.editais_personalizados_leis(edital_id, lei_id, ordem, recorte_id, recorte_lei_id, atalho_cor)
  select v_edital_id, p_lei_id, coalesce(max(ordem) + 1, 0), p_recorte_id,
         case when p_recorte_id is null then null else p_lei_id end, coalesce(v_cor, 'lilas')
  from public.editais_personalizados_leis
  where edital_id = v_edital_id;

  return jsonb_build_object('status', 'adicionado', 'lei_id', p_lei_id, 'recorte_id', p_recorte_id);
end;
$function$;

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
        'cor', public.cor_atalho_por_categoria(lei.categoria),
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
    select distinct lei.id as lei_id, lei.slug, lei.titulo, null::uuid as recorte_id, null::text as recorte_nome,
      public.cor_atalho_por_categoria(lei.categoria) as cor
    from public.leis lei
    where lei.ativo and lei.status_publicacao = 'ativa' and (
      lei.acesso_gratuito or exists (
        select 1 from liberacoes r
        left join public.produto_leis pl on pl.produto_id = r.produto_id and pl.lei_id = lei.id
        where r.lei_id = lei.id and (r.produto_id is null or pl.recorte_id is null)
      )
    )
    union
    select distinct lei.id, lei.slug, lei.titulo, recorte.id, recorte.nome,
      public.cor_atalho_por_categoria(lei.categoria)
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
    'leisDisponiveis', coalesce((select jsonb_agg(jsonb_build_object('leiId', lei_id, 'slug', slug, 'titulo', titulo, 'recorteId', recorte_id, 'recorteNome', recorte_nome, 'cor', cor) order by titulo, recorte_nome) from disponiveis), '[]'::jsonb)
  );
$function$;

revoke all on function public.definir_cor_atalho_meu_edital(bigint, text) from public, anon, service_role;
grant execute on function public.definir_cor_atalho_meu_edital(bigint, text) to authenticated;
revoke all on function public.definir_contexto_lei_meu_edital(bigint, uuid, boolean) from public, anon, service_role;
grant execute on function public.definir_contexto_lei_meu_edital(bigint, uuid, boolean) to authenticated;
revoke all on function public.obter_meus_atalhos() from public, anon, service_role;
grant execute on function public.obter_meus_atalhos() to authenticated;

commit;
