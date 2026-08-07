begin;

-- A tabela já existe em produção com colunas legadas. Esta migração somente
-- acrescenta o formato utilizado pelo receptor atual, sem remover o histórico.
alter table public.hotmart_eventos
  add column if not exists identificador_evento text,
  add column if not exists codigo_transacao text,
  add column if not exists tipo_evento text,
  add column if not exists status_transacao text,
  add column if not exists email_comprador text,
  add column if not exists payload_bruto jsonb,
  add column if not exists payload_normalizado jsonb,
  add column if not exists recebido_em timestamptz;

update public.hotmart_eventos
set
  identificador_evento = coalesce(identificador_evento, hotmart_event_id),
  codigo_transacao = coalesce(codigo_transacao, hotmart_transaction_id),
  tipo_evento = coalesce(tipo_evento, evento),
  payload_bruto = coalesce(payload_bruto, payload),
  recebido_em = coalesce(recebido_em, criado_em)
where identificador_evento is null
   or codigo_transacao is null
   or tipo_evento is null
   or payload_bruto is null
   or recebido_em is null;

create unique index if not exists hotmart_eventos_identificador_evento_unique_idx
  on public.hotmart_eventos (identificador_evento)
  where identificador_evento is not null;

create index if not exists hotmart_eventos_codigo_transacao_idx
  on public.hotmart_eventos (codigo_transacao)
  where codigo_transacao is not null;
create index if not exists hotmart_eventos_recebido_em_idx
  on public.hotmart_eventos (recebido_em desc);

commit;
