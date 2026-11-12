begin;

-- Vínculo editorial opcional: a ausência preserva o comportamento atual de
-- blocos sem estrutura. Nenhum registro existente é preenchido nesta migration.
alter table public.legislative_references
  add column if not exists structure_id bigint;

-- law_structure já possui UNIQUE (id, lei_id). A FK composta torna impossível
-- gravar uma estrutura de outra lei no bloco, inclusive fora do frontend.
-- Ao remover uma estrutura, somente structure_id é limpo; lei_id e o bloco
-- legislativo são preservados.
alter table public.legislative_references
  add constraint legislative_references_structure_same_law_fkey
  foreign key (structure_id, lei_id)
  references public.law_structure (id, lei_id)
  on update restrict
  on delete set null (structure_id);

create index if not exists legislative_references_lei_structure_ordem_idx
  on public.legislative_references (lei_id, structure_id, ordem)
  where structure_id is not null;

-- RLS e grants existentes da tabela permanecem inalterados: apenas service_role
-- acessa a base diretamente; ações administrativas continuam no servidor.

commit;

-- Rollback manual seguro, se a migration ainda for a última aplicada:
-- begin;
-- drop index if exists public.legislative_references_lei_structure_ordem_idx;
-- alter table public.legislative_references drop constraint if exists legislative_references_structure_same_law_fkey;
-- alter table public.legislative_references drop column if exists structure_id;
-- commit;
