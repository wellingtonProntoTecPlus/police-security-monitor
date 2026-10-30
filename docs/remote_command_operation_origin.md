# Origem do Arme e Desarme remoto

Quando o operador do PoliceCentral solicita um Arme ou Desarme físico Compatec ou Intelbras, o sistema registra a ação separadamente do evento Contact ID enviado pela central.

A solicitação contém:

- **Origem:** Central de Monitoramento;
- **Operador:** nome do usuário autenticado na sessão;
- **Ação:** `Armado Remoto por Central de Monitoramento` ou `Desarmado Remoto por Central de Monitoramento`;
- **Motivo:** texto informado pelo operador;
- **Auditoria:** número do comando remoto.

Enquanto a central não responder, a ocorrência mostra que a ação está aguardando confirmação. A ação somente é marcada como confirmada após uma resposta válida do protocolo físico. Se a ocorrência já tiver sido finalizada antes da resposta, a confirmação é preservada como um registro próprio no relatório de ocorrências.

O evento gerado pelo aplicativo ou pelo usuário do cliente continua sendo processado pelo fluxo normal do fabricante. Ele não recebe o nome do operador do PoliceCentral e não é convertido artificialmente em comando da Central de Monitoramento.

A simulação continua sem transmissão física e não cria confirmação de painel.
