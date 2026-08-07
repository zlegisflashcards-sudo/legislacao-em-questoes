begin;

create or replace function public.vincular_aluno_para_usuario(p_user_id uuid, p_email text, p_nome text default null)
returns text language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_conflito_id uuid;
  v_sem_vinculo integer;
begin
  if p_user_id is null or v_email is null or v_email = '' then raise exception using errcode = '22023', message = 'Usuário e e-mail são obrigatórios.'; end if;
  if exists (select 1 from public.alunos where user_id = p_user_id) then return 'already_linked'; end if;

  select id into v_conflito_id from public.alunos
  where pg_catalog.lower(pg_catalog.btrim(email)) = v_email and user_id is not null and user_id <> p_user_id limit 1;
  if found then
    insert into public.auditoria_administrativa (ator_user_id, acao, entidade, entidade_id, detalhes)
    values (p_user_id, 'conflito_vinculo_auth', 'aluno', v_conflito_id::text,
      pg_catalog.jsonb_build_object('email', v_email, 'motivo', 'email_ja_vinculado'));
    return 'conflict';
  end if;

  select pg_catalog.count(*) into v_sem_vinculo from public.alunos
  where pg_catalog.lower(pg_catalog.btrim(email)) = v_email and user_id is null;
  if v_sem_vinculo = 1 then
    update public.alunos set user_id = p_user_id, nome = pg_catalog.coalesce(nome, nullif(pg_catalog.btrim(p_nome), '')), atualizado_em = pg_catalog.now()
    where user_id is null and pg_catalog.lower(pg_catalog.btrim(email)) = v_email;
    return 'linked';
  end if;
  if v_sem_vinculo > 1 then
    insert into public.auditoria_administrativa (ator_user_id, acao, entidade, detalhes)
    values (p_user_id, 'conflito_vinculo_auth', 'aluno',
      pg_catalog.jsonb_build_object('email', v_email, 'motivo', 'multiplos_alunos_sem_vinculo'));
    return 'conflict';
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
  perform public.vincular_aluno_para_usuario(new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$function$;

revoke all on function public.vincular_aluno_para_usuario(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vincular_aluno_para_usuario(uuid, text, text) to service_role;

commit;
