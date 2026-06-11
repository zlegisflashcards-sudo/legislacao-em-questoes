# Legis Flashcards - Direcao Atual

## Decisao de produto

A V1 continuara sendo o produto principal por enquanto.

A implementacao atual da V2, incluindo login, Area do Aluno, alunos, fidelidade, pontos, cupons, produtos internos, compras e telas administrativas temporarias, deve ser considerada apenas uma prova de conceito.

Essa linha de desenvolvimento fica arquivada. Nao continuar a evolucao da V2 atual.

Nao remover o trabalho ja feito na branch `v2-area-aluno`. Apenas parar a evolucao dessa linha.

## Foco atual

Concentrar o desenvolvimento na V1 e em melhorias que aumentem conversao e experiencia de compra.

## Objetivo da V1

- Catalogo publico.
- Paginas das legislacoes.
- Compra avulsa via Hotmart.
- Futura pagina interna de pagamento com widget Hotmart.

## Regras de continuidade

- Nao alterar a leitura atual da planilha/Excel sem necessidade clara para a V1.
- Nao alterar a logica publica das paginas de legislacao sem objetivo direto de melhoria da V1.
- Nao continuar implementando login, fidelidade, pontos, cupons, biblioteca do aluno ou painel administrativo da V2 arquivada.
- Nao implementar novas dependencias da V1 sobre tabelas da prova de conceito da V2.

## Futura V2

A futura V2 sera redesenhada do zero como uma plataforma por assinatura.

Possiveis recursos:

- Meu Vade Mecum.
- Biblioteca do assinante.
- Legiscast.
- Legislacao Esquematizada.
- Legislacao em Questoes.
- Pesquisa avancada.
- Controle de acesso por assinatura.

Esses recursos ainda nao devem ser implementados. Eles precisam de uma nova especificacao antes do desenvolvimento.

## Status da prova de conceito arquivada

O trabalho ja realizado pode permanecer no codigo e na branch como referencia tecnica, mas nao deve orientar as proximas entregas de produto.

Itens da prova de conceito:

- rotas de login/cadastro/recuperacao;
- rota `/aluno`;
- tabela `alunos`;
- tabelas de produtos/compras da Fase 2.1;
- tela temporaria `/admin/produtos`;
- mocks de Clube de Beneficios.

Esses itens nao fazem parte do foco atual da V1.
