begin;

-- The initial Artigo Sombra migration may already be installed. This is
-- deliberately additive: it preserves all prior analyses and units while
-- allowing an analysis to come from pasted text instead of a Google Docs URL.
alter table public.admin_law_question_doc_sources
  add column if not exists source_url text;

alter table public.admin_law_question_doc_sources
  alter column material_id drop not null,
  alter column google_document_id drop not null,
  alter column source_url drop not null;

alter table public.admin_law_question_shadow_analyses
  add column if not exists source_url text,
  add column if not exists source_kind text,
  add column if not exists partial boolean;

update public.admin_law_question_shadow_analyses
set source_kind = 'google_docs'
where source_kind is null;

update public.admin_law_question_shadow_analyses
set partial = false
where partial is null;

alter table public.admin_law_question_shadow_analyses
  alter column material_id drop not null,
  alter column google_document_id drop not null,
  alter column source_url drop not null,
  alter column source_kind set default 'google_docs',
  alter column source_kind set not null,
  alter column partial set default false,
  alter column partial set not null;

alter table public.admin_law_question_shadow_analyses
  drop constraint if exists admin_law_question_shadow_analyses_source_kind_check;

alter table public.admin_law_question_shadow_analyses
  add constraint admin_law_question_shadow_analyses_source_kind_check
  check (source_kind in ('google_docs', 'texto_colado'));

notify pgrst, 'reload schema';

commit;
