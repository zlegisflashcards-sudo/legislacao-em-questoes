begin;

-- Leitura consolidada das leis liberadas para o proprio aluno autenticado.
-- A identidade sempre vem do JWT; nenhum identificador de aluno e aceito.
create or replace function public.obter_minhas_leis()
returns table (
  id bigint,
  slug text,
  titulo text,
  nome_curto text,
  descricao text,
  codigo text,
  categoria text,
  thumbnail_url text,
  ordem integer,
  fontes_ativas bigint,
  total_flashcards bigint,
  versao_material text,
  revisado_em date,
  publicado_em date,
  situacao_atualizacao text,
  houve_alteracao_legislativa boolean,
  referencia_normativa_atual text,
  tipo_referencia_normativa text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with acessos as (
    select
      lei.id as lei_id,
      pg_catalog.count(*)::bigint as fontes_ativas
    from public.alunos as aluno
    join public.liberacoes_leis as liberacao
      on liberacao.aluno_id = aluno.id
     and liberacao.status = 'ativo'
    join public.leis as lei
      on lei.id = liberacao.lei_id
     and lei.ativo = true
    where auth.uid() is not null
      and aluno.user_id = auth.uid()
    group by lei.id
  )
  select
    lei.id,
    lei.slug,
    lei.titulo,
    lei.nome_curto,
    lei.descricao,
    lei.codigo,
    lei.categoria,
    lei.thumbnail_url,
    lei.ordem,
    acessos.fontes_ativas,
    coalesce(totais.total_flashcards, 0::bigint) as total_flashcards,
    vigente.versao_material,
    vigente.revisado_em,
    vigente.publicado_em,
    lei.situacao_atualizacao,
    lei.houve_alteracao_legislativa,
    case
      when lei.houve_alteracao_legislativa then lei.ultima_alteracao_referencia
      else lei.norma_originaria_referencia
    end as referencia_normativa_atual,
    case
      when lei.houve_alteracao_legislativa then 'alteracao'::text
      else 'originaria'::text
    end as tipo_referencia_normativa
  from acessos
  join public.leis as lei on lei.id = acessos.lei_id
  left join lateral (
    select coalesce(pg_catalog.sum(material.quantidade_itens), 0)::bigint as total_flashcards
    from public.materiais_leis as material
    where material.lei_id = lei.id
      and material.ativo = true
      and material.tipo = 'flashcards'
  ) as totais on true
  left join lateral (
    select
      material.versao_material,
      material.revisado_em,
      material.publicado_em
    from public.materiais_leis as material
    where material.lei_id = lei.id
      and material.ativo = true
      and material.tipo = 'flashcards'
    order by
      material.publicado_em desc nulls last,
      material.revisado_em desc nulls last,
      material.ordem,
      material.id desc
    limit 1
  ) as vigente on true
  order by lei.ordem, lei.titulo, lei.id;
$function$;

revoke all on function public.obter_minhas_leis() from public, anon, authenticated, service_role;
grant execute on function public.obter_minhas_leis() to authenticated;

comment on function public.obter_minhas_leis() is
  'Lista leis ativas do aluno da sessao com resumo editorial seguro. A versao vigente usa publicacao mais recente, revisao, ordem e id; URLs e dados internos nao sao retornados.';

commit;
