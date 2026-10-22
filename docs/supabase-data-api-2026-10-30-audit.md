# Auditoria Data API do Supabase — 30/10/2026

Data da auditoria: 22/10/2026. Escopo: todas as migrations versionadas em
`supabase/migrations`, os clientes Supabase do aplicativo e os privilégios
declarados no repositório. Não houve conexão com projeto remoto, `db reset`,
aplicação de migration, deploy, commit ou push.

## Resultado

| Objeto / papel | Operações necessárias | Evidência | Situação e correção |
| --- | --- | --- | --- |
| `public.legisbot_comentarios` / `service_role` | `SELECT`, `UPDATE` diretos; inserção pela RPC | A rota ativa de geração constrói `getSupabaseServerClient()` e o repositório faz `SELECT`/`UPDATE`; a inserção ocorre dentro de `reservar_geracao_legisbot`, `SECURITY DEFINER`. | **Problema comprovado para novo reset/preview após 30/10:** não havia grant explícito a `service_role`. A migration aditiva concede somente `SELECT, UPDATE` a esse papel. |
| `public.perfis_publicos`, `public.legisbot_comentarios_comunidade` / alunos | Leitura pública; inserção/alteração autenticada | Cliente e rotas de comunidade; grants explícitos em `20260727150000_create_legisbot_community.sql`. | Coberto. |
| `public.legisbot_comentarios_curtidas`, `public.legisbot_comentarios_denuncias` / autenticado | Operações por aluno previstas em RLS | Grants explícitos e políticas na mesma migration de comunidade. | Coberto. |
| `public.legisbot_destaques_usuario` / autenticado | `SELECT, INSERT, UPDATE, DELETE` próprios | RLS e grant explícitos em `20260817150000_create_legisbot_user_highlights.sql`; rotas criam cliente com token do usuário. | Coberto. |
| Tabelas administrativas e de fluxo interno / `service_role` | CRUD conforme rotas server-side/RPCs | `lib/supabase-server.ts` define `getSupabaseServerClient()` com `SUPABASE_SERVICE_ROLE_KEY`; migrations posteriores revogam `anon`/`authenticated` e concedem verbos específicos a `service_role`. | Coberto no histórico versionado para os objetos criados pelas migrations, sem abrir acesso de aluno. |
| `public.legiscast_audio_dispatch_control` / nenhum cliente Data API | Sem CRUD direto; apenas funções `SECURITY DEFINER` internas | Criada em `20260917100000_allow_safe_legiscast_job_detach_on_structure_deletion.sql`; somente referenciada nas funções do mesmo arquivo. | Sem grant necessário para a API. RLS está ativa. |
| Tabelas anteriores ao primeiro snapshot de migration (por exemplo, `alunos`, `compras`, `produtos`, `atualizacoes_email`) | Depende do uso server-side e do catálogo já aplicado | São acessadas predominantemente pelo cliente com `service_role`; sua criação/privilégios iniciais não estão integralmente no histórico local. | **Lacuna de cobertura:** conferir ACL efetiva no catálogo vivo, sem mudar permissões. |

## Inventário e cruzamento

O histórico contém 143 migrations e cria 80 tabelas `public` (103 objetos
`CREATE TABLE|VIEW|MATERIALIZED VIEW|FUNCTION|SEQUENCE`). Das tabelas com
acesso de aluno direto, as quatro áreas listadas acima têm grants explícitos.
Os
demais objetos novos são administrativos ou consumidos por rotas server-side
que usam `service_role`; suas migrations declaram revogação para papéis
públicos e grants restritos para o papel administrativo quando o acesso direto
é requerido. Não há motivo para conceder `ALL`, nem para disponibilizar tabelas
de CRM, pagamentos, auditoria, revisão editorial ou operações administrativas
a `anon`/`authenticated`.

Foram revisados `CREATE`, `ALTER`, `GRANT` e `REVOKE`, incluindo sequências:
as sequências usadas por inserções administrativas possuem grants explícitos
quando necessários. Não foi encontrado uso de sequência diretamente pelo
cliente aluno. Views relevantes no histórico são administrativas e não são
chamadas pelo cliente público. A nova tabela de controle de dispatch não possui
cliente Data API direto.

Revisão adversarial do LegisBot: `lib/legisbot-comentarios-service.ts` contém
um `.insert()` com cliente anon, mas não possui importador no código rastreado.
Além disso, `20260929120000_track_legisbot_source_revision.sql` remove a
policy de criação e faz `REVOKE INSERT, UPDATE, DELETE` para `anon` e
`authenticated`, declarando que novas solicitações passam exclusivamente pela
API autenticada e RPC do servidor. Portanto, restaurar `INSERT` público seria
regressão de arquitetura e não é necessário para a compatibilidade atual.

As funções/RPCs devem ser analisadas separadamente: novas funções podem manter
`EXECUTE` global de `PUBLIC` por padrão. Isso não é alterado por esta correção,
pois o comunicado trata de privilégios de tabelas e um `REVOKE EXECUTE` amplo
seria mudança de endurecimento com risco de indisponibilidade. As migrations
de RPC sensíveis normalmente já fazem `REVOKE` seguido de `GRANT EXECUTE`
específico; validar assinaturas atuais no catálogo antes de uma ação futura.

## Validação local feita

- `pnpm exec supabase --version` confirmou que a CLI não está instalada neste
  workspace; portanto não foi executado reset nem migration local.
- O teste estático `lib/supabase-public-grants.test.ts` verifica o caminho
  server-side, os dois verbos diretos concedidos ao `service_role` e a ausência
  de concessão a aluno ou de `INSERT`/`DELETE`/`ALL` na correção. Ele não prova
  ACL efetiva, ownership da função, comportamento de reset ou produção.

## Consulta somente leitura recomendada no catálogo vivo

Executar em conexão de auditoria antes de 30/10, sem aplicar alterações:

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select sequence_schema, sequence_name, grantee, privilege_type
from information_schema.role_usage_grants
where sequence_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by sequence_name, grantee, privilege_type;
```

Compare o resultado com as policies RLS e com as assinaturas em
`information_schema.routine_privileges`. Essa consulta resolve a lacuna de
objetos criados antes do histórico local e confirma se grants anteriores foram
alterados manualmente no projeto.
