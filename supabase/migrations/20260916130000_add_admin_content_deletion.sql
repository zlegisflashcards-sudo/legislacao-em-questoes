begin;

create or replace function public.admin_delete_law_content(
  p_lei_id bigint,
  p_question_id uuid,
  p_structure_id bigint,
  p_actor_user_id uuid,
  p_confirmation text default null,
  p_execute boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_question_ids uuid[] := '{}'::uuid[];
  v_question_text_ids text[] := '{}'::text[];
  v_structure_ids bigint[] := '{}'::bigint[];
  v_campaign_ids uuid[] := '{}'::uuid[];
  v_admin_aluno_id uuid;
  v_campaigns jsonb := '[]'::jsonb;
  v_audios jsonb := '[]'::jsonb;
  v_jobs jsonb := '[]'::jsonb;
  v_recortes jsonb := '[]'::jsonb;
  v_cross_law jsonb := '[]'::jsonb;
  v_answers_count integer := 0;
  v_progress_count integer := 0;
  v_has_other_student boolean := false;
  v_summary jsonb;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users u where u.id=p_actor_user_id) then
    raise exception 'Autenticacao administrativa obrigatoria.' using errcode='42501';
  end if;
  if (p_question_id is null)=(p_structure_id is null) then
    raise exception 'Informe exatamente uma questao ou estrutura.' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_lei_id);
  if not exists(select 1 from public.leis l where l.id=p_lei_id) then
    raise exception 'Lei nao encontrada.' using errcode='P0002';
  end if;
  if p_execute then
    -- Os snapshots não possuem FK para questions. Estes locks impedem que uma
    -- campanha, questão ou dependência seja criada entre o cálculo e o DELETE.
    lock table public.law_structure, public.questions,
      public.campanhas_leis_alunos, public.campanhas_leis_niveis,
      public.campanhas_leis_respostas, public.progresso_leis_alunos,
      public.legiscast_audios, public.legiscast_audio_jobs,
      public.recortes_leis_estrutura
      in share row exclusive mode;
  end if;

  if p_question_id is not null then
    select pg_catalog.array_agg(q.id) into v_question_ids
    from public.questions q where q.id=p_question_id and q.lei_id=p_lei_id;
    if v_question_ids is null then raise exception 'Questao nao encontrada para esta lei.' using errcode='P0002'; end if;
  else
    select coalesce(pg_catalog.array_agg(tree.id order by tree.id),'{}'::bigint[]) into v_structure_ids
    from (
      with recursive descendants as (
        select s.id from public.law_structure s where s.id=p_structure_id and s.lei_id=p_lei_id
        union all
        select child.id from public.law_structure child join descendants parent on child.parent_id=parent.id
        where child.lei_id=p_lei_id
      ) select id from descendants
    ) tree;
    if coalesce(pg_catalog.array_length(v_structure_ids,1),0)=0 then
      raise exception 'Estrutura nao encontrada para esta lei.' using errcode='P0002';
    end if;
    select coalesce(pg_catalog.array_agg(q.id order by q.id),'{}'::uuid[]) into v_question_ids
    from public.questions q where q.lei_id=p_lei_id and q.structure_id=any(v_structure_ids);
  end if;

  select coalesce(pg_catalog.array_agg(question_id::text order by question_id::text),'{}'::text[])
  into v_question_text_ids from pg_catalog.unnest(v_question_ids) question_id;

  select coalesce(pg_catalog.array_agg(c.id order by c.id),'{}'::uuid[]) into v_campaign_ids
  from public.campanhas_leis_alunos c
  where c.lei_id=p_lei_id and (
    exists(
      select 1 from public.campanhas_leis_niveis n
      where n.campanha_id=c.id and (n.questoes_ids ?| v_question_text_ids or n.pendencias_ids ?| v_question_text_ids)
    )
    or exists(
      select 1 from public.campanhas_leis_respostas r
      where r.campanha_id=c.id and r.questao_id=any(v_question_text_ids)
    )
  );

  select a.id into v_admin_aluno_id from public.alunos a where a.user_id=p_actor_user_id order by a.id limit 1;
  select exists(
    select 1 from public.campanhas_leis_alunos c
    where c.id=any(v_campaign_ids) and c.aluno_id is distinct from v_admin_aluno_id
  ) into v_has_other_student;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',c.id,'aluno_id',c.aluno_id,'nome',a.nome,'email',a.email,
    'concluida',c.concluida,'abandonada',c.abandonada,
    'is_requesting_admin',c.aluno_id is not distinct from v_admin_aluno_id
  ) order by c.created_at,c.id),'[]'::jsonb)
  into v_campaigns
  from public.campanhas_leis_alunos c left join public.alunos a on a.id=c.aluno_id
  where c.id=any(v_campaign_ids);

  select count(*) into v_answers_count from public.campanhas_leis_respostas r where r.campanha_id=any(v_campaign_ids);
  select count(*) into v_progress_count from public.progresso_leis_alunos p where p.campanha_ativa_id=any(v_campaign_ids);

  if p_structure_id is not null then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'titulo',a.titulo,'structure_id',a.structure_id) order by a.id),'[]'::jsonb)
      into v_audios from public.legiscast_audios a where a.lei_id=p_lei_id and a.structure_id=any(v_structure_ids);
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',j.id,'titulo',j.titulo,'status',j.status,'structure_id',j.structure_id) order by j.id),'[]'::jsonb)
      into v_jobs from public.legiscast_audio_jobs j where j.lei_id=p_lei_id and j.structure_id=any(v_structure_ids);
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'nome',r.nome,'structure_id',link.structure_id) order by r.id),'[]'::jsonb)
      into v_recortes
      from public.recortes_leis_estrutura link join public.recortes_leis r on r.id=link.recorte_id and r.lei_id=link.lei_id
      where link.lei_id=p_lei_id and link.structure_id=any(v_structure_ids);
    select coalesce(pg_catalog.jsonb_agg(item order by item->>'kind',item->>'id'),'[]'::jsonb)
      into v_cross_law
      from (
        select pg_catalog.jsonb_build_object('kind','estrutura','id',s.id,'lei_id',s.lei_id,'parent_id',s.parent_id) as item
          from public.law_structure s where s.parent_id=any(v_structure_ids) and s.lei_id<>p_lei_id
        union all
        select pg_catalog.jsonb_build_object('kind','questao','id',q.id,'lei_id',q.lei_id,'structure_id',q.structure_id)
          from public.questions q where q.structure_id=any(v_structure_ids) and q.lei_id<>p_lei_id
        union all
        select pg_catalog.jsonb_build_object('kind','audio','id',a.id,'lei_id',a.lei_id,'structure_id',a.structure_id)
          from public.legiscast_audios a where a.structure_id=any(v_structure_ids) and a.lei_id<>p_lei_id
        union all
        select pg_catalog.jsonb_build_object('kind','job','id',j.id,'lei_id',j.lei_id,'structure_id',j.structure_id)
          from public.legiscast_audio_jobs j where j.structure_id=any(v_structure_ids) and j.lei_id<>p_lei_id
        union all
        select pg_catalog.jsonb_build_object('kind','recorte','id',link.recorte_id,'lei_id',link.lei_id,'structure_id',link.structure_id)
          from public.recortes_leis_estrutura link where link.structure_id=any(v_structure_ids) and link.lei_id<>p_lei_id
      ) cross_law;
  end if;

  v_summary:=pg_catalog.jsonb_build_object(
    'target',case when p_question_id is not null then 'question' else 'structure' end,
    'question_id',p_question_id,
    'structure_id',p_structure_id,
    'questions_count',coalesce(pg_catalog.array_length(v_question_ids,1),0),
    'structures_count',coalesce(pg_catalog.array_length(v_structure_ids,1),0),
    'substructures_count',greatest(coalesce(pg_catalog.array_length(v_structure_ids,1),0)-1,0),
    'campaigns',v_campaigns,
    'campaigns_count',coalesce(pg_catalog.array_length(v_campaign_ids,1),0),
    'answers_count',v_answers_count,
    'progresses_count',v_progress_count,
    'requires_confirmation',v_has_other_student,
    'dependencies',pg_catalog.jsonb_build_object('audios',v_audios,'jobs',v_jobs,'recortes',v_recortes,'cross_law',v_cross_law),
    'dependencies_count',pg_catalog.jsonb_array_length(v_audios)+pg_catalog.jsonb_array_length(v_jobs)+pg_catalog.jsonb_array_length(v_recortes)+pg_catalog.jsonb_array_length(v_cross_law)
  );

  if not p_execute then return v_summary; end if;
  if pg_catalog.jsonb_array_length(v_cross_law)>0 then
    raise exception 'Existem vinculos de outra lei apontando para esta estrutura. Corrija os vinculos cruzados antes de excluir.' using errcode='23503';
  end if;
  if pg_catalog.jsonb_array_length(v_audios)+pg_catalog.jsonb_array_length(v_jobs)+pg_catalog.jsonb_array_length(v_recortes)>0 then
    raise exception 'Existem audios, jobs ou recortes vinculados. Mova ou desvincule essas dependencias antes de excluir.' using errcode='23503';
  end if;
  if v_has_other_student and p_confirmation is distinct from 'EXCLUIR' then
    raise exception 'Digite EXCLUIR para confirmar a remocao de campanhas de outros alunos.' using errcode='22023';
  end if;

  update public.progresso_leis_alunos
    set campanha_ativa_id=null,status_campanha='nao_iniciada',updated_at=pg_catalog.now()
    where campanha_ativa_id=any(v_campaign_ids);
  delete from public.campanhas_leis_alunos where id=any(v_campaign_ids);
  delete from public.questions where lei_id=p_lei_id and id=any(v_question_ids);
  if p_structure_id is not null then
    delete from public.law_structure where lei_id=p_lei_id and id=any(v_structure_ids);
  end if;

  return v_summary||pg_catalog.jsonb_build_object('deleted',true);
end
$function$;

revoke all on function public.admin_delete_law_content(bigint,uuid,bigint,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_delete_law_content(bigint,uuid,bigint,uuid,text,boolean) to service_role;

comment on function public.admin_delete_law_content(bigint,uuid,bigint,uuid,text,boolean)
is 'Previsualiza ou executa exclusao administrativa definitiva de questao/estrutura e campanhas afetadas em uma unica transacao.';

commit;
