begin;

-- A migration anterior removeu os estados editoriais legados. Ajusta o
-- default legado para que inserções que não informem o campo continuem válidas.
alter table public.leis
  alter column situacao_atualizacao set default 'atualizado';

commit;
