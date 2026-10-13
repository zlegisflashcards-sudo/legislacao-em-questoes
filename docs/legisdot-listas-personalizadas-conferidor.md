# Exportação do LegisDot para Listas personalizadas

Use esta orientação quando o LegisDot precisar gerar um arquivo para importação no **Conferidor de Questões** do Legis Flashcards.

## Objetivo

Gerar uma lista de UUIDs de questões já existentes no Legis Flashcards, para que o administrador possa abrir somente essas questões em uma Lista personalizada e conferir uma a uma.

## O que é uma Lista personalizada

Uma Lista personalizada é uma seleção persistente de questões do Legis Flashcards. Ela não cria perguntas novas, não altera as questões existentes e não duplica o conteúdo no banco. A lista apenas guarda os UUIDs das questões escolhidas e a sequência em que elas devem aparecer no Conferidor.

Ela é destinada ao trabalho editorial: o professor ou administrador consegue revisar uma coleção específica de assertivas, corrigir vínculo, assunto, legislação, enunciado ou justificativa quando necessário e marcar cada item como conferido. Esse andamento pertence somente àquela lista; a mesma questão pode estar em outras listas com progresso diferente.

## Para que o LegisDot deve gerar esse arquivo

O LegisDot deve exportar o arquivo quando identificar um conjunto de questões que merece conferência humana, por exemplo:

- questões geradas ou alteradas em uma rodada específica;
- questões vinculadas a um artigo, capítulo ou assunto;
- itens com possível inconsistência editorial;
- uma seleção priorizada para revisão pelo professor.

O arquivo elimina a busca manual de UUID por UUID. Ao importar, o Legis Flashcards localiza todas as questões de uma vez e monta a fila de conferência na ordem definida pelo LegisDot.

## Formato do arquivo

- Gere um arquivo `.txt` ou `.csv` em UTF-8.
- Inclua somente o UUID da questão em cada linha.
- Preserve a ordem editorial desejada: a primeira linha será a primeira questão da lista.
- Não inclua título, enunciado, resposta, assunto, ordem, HTML ou cabeçalhos de coluna.
- Não invente UUIDs: use exclusivamente o UUID original recebido do Legis Flashcards.

Exemplo de arquivo correto:

```text
8c251d95-c0f3-4d43-8b6c-7a03d64c7b13
e9b4f516-4f44-432d-82ea-2d937c5086f2
3906a506-0806-4eec-bd76-45c3e793126c
```

Um CSV também é aceito, desde que contenha os UUIDs. Para evitar ambiguidades, prefira uma única coluna sem cabeçalho:

```csv
8c251d95-c0f3-4d43-8b6c-7a03d64c7b13
e9b4f516-4f44-432d-82ea-2d937c5086f2
```

## Regras importantes

1. Exporte UUIDs de questões da mesma lei que será aberta no Legis Flashcards.
2. Não repita UUIDs. Se houver repetição, o Conferidor indicará o item, mas o incluirá uma única vez.
3. Linhas vazias são ignoradas.
4. UUIDs malformados ou que não pertençam à lei atual serão reportados como problema e não entrarão na lista.
5. O limite é de 10.000 UUIDs por importação e 1 MB por arquivo.
6. A lista guarda referências: corrigir uma questão depois da importação reflete imediatamente na conferência.

## Como importar no Legis Flashcards

1. Abra **Central da Lei → Questões** da lei correspondente.
2. Clique em **Listas personalizadas**.
3. Informe um nome descritivo, por exemplo `Revisão LegisDot — Crimes contra a Administração`.
4. Cole os UUIDs ou selecione o arquivo `.txt`/`.csv`.
5. Clique em **Gerar prévia**.
6. Confira encontrados, ausentes, repetidos e inválidos.
7. Clique em **Criar lista com N questões**.

Depois, use **Abrir** para iniciar a conferência. A lista permite marcar cada questão como conferida, filtrar pendentes/conferidas, corrigir conteúdo e continuar mais tarde sem afetar outras listas.
