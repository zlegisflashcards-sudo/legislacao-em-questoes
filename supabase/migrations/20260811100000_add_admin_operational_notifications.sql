begin;

create or replace function public.criar_notificacao_admin_aluno_duplicado()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_email text := public.normalizar_email_aluno(new.email); v_count integer;
begin
  if v_email is null or v_email = '' then return new; end if;
  select count(*) into v_count from public.alunos where public.normalizar_email_aluno(email) = v_email;
  if v_count >= 2 then
    insert into public.admin_notificacoes(tipo, titulo, mensagem, link, entidade_tipo, entidade_id, lida, lida_em, created_at)
    values ('aluno_duplicado', 'Possível aluno duplicado', 'Existem ' || v_count || ' cadastros usando o e-mail ' || v_email || '.', '/admin/comercial?tab=alunos&q=' || replace(v_email, '@', '%40'), 'aluno_duplicado_email', v_email, false, null, now())
    on conflict (entidade_tipo, entidade_id) do update
    set titulo = excluded.titulo, mensagem = excluded.mensagem, link = excluded.link, lida = false, lida_em = null, created_at = excluded.created_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists criar_notificacao_admin_aluno_duplicado on public.alunos;
create trigger criar_notificacao_admin_aluno_duplicado
after insert or update of email on public.alunos
for each row execute function public.criar_notificacao_admin_aluno_duplicado();

comment on function public.criar_notificacao_admin_aluno_duplicado() is
  'Abre uma unica notificacao por e-mail normalizado quando uma identidade de aluno fica duplicada.';

commit;
