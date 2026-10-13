begin;

-- A estrutura anterior de apoios é preservada como histórico inerte. O fluxo
-- ativo passa a ser somente o checklist administrativo por dispositivo.
alter table public.article_legislative_updates
  add column if not exists referencia_normativa text,
  add column if not exists data_incorporacao date;

alter table public.article_legislative_update_steps
  drop constraint if exists article_legislative_update_steps_step_check;
update public.article_legislative_update_steps
  set step = case step
    when 'questoes' then 'questoes_artigo'
    when 'materiais' then 'materiais_relacionados'
    else step
  end;
alter table public.article_legislative_update_steps
  add constraint article_legislative_update_steps_step_check check (step in (
    'legislacao','questoes_artigo','questoes_outros_artigos','legisbot','legiscast','materiais_relacionados'
  ));

alter table public.article_context_mappings
  add column if not exists atualizacao_legislativa_realizada_em timestamptz;

commit;
