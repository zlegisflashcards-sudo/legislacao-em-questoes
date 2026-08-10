begin;

-- Corrige somente a transferencia de Auth durante o merge. O user_id precisa
-- sair do secundario antes de ser atribuido ao principal, sob a mesma transacao.
create or replace function public.admin_mesclar_alunos(p_ator_user_id uuid,p_principal uuid,p_secundario uuid,p_nome_final text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $f$
declare a public.alunos%rowtype; b public.alunos%rowtype; v_purchases integer; v_releases integer; v_user_id uuid;
begin
 if p_principal=p_secundario then raise exception using errcode='22023',message='Selecione cadastros diferentes.'; end if;
 select * into a from public.alunos where id=p_principal for update;
 if not found then raise exception using errcode='P0002',message='Aluno principal nao encontrado.'; end if;
 select * into b from public.alunos where id=p_secundario for update;
 if not found then raise exception using errcode='P0002',message='Aluno secundario nao encontrado.'; end if;
 if a.user_id is not null and b.user_id is not null and a.user_id<>b.user_id then raise exception using errcode='22023',message='Os dois cadastros possuem contas de autenticacao diferentes. E necessaria analise manual antes da mesclagem.'; end if;
 if public.normalizar_email_aluno(a.email)<>public.normalizar_email_aluno(b.email) then raise exception using errcode='22023',message='Mesclagem permitida somente para o mesmo e-mail normalizado.'; end if;
 if a.user_id is null and b.user_id is not null then
   v_user_id:=b.user_id;
   update public.alunos set user_id=null where id=p_secundario;
   update public.alunos set user_id=v_user_id where id=p_principal;
 end if;
 delete from public.progresso_leis_alunos s using public.progresso_leis_alunos p where s.aluno_id=p_secundario and p.aluno_id=p_principal and p.lei_id=s.lei_id;
 update public.progresso_leis_alunos set aluno_id=p_principal where aluno_id=p_secundario;
 update public.compras set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_purchases=row_count;
 update public.liberacoes_leis set aluno_id=p_principal where aluno_id=p_secundario; get diagnostics v_releases=row_count;
 update public.alunos set nome=coalesce(nullif(btrim(p_nome_final),''),nome,b.nome),user_id=coalesce(user_id,b.user_id) where id=p_principal;
 delete from public.alunos where id=p_secundario;
 insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,detalhes) values(p_ator_user_id,'mesclar','aluno',p_principal::text,jsonb_build_object('principal',p_principal,'secundario',p_secundario,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases));
 return jsonb_build_object('principal',p_principal,'compras_transferidas',v_purchases,'liberacoes_transferidas',v_releases);
end $f$;

commit;
