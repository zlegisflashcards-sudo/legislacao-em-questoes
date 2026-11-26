create table public.produto_upsells (
  produto_id uuid not null references public.produtos(id) on delete cascade,
  recomendado_id uuid not null references public.produtos(id) on delete cascade,
  ordem integer not null default 0,
  primary key (produto_id, recomendado_id),
  check (produto_id <> recomendado_id)
);
create index produto_upsells_recomendado_idx on public.produto_upsells(recomendado_id);
alter table public.produto_upsells enable row level security;
revoke all on public.produto_upsells from public, anon, authenticated;
grant select, insert, update, delete on public.produto_upsells to service_role;

create function public.admin_definir_produto_upsells(p_produto_id uuid, p_recomendados uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.produtos p
    join public.produto_leis pl on pl.produto_id = p.id
    join public.leis l on l.id = pl.lei_id
    where p.id = p_produto_id and p.tipo_produto = 'lei_avulsa'
      and lower(l.categoria) like 'legisla%espec%fic%'
  ) then raise exception 'Produto não é uma legislação específica avulsa.'; end if;
  if coalesce(array_length(p_recomendados, 1), 0) > 100 or exists (
    select 1 from unnest(p_recomendados) r(id)
    where not exists (
      select 1 from public.produtos p
      join public.produto_leis alvo on alvo.produto_id = p.id
      join public.produto_leis origem on origem.lei_id = alvo.lei_id
      where origem.produto_id = p_produto_id and p.id = r.id
        and p.tipo_produto in ('edital', 'combo') and p.ativo = true
    )
  ) then raise exception 'Upsell inválido ou sem lei em comum.'; end if;
  delete from public.produto_upsells where produto_id = p_produto_id;
  insert into public.produto_upsells(produto_id, recomendado_id, ordem)
  select p_produto_id, item.id, item.ord::integer
  from unnest(p_recomendados) with ordinality item(id, ord);
end $$;
revoke all on function public.admin_definir_produto_upsells(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_definir_produto_upsells(uuid, uuid[]) to service_role;
