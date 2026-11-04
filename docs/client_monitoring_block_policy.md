# Bloqueio e suspensão de cliente no receptor

## Comportamento esperado

Quando uma central estiver vinculada a um cliente com `monitoringStatus = blocked`, o bloqueio administrativo permanece ativo até ser removido manualmente. Quando o status for `suspended`, o bloqueio vale até `monitoringStatusUntil`; depois desse horário, a regra efetiva volta a `active` sem alterar o registro de auditoria do cadastro.

Para uma central identificada cujo cliente esteja efetivamente bloqueado ou suspenso, os eventos recebidos continuam sendo persistidos em `alarm_events` e no relatório de ocorrências automáticas, com o motivo do bloqueio/suspensão. O receptor não cria novo `incident`, não envia o evento ao Dashboard e não cria alertas de agenda nesse período. O evento, portanto, não deve abrir um novo cartão na fila.

Bloquear a fila não apaga eventos. Restaurações recebidas continuam sendo processadas para poder fechar atendimentos que já estavam abertos antes do bloqueio. Se o perfil do cliente não puder ser consultado, o receptor mantém o comportamento de atendimento normal e registra o erro; a indisponibilidade da consulta não deve silenciar um alarme.

## Validação

Os testes verificam que cliente bloqueado/suspenso gera plano somente para relatório, que bloqueio administrativo não expira sozinho e que suspensão temporal expira conforme a data cadastrada. A publicação da alteração no receptor e a validação controlada na VPS permanecem pendentes.
