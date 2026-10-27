# Atualização segura de APKG por UUID

## Escopo

Este plano refere-se somente à migration `20261027120000_add_safe_apkg_uuid_question_updates.sql`. Ela cria a RPC transacional usada para atualizar questões já existentes por `IDQuestao`; não insere questões novas, não altera estruturas automaticamente e não modifica registros fora do lote confirmado.

## Pré-requisitos antes de aplicar

1. Revisar o diff da migration e confirmar que o projeto/ambiente é o destino pretendido.
2. Executar `supabase/tests/20261027120000_safe_apkg_uuid_updates.test.sql` em PostgreSQL descartável. Nunca use a stack remota como laboratório.
3. Executar `pnpm exec vitest run lib/apkg-question-update.test.ts components/admin/admin-question-anki-tools.test.tsx lib/admin-questoes.test.ts lib/legisbot/source-flow.test.ts` e revisar a prévia local com fixture sintética.
4. Confirmar que a UI publicada contém a prévia por UUID, o diff antes/depois e a confirmação vinculada ao token. A migration isolada não habilita o fluxo sem o código da aplicação correspondente.

## Aplicação controlada

1. Usar o mecanismo de migrations do projeto para registrar e aplicar apenas a migration acima no ambiente explicitamente aprovado.
2. Após a aplicação, verificar a definição da função, `SECURITY DEFINER`, `search_path = ''` e a concessão exclusiva a `service_role`.
3. Fazer uma única prévia administrativa com arquivo sintético. Não confirmar nem importar dados reais como parte da verificação técnica.

## Rollback

O arquivo `supabase/rollbacks/20261027120000_add_safe_apkg_uuid_question_updates.rollback.sql` somente revoga e remove a RPC. Ele preserva questões, UUIDs, vínculos estruturais, comentários e registros de auditoria já existentes. Como consequência, a aplicação volta a responder que a atualização segura APKG está indisponível; inserções normais não são revertidas nem apagadas.

Não execute o rollback enquanto houver confirmação de APKG em andamento. Registre a decisão e preserve a auditoria antes de qualquer operação operacional.
