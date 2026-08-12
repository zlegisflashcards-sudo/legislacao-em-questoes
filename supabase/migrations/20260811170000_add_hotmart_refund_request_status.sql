begin;

alter table public.compras
  add column if not exists reembolso_solicitado_em timestamptz;

do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.compras'::pg_catalog.regclass
      and conname = 'compras_status_acesso_check'
  ) then
    alter table public.compras add constraint compras_status_acesso_check check (
      status_acesso is null or status_acesso in ('ativo', 'cancelado', 'reembolsado', 'reembolso_solicitado')
    );
  else
    alter table public.compras drop constraint compras_status_acesso_check;
    alter table public.compras add constraint compras_status_acesso_check check (
      status_acesso is null or status_acesso in ('ativo', 'cancelado', 'reembolsado', 'reembolso_solicitado')
    );
  end if;
end;
$do$;

commit;
