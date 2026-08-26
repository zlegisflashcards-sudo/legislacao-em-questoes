-- Execute manually in Supabase SQL Editor. All fixtures are reverted.
BEGIN;
CREATE TEMP TABLE audit_results (etapa text, teste text, resultado text, detalhe text) ON COMMIT DROP;
GRANT ALL ON audit_results TO authenticated;
DO $test$
DECLARE
  v_user_a uuid; v_user_b uuid; v_student_a uuid; v_student_b uuid; v_law_id bigint;
  v_notice_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; v_notice_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_count integer; v_result text;
BEGIN
  SELECT a.user_id,a.id INTO v_user_a,v_student_a FROM public.alunos AS a WHERE a.user_id IS NOT NULL ORDER BY a.id LIMIT 1;
  SELECT b.user_id,b.id INTO v_user_b,v_student_b FROM public.alunos AS b WHERE b.user_id IS NOT NULL AND b.user_id<>v_user_a ORDER BY b.id LIMIT 1;
  IF v_user_a IS NULL OR v_user_b IS NULL THEN RAISE EXCEPTION 'Two authenticated student identities are required'; END IF;
  INSERT INTO public.leis(slug,titulo,descricao,ativo,ordem) VALUES('audit-notice-rls-20260826','Lei fictícia RLS','Fixture transacional RLS',true,999998) RETURNING id INTO v_law_id;
  INSERT INTO public.law_update_notices(id,law_id,title,message,status,published_at) VALUES (v_notice_a,v_law_id,'Aviso A','Entrega temporária A','published',now()),(v_notice_b,v_law_id,'Aviso B','Entrega temporária B','published',now());
  INSERT INTO public.law_update_notice_deliveries(notice_id,student_id) VALUES(v_notice_a,v_student_a),(v_notice_b,v_student_b);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_user_a::text,'role','authenticated')::text,true);
  v_result:=CASE WHEN auth.uid()=v_user_a THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','auth_uid_A',v_result,auth.uid()::text);
  SELECT count(*) INTO v_count FROM public.law_update_notice_deliveries AS d;
  v_result:=CASE WHEN v_count=1 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_le_propria_entrega',v_result,'linhas visíveis='||v_count);
  SELECT count(*) INTO v_count FROM public.law_update_notice_deliveries AS d WHERE d.student_id=v_student_b;
  v_result:=CASE WHEN v_count=0 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_le_B',v_result,'linhas B visíveis='||v_count);
  SELECT count(*) INTO v_count FROM public.law_update_notices AS n;
  v_result:=CASE WHEN v_count=1 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_le_aviso_associado',v_result,'avisos visíveis='||v_count);
  UPDATE public.law_update_notice_deliveries AS d SET read_at=now() WHERE d.notice_id=v_notice_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result:=CASE WHEN v_count=1 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_atualiza_proprio_read_at',v_result,'linhas='||v_count);
  UPDATE public.law_update_notice_deliveries AS d SET read_at=now() WHERE d.notice_id=v_notice_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_result:=CASE WHEN v_count=0 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_atualiza_B',v_result,'linhas='||v_count);
  BEGIN
    INSERT INTO public.law_update_notices(law_id,title,message) VALUES(v_law_id,'Bloqueado','Bloqueado');
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_cria_aviso','FAIL','INSERT permitida');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_cria_aviso','PASS','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_cria_aviso','FAIL','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  END;
  BEGIN
    UPDATE public.law_update_notices AS n SET title='Bloqueado' WHERE n.id=v_notice_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result:=CASE WHEN v_count=0 THEN 'PASS' ELSE 'FAIL' END;
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_edita_aviso',v_result,'linhas='||v_count);
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_edita_aviso','PASS','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_edita_aviso','FAIL','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  END;
  BEGIN
    PERFORM public.publish_law_update_notice(v_notice_a);
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_publica_aviso','FAIL','RPC permitida');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_publica_aviso','PASS','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  WHEN OTHERS THEN
    INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','A_nao_publica_aviso','FAIL','SQLSTATE='||SQLSTATE||'; '||SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_user_b::text,'role','authenticated')::text,true);
  v_result:=CASE WHEN auth.uid()=v_user_b THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','auth_uid_B',v_result,auth.uid()::text);
  SELECT count(*) INTO v_count FROM public.law_update_notice_deliveries AS d;
  v_result:=CASE WHEN v_count=1 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','B_le_propria_entrega',v_result,'linhas visíveis='||v_count);
  SELECT count(*) INTO v_count FROM public.law_update_notice_deliveries AS d WHERE d.student_id=v_student_a;
  v_result:=CASE WHEN v_count=0 THEN 'PASS' ELSE 'FAIL' END;
  INSERT INTO audit_results(etapa,teste,resultado,detalhe) VALUES('rls','B_nao_le_A',v_result,'linhas A visíveis='||v_count);
END $test$;
SELECT * FROM audit_results ORDER BY etapa,teste;
ROLLBACK;
