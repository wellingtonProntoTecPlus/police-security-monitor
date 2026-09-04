# Intelbras AMT-8000 — Captura ISECnet e Homologação Segura

## Evidência observada

Em 03/09/2026, a VPS recebeu repetidamente na porta `9271` quadros da central Intelbras AMT-8000 configurada como conta `0049`, com origem `177.191.133.171` e conteúdo hexadecimal:

```text
07 94 45 00 49 7B 25 5F 61
```

O primeiro byte (`0x07`) indica o número de bytes que seguem no quadro ISECnet; o segundo (`0x94`) é o comando de identificação de conexão. A documentação técnica Intelbras recebida no arquivo `Descrição Comandos ISECnet - Centrais Alarme-IntelbrasReceptorIP - R10.pdf` descreve o comando `0x94` como a informação do número de conta Contact ID e dos três últimos bytes do endereço MAC no estabelecimento da conexão.

O conteúdo decodificado é coerente com canal Ethernet (`0x45`), conta `0049` e MAC parcial `7B255F`. A especificação determina a resposta curta `FE` para essa transação.

## Situação atual

| Item | Situação |
| --- | --- |
| Conectividade até a VPS | Confirmada na porta 9271 |
| Identificação do quadro 0x94 | Documentada como conexão ISECnet |
| Resposta obrigatória `FE` | Implementada e validada em testes; aguardando confirmação na VPS |
| Classificação como evento ou Keep Alive | Bloqueada até validação controlada |
| Comandos remotos Intelbras | Não habilitados |

> A recepção de um quadro `0x94` comprova a conexão, mas não autoriza tratá-lo automaticamente como Keep Alive ou liberar qualquer comando remoto. A resposta deve ser implementada e testada com checksum válido, associação por MAC/identidade física e confirmação operacional separada.

## Próxima validação controlada

O reconhecimento do quadro ISECnet `0x94`, a resposta exclusiva `FE` e a associação por MAC físico confirmado foram implementados em revisão isolada. Depois da instalação na VPS, a central deverá ser observada em modo Online antes de qualquer implementação de eventos `0xB0`/`0xB4` ou de comandos remotos.

## Tabela de eventos no material recebido

O pacote recebido descreve como a AMT-8000 transmite eventos Contact ID pelos comandos ISECnet `0xB0`, `0xB4` e `0xB5`, e como o buffer `0x3900` entrega oito eventos de 13 bytes por vez. Ele informa os campos de novo/restauro, código Contact ID interno, código programado, zona ou usuário e partição. Contudo, **não contém uma tabela fechada de descrições dos códigos Contact ID** para importar diretamente.

Assim, os códigos recebidos devem continuar sendo interpretados pela tabela Contact ID universal e pelo perfil Intelbras mantidos pelo Police Central. Somente depois de a recepção `0xB0`/`0xB4` ser homologada com capturas reais será possível comparar os códigos programados da instalação e complementar regras específicas, sem duplicar códigos universais.

## Recepção passiva preparada

O receptor passa a aceitar somente os eventos ISECnet `0xB0` e `0xB4` com tamanho e checksum válidos, preservando o ACK `FE` exigido pela central. O quadro é associado somente depois de a conexão ter sido identificada pelo comando `0x94`, com correspondência de conta e identificador físico; um quadro de evento não identificado é confirmado no transporte, mas não é persistido nem associado a qualquer cliente.

O código Contact ID e o qualificador são campos independentes. A notação alternativa `1130` é normalizada para o código `130`; o qualificador `E` representa Disparo e `R` representa Restauração. Não deve existir um mapeamento separado `E1130`, pois ele duplicaria o mesmo evento.

## Continuidade entre conexões TCP

Na AMT-8000 observada, o evento `0xB0` pode chegar em uma conexão TCP curta diferente da conexão que transmitiu o `0x94` de identificação. O receptor passa a manter por até cinco minutos a associação confirmada por **MAC, conta, IP de origem e porta** para permitir essa continuidade. Se duas centrais diferentes forem identificadas com a mesma conta no mesmo IP e porta, a associação fica ambígua e o evento é descartado da persistência, mantendo a segurança contra atribuição indevida.

Durante a primeira validação, os eventos `0xB0` foram corretamente recebidos, mas ficaram na conta técnica `0000`. A causa era que a etapa de persistência tentava encontrar novamente MAC, IMEI ou ISEP no quadro curto do evento, embora esse identificador já tivesse sido confirmado no `0x94`. A correção encaminha apenas o ID interno da central previamente confirmada até a persistência e confere novamente marca e conta antes de aceitá-lo. Assim, o evento não recebe fallback por conta; sem a confirmação física prévia, continua destinado à conta técnica `0000` para conferência.
