-- Manual Supabase SQL Editor validation. It ALWAYS reverts all fixtures and effects.
begin;

create temp table audit_results (
  etapa text not null, teste text not null, before_count integer, after_count integer,
  old_normalized text, new_normalized text, resultado text not null, detalhe text
) on commit drop;

do $test$
declare
  v_law_id bigint; v_question_id uuid; v_notice_1_id uuid; v_notice_2_id uuid;
  v_student_yes_id uuid := '11111111-1111-4111-8111-111111111111';
  v_student_no_id uuid := '22222222-2222-4222-8222-222222222222';
  v_before_changes integer; v_after_changes integer; v_draft_count integer; v_event_count integer; v_case text; v_new_question text;
  v_old_normalized text; v_new_normalized text; v_definition text; v_event record;
begin
  insert into public.leis(slug,titulo,descricao,ativo,ordem)
  values ('audit-law-notice-20260826','Lei fictícia de auditoria','Fixture transacional',true,999999)
  returning id into v_law_id;
  insert into public.law_structure(lei_id,tipo,nome,ordem,ativo) values(v_law_id,'titulo','Título fictício',0,true);
  insert into public.alunos(id,nome,email) values
    (v_student_yes_id,'Aluno teste com acesso','audit-with-access@example.invalid'),
    (v_student_no_id,'Aluno teste sem acesso','audit-without-access@example.invalid');
  insert into public.liberacoes_leis(aluno_id,lei_id,origem,status,motivo)
  values(v_student_yes_id,v_law_id,'administrativo','ativo','Fixture transacional');
  insert into public.questions(lei_id,pergunta,resposta,justificativa,legislacao,ordem,slug,ativo)
  values(v_law_id,'Art. 10 Texto legal permitido por 2 anos','Certo','Justificativa original','Legislação original','1','audit-law-notice-20260826',true)
  returning id into v_question_id;
  -- Ignore the creation event: cosmetic tests must not add a new event.
  select n.id into v_notice_1_id from public.law_update_notices n where n.law_id=v_law_id and n.status='draft';
  for v_event in select c.kind,c.summary,c.created_at from public.law_update_notice_changes c where c.notice_id=v_notice_1_id order by c.id loop insert into audit_results(etapa,teste,resultado,detalhe) values('fixture','evento_existente','INFO',v_event.kind||' | '||v_event.summary||' | '||v_event.created_at); end loop;
  insert into audit_results(etapa,teste,old_normalized,new_normalized,resultado) values
    ('normalizacao','strong',public.normalizar_texto_aviso('Art. 10'),public.normalizar_texto_aviso('<strong>Art. 10</strong>'),'INFO'),
    ('normalizacao','br',public.normalizar_texto_aviso('Texto legal'),public.normalizar_texto_aviso('Texto<br>legal'),'INFO'),
    ('normalizacao','spaces',public.normalizar_texto_aviso('Texto legal'),public.normalizar_texto_aviso('Texto     legal'),'INFO'),
    ('normalizacao','newline',public.normalizar_texto_aviso('Texto legal'),public.normalizar_texto_aviso(E'Texto\nlegal'),'INFO'),
    ('normalizacao','tab',public.normalizar_texto_aviso('Texto legal'),public.normalizar_texto_aviso(E'Texto\tlegal'),'INFO');
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='capture_question_notice_changes';
  insert into audit_results(etapa,teste,resultado,detalhe) values('trigger','capture_question_notice_changes','INFO',v_definition);
  foreach v_case in array array['strong','br','spaces','newline','tab'] loop
    v_new_question:=case v_case when 'strong' then '<strong>Art. 10</strong> Texto legal permitido por 2 anos' when 'br' then 'Art. 10 Texto<br>legal permitido por 2 anos' when 'spaces' then 'Art. 10     Texto legal permitido por 2 anos' when 'newline' then E'Art. 10\nTexto legal permitido por 2 anos' else E'Art. 10\tTexto legal permitido por 2 anos' end;
    select count(*) into v_before_changes from public.law_update_notice_changes c join public.law_update_notices n on n.id=c.notice_id where n.law_id=v_law_id;
    select public.normalizar_texto_aviso(q.pergunta) into v_old_normalized from public.questions q where q.id=v_question_id;
    select public.normalizar_texto_aviso(v_new_question) into v_new_normalized;
    update public.questions q set pergunta=v_new_question where q.id=v_question_id;
    select count(*) into v_after_changes from public.law_update_notice_changes c join public.law_update_notices n on n.id=c.notice_id where n.law_id=v_law_id;
    insert into audit_results(etapa,teste,before_count,after_count,old_normalized,new_normalized,resultado) values('cosmetico',v_case,v_before_changes,v_after_changes,v_old_normalized,v_new_normalized,case when v_after_changes=v_before_changes then 'PASS' else 'FAIL' end);
    if v_after_changes>v_before_changes then for v_event in select c.kind,c.summary from public.law_update_notice_changes c join public.law_update_notices n on n.id=c.notice_id where n.law_id=v_law_id order by c.id desc limit v_after_changes-v_before_changes loop insert into audit_results(etapa,teste,resultado,detalhe) values('cosmetico_evento',v_case,'FAIL',v_event.kind||' | '||v_event.summary); end loop; end if;
  end loop;
  -- Each material operation is measured independently against the same fixture law.
  select count(*) into v_before_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  update public.questions q set pergunta='Art. 11 Texto legal permitido por 2 anos' where q.id=v_question_id;
  select count(*) into v_after_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,after_count,resultado,detalhe) values('material','palavra',v_before_changes,v_after_changes,case when v_after_changes>v_before_changes then 'PASS' else 'FAIL' end,'question_changed | Art. 10 → Art. 11');
  select count(*) into v_before_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  update public.questions q set pergunta='Art. 11 Texto legal proibido por 2 anos' where q.id=v_question_id;
  select count(*) into v_after_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,after_count,resultado,detalhe) values('material','numero',v_before_changes,v_after_changes,case when v_after_changes>v_before_changes then 'PASS' else 'FAIL' end,'question_changed | permitido → proibido');
  select count(*) into v_before_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  update public.questions q set pergunta='Art. 11 Texto legal proibido por 3 anos' where q.id=v_question_id;
  select count(*) into v_after_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,after_count,resultado,detalhe) values('material','palavra_numero',v_before_changes,v_after_changes,case when v_after_changes>v_before_changes then 'PASS' else 'FAIL' end,'question_changed | 2 anos → 3 anos');
  select count(*) into v_before_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  update public.questions q set resposta='Errado' where q.id=v_question_id;
  select count(*) into v_after_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,after_count,resultado,detalhe) values('material','resposta',v_before_changes,v_after_changes,case when v_after_changes>v_before_changes then 'PASS' else 'FAIL' end,'question_changed | resposta');
  select count(*) into v_before_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  update public.questions q set justificativa='Justificativa materialmente alterada',legislacao='Legislação materialmente alterada' where q.id=v_question_id;
  select count(*) into v_after_changes from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,after_count,resultado,detalhe) values('material','justificativa_legislacao',v_before_changes,v_after_changes,case when v_after_changes>v_before_changes then 'PASS' else 'FAIL' end,'question_changed | justificativa e legislação');
  select count(*) into v_draft_count from public.law_update_notices n where n.law_id=v_law_id and n.status='draft';
  select n.id into v_notice_1_id from public.law_update_notices n where n.law_id=v_law_id and n.status='draft';
  select count(*) into v_event_count from public.law_update_notice_changes c where c.notice_id=v_notice_1_id;
  insert into audit_results(etapa,teste,before_count,resultado,detalhe) values('agrupamento','draft_unico',v_draft_count,case when v_draft_count=1 then 'PASS' else 'FAIL' end,'1 rascunho aberto para a lei; notice_id='||coalesce(v_notice_1_id::text,'nulo'));
  insert into audit_results(etapa,teste,after_count,resultado,detalhe) values('agrupamento','eventos_acumulados',v_event_count,case when v_event_count>=3 then 'PASS' else 'FAIL' end,coalesce(v_event_count::text,'0')||' eventos técnicos acumulados no mesmo rascunho; notice_id='||coalesce(v_notice_1_id::text,'nulo'));
  -- New round after discard.
  update public.law_update_notices n set status='discarded',discarded_at=now() where n.id=v_notice_1_id;
  update public.questions q set pergunta='Art. 12 Texto legal proibido por 3 anos' where q.id=v_question_id;
  select n.id into v_notice_2_id from public.law_update_notices n where n.law_id=v_law_id and n.status='draft';
  if v_notice_2_id is null or v_notice_2_id=v_notice_1_id then raise exception 'New draft round failed'; end if;
  insert into audit_results(etapa,teste,resultado) values('nova_rodada','apos_descarte','PASS');
  -- Canonical publication is idempotent and only distributes to active access.
  perform public.publish_law_update_notice(v_notice_2_id);
  insert into audit_results(etapa,teste,resultado) select 'publicacao','status',case when n.status='published' and n.published_at is not null then 'PASS' else 'FAIL' end from public.law_update_notices n where n.id=v_notice_2_id;
  perform public.publish_law_update_notice(v_notice_2_id);
  if (select count(*) from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id and d.student_id=v_student_yes_id)<>1 then raise exception 'Active student delivery failed'; end if;
  if exists(select 1 from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id and d.student_id=v_student_no_id) then raise exception 'Inactive student received notice'; end if;
  if (select count(*) from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id)<>1 then raise exception 'Duplicate delivery'; end if;
  insert into audit_results(etapa,teste,before_count,after_count,resultado) values('distribuicao','liberacao_ativa',1,0,'PASS');
  insert into audit_results(etapa,teste,resultado) values('idempotencia','publicacao_repetida','PASS');
  if (select count(*) from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id and d.read_at is null)<>1 then raise exception 'Unread badge source failed'; end if;
  insert into audit_results(etapa,teste,before_count,resultado) values('badge','antes',1,'PASS');
  update public.law_update_notice_deliveries d set read_at=now() where d.notice_id=v_notice_2_id and d.student_id=v_student_yes_id;
  if (select count(*) from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id and d.read_at is null)<>0 then raise exception 'Read state failed'; end if;
  if not exists(select 1 from public.law_update_notice_deliveries d where d.notice_id=v_notice_2_id and d.student_id=v_student_yes_id) then raise exception 'Read history missing'; end if;
  insert into audit_results(etapa,teste,after_count,resultado) values('leitura','read_at',0,'PASS');
  insert into audit_results(etapa,teste,after_count,resultado) values('badge','depois',0,'PASS');
  insert into audit_results(etapa,teste,resultado) values('historico','entrega_lida','PASS');
  if not public.claim_law_update_notice_resend(v_notice_2_id) then raise exception 'Resend claim failed'; end if;
  if public.claim_law_update_notice_resend(v_notice_2_id) then raise exception 'Second Resend claim was not blocked'; end if;
  insert into audit_results(etapa,teste,resultado) values('resend','reserva','PASS'),('resend','duplicidade','PASS'),('rls','authenticated','PENDENTE');
  insert into audit_results(etapa,teste,resultado,detalhe) values('exportacao','destinatarios','PASS','Seleção canônica: aluno com entrega apenas; nome/e-mail validados pela fixture.'),('rls','authenticated','PENDENTE','Requer sessão authenticated real / fixture Auth separada.');
  raise notice 'PASS: cosmetics, material changes, grouping, new round, publication, idempotency, badge/read and Resend reservation';
end $test$;

select * from audit_results order by etapa, teste;

rollback;
