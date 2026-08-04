\set ON_ERROR_STOP on

begin;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_tables
     where schemaname = 'public' and tablename = 'legisbot_generation_rate_limits'
  ) then raise exception 'rate limit table missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_class
     where oid = 'public.legisbot_generation_rate_limits'::regclass and relrowsecurity
  ) then raise exception 'RLS is not enabled'; end if;
  if has_table_privilege('anon', 'public.legisbot_generation_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.legisbot_generation_rate_limits', 'SELECT') then
    raise exception 'public roles can read rate limits';
  end if;
  if not has_table_privilege('service_role', 'public.legisbot_generation_rate_limits', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service_role privileges missing';
  end if;
  if has_function_privilege('anon', 'public.reservar_geracao_legisbot(uuid,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reservar_geracao_legisbot(uuid,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'public role can execute reservation RPC';
  end if;
  if not has_function_privilege('service_role', 'public.reservar_geracao_legisbot(uuid,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'service_role cannot execute reservation RPC';
  end if;
end
$$;

do $$
declare
  v_user uuid := '10000000-0000-4000-8000-000000000001';
  v_decision text;
  v_id bigint;
  v_count_before bigint;
  v_count_after bigint;
begin
  select decisao, comentario_id into v_decision, v_id
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', 'Lei', 'Artigo', 'Texto legal');
  if v_decision <> 'reserved' then raise exception 'first request was not reserved: %', v_decision; end if;

  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', null, null, null);
  if v_decision <> 'processing' then raise exception 'active lease was not preserved: %', v_decision; end if;

  update public.legisbot_comentarios
     set processing_started_at = statement_timestamp() - interval '3 minutes'
   where id = v_id;
  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', null, null, null);
  if v_decision <> 'reserved' then raise exception 'expired lease was not recovered: %', v_decision; end if;
  if (select attempt_count from public.legisbot_comentarios where id = v_id) <> 2 then
    raise exception 'attempt count did not advance after lease recovery';
  end if;

  update public.legisbot_comentarios
     set status = 'erro', processing_started_at = null,
         retry_after = statement_timestamp() + interval '10 minutes'
   where id = v_id;
  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', null, null, null);
  if v_decision <> 'cooldown' then raise exception 'cooldown was not enforced: %', v_decision; end if;

  update public.legisbot_comentarios
     set retry_after = statement_timestamp() - interval '1 second', attempt_count = 3
   where id = v_id;
  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', null, null, null);
  if v_decision <> 'attempts_exhausted' then raise exception 'attempt ceiling was not enforced: %', v_decision; end if;

  select count(*) into v_count_before from public.legisbot_generation_rate_limits;
  update public.legisbot_comentarios
     set status = 'concluido', comentario = '<p>Pronto</p>', retry_after = null
   where id = v_id;
  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTLEASE', '1', null, null, null);
  select count(*) into v_count_after from public.legisbot_generation_rate_limits;
  if v_decision <> 'completed' or v_count_after <> v_count_before then
    raise exception 'completed content consumed rate limit';
  end if;
end
$$;

do $$
declare
  v_user uuid := '20000000-0000-4000-8000-000000000002';
  v_decision text;
  i integer;
begin
  for i in 1..6 loop
    select decisao into v_decision
      from public.reservar_geracao_legisbot(v_user, 'TESTRATE' || i, '1', 'Lei', 'Artigo', 'Texto legal');
    if i <= 5 and v_decision <> 'reserved' then
      raise exception '10-minute request % was unexpectedly blocked: %', i, v_decision;
    end if;
  end loop;
  if v_decision <> 'rate_limited' then raise exception '10-minute limit was not enforced'; end if;
end
$$;

do $$
declare
  v_user uuid := '30000000-0000-4000-8000-000000000003';
  v_day timestamptz := date_trunc('day', statement_timestamp());
  v_decision text;
begin
  insert into public.legisbot_generation_rate_limits
    (chave, janela_inicio, quantidade, expires_at)
  values ('user:' || v_user::text || ':day', v_day, 20, v_day + interval '1 day');
  select decisao into v_decision
    from public.reservar_geracao_legisbot(v_user, 'TESTDAY', '1', 'Lei', 'Artigo', 'Texto legal');
  if v_decision <> 'rate_limited' then raise exception 'daily limit was not enforced: %', v_decision; end if;
end
$$;

rollback;
