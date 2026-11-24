-- Execute somente em PostgreSQL descartável após a migration do LegisDot.
-- O arquivo é transacional e reverte seus dados de teste.
begin;

do $$
begin
  if has_table_privilege('anon','public.legisdot_messages','SELECT')
    or has_table_privilege('authenticated','public.legisdot_conversations','UPDATE')
    or has_function_privilege('anon','public.legisdot_claim_message(text)','EXECUTE')
    or has_function_privilege('authenticated','public.legisdot_receive_message(text,text,text,text,text,timestamptz,text,text,text,text,text)','EXECUTE') then
    raise exception 'Exposição pública indevida';
  end if;
  if (select count(*) from pg_class where relname in ('legisdot_messages','legisdot_conversations','legisdot_status_events') and relrowsecurity)<>3 then
    raise exception 'RLS ausente';
  end if;
end $$;

do $$
declare j public.legisdot_messages; c uuid; count_before integer; result text;
begin
  -- Deduplicação e timestamp original, inclusive quando há retry antigo.
  if not public.legisdot_receive_message('9001','test-1','phone','5511990000001','Teste',now()-interval '1 hour','text','Quero CTB','live') then raise exception 'Não inseriu'; end if;
  if public.legisdot_receive_message('9001','test-1','phone','5511990000001','Teste',now()-interval '1 hour','text','Quero CTB','live') then raise exception 'Duplicou'; end if;
  select id into c from public.legisdot_conversations where phone_number_id='9001';
  if (select count(*) from public.legisdot_messages where conversation_id=c)<>1 then raise exception 'Inbox duplicada'; end if;
  perform public.legisdot_receive_message('9001','test-old','phone','5511990000001','Teste',now()-interval '2 days','text','Oi','live');
  if (select last_inbound_at from public.legisdot_conversations where id=c)<>now()-interval '1 hour' then raise exception 'Retry reabriu janela'; end if;
  select * into j from public.legisdot_claim_message('9001');
  if j.provider_message_id<>'test-1' then raise exception 'Reivindicou retry antigo'; end if;
  select count(*) into count_before from public.legisdot_claim_message('9001');
  if count_before<>0 then raise exception 'Conversa processada em paralelo'; end if;
  if not public.legisdot_save_reply(j.id,j.claim_token,'Resposta','compra','rules','[]',false,false) then raise exception 'Falha ao salvar'; end if;
  if public.legisdot_prepare_send(j.id,j.claim_token,100)<>'send' then raise exception 'Envio válido negado'; end if;
  -- HTTP incerto pode ser reconciliado pelo callback sem WAMID no retorno inicial.
  update public.legisdot_messages set lease_until=now()-interval '1 minute' where id=j.id;
  perform public.legisdot_claim_message('9001');
  if (select state from public.legisdot_messages where id=j.id)<>'uncertain' then raise exception 'Reenviaria POST incerto'; end if;
  perform public.legisdot_record_status('9001','wamid-test',j.id,'read',now());
  perform public.legisdot_record_status('9001','wamid-test',j.id,'sent',now());
  perform public.legisdot_record_status('9001','wamid-test',j.id,'read',now());
  if (select delivery_status from public.legisdot_messages where id=j.id)<>'read' then raise exception 'Status regrediu'; end if;
  if (select state from public.legisdot_messages where id=j.id)<>'accepted' then raise exception 'Não reconciliou envio'; end if;
  if (select count(*) from public.legisdot_status_events where phone_number_id='9001')<>2 then raise exception 'Status duplicado'; end if;
end $$;

do $$
declare j public.legisdot_messages; newer public.legisdot_messages; c uuid;
begin
  -- Pedido atrasado de interrupção prevalece, sem reabrir janela.
  perform public.legisdot_receive_message('9002','normal','phone','5511990000002','Teste',now(),'text','Quero CTB','live');
  select * into j from public.legisdot_claim_message('9002');
  perform public.legisdot_save_reply(j.id,j.claim_token,'Resposta','catalogo','rules','[]',false,false);
  perform public.legisdot_receive_message('9002','stop-old','phone','5511990000002','Teste',now()-interval '1 second','text','pare','live','opt_out');
  if (select status from public.legisdot_conversations where id=j.conversation_id)<>'opted_out' then raise exception 'Opt-out atrasado perdido'; end if;
  if public.legisdot_prepare_send(j.id,j.claim_token,100)<>'opted_out' then raise exception 'Enviaria após opt-out'; end if;

  -- Resposta superada não assume atendimento nem bloqueia a mensagem nova.
  perform public.legisdot_receive_message('9003','old','phone','5511990000003','Teste',now()-interval '1 second','text','Dúvida','live');
  select * into j from public.legisdot_claim_message('9003');
  perform public.legisdot_receive_message('9003','new','phone','5511990000003','Teste',now(),'text','Quero CTB','live');
  perform public.legisdot_save_reply(j.id,j.claim_token,'Vou chamar equipe','humano','rules','[]',true,false);
  if public.legisdot_prepare_send(j.id,j.claim_token,100)<>'superseded' then raise exception 'Enviaria resposta superada'; end if;
  if (select status from public.legisdot_conversations where id=j.conversation_id)<>'bot' then raise exception 'Handoff superado pausou conversa'; end if;
  select * into newer from public.legisdot_claim_message('9003');
  if newer.provider_message_id<>'new' then raise exception 'Nova mensagem perdida'; end if;
