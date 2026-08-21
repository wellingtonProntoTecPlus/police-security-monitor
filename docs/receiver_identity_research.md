# Identificação de Painéis IP no Receptor

## Situação atual

O receptor atual extrai a Conta Contact ID dos pacotes de evento. Quando a marca ou a porta já são conhecidas, a consulta exige Conta + fabricante + porta e não recorre somente à Conta. Isso evita associar um evento ao cliente errado quando duas empresas usam a mesma Conta Contact ID.

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

O status Online/Offline deve ser determinado por comunicação de supervisão, e não por eventos de Arme, Desarme ou disparo. O receptor persiste cada sinal reconhecido em `system_keep_alive_samples` e atualiza a última supervisão da central identificada. A expiração continuará pendente da medição de múltiplos intervalos reais.

| Fabricante ou protocolo | Sinal reconhecido pelo receptor | Situação atual | Regra necessária |
|---|---|---|---|
| JFL e Radioenge (7B) | Comando `0x40` | Recebe e responde ao Keep Alive | Atualizar o último contato do painel identificado na conexão |
| Vetti | Quadro `0xAB` e sinal curto `F7` | `0xAB` recebe resposta; `F7` é registrado sem resposta adicional | Atualizar o último contato do login MAC associado ao socket |
| Compatec | Quadro `@` | Recebe e responde ao quadro de supervisão | Confirmar a identidade MAC da conexão e atualizar o último contato |
| Intelbras | Supervisão ainda a confirmar no pacote recebido | Apenas eventos e alguns quadros auxiliares tratados | Manter captura até confirmar o quadro de Keep Alive |

O manual Radioenge localizado para esta investigação informa que o Keep Alive é enviado a cada 30 segundos ao software de automação. O intervalo de expiração operacional deverá ser configurado de forma conservadora e validado com os painéis reais antes de classificar uma central como Offline.

## Evidência operacional da VPS — 13/08

Após a atualização de coleta de supervisão, o log do processo `police-central` confirmou as conexões reais abaixo. A Compatec não apresentou conexão ou quadro de supervisão durante a verificação e, portanto, foi considerada offline neste instante.

| Central | Porta | Origem observada | Quadro de supervisão | Associação confirmada |
|---|---:|---|---|---|
| Radioenge conta 0335 | 9035 | 189.101.32.9 | `7B0503403D` (`0x40`) | Keep Alive registrado pelo socket identificado |
| Radioenge conta 0041 | 9035 | 191.248.170.53 | `7B0502403C` (`0x40`) | Keep Alive registrado pelo socket identificado |
| Vetti conta 0336 | 9161 | 189.101.32.9 | `F7` isolado | Login `0209C04203362DE4A88F` confirmou MAC `2DE4A8`; `F7` será tratado como Keep Alive sem ACK |
| Compatec conta 0334 | 9112 | Reconectada posteriormente | `@` | Online; amostras persistidas confirmadas |

Os dois primeiros sinais Radioenge foram registrados como “primeiro Keep Alive observado”, o que é esperado logo após reiniciar o processo: ainda não existe sinal anterior para calcular o intervalo. A próxima etapa é acumular novas amostras para cada central e obter os intervalos reais persistidos.

## Medição confirmada das quatro centrais — 14/08

Após a coleta contínua na VPS, a consulta em `system_keep_alive_samples` confirmou a persistência de sinais das quatro centrais. A tabela abaixo registra a evidência que orientará a regra de expiração; o limite Offline será calculado de modo conservador a partir do comportamento de cada sistema, e não de uma constante geral.

| Conta | Marca | Amostras | Intervalo médio | Mínimo | Máximo | Interpretação operacional |
|---|---|---:|---:|---:|---:|---|
| 0041 | Radioenge | 13 | 356,3 s | 300,5 s | 648,7 s | Supervisão na faixa de 5 a 6 minutos, com intervalo excepcional maior após reinício/reconexão. |
| 0335 | Radioenge | 13 | 358,7 s | 299,6 s | 656,0 s | Supervisão na faixa de 5 a 6 minutos, com intervalo excepcional maior após reinício/reconexão. |
| 0334 | Compatec | 16 | 60,7 s | 60,2 s | 60,2 s | Supervisão estável de aproximadamente 60 segundos. |
| 0336 | Vetti | 99 | 28,4 s | 11,5 s | 151,4 s | Quadros `F7` alternam intervalos curtos e longos; a expiração deve acomodar essa alternância. |

Os logs da VPS também confirmaram o sinal `0x40` para Radioenge e o sinal `F7` para Vetti. A Compatec passou a apresentar amostras persistidas após sua reconexão.

## Incidente de associação indevida por conta — 15/08

Uma análise de evento real demonstrou que a conta Contact ID não pode ser usada como fallback quando o receptor já conhece a marca ou a porta da origem.

| Dado recebido | Valor | Cadastro associado indevidamente antes da correção |
|---|---|---|
| Evento | `R130`, conta `0001` | Sistema ID `6` |
| Origem | JFL, porta `9061`, IP `177.191.113.85` | Vetti Smart Alarm-Monitorada |
| Identificador cadastrado | Não transmitido no evento | MAC `2298B4`, porta `9161` |
| Cliente exibido incorretamente | — | Nilva Luzia dos Santos Santana |

