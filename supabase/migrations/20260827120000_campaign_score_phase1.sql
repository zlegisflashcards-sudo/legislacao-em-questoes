begin;

-- V1 preserva o histórico percentual; V2 é a regra +5/-1.
alter table public.campanhas_leis_alunos
  add column if not exists score_version smallint not null default 1 check (score_version in (1,2)),
  add column if not exists score_competitivo_acertos integer check (score_competitivo_acertos >= 0),
  add column if not exists score_competitivo_erros integer check (score_competitivo_erros >= 0),
  add column if not exists score_competitivo_iniciado_em timestamptz,
  add column if not exists score_competitivo_atualizado_em timestamptz;
alter table public.campanhas_leis_alunos drop constraint if exists campanhas_leis_alunos_conclusao_check, drop constraint if exists campanhas_leis_alunos_score_check;
alter table public.campanhas_leis_alunos
  add constraint campanhas_leis_alunos_score_check check(score is null or score >= 0),
  add constraint campanhas_leis_alunos_conclusao_check check((not concluida and concluida_em is null) or (concluida and concluida_em is not null and score is not null)),
  add constraint campanhas_leis_alunos_score_v2_check check(score_version=1 or (score is not null and score_competitivo_acertos is not null and score_competitivo_erros is not null and score_competitivo_iniciado_em is not null and score_competitivo_atualizado_em is not null));

-- Transição idempotente. Não toca campanhas_leis_niveis nem progresso_leis_alunos.
update public.campanhas_leis_alunos set score_version=2, score=0, score_competitivo_acertos=0, score_competitivo_erros=0, score_competitivo_iniciado_em=now(), score_competitivo_atualizado_em=now()
where score_version=1 and not concluida;

create index if not exists campanhas_leis_alunos_ranking_score_v2_idx on public.campanhas_leis_alunos (lei_id,aluno_id,(coalesce(score_ajustado,score)) desc,score_competitivo_atualizado_em asc,id asc) where score_version=2;

create or replace function public.registrar_resposta_campanha(p_campanha_id uuid,p_nivel_id bigint,p_questao_id text,p_correta boolean,p_proxima_posicao integer,p_proximas_pendencias jsonb,p_total_erros_nivel integer,p_conclui_nivel boolean)
returns table(score_competitivo_acertos integer,score_competitivo_erros integer,score integer)
language plpgsql security definer set search_path=public as $$
declare v_nivel public.campanhas_leis_niveis; v_esperada text;
begin
 select * into v_nivel from public.campanhas_leis_niveis where id=p_nivel_id and campanha_id=p_campanha_id and not concluido for update;
 if not found then raise exception using errcode='P0001',message='Nível atual foi atualizado.'; end if;
 perform 1 from public.campanhas_leis_alunos where id=p_campanha_id and score_version=2 and not concluida for update;
 if not found then raise exception using errcode='P0001',message='Campanha não está apta para score competitivo.'; end if;
 v_esperada:=case when v_nivel.proxima_posicao<jsonb_array_length(v_nivel.questoes_ids) then v_nivel.questoes_ids->>v_nivel.proxima_posicao else v_nivel.pendencias_ids->>0 end;
 if v_esperada is distinct from p_questao_id then raise exception using errcode='P0001',message='Questão atual foi atualizada.'; end if;
 update public.campanhas_leis_niveis set proxima_posicao=p_proxima_posicao,pendencias_ids=p_proximas_pendencias,total_erros=p_total_erros_nivel,concluido=p_conclui_nivel where id=p_nivel_id;
 update public.campanhas_leis_alunos set score_competitivo_acertos=score_competitivo_acertos+case when p_correta then 1 else 0 end,score_competitivo_erros=score_competitivo_erros+case when p_correta then 0 else 1 end,score=greatest(0,(score_competitivo_acertos+case when p_correta then 1 else 0 end)*5-(score_competitivo_erros+case when p_correta then 0 else 1 end)),score_competitivo_atualizado_em=case when score is distinct from greatest(0,(score_competitivo_acertos+case when p_correta then 1 else 0 end)*5-(score_competitivo_erros+case when p_correta then 0 else 1 end)) then now() else score_competitivo_atualizado_em end where id=p_campanha_id returning campanhas_leis_alunos.score_competitivo_acertos,campanhas_leis_alunos.score_competitivo_erros,campanhas_leis_alunos.score into score_competitivo_acertos,score_competitivo_erros,score;
 return next;
end;$$;

create or replace function public.obter_resultado_campanha_lei(p_aluno_id uuid,p_lei_id bigint)
returns table(score_atual integer,melhor_score integer,melhor_score_em timestamptz,posicao bigint,participantes bigint)
language sql security definer set search_path=public as $$
with melhores as(select aluno_id,max(coalesce(score_ajustado,score)) melhor_score from campanhas_leis_alunos where lei_id=p_lei_id and score_version=2 group by aluno_id), classificados as(select m.aluno_id,m.melhor_score,min(c.score_competitivo_atualizado_em) filter(where coalesce(c.score_ajustado,c.score)=m.melhor_score) melhor_score_em from melhores m join campanhas_leis_alunos c on c.aluno_id=m.aluno_id and c.lei_id=p_lei_id and c.score_version=2 group by m.aluno_id,m.melhor_score), ordenados as(select *,row_number() over(order by melhor_score desc,melhor_score_em asc nulls last,aluno_id asc) posicao,count(*) over() participantes from classificados) select coalesce(c.score_ajustado,c.score),o.melhor_score,o.melhor_score_em,o.posicao,o.participantes from campanhas_leis_alunos c join ordenados o on o.aluno_id=c.aluno_id where c.aluno_id=p_aluno_id and c.lei_id=p_lei_id and c.score_version=2 order by c.score_competitivo_atualizado_em desc nulls last limit 1;
$$;

create or replace function public.auditar_transicao_score_v2() returns table(legadas_concluidas bigint,migradas_em_andamento bigint,progresso_alterado bigint) language sql security definer set search_path=public as $$ select count(*) filter(where score_version=1 and concluida),count(*) filter(where score_version=2 and not concluida),0::bigint from campanhas_leis_alunos; $$;
revoke all on function public.registrar_resposta_campanha(uuid,bigint,text,boolean,integer,jsonb,integer,boolean),public.obter_resultado_campanha_lei(uuid,bigint),public.auditar_transicao_score_v2() from public,anon,authenticated;
grant execute on function public.registrar_resposta_campanha(uuid,bigint,text,boolean,integer,jsonb,integer,boolean),public.obter_resultado_campanha_lei(uuid,bigint),public.auditar_transicao_score_v2() to service_role;
commit;
