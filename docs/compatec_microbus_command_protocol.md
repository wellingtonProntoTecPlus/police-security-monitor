# Protocolo MicroBus Compatec — Notas de Integração

## Fontes recebidas do usuário

| Documento | Arquivo local | Escopo |
|---|---|---|
| Integração Compatec Contact ID IP | `/home/ubuntu/upload/IntegraçãocentraisCompatecContactIDIPMonitoramento.pdf` | Eventos, identificação e Keep Alive do protocolo universal |
| Integração Compatec Parte 2 — Comandos | `/home/ubuntu/upload/IntegraçãoCompatec-Monitoramento-Parte2-Comandos.pdf` | MicroBus, Arme/Desarme, setor, PGM e demais comandos |
| Documentos Monitoramento Linha PRO | `/home/ubuntu/upload/INTEGR~3.PDF` | CRUD de controles e senhas da linha PRO Continente |

## Separação obrigatória de protocolos

O protocolo universal Contact ID IP que o receptor Police Central já usa para a Compatec serve para identificação (`*ID`), conta (`#conta`), Keep Alive (`@`) e eventos (`$...`). A primeira documentação declara explicitamente que, nesse protocolo universal, a recepção de comandos não é habilitada.

Os comandos remotos usam o **MicroBus proprietário Compatec**, em fluxo originado pelo software de monitoramento. Não presumir que uma conexão do Contact ID possa receber MicroBus sem confirmação técnica da Compatec sobre a porta, modo de conexão e sessão de comando.

## Estrutura MicroBus documentada

```text
MB=<destino><origem><comando>[argumentos]\r\n
```

O destino da central é `A`. A origem é `J` para o módulo GPRS MG1 e `K` para o módulo Wi-Fi MW1. A resposta inverte o cabeçalho, por exemplo `MB=JA4...`. Os argumentos são separados por vírgula dentro de colchetes; a mensagem termina em CR/LF.

| Ação | Comando | Exemplos documentados via MG1 |
|---|---:|---|
| Ler estado da central | `0` | `MB=AJ0\r\n` |
| Configurar/monitorar setor | `1` | Requer máscara de alteração antes do pacote do setor |
| Máscara de setor | `2` | Enviada antes de `CMD_SETOR` para definir os bits alteráveis |
| Configurar/monitorar PGM | `P` | A documentação recomenda comando de grupo para acionamento normal |
| Arme/desarme e PGM simplificados | `4` | `MB=AJ4[0,03FF]` arma todos; `MB=AJ4[0,0001]` arma setor 1; `MB=AJ4[0,0000]` desarma todos; `MB=AJ4[5]` aciona PGM 1 |

Para `CMD_GRUPO`, grupo `0` é arme/desarme; grupos `5`, `6`, `7`, `16` a `20` acionam PGM 1 a 8. O argumento de setores é uma máscara `U16HEX`; em AM8 e AM10, os dez setores físicos correspondem aos bits da máscara.

Na abertura do manual, a Compatec explicita que o cabeçalho do quadro sempre segue `MB=<destino><origem><comando>`, em que o destino da central é `A`, a origem varia para `J` no **MG1 GPRS** e para `K` no **MW1 Wi‑Fi**, e o fluxo de comandos é sempre iniciado pelo software de monitoramento; a central apenas responde aos pacotes recebidos [1]. Essa descrição coincide com as consultas reais homologadas no laboratório, em que o Police Central envia `MB=AK...` e a central responde `MB=KA...`.

As páginas iniciais também trazem exemplos de `HWINFO` e `CMD_HWINFO` para MW1, confirmando novamente a troca do endereço de origem para `K` no Wi‑Fi. Isso reforça que a divergência observada no `CMD_GRUPO '4'` não decorre de usar o cabeçalho errado; o conflito está na **semântica do quadro no MW1**, não no sentido do canal ou na inversão de origem/destino [1].

## Segurança e auditoria do Police Central

As ações de comando não necessariamente geram um evento Contact ID. Portanto, qualquer envio deve persistir: sistema, operador, motivo, tipo de comando, parâmetros, quadro MicroBus, data/hora, resposta, tempo de retorno e resultado.

O envio real ficará bloqueado por padrão. A primeira entrega implementará o fluxo auditável e o gerador MicroBus em modo de simulação. Antes de habilitar uma central física, confirmar com a Compatec: modelos compatíveis, porta/rota de comandos, abertura ou reaproveitamento de sessão TCP, modo de programação necessário, resposta esperada e autorização operacional.

## Quadros documentados confirmados para a etapa de simulação

As páginas 7 a 10 do manual de comandos mostram exemplos suficientes para montar uma **simulação fiel**, ainda sem transmissão real. Os quadros abaixo devem ser tratados como **fonte externa documentada**, não como descoberta por engenharia reversa do receptor atual [1].

