# Identificação de Painéis IP no Receptor

## Situação atual

O receptor atual extrai a Conta Contact ID dos pacotes de evento. A consulta prioriza Conta + fabricante + porta, mas pode recorrer somente à Conta quando não encontra essa combinação. Esse recurso de contingência não é seguro quando duas empresas parceiras usam a mesma Conta Contact ID.

Os campos MAC, IMEI e ID ISEP existem no cadastro de sistemas, porém os parsers atuais não extraem esses identificadores dos pacotes recebidos. Portanto, o sistema ainda não pode afirmar que identifica um painel por MAC, IMEI ou ISEP.

## Captura operacional de 13/08

| Fabricante | Conta de teste | MAC informado | Evidência no pacote | Conclusão |
|---|---:|---|---|---|
| Vetti | 0336 | FC-0F-E7-2D-E4-A8 | O login contém `2DE4A8`, os seis últimos caracteres do MAC. | O login Vetti transmite o sufixo MAC em hexadecimal. |
| Radioenge | 0335 | 00-12-F8-60-0C-81 | A conexão contém `6294657`, a representação decimal de `600C81`, os seis últimos caracteres do MAC. | A conexão Radioenge transmite o sufixo MAC convertido para decimal. |
| Compatec | 0334 | F0-24-F9-C1-BD-CB | A conexão curta contém `C1BDC`, que corresponde aos cinco primeiros caracteres do sufixo `C1BDCB`. | Há forte indício de um identificador de MAC abreviado; é necessário capturar outra conexão Compatec para confirmar o sexto caractere ou o quadro complementar. |

## Regra operacional proposta

| Tipo de painel | Identificador principal | Dado operacional complementar |
|---|---|---|
| JFL, Intelbras, Vetti, Compatec e Radioenge IP | MAC Ethernet ou IMEI GPRS transmitido pelo protocolo | Conta Contact ID |
| ViaWeb | ID ISEP transmitido pelo receptor/protocolo ViaWeb | Conta Contact ID e MAC, quando disponível |

A Conta Contact ID poderá ser repetida entre parceiras. Um evento só poderá ser associado a um sistema após encontrar o identificador único do painel. Eventos sem identificador reconhecido devem permanecer vinculados à Conta do Sistema 0000, preservando os dados brutos para diagnóstico, sem risco de atribuição ao cliente errado.

## Evidência externa

A documentação da ViaWeb informa que o VIAWEB Receiver recebe os eventos dos equipamentos e os repassa ao software de monitoramento; também menciona múltiplos meios online em uma única conta ID ISEP e recursos anti-clonagem. Isso reforça que a integração ViaWeb deve respeitar seu identificador próprio e protocolo/receptor autorizado.

Fonte: https://www.viawebsystem.com.br/guias/conteudo/index.php?doc=VIAWEBReceiverPlataformaAlarmeNET
