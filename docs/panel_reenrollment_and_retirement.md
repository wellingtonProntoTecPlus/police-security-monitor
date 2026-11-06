# Recadastro de centrais e aposentadoria de vínculos

## Diagnóstico comprovado: conta 0021

Na consulta enviada da VPS em 05/11/2026, havia dois registros INTELBRAS, na porta 9271, com o mesmo MAC `37C6B0` e conta `0021`:

- Sistema antigo **77**: marcado ativo e online, mas sem cliente correspondente. Recebia eventos e Keep Alive.
- Sistema novo **80**: ligado ao cliente **76**, Teto Locadora de Máquinas e Equipamentos LTDA, mas sem horários de comunicação.

O aparelho estava comunicando com o PoliceCentral; a associação no banco ainda apontava para o cadastro antigo. Não há, nesse resultado, evidência de que a configuração do aparelho ou da rede tenha sido alterada. A exclusão do cliente deixou uma central órfã elegível para o receptor.

## Correção

A resolução física considera somente central ativa, cliente existente e ativo, fabricante compatível, porta exata e identidade física válida. Dois candidatos válidos com a mesma identidade são recusados; o sistema não escolhe arbitrariamente pelo número de conta. Cadastros sem porta definida não servem como coringa para o receptor.

Para Intelbras, o quadro de identificação 0x94/MAC precisa pertencer ao socket TCP atual. Conta, IP e cache de outro socket não comprovam a identidade. Após invalidar o cadastro antigo, a identidade capturada na conexão atual pode ser resolvida novamente para o cadastro válido. A atualização Online/Offline exige comunicação efetivamente recebida; o software não marca a central online apenas por criar seu cadastro.

Ao excluir um cliente, suas centrais são inativadas na mesma transação. Ao excluir uma central individualmente, ela é aposentada, não apagada com seu histórico. Eventos, ocorrências e comandos já transmitidos permanecem. O serial anterior fica em `retiredSerialNumber`, permitindo o recadastro desse serial sem perder sua referência histórica. Credenciais remotas do vínculo aposentado são removidas.

Somente comandos ainda aguardando envio (`queued` e `waiting_connection`) são cancelados. A invalidação dos caches e sessões físicas ocorre depois do commit, sem escrever quadros adicionais ou fechar arbitrariamente outras conexões.

## Despacho e exclusão concorrentes

O despacho dos fluxos existentes Compatec/Vetti reserva o comando no banco como `dispatching`. Antes do `socket.write`, relê cliente, central e comando sob locks, e executa apenas um callback síncrono de envio. Se a exclusão já foi concluída, não transmite. Se a escrita já ocorreu antes da exclusão, seu histórico não é convertido em cancelamento sem transmissão.

Interrupção durante essa janela pode deixar resultado indeterminado. O comando passa a `dispatch_unknown`, ou é recuperado para esse estado pela varredura operacional existente após 120 segundos. Não é reenviado automaticamente. Esse estado não significa confirmação de Arme/Desarme e exige conferência antes de liberar outra ação. Os quadros/protocolos e as autorizações físicas existentes não foram ampliados; Arme/Desarme físico Intelbras AMT-8000 continua bloqueado.

## Atualização da VPS

A migration `deploy/upgrade_vps.sql` adiciona a coluna histórica se necessário e inativa sistemas sem cliente correspondente ou ligados a cliente inativo. Cancela apenas comandos ainda não transmitidos desses vínculos. Sua repetição não duplica mensagens de cancelamento. Não transfere eventos históricos do sistema antigo para o novo e não altera IP, portas ou parâmetros ViaWeb.

Produção utiliza somente o fluxo versionado `deploy/update_vps.sh` e seu upgrade SQL. Não misturar o migrador Drizzle nesse mesmo banco.

Após o deploy, conferir a conta 0021 e MAC 37C6B0: o sistema 77 deve estar inativo/offline e o sistema 80 deve registrar nova comunicação ao receber o próximo quadro físico válido. Se o aparelho não transmitir durante a conferência, não presumir conexão com base somente no cadastro. Não enviar Arme/Desarme para testar conectividade.

## Validação local

Testes funcionais usam sockets fictícios; testes transacionais usam MariaDB privado por socket Unix no sandbox. Cobrem rejeição de sistemas órfãos/inativos, ambiguidade, porta exata, ausência de herança entre sockets Intelbras, reuso de serial, preservação de eventos, atualização idempotente e corrida entre despacho simulado e aposentadoria. Nenhum teste envia comandos a uma central real.
