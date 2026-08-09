begin;

-- A identidade de aluno e sempre lower(btrim(email)). Ainda existem
-- duplicidades historicas, portanto a constraint UNIQUE definitiva fica para
-- depois da consolidacao documentada em IDENTITY_CONSOLIDATION_NEXT_STEP.md.
create or replace function public.normalizar_email_aluno(p_email text)
returns text language sql immutable strict set search_path = pg_catalog
as $$ select pg_catalog.lower(pg_catalog.btrim(p_email)) $$;

create or replace function public.proteger_identidade_aluno()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text;
begin
  v_email := public.normalizar_email_aluno(new.email);
  if v_email is null or v_email = '' then raise exception using errcode = '22023', message = 'E-mail do aluno e obrigatorio.'; end if;
  new.email := v_email;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  if tg_op = 'INSERT' and exists (select 1 from public.alunos a where public.normalizar_email_aluno(a.email) = v_email) then
    raise exception using errcode = '23505', message = 'Ja existe aluno com este e-mail normalizado.';
  end if;
  if tg_op = 'UPDATE' and public.normalizar_email_aluno(old.email) <> v_email and exists (select 1 from public.alunos a where a.id <> old.id and public.normalizar_email_aluno(a.email) = v_email) then
    raise exception using errcode = '23505', message = 'Ja existe aluno com este e-mail normalizado.';
  end if;
  return new;
end;
$function$;

drop trigger if exists alunos_proteger_identidade_email on public.alunos;
create trigger alunos_proteger_identidade_email before insert or update of email on public.alunos for each row execute function public.proteger_identidade_aluno();
create index if not exists alunos_email_normalizado_idx on public.alunos (public.normalizar_email_aluno(email));

create or replace function public.obter_ou_criar_aluno_por_email(p_email text, p_nome text default null, p_telefone text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text := public.normalizar_email_aluno(p_email); v_aluno public.alunos%rowtype;
begin
  if v_email is null or v_email = '' then raise exception using errcode = '22023', message = 'E-mail do aluno e obrigatorio.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  select * into v_aluno from public.alunos where public.normalizar_email_aluno(email) = v_email order by criado_em, id limit 1;
  if found then
    update public.alunos set nome = coalesce(nome, nullif(pg_catalog.btrim(p_nome), '')), telefone = coalesce(telefone, nullif(pg_catalog.btrim(p_telefone), '')) where id = v_aluno.id;
    return v_aluno.id;
  end if;
  insert into public.alunos (nome, email, telefone) values (nullif(pg_catalog.btrim(p_nome), ''), v_email, nullif(pg_catalog.btrim(p_telefone), '')) returning id into v_aluno.id;
  return v_aluno.id;
end;
$function$;

create or replace function public.vincular_aluno_para_usuario(p_user_id uuid, p_email text, p_nome text default null)
returns text language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text := public.normalizar_email_aluno(p_email); v_aluno_id uuid;
begin
  if p_user_id is null or v_email is null or v_email = '' then raise exception using errcode = '22023', message = 'Usuario e e-mail sao obrigatorios.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  if exists (select 1 from public.alunos where user_id = p_user_id) then return 'already_linked'; end if;
  if exists (select 1 from public.alunos where public.normalizar_email_aluno(email) = v_email and user_id is not null) then return 'conflict'; end if;
  select id into v_aluno_id from public.alunos where public.normalizar_email_aluno(email) = v_email and user_id is null order by criado_em, id limit 1;
  if found then
    update public.alunos set user_id = p_user_id, nome = coalesce(nome, nullif(pg_catalog.btrim(p_nome), '')), atualizado_em = pg_catalog.now() where id = v_aluno_id;
    return 'linked';
  end if;
  insert into public.alunos (user_id, nome, email) values (p_user_id, nullif(pg_catalog.btrim(p_nome), ''), v_email);
  return 'created';
end;
$function$;

revoke all on function public.normalizar_email_aluno(text) from public, anon, authenticated;
revoke all on function public.proteger_identidade_aluno() from public, anon, authenticated;
revoke all on function public.obter_ou_criar_aluno_por_email(text, text, text) from public, anon, authenticated;
grant execute on function public.obter_ou_criar_aluno_por_email(text, text, text) to service_role;
comment on index public.alunos_email_normalizado_idx is 'Indice de busca e protecao transacional; apos consolidar duplicidades, substituir por UNIQUE em public.normalizar_email_aluno(email).';

commit;
