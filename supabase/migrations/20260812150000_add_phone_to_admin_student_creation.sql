begin;

drop function if exists public.admin_criar_aluno(uuid, text, text);

create function public.admin_criar_aluno(
  p_ator_user_id uuid,
  p_nome text,
  p_email text,
  p_telefone text default null
)
returns public.alunos language plpgsql security definer set search_path=pg_catalog
as $f$
declare
  v_row public.alunos%rowtype;
  v_email text := public.normalizar_email_aluno(p_email);
begin
  if not exists(select 1 from auth.users where id=p_ator_user_id) then
    raise exception using errcode='42501',message='Administrador invalido.';
  end if;
  if exists(select 1 from public.alunos where public.normalizar_email_aluno(email)=v_email) then
    raise exception using errcode='23505',message='Ja existe um aluno cadastrado com este e-mail.';
  end if;
  insert into public.alunos(nome,email,telefone)
  values(nullif(btrim(p_nome),''),v_email,nullif(btrim(p_telefone),''))
  returning * into v_row;
  insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,estado_posterior)
  values(p_ator_user_id,'criar_manual','aluno',v_row.id::text,to_jsonb(v_row));
  return v_row;
end $f$;

revoke all on function public.admin_criar_aluno(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_criar_aluno(uuid,text,text,text) to service_role;

commit;
