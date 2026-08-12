-- Auditoria SOMENTE LEITURA das migrations divergentes.
-- Cole no SQL Editor do projeto remoto. Nao executa DDL/DML nem chama funcoes de negocio.

-- 0. Historico remoto relevante.
select version, inserted_at from supabase_migrations.schema_migrations
where version in ('20260807153000','20260807170000','20260807200000','20260808230000','20260810090000','20260810110000','20260810120000','20260810130000','20260810140000','20260810150000','20260810160000','20260810170000','20260810180000','20260810190000','20260810200000','20260810210000','20260811090000','20260811100000','20260811110000','20260811120000')
order by version;

-- Utilitarios de leitura repetidos: tabelas/colunas, constraints, indices, RLS/policies/grants.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name in
 ('produtos','hotmart_eventos','alunos','compras','alunos_primeiro_acesso_envios','alunos_notificacoes_acesso','alunos_ativacoes_pendentes','admin_notificacoes')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('hotmart_eventos','alunos_primeiro_acesso_envios','alunos_notificacoes_acesso','alunos_ativacoes_pendentes','admin_notificacoes')
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename in ('hotmart_eventos','alunos_primeiro_acesso_envios','alunos_notificacoes_acesso','alunos_ativacoes_pendentes','admin_notificacoes')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('hotmart_eventos','alunos_primeiro_acesso_envios','alunos_notificacoes_acesso','alunos_ativacoes_pendentes','admin_notificacoes')
order by table_name, grantee, privilege_type;

select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace and conrelid = any(array_remove(array[
  to_regclass('public.hotmart_eventos'),to_regclass('public.alunos'),to_regclass('public.compras'),
  to_regclass('public.alunos_primeiro_acesso_envios'),to_regclass('public.alunos_notificacoes_acesso'),
  to_regclass('public.alunos_ativacoes_pendentes'),to_regclass('public.admin_notificacoes')],null))
order by table_name, conname;

select schemaname, tablename, indexname, indexdef from pg_indexes
where schemaname='public' and (indexname in ('produtos_hotmart_product_id_unique_idx','hotmart_eventos_codigo_transacao_idx','hotmart_eventos_recebido_em_idx','alunos_email_normalizado_idx','alunos_ativacoes_pendentes_aluno_pendente_idx','admin_notificacoes_nao_lidas_idx','admin_notificacoes_lista_idx')
or tablename in ('hotmart_eventos','alunos_primeiro_acesso_envios','alunos_notificacoes_acesso','alunos_ativacoes_pendentes','admin_notificacoes'))
order by tablename,indexname;

-- Todas as funcoes das migrations divergentes; compare pg_get_functiondef ao SQL local.
select p.oid::regprocedure as signature, p.prosecdef as security_definer, p.proconfig as config, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('vincular_aluno_para_usuario','criar_aluno_para_usuario','normalizar_email_aluno','proteger_identidade_aluno','obter_ou_criar_aluno_por_email','admin_mesclar_alunos','admin_importar_aquisicao_hotmart_historica','admin_listar_alunos','admin_resumo_exclusao_aluno','admin_excluir_aluno_definitivamente','criar_notificacao_admin_novo_comentario')
order by signature;

select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and t.tgname in ('alunos_proteger_identidade_email','criar_notificacao_admin_novo_comentario')
order by table_name,t.tgname;

-- 20260807153000_add_unique_hotmart_product_id.sql: precondicao de dados do indice UNIQUE.
select hotmart_product_id,count(*) as quantidade
from public.produtos where hotmart_product_id is not null
group by hotmart_product_id having count(*)>1 order by quantidade desc,hotmart_product_id;

-- 20260807170000_create_hotmart_eventos.sql: tabela, PK/FKs, indices, RLS e grants aparecem nos blocos gerais.
select to_regclass('public.hotmart_eventos') as hotmart_eventos_exists;

-- 20260807200000_link_existing_students_on_auth.sql: somente definicoes das funcoes acima.
-- Diagnostico nao invasivo de vinculos inconsistentes: e-mails repetidos e IDs Auth repetidos.
select lower(btrim(email)) as email_normalizado,count(*) from public.alunos
where email is not null group by lower(btrim(email)) having count(*)>1 order by count(*) desc,email_normalizado;
select user_id,count(*) from public.alunos where user_id is not null group by user_id having count(*)>1;

-- 20260808230000_enforce_student_email_identity.sql: funcao, trigger e indice acima; duplicidades abaixo.
select lower(btrim(email)) as email_normalizado,count(*)
from public.alunos where email is not null
group by lower(btrim(email)) having count(*)>1 order by count(*) desc,email_normalizado;

-- 20260810090000 / 20260810120000: admin_mesclar_alunos. Nunca execute a funcao; definicao acima.
-- 20260810110000: normalizar_email_aluno. Definicao acima.

-- 20260810130000_add_student_provisional_password_flag.sql.
select column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name='alunos' and column_name='deve_trocar_senha';

-- 20260810140000_add_student_first_access_delivery.sql.
select to_regclass('public.alunos_primeiro_acesso_envios') as alunos_primeiro_acesso_envios_exists;

-- 20260810150000_make_historical_hotmart_import_atomic.sql: apenas definicao acima.
-- 20260810160000_add_admin_student_list.sql: objeto atual pode ter sido sobrescrito por 20260811120000; definicao acima.

-- 20260810170000/20260810180000: FK compras.aluno_id e funcoes de exclusao; nao execute as funcoes.
select a.attname as column_name,a.attnotnull as not_null,pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.compras') and a.attname='aluno_id' and a.attnum>0 and not a.attisdropped;
select conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid=to_regclass('public.compras') and conname='compras_aluno_id_fkey';

-- 20260810190000: vincular_aluno_para_usuario/criar_aluno_para_usuario, definicoes acima.

-- 20260810200000_add_student_access_notifications.sql.
select to_regclass('public.alunos_notificacoes_acesso') as alunos_notificacoes_acesso_exists;

-- 20260810210000_add_student_account_activation_tokens.sql.
select to_regclass('public.alunos_ativacoes_pendentes') as alunos_ativacoes_pendentes_exists;

-- 20260811090000_create_admin_notifications.sql: tabela, constraints, indices, RLS/grants, funcao e trigger acima.
select to_regclass('public.admin_notificacoes') as admin_notificacoes_exists;
