-- Remove as policies temporarias que permitem escrita anonima no catalogo de produtos.
-- As policies de leitura e o RLS de public.produtos permanecem inalterados.

drop policy if exists "DEV permitir cadastro publico de produtos" on public.produtos;
drop policy if exists "DEV permitir edicao publica de produtos" on public.produtos;
