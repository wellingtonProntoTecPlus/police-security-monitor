# Análise técnica — protocolo Vetti VSec Rev. 13

## Escopo e limites de segurança

Este registro consolida somente informações verificadas no protocolo fornecido pelo usuário: **VETTI — Protocolo de comunicação VSec Rev. 13**, datado de 13/08/2021. A análise não autoriza transmissão física a nenhuma central. Qualquer implementação inicial deve permanecer em simulação auditável e, posteriormente, ser limitada por conta, MAC e modo explícito da central Vetti exclusiva de testes.

## Fundamentos confirmados

| Item | Informação verificada |
|---|---|
| Transporte | TCP/IP, com a SmartAlarm atuando como cliente do servidor de monitoramento |
| Porta indicada | `9018` |
| Tempo máximo de resposta | 12 segundos |
| Firmware mínimo | 2.15 |
| Estrutura de frame | `STX (02) + NB + FR + parâmetros + CRC` |
| CRC | CRC de 8 bits calculado do campo `NB` até o byte anterior ao CRC |

## Páginas 10 a 14 — comandos e confirmações

| Comando | Finalidade indicada | Observação confirmada |
|---|---|---|
| `0x11` | Solicitação de acesso remoto | Requer senha de acesso externo de quatro dígitos; o login é válido por 60 segundos a partir da confirmação da central |
| `0x12` | Arme/desarme por inversão de estado | Exige a leitura prévia do status de partições via `0x14`; altera uma partição por vez e inclui número de usuário |
| `0x21` | Arme parcial (STAY) de partição | Inclui número de partição e usuário |
| `0x22` | Arme de partição | Inclui número de partição e usuário |
| `0x23` | Desarme de partição | Inclui número de partição e usuário |

O manual exibe, para os comandos analisados, uma resposta da central com o código de comando acrescido de `0x80` (por exemplo, `0x11` → `0x91`, `0x12` → `0x92`, `0x21` → `0xA1`), um campo de erro e campos de correlação. Para o `0x12`, o estado deve ser lido antes por `0x14`: para armar, aplica-se OR no mapa de partições; para desarmar, AND com o bit da partição removido. Os valores exatos de máscara, usuário e CRC devem ser gerados pelo transporte, nunca digitados pelo operador.

## Páginas 15 a 19 — múltiplas partições, sirene e PGM

| Comando | Finalidade indicada | Parâmetros principais | Observação confirmada |
|---|---|---|---|
| `0x32` | Arme de múltiplas partições | mapa de bits das partições + usuário | Exemplo do manual usa `0x14` para partições 3 e 5 |
| `0x33` | Desarme de múltiplas partições | mapa de bits das partições + usuário | Mesmo modelo de máscara binária do `0x32` |
| `0x42` | Arme de múltiplas partições com senha do usuário | mapa de partições + senha decimal do usuário | A senha aceita 4 a 8 dígitos; o campo reserva quatro bytes BCD, com `0xFF` como preenchimento quando necessário |
| `0x43` | Desarme de múltiplas partições com senha do usuário | mapa de partições + senha decimal do usuário | Estrutura paralela ao `0x42`: `NB=0x09`, máscara `0x01..0x3F`, quatro bytes da senha BCD e CRC |
| `0x44` | Arme STAY de múltiplas partições com senha do usuário | mapa de partições + senha decimal do usuário | Permite modo parcial explícito |
| `0x16` | Controle da sirene | ação `0x00` off / `0x01` on | O manual informa tempo máximo de 240 segundos ligada e restrição em disparo/pânico |
| `0x17` | Controle de PGM | ação + número da PGM | Ações previstas: `0x00` off, `0x01` on, `0x02` toggle, `0x03` pulso, `0x04` pré-definido VettiConfig |

Os comandos de múltiplas partições confirmam que a Vetti oferece duas famílias operacionais: uma baseada em **número do usuário** (`0x32` e `0x33`) e outra baseada em **senha do usuário** (`0x42`, `0x43` e `0x44`). Isso é relevante para o Police Central porque a credencial técnica já cadastrada para Vetti deriva o usuário a partir da senha de comando; portanto, na etapa de simulação auditável, precisaremos distinguir claramente qual via será usada em cada central de testes antes de qualquer homologação física.

Também fica confirmado que **PGM e sirene possuem quadros próprios**, independentes dos comandos de arme e desarme. No `0x17`, as ações previstas são `0x00` desligar, `0x01` ligar, `0x02` alternar, `0x03` pulso e `0x04` ação pré-definida do VettiConfig; o número da PGM vai de `0x01` a `0xFF`. Assim, o fluxo futuro de homologação Vetti deve ser unitário: primeiro login remoto, depois leitura de estado, depois um único teste por categoria — arme/desarme, stay, PGM e isolamento — sempre com retorno documentado.

## Páginas 20 e 21 — isolamento de zonas

| Comando | Situação | Ação | Formato confirmado |
|---|---|---|---|
| `0x19` | Obsoleto | `0x00` desinibir; `0x01` inibir | `02 07 AF 19 <ação> <zona> FF <CRC>` |
| `0x29` | Vigente, firmware 5.06 ou superior | `0x00` restaurar zona isolada; `0x01` isolar zona | `02 07 AF 29 <ação> <zona-high> <zona-low> <CRC>` |