| Ação | Quadro documentado | Observação |
|---|---|---|
| Armar todos os setores | `MB=AJ4[0,03FF]\r\n` | `CMD_GRUPO '4'`, grupo `0`, máscara de 10 setores habilitados |
| Armar apenas o setor 1 | `MB=AJ4[0,0001]\r\n` | Exemplo explícito do manual |
| Desarmar todos os setores | `MB=AJ4[0,0000]\r\n` | Exemplo explícito do manual |
| Acionar PGM 1 | `MB=AJ4[5]\r\n` | Grupo `5` corresponde à PGM 1 |
| Solicitar estado do setor | `MB=AJ1\r\n` | Sem argumentos |
| Máscara do setor | `MB=AJ2[...]\r\n` | Deve anteceder `CMD_SETOR '1'` |

> “Para envio de configurações nos comandos é necessário enviar todo pacote juntamente com um pacote idêntico contendo a máscara dos bits que se deseja alterar. (...) No caso do comando de setor a máscara foi separada em um novo comando que deve ser enviado antes do envio da configuração dos setores.” — Compatec, Parte 2 Comandos, página 7 [1]

Nos exemplos visuais da mesma página, a **anulação do Setor 1** usa a sequência `CMD_MASK_SETOR` seguida de `CMD_SETOR`, ambos com o primeiro campo em `0008`; a **restauração** usa a mesma sequência com o primeiro campo em `0000` [1]. Como a etapa atual continua em simulação, o Police Central pode registrar exatamente essa dupla de quadros na auditoria sem transmiti-la.

## Mapeamento de grupos para PGM

| PGM | Grupo `CMD_GRUPO` |
|---|---:|
| PGM 1 | 5 |
| PGM 2 | 6 |
| PGM 3 | 7 |
| PGM 4 | 16 |
| PGM 5 | 17 |
| PGM 6 | 18 |
| PGM 7 | 19 |
| PGM 8 | 20 |

## Evidência da central de bancada — 25/08/2026

As telas fornecidas pelo operador confirmam o MAC completo `F024F9C1BDCB`, cujo sufixo `C1BDCB` identifica a conta Compatec `0334` no receptor Police Central. A tela de monitoramento configura a VPS como **Servidor 1** em `104.207.144.231:9112`; o Servidor 2 é `monitoramento1.servebbs.com:9112`.

A central usa somente o módulo **Wi-Fi MW1**, sem GPRS. A origem MicroBus aplicável é, portanto, `K`, e a primeira consulta de estado de bancada é `MB=AK0\r\n`. Não há, nas telas de monitoramento apresentadas, uma porta adicional de recebimento de comandos. O Police Central testará somente a conexão TCP que a central já abre para a VPS, com bloqueio explícito ao MAC de bancada e sem alterar a configuração existente.

O relatório do aplicativo confirma arme/desarme por App e as telas iniciais mostram PGM 1 e PGM 2 disponíveis. Esses comandos físicos continuam pendentes de homologação individual após a consulta de estado.

## Primeira resposta MicroBus real — 26/08/2026

A consulta de bancada `MB=AK0\r\n` foi enfileirada pelo Police Central, entregue no próximo contato Wi-Fi autenticado da conta `0334` e confirmada com a resposta real:

```text
MB=KA0[00C7,1E,3C]
```

O manual define o primeiro argumento como um campo de bits de estado da central; o bit de armado está presente em `00C7`, coerente com a tela do aplicativo que indicava central parcialmente armada. Esse resumo não informa quais setores estão armados. Antes de transmitir arme, desarme, PGM ou anulação, a próxima consulta segura será `MB=AK1\r\n` para obter o estado individual dos setores e distinguir central totalmente armada de parcialmente armada [1].

## Evidência de comando físico — 26/08/2026

O quadro Wi-Fi `MB=AK4[0,03FF]\r\n`, inicialmente rotulado segundo o exemplo externo como Arme, foi transmitido na central Compatec de bancada `F024F9C1BDCB`. O aplicativo oficial registrou **“Desarme do alarme efetuado por App”** tanto quando a central estava previamente desarmada quanto quando estava armada. Para esta integração MW1, o Police Central passa a tratar este quadro como **Desarme observado em bancada** e bloqueia qualquer quadro de Arme até que sua semântica seja demonstrada pela central física.

### Homologação controlada do Desarme — 26/08/2026

