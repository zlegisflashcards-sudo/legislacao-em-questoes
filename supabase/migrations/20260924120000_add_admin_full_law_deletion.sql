begin;

create or replace function public.admin_delete_law_definitively(
  p_lei_id bigint,
  p_actor_user_id uuid,
  p_confirmation text default null,
  p_execute boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_law public.leis;
  v_summary jsonb;
  v_audio_paths jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null or not exists (
    select 1 from auth.users where id = p_actor_user_id
  ) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  select * into v_law from public.leis where id = p_lei_id for update;
  if not found then
    raise exception 'Lei nao encontrada.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(path order by path), '[]'::jsonb)
    into v_audio_paths
    from (
      select a.storage_path as path from public.legiscast_audios a where a.lei_id = p_lei_id
      union
      select j.final_path from public.legiscast_audio_jobs j where j.lei_id = p_lei_id
      union
      select j.mp3_path from public.legiscast_audio_jobs j where j.lei_id = p_lei_id and j.mp3_path is not null
    ) paths;

  select jsonb_build_object(
    'law', jsonb_build_object('id', v_law.id, 'slug', v_law.slug, 'titulo', v_law.titulo),
    'structures_count', (select count(*) from public.law_structure where lei_id = p_lei_id),
    'questions_count', (select count(*) from public.questions where lei_id = p_lei_id),
    'campaigns_count', (select count(*) from public.campanhas_leis_alunos where lei_id = p_lei_id),
    'answers_count', (select count(*) from public.campanhas_leis_respostas r join public.campanhas_leis_alunos c on c.id = r.campanha_id where c.lei_id = p_lei_id),
    'progresses_count', (select count(*) from public.progresso_leis_alunos where lei_id = p_lei_id),
    'recortes_count', (select count(*) from public.recortes_leis where lei_id = p_lei_id),
    'materials_count', (select count(*) from public.materiais_leis where lei_id = p_lei_id),
    'history_count', (select count(*) from public.historico_atualizacoes_leis where lei_id = p_lei_id),
    'releases_count', (select count(*) from public.liberacoes_leis where lei_id = p_lei_id),
    'product_links_count', (select count(*) from public.produto_leis where lei_id = p_lei_id),
    'personal_edital_links_count', (select count(*) from public.editais_personalizados_leis where lei_id = p_lei_id),
    'league_links_count', (select count(*) from public.ligas_leis where lei_id = p_lei_id),
    'audios_count', (select count(*) from public.legiscast_audios where lei_id = p_lei_id),
    'jobs_count', (select count(*) from public.legiscast_audio_jobs where lei_id = p_lei_id),
    'storage_paths', v_audio_paths
  ) into v_summary;

  if not p_execute then
    return v_summary;
  end if;
  if p_confirmation is distinct from 'EXCLUIR' then
    raise exception 'Digite EXCLUIR para confirmar a exclusao definitiva da lei e de todos os dados relacionados.' using errcode = '22023';
  end if;

  -- A ordem remove referências RESTRICT antes de a remoção da lei acionar os
  -- relacionamentos CASCADE de questões, campanhas, progresso e LegisCast.
  delete from public.historico_atualizacoes_leis where lei_id = p_lei_id;
  delete from public.produto_leis where lei_id = p_lei_id;
  delete from public.editais_personalizados_leis where lei_id = p_lei_id;
  delete from public.ligas_leis where lei_id = p_lei_id;
  delete from public.liberacoes_leis where lei_id = p_lei_id;
  delete from public.recortes_leis where lei_id = p_lei_id;
  delete from public.materiais_leis where lei_id = p_lei_id;

  insert into public.auditoria_administrativa(
    ator_user_id, acao, entidade, entidade_id, estado_anterior, detalhes
  ) values (
    p_actor_user_id, 'excluir_definitivamente', 'lei', p_lei_id::text,
    jsonb_build_object('id', v_law.id, 'slug', v_law.slug, 'titulo', v_law.titulo),
    v_summary
  );

  delete from public.leis where id = p_lei_id;
  if not found then
    raise exception 'A lei nao pode ser excluida.' using errcode = 'P0002';
  end if;
  return v_summary || jsonb_build_object('deleted', true);
end;
$function$;

revoke all on function public.admin_delete_law_definitively(bigint, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_delete_law_definitively(bigint, uuid, text, boolean)
  to service_role;

comment on function public.admin_delete_law_definitively(bigint, uuid, text, boolean)
  is 'Previsualiza ou exclui definitivamente uma lei e seus vínculos comerciais/editoriais em uma transação. Produtos, compras e alunos são preservados.';

commit;