O comando vigente para a implementação futura é **`0x29`**, não o `0x19`. Para isolar a zona 2, o exemplo oficial é `02 07 AF 29 01 00 02 11`; a resposta de sucesso é `02 08 AF A9 01 00 02 80 90`. Em zonas comuns, o fluxo operacional informado é desarmar a central, isolar a zona e armar novamente; o próximo Desarme restaura a zona isolada automaticamente. O restauro manual `0x29` com ação `0x00` deve ser reservado a zonas configuradas como **24 horas**, porque elas não retornam ao estado normal apenas com o Desarme.

Os comandos de pareamento (`0x40`), IR-Cloner (`0x41`), reset e sirene foram identificados no manual, mas ficam fora do escopo dos controles operacionais solicitados. Em especial, não serão incluídos na interface de atendimento.

## Páginas 26 a 28 — consultas seguras antes de qualquer ação

| Consulta | Quadro de solicitação | Resposta esperada | Informação operacional |
|---|---|---|---|
| Status geral da central | `02 05 AF 14 FF B1` | `0x94` | Estado geral, partições, PGMs, STAY e partições em uso |
| Zonas isoladas | `02 05 AF 18 FF 4D` | `0x98` | Mapa de bits: `1` indica zona isolada |
| Zonas inibidas | `02 05 AF 20 FF 1C` | `0xA0` | Mapa de bits: `1` indica zona inibida |

O `0x14` é a consulta obrigatória de pré-checagem. No campo de estado geral (`CTN`), o bit `0` indica se a central está armada; no campo `PAR`, cada bit de `0` a `5` representa a Partição 1 a 6; no campo `PGM`, os bits `0` a `7` representam PGM 1 a 8; e no campo `STY`, os bits `0` a `5` indicam se a respectiva partição armada está em STAY. Essa resposta fornece o estado que o Police Central deve registrar antes e depois de qualquer teste físico Vetti.

## Homologação da bancada Vetti 0336 — 28/08/2026

A central Vetti Smartalar32 de bancada, conta `0336` e MAC final `2DE4A8`, confirmou a entrega da consulta física depois do ACK de login da própria central. Em duas consultas, uma realizada com a central ARMADA STAY/PARCIAL e outra com a central DESARMADA, o retorno observado foi igual: `02 06 AF 94 85 FF 60`.

Esse retorno curto **não é estado da central**. O byte `0x85` ocupa a posição de erro da resposta `0x94` e o protocolo o define como **Login Expirado. Necessário novo login**. Portanto, a implementação não pode classificar esse retorno como ARMADO, STAY ou DESARMADO, mesmo que o frame `0x94` tenha sido recebido.

O fluxo físico obrigatório para a bancada passa a ser:

1. a central abre e autentica a sessão na VPS (`0xC0`), que responde o ACK documentado;
2. a VPS envia o login remoto `0x11` usando somente a senha de acesso externo cifrada no servidor;
3. a central deve responder `0x91` com erro `0x80` para confirmar o login válido por 60 segundos;
4. somente então a VPS envia a consulta de status `0x14`;
5. a resposta `0x94` só é aceita como status quando o campo de erro for `0x80`; qualquer outro código é registrado como falha auditável.

Até a nova leitura com essa sequência, Arme, Desarme, Zona e PGM físicos Vetti permanecem bloqueados. A credencial de comando do usuário e a senha de acesso externo nunca devem aparecer em quadros de histórico, logs ou na interface.

### Status completo confirmado após login remoto

Na sequência corrigida — login remoto `0x11` confirmado e consulta `0x14` enviada dentro da sessão válida — a central de bancada respondeu:

```text
02 0C AF 94 80 12 01 01 00 00 01 FF 57
```

O usuário confirmou que a central estava **ARMADA TOTAL** nesse instante. A decodificação verificada é: erro `0x80` (sucesso), modelo `0x12` (SmartAlarm Monitorada), `CTN=0x01` (central armada), `PAR=0x01` (Partição 1 armada), `PGM=0x00` (PGMs 1 a 8 desligadas), `STY=0x00` (Partição 1 sem STAY) e `USO=0x01` (Partição 1 em uso). Esse quadro passa a ser a pré-condição auditável para qualquer futuro teste físico de Desarme Vetti na bancada.

### Preparação do Desarme físico VSec 0x43 — pendente de homologação

O Police Central está preparado para uma única sequência de **Desarme VSec `0x43`**, exclusivamente para a central de bancada `0336`, MAC final `2DE4A8`, firmware `6.68` e com o modo de bancada VSec explicitamente ativo. A implementação não habilita Arme, Arme STAY, Zona ou PGM físicos.

A sequência preparada exige: conexão autenticada da própria central; login remoto `0x11` com retorno `0x91/0x80`; pré-consulta completa `0x14/0x94/0x80` que comprove `CTN` armado e máscara `PAR` não nula; envio do `0x43` com a máscara lida e a senha do usuário de comando mantida somente em memória; retorno `0xC3/0x80` com a mesma máscara e os quatro bytes de credencial refletidos; e consulta posterior `0x14`. O resultado só fica como `responded` se o pós-estado comprovar central desarmada e ausência das partições que estavam armadas antes. Os três retornos são gravados como auditoria sem expor qualquer senha.

O transporte VSec agora também valida comprimento e CRC de cada resposta, separa frames TCP fracionados ou agregados, impõe no máximo uma sequência VSec ativa para a bancada e encerra como `failed` as perdas de sessão, divergências de confirmação ou ausência de resposta em até 12 segundos. Esses controles foram validados automaticamente; **não houve teste físico do `0x43` e ele não pode ser considerado homologado**.

## Referência

[1]: file:///home/ubuntu/upload/VETTI-ProtocolodecomunicacaoVSecRev13.pdf "VETTI — Protocolo de comunicação VSec Rev. 13"