Após corrigir a autorização do operador autenticado, foi executado um teste único com a central inicialmente **ARMADA** pelo aplicativo oficial. O operador informou o motivo operacional `testando`, confirmou o botão vermelho de Desarme e o Police Central criou no histórico uma solicitação **Desarmar central** com status inicial `sent`, preservando operador, motivo e quadro transmitido. Em gravação simultânea do aplicativo oficial, a central mudou de **Armado total** para **Desarmado** e apresentou a confirmação **“Desarme do alarme efetuado por App”**. Portanto, `MB=AK4[0,03FF]\r\n` está **homologado como Desarme físico exclusivamente para a bancada MW1 identificada por C1BDCB**. O estado de referência após o teste é **DESARMADO**.

O quadro de Arme permanece **desconhecido e bloqueado**. Os exemplos MG1 do manual não podem ser reutilizados para MW1 sem uma evidência física equivalente.

## Releitura dirigida do manual de comandos — páginas 9 e 10

Na revisão visual das páginas 9 e 10 do manual Parte 2, o comando `CMD_GRUPO '4'` continua descrito para o canal **MG1**, não para MW1, com os exemplos documentados `MB=AJ4[0,03FF]\r\n` para **arme de todos os setores** e `MB=AJ4[0,0000]\r\n` para **desarme de todos os setores** [1]. As mesmas páginas também listam grupos adicionais `9`, `10` e `11` para ações sobre setores das partições 1, 2 e 3, mas sem qualquer evidência prática na bancada Wi‑Fi [1].

Essas páginas reforçam duas conclusões operacionais. Primeiro, a documentação disponível permanece **insuficiente para afirmar o quadro de Arme no módulo MW1**, porque o comportamento real observado na bancada contradisse a semântica MG1 para o mesmo padrão de argumentos. Segundo, qualquer candidato de Arme em MW1 deve ser tratado apenas como **hipótese de bancada**, nunca como verdade de protocolo, até existir confirmação física com auditoria e verificação independente no aplicativo.

## Exclusão do CMD_ALARME como candidato de Arme remoto

Na revisão das páginas 6 a 8 do mesmo manual, o `CMD_ALARME '0'` foi descrito como um pacote de **resumo e configuração de estado geral** da central, incluindo bits como armado, bateria, rede, disparo de sirene, auto arme e modo silencioso [1]. O próprio exemplo de escrita mostrado nessa seção altera apenas máscara, auto arme e tempo de sirene, além do acionamento de sirene, sem apresentar qualquer quadro dedicado para executar **arme remoto** da central [1].

Com isso, o `CMD_ALARME '0'` deve ser descartado como candidato para o Arme que o operador deseja homologar. O caminho plausível continua sendo o `CMD_GRUPO '4'` ou algum comportamento específico do MW1 ainda não documentado na base atual [1].

## Releitura final do CMD_GRUPO e comandos MW1 restantes

Nas páginas finais do manual, o `CMD_GRUPO '4'` é descrito como a via simplificada para **arme/desarme**, PGM e sirene. O grupo `0` permanece associado a arme/desarme por máscara de setores; os grupos `9`, `10` e `11` referem-se a ações sobre setores das partições 1, 2 e 3; e os exemplos explícitos continuam sendo apenas os do canal MG1: `MB=AJ4[0,03FF]\r\n` para arme total, `MB=AJ4[0,0001]\r\n` para arme apenas do setor 1, `MB=AJ4[0,0000]\r\n` para desarme total e `MB=AJ4[5]\r\n` para PGM 1 [1].

As páginas 11 e 12 mostram exemplos **MW1** somente para `CMD_CONTROLE '8'` e `CMD_SENHA '9'`, confirmando que o manual sabe diferenciar o canal Wi‑Fi quando deseja fazê-lo [1]. Como não há exemplo equivalente de `CMD_GRUPO '4'` para MW1, a documentação atual continua sem fornecer um quadro explícito e confiável de **Arme via Wi‑Fi**. Em consequência, o próximo teste de Arme deve ser tratado como **ensaio experimental de bancada, um candidato por vez, com consulta `AK1` antes e depois e observação simultânea no aplicativo**.

### Regra operacional de ARMADO STAY

Para a operação Police Central, **ARMADO STAY** significa central armada com ao menos um setor isolado ou inibido. A central armada sem setores isolados/inibidos será apresentada como **ARMADO**; sem arme ativo, como **DESARMADO**. Essa classificação será aplicada somente quando a leitura `MB=KA1[...]` confirmar os indicadores de arme e de isolamento/inibição dos setores.

Fontes visuais fornecidas pelo usuário: `Screenshot_20260825_072007_ContinentePro.jpg`, `Screenshot_20260825_072056_ContinentePro.jpg`, `Screenshot_20260825_072156_ContinentePro.jpg` e `Screenshot_20260825_072219_ContinentePro.jpg`.

## References

[1]: file:///home/ubuntu/upload/IntegraçãoCompatec-Monitoramento-Parte2-Comandos.pdf "Integração das centrais de alarme Compatec monitoradas com os softwares de monitoramento — Parte 2 Comandos"
