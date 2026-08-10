begin;

-- A funcao usa search_path=pg_catalog; nessa condicao regclass gera nomes
-- qualificados (public.aluno_produtos). Compare OIDs, nao texto, para que as
-- referencias explicitamente tratadas nunca sejam classificadas como desconhecidas.
create or replace function public.admin_excluir_aluno_definitivamente(p_ator_user_id uuid,p_aluno_id uuid,p_confirmacao text,p_excluir_auth boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $f$
declare
 a public.alunos%rowtype;
 v_compras integer:=0; v_produtos integer:=0; v_liberacoes integer:=0;
 v_progresso integer:=0; v_primeiro_acesso integer:=0; v_inesperada text;
begin
 if not exists(select 1 from auth.users where id=p_ator_user_id) then
   raise exception using errcode='42501',message='Administrador invalido.';
 end if;
 if btrim(coalesce(p_confirmacao,''))<>'EXCLUIR' then
   raise exception using errcode='22023',message='Digite EXCLUIR para confirmar a exclusao definitiva.';
 end if;
 select * into a from public.alunos where id=p_aluno_id for update;
 if not found then raise exception using errcode='P0002',message='Aluno nao encontrado.'; end if;
 if a.user_id is not null and not p_excluir_auth then
   raise exception using errcode='22023',message='O aluno possui conta Auth. Marque a exclusao da conta Auth para continuar.';
 end if;

 select conrelid::regclass::text into v_inesperada
 from pg_constraint
 where contype='f' and confrelid='public.alunos'::regclass
   and conrelid not in (
     'public.aluno_produtos'::regclass,
     'public.alunos_primeiro_acesso_envios'::regclass,
     'public.compras'::regclass,
     'public.liberacoes_leis'::regclass,
     'public.progresso_leis_alunos'::regclass
   )
 limit 1;
 if v_inesperada is not null then
   raise exception using errcode='23503',message='Referencia pendente nao suportada para exclusao: '||v_inesperada;
 end if;

 delete from public.alunos_primeiro_acesso_envios where aluno_id=a.id; get diagnostics v_primeiro_acesso=row_count;
 delete from public.liberacoes_leis where aluno_id=a.id; get diagnostics v_liberacoes=row_count;
 delete from public.aluno_produtos where aluno_id=a.id; get diagnostics v_produtos=row_count;
 delete from public.progresso_leis_alunos where aluno_id=a.id; get diagnostics v_progresso=row_count;
 update public.compras set aluno_id=null where aluno_id=a.id; get diagnostics v_compras=row_count;
 delete from public.alunos where id=a.id;
 insert into public.auditoria_administrativa(ator_user_id,acao,entidade,entidade_id,estado_anterior,detalhes)
 values(p_ator_user_id,'excluir_definitivamente','aluno',a.id::text,to_jsonb(a),jsonb_build_object(
   'compras_desvinculadas_e_preservadas',v_compras,
   'produtos_removidos',v_produtos,'liberacoes_removidas',v_liberacoes,
   'progresso_removido',v_progresso,'primeiro_acesso_removido',v_primeiro_acesso,
   'auth_solicitado',p_excluir_auth,'hotmart_eventos_preservados',true
 ));
 return jsonb_build_object('compras_preservadas',v_compras,'produtos_removidos',v_produtos,'liberacoes_removidas',v_liberacoes,'progresso_removido',v_progresso,'primeiro_acesso_removido',v_primeiro_acesso);
end $f$;

revoke all on function public.admin_excluir_aluno_definitivamente(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_excluir_aluno_definitivamente(uuid,uuid,text,boolean) to service_role;

commit;
