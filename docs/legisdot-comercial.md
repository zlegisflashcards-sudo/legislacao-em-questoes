# LegisDot Comercial — primeira versão

## Entrega

Atendimento comercial por texto, conectado ao catálogo atual do Legis Flashcards e preparado para a WhatsApp Cloud API. O módulo fica **desativado por padrão**. A presença do código ou das variáveis não comprova conexão com a Meta.

Painel privado: `/admin/legisdot-comercial`, com acesso pela Central Administrativa.

- **Simulador:** testa conversas sem gravar clientes nem enviar mensagens ao WhatsApp. IA opcional; sem IA, o fluxo por regras funciona.
- **Conversas:** acompanha mensagens recebidas, rascunhos, envios e encaminhamentos. A administração pode assumir/retomar atendimento; um contato interrompido pelo cliente não pode ser reativado por esse botão.
- **Conexão:** apresenta estado, nomes das configurações faltantes e caminho do webhook. Nunca apresenta valores de segredos.

O atendimento identifica a lei/concurso, apresenta até três opções, explica Legis Questões/Lei Interativa/LegisCast, oferece amostra somente quando a gratuidade está confirmada, recupera uma escolha do histórico e compartilha o checkout cadastrado. Pedidos de acesso, pagamento, reembolso e atendimento humano são encaminhados à equipe. O modelo escolhe intenção e IDs; preços, URLs e disponibilidade são renderizados pelo código.

## Integração com o negócio

Fonte do catálogo: `produtos`, `produto_leis`, `leis`, `recortes_leis` e checks da Central. Preço ausente permanece desconhecido. Material em breve não recebe link de compra. Conteúdo inativo não é oferecido. O acesso gratuito só existe quando a lei ou o recorte correto o permite.

Links comerciais usam `/leisflashcards/{slug}`; links de pagamento usam o `hotmart_url` cadastrado. Este incremento **não implementa carrinho conjunto, novo gateway, confirmação de pagamento por WhatsApp ou liberação de acesso**. O webhook Hotmart e o processo atual de entrega continuam responsáveis por confirmação e acesso. Comprovante enviado no chat não confirma compra.

Não há identificação de conta de aluno pelo telefone, leitura de compras individuais ou envio de dados privados ao modelo. A IA recebe a projeção comercial do catálogo e um contexto curto da conversa; `store: false`, limite de saída, timeout e nenhuma repetição automática da chamada de IA.

## Estado que ainda depende da conta do proprietário

1. Escolher o número empresarial. O código atual do site publica um número, enquanto registros de atendimento citam outro. Nenhum número foi migrado, conectado ou alterado neste desenvolvimento.
2. Configurar o app/conta empresarial Meta e credenciais com permissão para o número. Se a intenção for continuar pelo aplicativo no celular, avaliar a elegibilidade e o fluxo oficial de coexistência.
3. Aplicar a migration inicialmente em banco de teste/preview e fornecer o catálogo nesse ambiente.
4. Publicar a branch em ambiente de teste e configurar o webhook Meta nesse endereço HTTPS.
5. Configurar recuperação periódica da fila e executar o piloto com os próprios números de teste.
6. Somente então ativar o atendimento no ambiente escolhido e ampliar os destinatários.

O desenvolvimento não aplicou migration em produção, não configurou credenciais, não disparou mensagens e não confirmou cobrança Meta/IA real. O simulador pode ser usado sem as tabelas de conversas, desde que a autenticação e o catálogo existentes estejam configurados.

## Configuração

Referência completa: `docs/legisdot-comercial.env.example`.

| Variável | Função |
| --- | --- |
| `LEGISDOT_WHATSAPP_MODE` | `disabled` (padrão), `shadow` (rascunhos) ou `live` (respostas elegíveis) |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador Meta do número; não é o telefone com DDD |
| `WHATSAPP_APP_SECRET` | Valida a assinatura HMAC do webhook |
| `WHATSAPP_VERIFY_TOKEN` | Segredo escolhido para o challenge GET |
| `WHATSAPP_ACCESS_TOKEN` | Credencial Meta para envio, mantida no servidor |
| `WHATSAPP_GRAPH_VERSION` | Versão fixada, inicialmente `v27.0` |
| `LEGISDOT_WORKER_TOKEN` | Bearer secreto do endpoint de recuperação |
| `LEGISDOT_WHATSAPP_ALLOWLIST` | Telefones internacionais ou BSUIDs autorizados no piloto |
| `LEGISDOT_WHATSAPP_ALLOW_ALL` | Só `true` remove a restrição de destinatários |
| `LEGISDOT_MAX_REPLIES_PER_DAY` | Limite diário de tentativas de envio, padrão 100, dia UTC |
| `LEGISDOT_OPENAI_MODEL` | Modelo existente/configurável, padrão `gpt-5.4-mini` |

