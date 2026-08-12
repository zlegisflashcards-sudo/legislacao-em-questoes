begin;

-- Correcao complementar de 20260808230000: o diagnostico anterior confirmou
-- ausencia de e-mails normalizados duplicados. Nenhum dado existente e alterado.
create or replace function public.proteger_identidade_aluno()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text;
begin
  v_email := public.normalizar_email_aluno(new.email);
  if v_email is null or v_email = '' then
    raise exception using errcode = '22023', message = 'E-mail do aluno e obrigatorio.';
  end if;
  new.email := v_email;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  if tg_op = 'INSERT' and exists (
    select 1 from public.alunos a where public.normalizar_email_aluno(a.email) = v_email
  ) then
    raise exception using errcode = '23505', message = 'Ja existe aluno com este e-mail normalizado.';
  end if;
  if tg_op = 'UPDATE' and public.normalizar_email_aluno(old.email) <> v_email and exists (
    select 1 from public.alunos a where a.id <> old.id and public.normalizar_email_aluno(a.email) = v_email
  ) then
    raise exception using errcode = '23505', message = 'Ja existe aluno com este e-mail normalizado.';
  end if;
  return new;
end;
$function$;

do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.alunos'::pg_catalog.regclass
      and tgname = 'alunos_proteger_identidade_email'
      and not tgisinternal
  ) then
    create trigger alunos_proteger_identidade_email
      before insert or update of email on public.alunos
      for each row execute function public.proteger_identidade_aluno();
  end if;
end;
$do$;

create unique index if not exists alunos_email_normalizado_idx
  on public.alunos (public.normalizar_email_aluno(email));

create or replace function public.obter_ou_criar_aluno_por_email(
  p_email text, p_nome text default null, p_telefone text default null
)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text := public.normalizar_email_aluno(p_email); v_aluno public.alunos%rowtype;
begin
  if v_email is null or v_email = '' then
    raise exception using errcode = '22023', message = 'E-mail do aluno e obrigatorio.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));
  select * into v_aluno from public.alunos
  where public.normalizar_email_aluno(email) = v_email
  order by criado_em, id limit 1;
  if found then
    update public.alunos
    set nome = coalesce(nome, nullif(pg_catalog.btrim(p_nome), '')),
        telefone = coalesce(telefone, nullif(pg_catalog.btrim(p_telefone), ''))
    where id = v_aluno.id;
    return v_aluno.id;
  end if;
  insert into public.alunos (nome, email, telefone)
  values (nullif(pg_catalog.btrim(p_nome), ''), v_email, nullif(pg_catalog.btrim(p_telefone), ''))
  returning id into v_aluno.id;
  return v_aluno.id;
end;
$function$;

revoke all on function public.proteger_identidade_aluno() from public, anon, authenticated;
revoke all on function public.obter_ou_criar_aluno_por_email(text, text, text) from public, anon, authenticated;
grant execute on function public.obter_ou_criar_aluno_por_email(text, text, text) to service_role;

comment on index public.alunos_email_normalizado_idx is
  'Unicidade da identidade de aluno por e-mail normalizado, validada antes da criacao do indice.';

commit;
