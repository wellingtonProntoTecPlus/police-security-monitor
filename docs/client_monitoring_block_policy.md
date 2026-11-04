# Bloqueio e suspensão de cliente no PoliceCentral

## Causa corrigida

O cadastro gravava o status e a lista Bloqueados o apresentava, mas o receptor Contact ID não consultava esse status antes de abrir um atendimento. As rotinas internas de falha Keep Alive e agenda também não consideravam o bloqueio do cliente.

## Comportamento esperado

Para `monitoringStatus = blocked`, o bloqueio administrativo permanece até ser removido manualmente. Para `suspended`, vale até `monitoringStatusUntil`; depois desse horário, o status efetivo volta a `active` sem apagar os dados da suspensão no cadastro. O vínculo é pelo cliente da central identificada, nunca pelo número de conta sozinho: clientes de parceiras diferentes podem ter a mesma conta.

Os eventos Contact ID de uma central identificada cujo cliente esteja bloqueado ou suspenso continuam gravados em `alarm_events`, incluindo o pacote bruto, e no relatório de ocorrências automáticas com o motivo da restrição. Não criam novo `incident`, cartão operacional ou alerta novo de agenda. A Radioenge E361 também não cria uma observação nova que estouraria na tela após quatro segundos.

As amostras de Keep Alive e o estado Online/Offline continuam sendo registrados. A varredura interna não gera novo KOFF durante a restrição; se a mesma desconexão continuar após reativação ou fim da suspensão, volta a ser elegível para tratamento normal. A agenda também retoma sua verificação normal ao fim da restrição.

## Preservação e segurança

O bloqueio não apaga eventos nem finaliza os atendimentos anteriores. Eles continuam persistidos para que o operador conclua seu tratamento. Restaurações recebidas continuam podendo fechar falhas já abertas. Se a consulta de perfil do cliente falhar no processamento Contact ID, o receptor mantém o atendimento normal para não silenciar um alarme por indisponibilidade de consulta.

## Validação e publicação

Há testes funcionais da entrada de eventos com banco simulado para bloqueio, suspensão, suspensão expirada, falha de consulta e Radioenge E361, além de teste de supressão/retomada da varredura Keep Alive. Nenhum teste abre socket de recepção ou transmite comandos físicos. A correção está local; depende de atualização e conferência controlada na VPS.