Em `live`, faltas na configuração de envio ou destinatário fora do piloto produzem rascunhos. Rascunhos antigos não são enviados automaticamente ao mudar o modo. Existe também limite de dez tentativas de resposta por contato por hora. Os limites se aplicam aos envios; não representam orçamento financeiro garantido de IA ou Meta.

## Webhook e fila

Webhook: `https://DOMINIO_ESCOLHIDO/api/webhooks/whatsapp`.

- GET verifica `hub.mode`, `hub.verify_token` e devolve `hub.challenge` em texto simples.
- POST aceita até 512 KB, valida `x-hub-signature-256` sobre os bytes originais e só depois interpreta JSON.
- Eventos de outro `phone_number_id` são ignorados.
- Mensagens são persistidas antes do ACK. Falha de persistência retorna 503, permitindo retry da Meta.
- Chave única por número empresarial e ID de mensagem impede geração duplicada.
- O webhook agenda um item com `after()`. Uma chamada periódica autenticada recupera itens pendentes, leases vencidas e falhas anteriores ao envio.

Worker: `GET` ou `POST /api/internal/legisdot-comercial/processar`, com header `Authorization: Bearer VALOR_DE_LEGISDOT_WORKER_TOKEN`. Configure um agendador no ambiente de hospedagem para chamar esse endpoint a cada minuto. O código não criou nem ativou o agendador. Cada chamada processa um item; ajustar concorrência/volume após medir a fila real.

As conversas são serializadas na reivindicação. Se o cliente envia nova mensagem enquanto uma resposta é preparada, o envio anterior é marcado como superado. O histórico conserva as mensagens, mas não trata rascunhos ou saídas não aceitas como falas que o cliente já recebeu.

O timestamp original da Meta determina a janela. Retries e eventos de entrega não a renovam. O envio livre é bloqueado com margem de um minuto antes das 24 horas. A primeira versão não envia templates ou campanhas de recuperação.

Antes do POST à Meta, o banco confirma janela, pausa, opt-out, atualidade da mensagem, token de trabalho e limites de envio. Timeout, falha de rede, resposta de sucesso inválida ou encerramento após início do envio são registrados como **incertos**, sem reenvio automático. O callback opaco correlaciona eventos de entrega ao registro local, mesmo se a resposta do POST não tiver chegado. “Aceito” não significa “entregue”.

Falhas anteriores ao POST têm até três tentativas, com espera mínima de um minuto. O `after()` é conveniência; o worker periódico é necessário para recuperação.

## Identidade, interrupção e atendimento humano

Quando a Meta informa BSUID, ele é usado para enviar. O telefone opcional é preservado como alias. Eventos que fornecem os dois identificadores unem o histórico sob lock, mantendo a condição mais restritiva: opt-out, pausa administrativa ou atendimento humano. Um evento somente com BSUID sem associação anterior não permite inferir quem era o telefone; não se inventa esse vínculo.

Pedidos explícitos para parar são aplicados na ingestão, inclusive quando chegam com atraso. A pausa manual é revalidada antes do envio. Ao assumir uma conversa, a equipe continua o contato pelo canal empresarial conectado; este painel ainda não inclui envio manual de mensagens.

Áudio, imagem e documento recebem orientação para atendimento da equipe. A primeira versão guarda o tipo/aviso de mídia, não baixa nem transcreve o arquivo. A equipe consulta o arquivo no próprio WhatsApp. Leitura de edital e transcrição são próximos incrementos, assim como carrinho, identidade autenticada do aluno e acompanhamento por templates.

## Privacidade e manutenção

Tabelas dedicadas com RLS ativo e privilégios revogados de `PUBLIC`, `anon` e `authenticated`. As funções são `SECURITY INVOKER`, com `search_path` fixo e execução restrita ao backend. APIs e página exigem autenticação administrativa; mutações verificam origem. A listagem mascara telefones. Logs operacionais não incluem texto de conversa, tokens ou payloads.

Não há rotina de retenção automática nesta entrega. Antes do uso contínuo, definir prazo de retenção e a forma de atender exclusão/exportação de conversas. Esta documentação não altera termos de privacidade nem obtém consentimento em nome da empresa.

## Validação reproduzível

```sh
pnpm exec vitest run lib/legisdot-comercial
pnpm exec tsc --noEmit --incremental false
pnpm run build:offline
```

`supabase/tests/legisdot_comercial.sql` testa privilégios/RLS, deduplicação, timestamps, interrupção atrasada, respostas superadas, janela, rascunhos, pausa, separação de números, backoff, reconciliação de entrega e aliases. Executar em PostgreSQL descartável após aplicar apenas a migration pertinente. Os testes de integração do desenvolvimento usaram PostgreSQL local via PGlite; isso não substitui piloto na Meta, autenticação real ou validação visual no navegador.

## Documentação oficial consultada

- [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/)
- [Webhook: criação e assinatura](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint)
- [Mensagens de texto](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages)
- [BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)
- [Eventos de entrega](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status/)
- [Política de mensagens e janela de atendimento](https://whatsappbusiness.com/policy/)
- [Coexistência do aplicativo e API](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
