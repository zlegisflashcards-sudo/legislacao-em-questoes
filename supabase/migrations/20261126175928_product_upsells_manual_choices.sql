create or replace function public.admin_definir_produto_upsells(p_produto_id uuid, p_recomendados uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.produtos p join public.produto_leis pl on pl.produto_id = p.id
    join public.leis l on l.id = pl.lei_id
    where p.id = p_produto_id and p.tipo_produto = 'lei_avulsa'
      and lower(l.categoria) like 'legisla%espec%fic%'
  ) then raise exception 'Produto não é uma legislação específica avulsa.'; end if;
  if coalesce(array_length(p_recomendados, 1), 0) > 100 or exists (
    select 1 from unnest(p_recomendados) r(id) where not exists (
      select 1 from public.produtos p where p.id = r.id and p.id <> p_produto_id
        and p.tipo_produto in ('edital', 'combo') and p.ativo = true
    )
  ) then raise exception 'Upsell inválido ou inativo.'; end if;
  delete from public.produto_upsells where produto_id = p_produto_id;
  insert into public.produto_upsells(produto_id, recomendado_id, ordem)
  select p_produto_id, item.id, item.ord::integer from unnest(p_recomendados) with ordinality item(id, ord);
end $$;
