begin;

-- O campo já existe e permanece opcional; somente IDs informados precisam ser únicos.
create unique index if not exists produtos_hotmart_product_id_unique_idx
  on public.produtos (hotmart_product_id)
  where hotmart_product_id is not null;

commit;
