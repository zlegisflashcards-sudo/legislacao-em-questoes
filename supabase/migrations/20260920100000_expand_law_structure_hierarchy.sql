begin;

-- A ampliação é somente de domínio: não atualiza, recria ou remove nenhum nó
-- existente. `artigo` permanece permitido para compatibilidade com estruturas
-- legadas já vinculadas a questões, campanhas, recortes, PDFs ou áudios.
alter table public.law_structure
  drop constraint if exists law_structure_tipo_check;

alter table public.law_structure
  add constraint law_structure_tipo_check
  check (tipo in ('parte', 'livro', 'titulo', 'capitulo', 'secao', 'subsecao', 'artigo'));

commit;
