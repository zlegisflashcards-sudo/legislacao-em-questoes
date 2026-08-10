begin;

-- Auth pode ser criado depois da aquisicao. A trigger deve reutilizar o aluno
-- ja criado pelo e-mail normalizado, nunca inserir um segundo UUID por user_id.
create or replace function public.vincular_aluno_para_usuario(p_user_id uuid, p_email text, p_nome text default null)
returns text language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text := public.normalizar_email_aluno(p_email); v_aluno_id uuid;
begin
  if p_user_id is null or v_email is null or v_email = '' then
    raise exception using errcode = '22023', message = 'Usuario e e-mail sao obrigatorios.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

  if exists (select 1 from public.alunos where user_id = p_user_id) then
    return 'already_linked';
  end if;
  if exists (select 1 from public.alunos where public.normalizar_email_aluno(email) = v_email and user_id is not null) then
    return 'conflict';
  end if;

  select id into v_aluno_id
  from public.alunos
  where public.normalizar_email_aluno(email) = v_email and user_id is null
  order by criado_em, id
  limit 1;
  if found then
    update public.alunos
    set user_id = p_user_id,
        nome = coalesce(nome, nullif(pg_catalog.btrim(p_nome), '')),
        atualizado_em = pg_catalog.now()
    where id = v_aluno_id;
    return 'linked';
  end if;

  insert into public.alunos (user_id, nome, email)
  values (p_user_id, nullif(pg_catalog.btrim(p_nome), ''), v_email);
  return 'created';
end;
$function$;

create or replace function public.criar_aluno_para_usuario()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  perform public.vincular_aluno_para_usuario(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$function$;

revoke all on function public.vincular_aluno_para_usuario(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vincular_aluno_para_usuario(uuid, text, text) to service_role;

commit;