end $$;

do $$
declare j public.legisdot_messages;
begin
  -- Fechamento de janela é revalidado no banco.
  perform public.legisdot_receive_message('9004','expired','phone','5511990000004','Teste',now()-interval '25 hours','text','Oi','live');
  select * into j from public.legisdot_claim_message('9004');
  perform public.legisdot_save_reply(j.id,j.claim_token,'Resposta','qualificacao','rules','[]',false,false);
  if public.legisdot_prepare_send(j.id,j.claim_token,100)<>'window_closed' then raise exception 'Enviaria fora da janela'; end if;

  -- Rascunho nunca é enviado ou transforma o controle do atendimento.
  perform public.legisdot_receive_message('9005','draft','bsuid','BR.TEST.USER','Teste',now(),'text','Oi','shadow');
  select * into j from public.legisdot_claim_message('9005');
  perform public.legisdot_save_reply(j.id,j.claim_token,'Resposta','humano','rules','[]',true,false);
  if (select state from public.legisdot_messages where id=j.id)<>'draft' then raise exception 'Sem rascunho'; end if;
  if (select status from public.legisdot_conversations where id=j.conversation_id)<>'bot' then raise exception 'Rascunho assumiu conversa'; end if;
  if public.legisdot_prepare_send(j.id,j.claim_token,100)='send' then raise exception 'Rascunho enviável'; end if;

  -- Pausa administrativa impede um envio já preparado pela IA.
  perform public.legisdot_receive_message('9006','paused','phone','5511990000006','Teste',now(),'text','Oi','live');
  select * into j from public.legisdot_claim_message('9006');
  perform public.legisdot_save_reply(j.id,j.claim_token,'Resposta','catalogo','rules','[]',false,false);
  update public.legisdot_conversations set status='human',paused_by_admin=true where id=j.conversation_id;
  if public.legisdot_prepare_send(j.id,j.claim_token,100)<>'paused' then raise exception 'Pausa ignorada'; end if;

  -- Uma configuração de outro número não reivindica dados deste número.
  perform public.legisdot_receive_message('9007','account','phone','5511990000007','Teste',now(),'text','Oi','live');
  if exists(select 1 from public.legisdot_claim_message('9999')) then raise exception 'Conta cruzada'; end if;

  -- Falha pré-envio tem retry com espera, token antigo não pode salvar.
  select * into j from public.legisdot_claim_message('9007');
  update public.legisdot_messages set state='pending',retry_after=now()+interval '1 minute' where id=j.id;
  if exists(select 1 from public.legisdot_claim_message('9007')) then raise exception 'Backoff ignorado'; end if;
  if public.legisdot_save_reply(j.id,gen_random_uuid(),'Resposta','catalogo','rules','[]',false,false) then raise exception 'Lease antigo aceito'; end if;
end $$;

do $$
declare c uuid; count_after integer;
begin
  perform public.legisdot_receive_message('9008','phone-stop','phone','5511990000008','Teste',now()-interval '1 second','text','pare','live','opt_out');
  select id into c from public.legisdot_conversations where phone_number_id='9008';
  perform public.legisdot_receive_message('9008','bsuid-alias','bsuid','BR.SAME.PERSON','Teste',now(),'text','Oi','live',null,'5511990000008');
  if (select status from public.legisdot_conversations where id=c)<>'opted_out' then raise exception 'Alias perdeu opt-out'; end if;
  perform public.legisdot_receive_message('9008','bsuid-only','bsuid','BR.SAME.PERSON','Teste',now(),'text','Oi','live');
  perform public.legisdot_receive_message('9008','phone-only','phone','5511990000008','Teste',now(),'text','Oi','live');
  if (select count(*) from public.legisdot_conversations where phone_number_id='9008')<>1 then raise exception 'Alias dividiu identidade'; end if;

  -- Dois registros prévios são unidos quando a Meta informa os dois identificadores.
  perform public.legisdot_receive_message('9009','phone-pause','phone','5511990000009','Teste',now(),'text','humano','live','human');
  perform public.legisdot_receive_message('9009','bsuid-first','bsuid','BR.MERGE.PERSON','Teste',now(),'text','Oi','live');
  perform public.legisdot_receive_message('9009','merge','bsuid','BR.MERGE.PERSON','Teste',now(),'text','Oi','live',null,'5511990000009');
  if (select count(*) from public.legisdot_conversations where phone_number_id='9009')<>1 then raise exception 'Não reconciliou identidades'; end if;
  if (select status from public.legisdot_conversations where phone_number_id='9009')<>'human' then raise exception 'Merge perdeu pausa'; end if;
  if (select count(*) from public.legisdot_messages where phone_number_id='9009')<>3 then raise exception 'Merge perdeu histórico'; end if;
end $$;

rollback;
