begin;

create or replace function public.admin_criar_aluno(p_ator_user_id uuid,p_nome text,p_email text)
returns public.alunos language plpgsql security definer set search_path=pg_catalog
as $f$ declare v_row public.alunos%rowtype; v_email text:=public.normalizar_email_aluno(p_email); begin
 if not exists(select 1 from auth.users where id=p_ator_user_id) then raise exception using errcode='42501',message='Administrador invalido.'; end if;
 if exists(select 1 from public.alunos where public.normalizar_email_aluno(email)=v_email) then raise exception using errcode='23505',message='Ja existe um aluno cadastrado com este e-mail.'; end if;
 insert into public.alunos(nome,email) values(nullif(btrim(p_nome),''),v_email) returning * into v_row;
 insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,estado_posterior) values(p_ator_user_id,'criar_manual','aluno',v_row.id::text,to_jsonb(v_row)); return v_row;
end $f$;

create or replace function public.admin_atualizar_aluno(p_ator_user_id uuid,p_aluno_id uuid,p_nome text,p_email text)
returns public.alunos language plpgsql security definer set search_path=pg_catalog
as $f$ declare v_before public.alunos%rowtype; v_row public.alunos%rowtype; v_email text:=public.normalizar_email_aluno(p_email); begin
 select * into v_before from public.alunos where id=p_aluno_id for update; if not found then raise exception using errcode='P0002',message='Aluno nao encontrado.'; end if;
 if v_before.user_id is not null and public.normalizar_email_aluno(v_before.email)<>v_email then raise exception using errcode='22023',message='O e-mail de aluno com Auth nao pode ser alterado sem sincronizacao segura da conta Auth.'; end if;
 if exists(select 1 from public.alunos where id<>p_aluno_id and public.normalizar_email_aluno(email)=v_email) then raise exception using errcode='23505',message='Ja existe outro aluno com este e-mail.'; end if;
 update public.alunos set nome=nullif(btrim(p_nome),''),email=v_email where id=p_aluno_id returning * into v_row;
 insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,estado_anterior,estado_posterior) values(p_ator_user_id,'atualizar','aluno',p_aluno_id::text,to_jsonb(v_before),to_jsonb(v_row)); return v_row;
end $f$;

create or replace function public.admin_mesclar_alunos(p_ator_user_id uuid,p_principal uuid,p_secundario uuid,p_nome_final text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $f$ declare a public.alunos%rowtype; b public.alunos%rowtype; v_conflicts integer; v_purchases integer; v_releases integer; begin
 if p_principal=p_secundario then raise exception using errcode='22023',message='Selecione cadastros diferentes.'; end if;
 select * into a from public.alunos where id=p_principal for update; select * into b from public.alunos where id=p_secundario for update; if not found then raise exception using errcode='P0002',message='Aluno secundario nao encontrado.'; end if;
 if a.user_id is not null and b.user_id is not null and a.user_id<>b.user_id then raise exception using errcode='22023',message='Os dois cadastros possuem contas de autenticacao diferentes. E necessaria analise manual antes da mesclagem.'; end if;
 if public.normalizar_email_aluno(a.email)<>public.normalizar_email_aluno(b.email) then raise exception using errcode='22023',message='Mesclagem permitida somente para o mesmo e-mail normalizado.'; end if;
 if a.user_id is null and b.user_id is not null then update public.alunos set user_id=b.user_id where id=p_principal; end if;
 -- Relacoes conhecidas: compras, liberacoes e progresso. Conflitos de progresso e
 -- liberacoes manuais equivalentes sao preservados no principal e removidos do secundario.
 delete from public.progresso_leis_alunos s using public.progresso_leis_alunos p where s.aluno_id=p_secundario and p.aluno_id=p_principal and p.lei_id=s.lei_id;
 update public.progresso_leis_alunos set aluno_id=p_principal where aluno_id=p_secundario;
 update public.compras set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_purchases=row_count;
 update public.liberacoes_leis set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_releases=row_count;
 update public.alunos set nome=coalesce(nullif(btrim(p_nome_final),''),nome,b.nome),user_id=coalesce(user_id,b.user_id) where id=p_principal;
 delete from public.alunos where id=p_secundario;
 insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,detalhes) values(p_ator_user_id,'mesclar','aluno',p_principal::text,jsonb_build_object('principal',p_principal,'secundario',p_secundario,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases));
 return jsonb_build_object('principal',p_principal,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases);
end $f$;

create or replace function public.admin_excluir_aluno_vazio(p_ator_user_id uuid,p_aluno_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog
as $f$ declare a public.alunos%rowtype; begin select * into a from public.alunos where id=p_aluno_id for update; if not found then raise exception using errcode='P0002',message='Aluno nao encontrado.'; end if;
 if a.user_id is not null or exists(select 1 from public.compras where aluno_id=p_aluno_id) or exists(select 1 from public.liberacoes_leis where aluno_id=p_aluno_id) or exists(select 1 from public.progresso_leis_alunos where aluno_id=p_aluno_id) then raise exception using errcode='22023',message='Exclusao bloqueada: aluno possui Auth, compras, liberacoes, progresso ou outros vinculos.'; end if;
 delete from public.alunos where id=p_aluno_id; insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,estado_anterior) values(p_ator_user_id,'excluir','aluno',p_aluno_id::text,to_jsonb(a)); end $f$;

grant execute on function public.admin_criar_aluno(uuid,text,text),public.admin_atualizar_aluno(uuid,uuid,text,text),public.admin_mesclar_alunos(uuid,uuid,uuid,text),public.admin_excluir_aluno_vazio(uuid,uuid) to service_role;
commit;
