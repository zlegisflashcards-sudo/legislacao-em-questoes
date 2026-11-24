# Lei Interativa em recortes

## Disponibilidade

- O leitor de recortes fica em preparação por padrão. O leitor integral exige
  acesso integral legítimo; um produto que dá apenas um recorte não serve como
  direito de leitura integral.
- Ativação gradual: no ambiente de teste, configure
  `LEI_INTERATIVA_ESTRUTURAS_RECORTE=1` e inclua apenas os identificadores
  dos recortes que serão validados em `LEI_INTERATIVA_RECORTES_HABILITADOS`.
  Sem a configuração ou sem estrutura liberada, nada é exposto pelo leitor.
- Minhas Leis, navegação dos modos e aprofundamento em Legis Questões usam o
  mesmo estado do servidor. A paginação revalida acesso e escopo do mesmo modo.
- O leitor mostra apenas os blocos preparados das estruturas selecionadas,
  íntegras e liberadas. Não usa o status do livro inteiro como requisito de
  abertura. Bloqueio explícito na hierarquia é respeitado.
- PDF, Legis Questões, Anki e LegisCast mantêm suas regras atuais. Este piloto
  traz apenas a leitura do recorte; não libera um áudio integral como áudio
  do recorte, nem muda os produtos comerciais.

## Conferência editorial e de acesso

1. No ADM da Central do Artigo, confira cada estrutura contra a lei, inclusive
   dispositivos faltantes, respectivos blocos e questões órfãs.
2. Em Liberação manual por estrutura, o botão **Ligar no recorte** aparece para
   uma estrutura filha selecionada em recorte ativo. Ele grava a decisão no
   mesmo registro auditado utilizado pelas estruturas de primeiro nível.
3. Teste o recorte em uma conta com exatamente aquele acesso e outra sem
   acesso. Confira Minhas Leis, a navegação principal, o aprofundamento por
   questão, links diretos, sumário e páginas progressivas. Com apenas um trecho
   liberado, confira sua abertura, a ausência dos demais e se o leitor
   integral continua disponível para uma conta que tem acesso integral.
4. Retire o identificador do recorte da configuração (ou desligue o recurso)
   para pausar imediatamente o leitor na próxima versão implantada. Essa
   pausa não remove conteúdo nem acessos comerciais.
