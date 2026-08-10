begin;

-- Compras sao historico financeiro. Ao excluir um aluno, preservamos a compra e
-- seu identificador Hotmart, removendo somente o vinculo pessoal ao cadastro.
alter table public.compras alter column aluno_id drop not null;
alter table public.compras drop constraint if exists compras_aluno_id_fkey;
alter table public.compras add constraint compras_aluno_id_fkey
  foreign key (aluno_id) references public.alunos(id) on delete set null;

create or replace function public.admin_resumo_exclusao_aluno(p_ator_user_id uuid,p_aluno_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $f$
declare a public.alunos%rowtype;
begin
 if not exists(select 1 from auth.users where id=p_ator_user_id) then
   raise exception using errcode='42501',message='Administrador invalido.';
 end if;
 select * into a from public.alunos where id=p_aluno_id;
 if not found then raise exception using errcode='P0002',message='Aluno nao encontrado.'; end if;
 return jsonb_build_object(
   'aluno_id',a.id,'nome',a.nome,'email',a.email,'user_id',a.user_id,
   'compras',(select count(*) from public.compras where aluno_id=a.id),
   'compras_hotmart',(select count(*) from public.compras where aluno_id=a.id and (origem='hotmart' or hotmart_transaction_id is not null)),
   'produtos',(select count(*) from public.aluno_produtos where aluno_id=a.id),
   'liberacoes',(select count(*) from public.liberacoes_leis where aluno_id=a.id),
   'progresso',(select count(*) from public.progresso_leis_alunos where aluno_id=a.id),
   'primeiro_acesso',(select count(*) from public.alunos_primeiro_acesso_envios where aluno_id=a.id),
   'duplicados',(select count(*) from public.alunos where public.normalizar_email_aluno(email)=public.normalizar_email_aluno(a.email))
 );
end $f$;

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

 -- Falha fechada: uma FK nova que a rotina ainda nao conhece bloqueia a acao
 -- antes de qualquer remocao, em vez de depender de cascade silencioso.
 select conrelid::regclass::text into v_inesperada
 from pg_constraint
 where contype='f' and confrelid='public.alunos'::regclass
   and conrelid::regclass::text not in ('aluno_produtos','alunos_primeiro_acesso_envios','compras','liberacoes_leis','progresso_leis_alunos')
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

revoke all on function public.admin_resumo_exclusao_aluno(uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_excluir_aluno_definitivamente(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_resumo_exclusao_aluno(uuid,uuid) to service_role;
grant execute on function public.admin_excluir_aluno_definitivamente(uuid,uuid,text,boolean) to service_role;

commit;
