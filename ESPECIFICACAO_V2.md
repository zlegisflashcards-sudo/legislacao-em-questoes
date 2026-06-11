# Legis Flashcards V2

Criar a V2 do Legis Flashcards como uma camada nova, sem alterar a V1.

## Regra principal

A V1 ja esta pronta e funcionando.

Nao alterar, migrar, refatorar ou substituir o catalogo publico atual.

A V1 continua lendo as legislacoes da planilha/Excel.

Nao alterar `/legislacao/[slug]` nem a logica atual da planilha.

Ao final, a V1 deve continuar funcionando exatamente como antes.

## Escopo da V2

A V2 deve usar Supabase e criar apenas:

- Area do Aluno;
- login/cadastro;
- perfil;
- produtos adquiridos;
- historico de compras;
- pontos;
- niveis de fidelidade;
- cupons;
- notificacoes;
- atualizacoes;
- painel administrativo.

A Hotmart continua responsavel por pagamento e entrega do conteudo.

A V2 apenas registra compras, relacionamento, pontos e beneficios.

## Produtos internos da V2

Criar produtos internos da V2 no Supabase com:

- `id`
- `nome`
- `tipo`
- `hotmart_product_id`
- `slug_opcional`
- `ativo`
- `criado_em`
- `atualizado_em`

O identificador principal para conciliar compras deve ser o `hotmart_product_id` recebido da Hotmart.

O `slug_opcional` nao deve criar dependencia com a V1.

## Tabelas

Criar as seguintes tabelas:

- `alunos`
- `produtos`
- `compras`
- `aluno_produtos`
- `movimentacoes_pontos`
- `niveis_fidelidade`
- `cupons`
- `beneficios`
- `produto_atualizacoes`
- `notificacoes_aluno`
- `hotmart_eventos`
- `importacoes_clientes`

## Rotas

Criar as seguintes rotas:

- `/login`
- `/cadastro`
- `/recuperar-senha`
- `/aluno`
- `/aluno/perfil`
- `/aluno/meus-produtos`
- `/aluno/fidelidade`
- `/aluno/cupons`
- `/aluno/atualizacoes`
- `/aluno/notificacoes`
- `/admin`
- `/admin/alunos`
- `/admin/compras`
- `/admin/produtos`
- `/admin/atualizacoes`
- `/admin/fidelidade`
- `/admin/cupons`
- `/admin/importacoes`

## Regras

- Compra aprovada gera produto ativo para o aluno.
- Reembolso, cancelamento ou chargeback remove acesso ativo, mas mantem historico.
- Pontos devem vir de movimentacoes, nao apenas saldo final.
- Eventos Hotmart devem ser idempotentes.
- Atualizacoes de produto geram notificacoes so para alunos que possuem o produto.
- Notificacoes sao independentes das atualizacoes.
- Cupons personalizados prevalecem sobre cupons por nivel.

## Fases

1. Supabase Auth, tabela `alunos` e Area do Aluno basica.
2. Produtos, compras, webhook Hotmart e biblioteca.
3. Pontos, niveis e cupons.
4. Atualizacoes e notificacoes.
5. Painel administrativo.

## Criterio essencial

Ao final, a V1 deve continuar funcionando exatamente como antes.
