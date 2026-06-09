# Plano do MVP

## Escopo da V1

O MVP sera um catalogo publico de legislacoes. A manutencao das legislacoes sera feita pelo Google Sheets, e as interacoes simples dos usuarios serao salvas no Supabase.

## Funcionalidades da V1

1. Home com pesquisa em destaque.
2. Home com secoes:
   - Constituicao Federal;
   - Codigos;
   - Legislacoes.
3. Cada secao da Home mostra apenas itens com destaque.
4. Paginas simples de categoria.
5. Pagina publica da legislacao em `/legislacao/[codigo]`.
6. Apenas legislacoes com `ativo = Sim` aparecem no site.
7. Pagina da legislacao com:
   - nome;
   - descricao curta;
   - video publico do YouTube incorporado;
   - quantidade de flashcards;
   - PDF Esquematizado, se disponivel;
   - Legiscast, se disponivel;
   - ultima alteracao legislativa;
   - botao Comprar;
   - formulario para acompanhar atualizacoes por nome e e-mail.
8. Cadastro de acompanhamento por e-mail no Supabase.
9. Bloqueio de duplicidade por `legislacao_codigo + email`.

## Fora do MVP

1. Comentarios publicos.
2. Cadastro/login de alunos.
3. Area do aluno.
4. Banco interno de questoes.
5. Alternativas, resposta correta ou comentarios de questoes dentro do site.
6. Painel administrativo.

## Observacao sobre comentarios

A tabela `comentarios` pode permanecer no Supabase sem uso por enquanto. A experiencia de comentarios fica para a V2, junto com cadastro/login de alunos.