A causa era um fallback legado: a consulta por `conta + marca + porta` retornava vazia e a rotina consultava novamente apenas pela conta. Como existia uma Vetti da conta `0001`, o evento JFL foi associado a ela. A regra foi corrigida: quando marca ou porta forem conhecidas e não houver sistema compatível, **não há fallback por conta**. O evento passa a ser registrado na Conta do Sistema `0000`, com a conta recebida preservada para auditoria, como “Conta Não Cadastrada”.

## JFL Active 20 da parceira Coruja — conta 0044

Em 20/08, a captura limitada da VPS confirmou que a central JFL Active 20 versão 8.0 transmite a Conta Contact ID `0044` no quadro de evento. O segmento hexadecimal `30303434` representa o texto `0044`; o quadro do teste periódico continha também o evento `E602`.

O MAC informado do painel é `44:1D:64:3B:CE:24` (sufixo cadastral `3BCE24`), mas ele não apareceu nos quadros JFL coletados de 5 e 24 bytes. Portanto, não existe evidência técnica suficiente para associar a Active 20 pelo MAC usando o formato atualmente recebido.

> Regra operacional decidida: nenhuma central IP será associada somente pela Conta Contact ID. A associação requer MAC Ethernet, IMEI GPRS ou, exclusivamente para ViaWeb, ID ISEP confirmados no protocolo. Enquanto a JFL não transmitir um identificador único confirmado, seus eventos devem seguir para a Conta do Sistema `0000` com a conta recebida preservada para auditoria.

Fonte consultada: manual oficial da linha Active da JFL, https://jflalarmes.com.br/wp-content/uploads/2024/05/manual-actives.pdf. O manual confirma o uso de Contact ID para comunicação, mas a decisão acima se baseia nos quadros reais capturados na VPS, pois o manual não documentou neste trecho um campo de MAC ou IMEI no protocolo de recepção. Regra operacional informada pelo usuário com base no cadastro da FullTime: centrais JFL da versão 7 em diante são cadastradas pelo serial de 10 caracteres.

## Hipótese a confirmar: canal proprietário além do Contact ID

A captura real demonstrou apenas que o quadro Contact ID recebido na porta 9061 contém a conta e o evento; ela não prova que a central não exponha serial em outro canal. A página oficial de softwares da JFL lista ferramentas próprias de monitoramento e comunicação, enquanto uma integração técnica pública para a linha Active descreve uma conexão TCP/IP configurada para o IP e a porta do sistema externo. Isso sustenta a hipótese — ainda não confirmada para a FullTime — de que o serial seja obtido por sessão ou protocolo proprietário distinto do Contact ID.

Fontes consultadas: https://jflalarmes.com.br/softwares-drivers/ e https://github.com/fernac03/JFL_ACTIVE. A integração pública é evidência de arquitetura, não documentação oficial da FullTime; a confirmação exigirá verificar a programação da central ou capturar a conexão no canal correspondente.

Consulta adicional em 21/08/2026: o manual oficial da JFL disponível em https://jflalarmes.com.br/wp-content/uploads/2024/05/manual-actives.pdf faz referência a protocolo JFL e a conector serial físico, mas a extração pública do PDF não apresentou uma especificação do protocolo IP de reporte que permita extrair o serial. Portanto, não é seguro inferir um formato de mensagem ou implementar o parser sem documentação fornecida pela JFL ou pela FullTime.

Evidência operacional enviada pelo usuário em 21/08/2026: o log de eventos da FullTime para a conta 0044 mostra pacotes Contact ID E602, E306 e E410, com a coluna "Imei/Mac" vazia em todos os registros. A FullTime, portanto, também não recebe MAC ou IMEI dentro desses eventos. O serial cadastrado para JFL versão 7 ou superior é uma referência de painel mantida fora da linha de evento apresentada; o mecanismo de correlação ainda requer documentação do gateway/protocolo proprietário.

Leitura da aba "Entrega de Eventos" da FullTime em 21/08/2026: os únicos controles disponíveis para o painel são "Habilitar entrega de eventos" e "Utilizar destinatários padrão", ambos ativos. A tela não expõe endereço, porta, protocolo ou campo de serial para a entrega. Assim, a associação pelo serial não é configurada individualmente nessa aba e permanece interna ao serviço padrão/gateway da FullTime.

Teste controlado em 21/08/2026: os pacotes recebidos do IP 190.111.129.105 permaneceram no formato de 24 bytes e continham `30303434`, correspondente à conta 0044, mesmo após a tentativa inicial de usar a conta temporária 5000. A mudança de conta ainda não havia sido aplicada na central no momento dessa captura.

Descoberta confirmada no teste posterior com a conta temporária 5000: antes do evento Contact ID, a JFL Active 20 enviou pela mesma conexão TCP (origem 190.111.129.105, porta 9061) um quadro de conexão `0x21` com 102 bytes. O quadro contém o serial ASCII `2801936621` e o MAC ASCII completo `441D643BCE24` (sufixo cadastrado `3BCE24`). O evento seguinte foi um quadro `0x24` com conta `5000`. A identificação deve, portanto, usar o quadro de conexão para vincular o socket ao painel por serial e/ou MAC antes de processar os eventos subsequentes.

## Regra de expiração adotada

Para cada central, o sistema considera os até 30 intervalos mais recentes e calcula `maior(90 segundos, média × 3, maior intervalo × 1,5)`. O status é **Online** somente quando `lastKeepAliveAt` está dentro dessa janela. Assim, eventos Contact ID, Arme, Desarme e disparos não podem manter artificialmente uma central online.
