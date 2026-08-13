# Identificação de Painéis IP no Receptor

## Situação atual

O receptor atual extrai a Conta Contact ID dos pacotes de evento. A consulta prioriza Conta + fabricante + porta, mas pode recorrer somente à Conta quando não encontra essa combinação. Esse recurso de contingência não é seguro quando duas empresas parceiras usam a mesma Conta Contact ID.

Os campos MAC, IMEI e ID ISEP existem no cadastro de sistemas, porém os parsers atuais não extraem esses identificadores dos pacotes recebidos. Portanto, o sistema ainda não pode afirmar que identifica um painel por MAC, IMEI ou ISEP.

## Regra operacional proposta

| Tipo de painel | Identificador principal | Dado operacional complementar |
|---|---|---|
| JFL, Intelbras, Vetti, Compatec e Radioenge IP | MAC Ethernet ou IMEI GPRS transmitido pelo protocolo | Conta Contact ID |
| ViaWeb | ID ISEP transmitido pelo receptor/protocolo ViaWeb | Conta Contact ID e MAC, quando disponível |

A Conta Contact ID poderá ser repetida entre parceiras. Um evento só poderá ser associado a um sistema após encontrar o identificador único do painel. Eventos sem identificador reconhecido devem permanecer vinculados à Conta do Sistema 0000, preservando os dados brutos para diagnóstico, sem risco de atribuição ao cliente errado.

## Evidência externa

A documentação da ViaWeb informa que o VIAWEB Receiver recebe os eventos dos equipamentos e os repassa ao software de monitoramento; também menciona múltiplos meios online em uma única conta ID ISEP e recursos anti-clonagem. Isso reforça que a integração ViaWeb deve respeitar seu identificador próprio e protocolo/receptor autorizado.

Fonte: https://www.viawebsystem.com.br/guias/conteudo/index.php?doc=VIAWEBReceiverPlataformaAlarmeNET
