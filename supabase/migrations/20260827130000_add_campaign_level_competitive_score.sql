begin;

-- Janela competitiva independente da métrica pedagógica total_erros.
alter table public.campanhas_leis_niveis
  add column if not exists score_competitivo_acertos integer not null default 0 check (score_competitivo_acertos >= 0),
  add column if not exists score_competitivo_erros integer not null default 0 check (score_competitivo_erros >= 0);

create or replace function public.registrar_resposta_campanha(
  p_campanha_id uuid,
  p_nivel_id bigint,
  p_questao_id text,
  p_correta boolean,
  p_proxima_posicao integer,
  p_proximas_pendencias jsonb,
  p_total_erros_nivel integer,
  p_conclui_nivel boolean
)
returns table(score_competitivo_acertos integer,score_competitivo_erros integer,score integer)
language plpgsql security definer set search_path=public as $$
declare
  v_nivel public.campanhas_leis_niveis;
  v_esperada text;
begin
  select * into v_nivel
  from public.campanhas_leis_niveis as n
  where n.id=p_nivel_id and n.campanha_id=p_campanha_id and not n.concluido
  for update;
  if not found then raise exception using errcode='P0001',message='Nível atual foi atualizado.'; end if;

  perform 1
  from public.campanhas_leis_alunos as c
  where c.id=p_campanha_id and c.score_version=2 and not c.concluida
  for update;
  if not found then raise exception using errcode='P0001',message='Campanha não está apta para score competitivo.'; end if;

  v_esperada:=case when v_nivel.proxima_posicao<jsonb_array_length(v_nivel.questoes_ids) then v_nivel.questoes_ids->>v_nivel.proxima_posicao else v_nivel.pendencias_ids->>0 end;
  if v_esperada is distinct from p_questao_id then raise exception using errcode='P0001',message='Questão atual foi atualizada.'; end if;

  update public.campanhas_leis_niveis as n
  set proxima_posicao=p_proxima_posicao,
      pendencias_ids=p_proximas_pendencias,
      total_erros=p_total_erros_nivel,
      score_competitivo_acertos=n.score_competitivo_acertos+case when p_correta then 1 else 0 end,
      score_competitivo_erros=n.score_competitivo_erros+case when p_correta then 0 else 1 end,
      concluido=p_conclui_nivel
  where n.id=p_nivel_id;

  update public.campanhas_leis_alunos as c
  set score_competitivo_acertos=c.score_competitivo_acertos+case when p_correta then 1 else 0 end,
      score_competitivo_erros=c.score_competitivo_erros+case when p_correta then 0 else 1 end,
      score=greatest(0,(c.score_competitivo_acertos+case when p_correta then 1 else 0 end)*5-(c.score_competitivo_erros+case when p_correta then 0 else 1 end)),
      score_competitivo_atualizado_em=case when c.score is distinct from greatest(0,(c.score_competitivo_acertos+case when p_correta then 1 else 0 end)*5-(c.score_competitivo_erros+case when p_correta then 0 else 1 end)) then now() else c.score_competitivo_atualizado_em end
  where c.id=p_campanha_id
  returning c.score_competitivo_acertos,c.score_competitivo_erros,c.score
  into score_competitivo_acertos,score_competitivo_erros,score;

  return next;
end;$$;

commit;
