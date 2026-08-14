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

No quadro de login Vetti `0209C04203362DE4A88F`, os bytes `03 36` são a Conta Contact ID `0336` e os bytes `2D E4 A8` são o sufixo MAC. Os campos `0A 03` do quadro de evento C1 não são a conta. O receptor guarda a identidade do login por conexão e aplica `0336` aos eventos seguintes daquela central.

## Regra operacional proposta

| Tipo de painel | Identificador principal | Dado operacional complementar |
|---|---|---|
| JFL, Intelbras, Vetti, Compatec e Radioenge IP | MAC Ethernet ou IMEI GPRS transmitido pelo protocolo | Conta Contact ID |
| ViaWeb | ID ISEP transmitido pelo receptor/protocolo ViaWeb | Conta Contact ID e MAC, quando disponível |

A Conta Contact ID poderá ser repetida entre parceiras. Um evento só poderá ser associado a um sistema após encontrar o identificador único do painel. Eventos sem identificador reconhecido devem permanecer vinculados à Conta do Sistema 0000, preservando os dados brutos para diagnóstico, sem risco de atribuição ao cliente errado.

## Evidência externa

A documentação da ViaWeb informa que o VIAWEB Receiver recebe os eventos dos equipamentos e os repassa ao software de monitoramento; também menciona múltiplos meios online em uma única conta ID ISEP e recursos anti-clonagem. Isso reforça que a integração ViaWeb deve respeitar seu identificador próprio e protocolo/receptor autorizado.

Fonte: https://www.viawebsystem.com.br/guias/conteudo/index.php?doc=VIAWEBReceiverPlataformaAlarmeNET

## Sinais Keep Alive usados para status operacional

O status Online/Offline deve ser determinado por comunicação de supervisão, e não por eventos de Arme, Desarme ou disparo. A implementação atual já reconhece alguns sinais de protocolo, mas ainda não persiste o horário desses sinais no sistema cadastrado.

| Fabricante ou protocolo | Sinal reconhecido pelo receptor | Situação atual | Regra necessária |
|---|---|---|---|
| JFL e Radioenge (7B) | Comando `0x40` | Recebe e responde ao Keep Alive | Atualizar o último contato do painel identificado na conexão |
| Vetti | Quadro `0xAB` | Recebe e responde ao Keep Alive | Atualizar o último contato do login MAC associado ao socket |
| Compatec | Quadro `@` | Recebe e responde ao quadro de supervisão | Confirmar a identidade MAC da conexão e atualizar o último contato |
| Intelbras | Supervisão ainda a confirmar no pacote recebido | Apenas eventos e alguns quadros auxiliares tratados | Manter captura até confirmar o quadro de Keep Alive |

O manual Radioenge localizado para esta investigação informa que o Keep Alive é enviado a cada 30 segundos ao software de automação. O intervalo de expiração operacional deverá ser configurado de forma conservadora e validado com os painéis reais antes de classificar uma central como Offline.
