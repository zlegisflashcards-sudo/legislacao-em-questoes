begin;

alter table public.compras drop constraint if exists compras_status_check;
alter table public.compras add constraint compras_status_check check (
  status is null or status in ('aprovada', 'manual', 'cancelada', 'reembolsada', 'chargeback', 'reembolso_solicitado')
);

commit;
