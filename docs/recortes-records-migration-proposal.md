# Proposta de migration: contexto de recorte no Records

Não aplicar automaticamente. A RPC `obter_detalhes_records_produto` já lê `produto_leis.recorte_id`, mas não o devolve ao servidor Next.js. Por isso o botão **Estudar** não consegue distinguir a lei completa do recorte do concurso.

Proposta: acrescentar `recorte_id: lp.recorte_id` em cada objeto do array JSON `laws` nas duas definições existentes da RPC. Nenhuma tabela, compra, liberação, questão, campanha ou score é alterado.

O servidor passará esse identificador ao resolvedor de contextos. Se o recorte estiver `ativa`, o Records abre esse recorte; se estiver `em_breve`, exibe indisponibilidade; se não houver recorte no vínculo, abre a lei completa. A autorização final continua no servidor, em `authorizeLawQuestionScope`.

Antes de aplicar:

1. gerar a migration pelo Supabase CLI;
2. executar em banco local/branch descartável;
3. conferir Records com lei avulsa, combo, recorte pronto, recorte em breve e ausência de produto avulso;
4. revisar RLS/advisors. A RPC já é `SECURITY DEFINER` e deve continuar revogada para papéis públicos, como está hoje.
