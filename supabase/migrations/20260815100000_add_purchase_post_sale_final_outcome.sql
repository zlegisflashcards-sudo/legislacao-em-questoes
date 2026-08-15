begin;

alter table public.compras_pos_venda_overrides
  add column if not exists resultado_final text;

alter table public.compras_pos_venda_overrides
  drop constraint if exists compras_pos_venda_overrides_resultado_final_check;
alter table public.compras_pos_venda_overrides
  add constraint compras_pos_venda_overrides_resultado_final_check check (
    resultado_final is null or resultado_final in ('cliente_confirmou', 'nao_respondeu')
  );

commit;
