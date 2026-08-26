begin;

create or replace function public.normalizar_texto_aviso(p_text text)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.replace(
          pg_catalog.regexp_replace(p_text, '<[[:space:]]*br[[:space:]]*/?[[:space:]]*>', ' ', 'gi'),
          chr(160), ' '
        ),
        '<[^>]*>', '', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  );
$$;

revoke all on function public.normalizar_texto_aviso(text) from public, anon, authenticated;
grant execute on function public.normalizar_texto_aviso(text) to service_role;

commit;
