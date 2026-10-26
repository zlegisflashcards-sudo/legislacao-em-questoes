# Correções de questões por UUID

O arquivo UTF-8 usa `format: "legisflashcards.question-patch"`, `version: 1`, `law_slug`, `source` e `updates`. A proveniência exige `kind: "exported_apkg"`, `sha256` e `exported_question_count`. Cada atualização aceita exclusivamente `uuid`, `expected_before` (assunto e ordem) e `changes` (assunto e/ou ordem). O limite é 2 MiB e 5.000 questões; assunto aceita até 500 caracteres e ordem até 100. Não há normalização dos valores comparados.

A Central de Questões mostra uma prévia sem escrita. A confirmação é assinada no servidor e vinculada ao usuário, lei, conteúdo exato, snapshot e prazo de 15 minutos. Alterar qualquer campo ou versão após a prévia impede a aplicação. Os dados para reconciliar uma resposta perdida são mantidos na sessão do navegador, permitindo consultar a operação após fechar a janela ou recarregar a página, sem reenviar alterações; estão disponíveis apenas na mesma sessão do navegador.

A aplicação está bloqueada por padrão (`QUESTION_UUID_PATCH_APPLY_ENABLED` diferente de `true`). A migration `20261026120000_add_admin_question_uuid_patch.sql` foi exercitada em um PostgreSQL temporário em memória, com esquema mínimo; permanece necessária a revisão e a validação com o esquema completo antes de qualquer autorização para aplicá-la em produção e habilitar o recurso. A função preparada restringe execução a `service_role` e reúne a comparação, atualização, sinalização do LegisBot, auditoria e registro idempotente da operação em uma transação.

Não use importadores Anki com este formato. Não renomeie estruturas nem marque a lei como conferida através deste fluxo. Após aplicação futuramente autorizada, releia os dados e confira o APKG; uma resposta não verificada não é prova de sucesso.
