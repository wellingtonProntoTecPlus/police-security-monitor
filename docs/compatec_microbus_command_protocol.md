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

## Segurança e auditoria do Police Central

As ações de comando não necessariamente geram um evento Contact ID. Portanto, qualquer envio deve persistir: sistema, operador, motivo, tipo de comando, parâmetros, quadro MicroBus, data/hora, resposta, tempo de retorno e resultado.

O envio real ficará bloqueado por padrão. A primeira entrega implementará o fluxo auditável e o gerador MicroBus em modo de simulação. Antes de habilitar uma central física, confirmar com a Compatec: modelos compatíveis, porta/rota de comandos, abertura ou reaproveitamento de sessão TCP, modo de programação necessário, resposta esperada e autorização operacional.
