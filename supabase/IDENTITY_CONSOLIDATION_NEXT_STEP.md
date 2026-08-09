# Próxima etapa: consolidar duplicidades históricas de alunos

Esta etapa não altera nem remove alunos existentes. Antes da unicidade física definitiva, escolha para cada e-mail normalizado um UUID canônico e mova, numa transação auditada, compras, liberações, progresso e todas as demais referências para ele.

Depois de não haver grupos duplicados, execute:

```sql
create unique index alunos_email_normalizado_unique_idx
  on public.alunos (public.normalizar_email_aluno(email));
```

Até a consolidação, o trigger `alunos_proteger_identidade_email` e as RPCs serializadas por advisory lock bloqueiam qualquer nova duplicidade, inclusive em concorrência.
