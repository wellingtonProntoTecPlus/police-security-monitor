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
| Resposta obrigatória `FE` | Ainda não homologada no Police Central para a AMT-8000 |
| Classificação como evento ou Keep Alive | Bloqueada até validação controlada |
| Comandos remotos Intelbras | Não habilitados |

> A recepção de um quadro `0x94` comprova a conexão, mas não autoriza tratá-lo automaticamente como Keep Alive ou liberar qualquer comando remoto. A resposta deve ser implementada e testada com checksum válido, associação por MAC/identidade física e confirmação operacional separada.

## Próxima validação controlada

O próximo passo técnico é adicionar, em revisão isolada, o reconhecimento do quadro ISECnet `0x94`, responder somente com `FE` e associar a AMT-8000 por identificador físico confirmado. Depois disso, a central deverá ser observada em modo Online antes de qualquer implementação de eventos `0xB0`/`0xB4` ou de comandos remotos.
