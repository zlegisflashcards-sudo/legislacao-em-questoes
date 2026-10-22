# Proposta: reparenting transacional de `law_structure`

O endpoint atual revalida a estrutura e faz `UPDATE ... WHERE updated_at = valor_da_previa`. Isso bloqueia uma alteração concorrente no nó movido, mas não serializa duas operações que envolvam nós diferentes. Assim, A→B e B→A podem, em teoria, passar em paralelo e criar um ciclo.

Para garantir a integridade no banco, a publicação deve incluir uma RPC `admin_reparent_law_structure` com `SECURITY DEFINER`, autorização administrativa já usada pelo projeto e uma transação que:

1. bloqueie (`FOR UPDATE`) todos os nós ativos da lei;
2. confira a versão esperada do nó movido;
3. valide existência do destino, mesma lei, ausência de auto-vínculo/ciclo e conflito de `ordem`;
4. atualize somente `parent_id`;
5. grave auditoria na mesma transação.

Essa proposta não foi aplicada como migration nem executada em nenhum banco.
