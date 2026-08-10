begin;

create or replace function public.admin_mesclar_alunos(p_ator_user_id uuid,p_principal uuid,p_secundario uuid,p_nome_final text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $f$
declare
  a public.alunos%rowtype; b public.alunos%rowtype; v_purchases integer:=0; v_releases integer:=0; r record;
begin
  if p_principal=p_secundario then raise exception using errcode='22023',message='Mesclagem invalida: os UUIDs sao iguais.'; end if;
  select * into a from public.alunos where id=p_principal for update;
  if not found then raise exception using errcode='P0002',message='Aluno principal nao encontrado.'; end if;
  select * into b from public.alunos where id=p_secundario for update;
  if not found then raise exception using errcode='P0002',message='Aluno secundario nao encontrado.'; end if;
  if a.user_id is not null and b.user_id is not null and a.user_id<>b.user_id then raise exception using errcode='22023',message='Os dois cadastros possuem contas Auth diferentes. E necessaria analise manual antes da mesclagem.'; end if;
  if public.normalizar_email_aluno(a.email)<>public.normalizar_email_aluno(b.email) then raise exception using errcode='22023',message='Mesclagem permitida somente para o mesmo e-mail normalizado.'; end if;
  -- Nunca ocultar uma FK desconhecida: interrompe antes de qualquer alteracao.
  for r in
    select c.conname,n.nspname as schema_name,cl.relname as table_name,at.attname as column_name
    from pg_catalog.pg_constraint c join pg_catalog.pg_class cl on cl.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=cl.relnamespace
    join pg_catalog.pg_attribute at on at.attrelid=cl.oid and at.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.alunos'::regclass
  loop
    if (r.schema_name,r.table_name,r.column_name) not in (('public','compras','aluno_id'),('public','liberacoes_leis','aluno_id'),('public','progresso_leis_alunos','aluno_id')) then
      raise exception using errcode='23503',message=format('Referencia pendente nao suportada: %I.%I.%I (%I).',r.schema_name,r.table_name,r.column_name,r.conname);
    end if;
  end loop;
  if a.user_id is null and b.user_id is not null then update public.alunos set user_id=b.user_id where id=p_principal; end if;
  -- Progresso possui chave unica aluno/lei: conserva o registro do principal.
  delete from public.progresso_leis_alunos s using public.progresso_leis_alunos p where s.aluno_id=p_secundario and p.aluno_id=p_principal and p.lei_id=s.lei_id;
  update public.progresso_leis_alunos set aluno_id=p_principal where aluno_id=p_secundario;
  update public.compras set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_purchases=row_count;
  update public.liberacoes_leis set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_releases=row_count;
  update public.alunos set nome=coalesce(nullif(btrim(p_nome_final),''),nome,b.nome),user_id=coalesce(user_id,b.user_id) where id=p_principal;
  delete from public.alunos where id=p_secundario;
  insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,detalhes) values(p_ator_user_id,'mesclar','aluno',p_principal::text,jsonb_build_object('principal',p_principal,'secundario',p_secundario,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases));
  return jsonb_build_object('principal',p_principal,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases);
exception when others then
  raise log 'Falha merge alunos principal=% secundario=% sqlstate=% mensagem=%',p_principal,p_secundario,sqlstate,sqlerrm;
  raise;
end $f$;

commit;
