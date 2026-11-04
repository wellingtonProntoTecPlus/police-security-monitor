# Registro de Arme/Desarme Compatec nos relatórios

## O que passa a ser registrado

Cada solicitação física de Arme ou Desarme iniciada no PoliceCentral recebe uma entrada informativa em `occurrences`, vinculada à conta, à central, ao cliente, à parceira e ao operador. Essa entrada é criada junto com a reserva do comando, antes da tentativa de transmissão, e é atualizada quando o sistema registra envio, espera de conexão, confirmação ou falha.

O relatório identifica explicitamente `Origem: PoliceCentral (Central de Monitoramento)`, a operação, o operador, o motivo, o resultado, a resposta disponível do painel e o número de auditoria do comando (`#ID`). Uma resposta incompatível — como `MB=KA4` sem a confirmação esperada — aparece como falha/não confirmado, nunca como desarme ou arme concluído.

## Onde consultar

Abra **Relatórios → Ocorrências finalizadas** e filtre pela conta, cliente e período desejados. A linha é um registro de auditoria do comando remoto, separado dos Contact ID genuínos recebidos do painel. O código de relatório `REMOTE` e a descrição explicam a origem e o estado.

## Segurança e fila operacional

Esse registro não cria nem altera `alarm_events`, não abre `incidents`, não remove ocorrências da fila e não afirma que o alarme mudou de estado quando não houve confirmação. Caso o comando esteja ligado a um atendimento em andamento, o relatório independente continua sendo criado e uma nota da solicitação/confirmação também fica no histórico daquele atendimento.

## Atualização da VPS

A migração `deploy/upgrade_vps.sql` inclui, sem duplicar, registros históricos de Arme/Desarme Compatec já salvos em `alarm_remote_commands`. A atualização da VPS aplica a migração antes do build/reinício. Nenhuma atualização ou alteração foi realizada na VPS durante a implementação local.
