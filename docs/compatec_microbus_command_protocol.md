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

## References

[1]: file:///home/ubuntu/upload/IntegraçãoCompatec-Monitoramento-Parte2-Comandos.pdf "Integração das centrais de alarme Compatec monitoradas com os softwares de monitoramento — Parte 2 Comandos"
