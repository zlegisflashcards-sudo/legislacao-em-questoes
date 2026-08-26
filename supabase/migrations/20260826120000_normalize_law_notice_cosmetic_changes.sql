begin;

-- Canonical comparison representation only; question data remains untouched.
create or replace function public.normalizar_texto_aviso(p_text text)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.regexp_replace(p_text, '<[[:space:]]*br[[:space:]]*/?[[:space:]]*>', ' ', 'gi'),
        chr(160), ' '
      ),
      '<[^>]*>|[[:space:]]+', ' ', 'g'
    )
  );
$$;

create or replace function public.capture_question_notice_changes()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record;
begin
  if tg_op='INSERT' then
    for r in select lei_id,count(*)::integer as n from new_rows group by lei_id loop
      perform public.record_law_update_notice_event(r.lei_id,'question_added',r.n||' questão(ões) adicionada(s).',jsonb_build_object('count',r.n,'bulk',r.n>1));
    end loop;
  elsif tg_op='DELETE' then
    for r in select lei_id,count(*)::integer as n from old_rows group by lei_id loop
      perform public.record_law_update_notice_event(r.lei_id,'question_removed',r.n||' questão(ões) removida(s).',jsonb_build_object('count',r.n,'bulk',r.n>1));
    end loop;
  else
    for r in
      select n.lei_id,count(*)::integer as n from new_rows n join old_rows o using(id)
      where public.normalizar_texto_aviso(n.pergunta) is distinct from public.normalizar_texto_aviso(o.pergunta)
         or n.resposta is distinct from o.resposta
         or public.normalizar_texto_aviso(n.justificativa) is distinct from public.normalizar_texto_aviso(o.justificativa)
         or public.normalizar_texto_aviso(n.legislacao) is distinct from public.normalizar_texto_aviso(o.legislacao)
         or n.ativo is distinct from o.ativo
      group by n.lei_id
    loop
      perform public.record_law_update_notice_event(r.lei_id,'question_changed',r.n||' questão(ões) alterada(s).',jsonb_build_object('count',r.n,'bulk',r.n>1));
    end loop;
  end if;
  return null;
end $$;

revoke all on function public.normalizar_texto_aviso(text) from public, anon, authenticated;
grant execute on function public.normalizar_texto_aviso(text) to service_role;

commit;
