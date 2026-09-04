# Evidências de eventos ViaWeb — conta 0337

## Fonte documental

O manual de integração ViaWeb SDK V10.1.5 descreve que cada operação `evento` chega pelo VIAWEB Receiver em `oper[]`, contém `id`, `acao: "evento"`, `codigoEvento` em Contact ID hexadecimal de quatro dígitos e, quando associada a uma central, `isep` de quatro dígitos hexadecimais. A confirmação deve responder o mesmo `id` em `resp[]`.

O mesmo manual define `eventoInterno: 1` como entrada On Line, `2` como saída Off Line e `3` como solicitação de autorização. Eventos internos podem não carregar ISEP quando pertencem ao próprio Receiver; não podem ser associados por conta.

## Evidência operacional de 04/09/2026

Após a integração local pelo VIAWEB Receiver na porta 2700 e autenticação do ISEP `F301`, a VPS registrou:

| Evento | ISEP | Conta associada | Resultado |
|---|---|---:|---|
| `EAA5`, tipo interno 3 | `F301` | `0337` | Solicitação de autorização entregue e confirmada após persistência de auditoria. |
| `RAA6`, tipo interno 1 | `F301` | `0337` | Evento interno de entrada On Line entregue. |
| `E410` | `F301` | `0337` | Persistido e emitido ao Dashboard como “Configuração remota”. |
| `E603` | `F301` | `0337` | Persistido e emitido ao Dashboard; aguardava classificação de teste de supervisão. |

O aviso interno `EAA0`, tipo 1, sem ISEP, foi confirmado sem persistência nem associação de painel, exclusivamente para não bloquear a fila do Receiver. Todos os comandos físicos ViaWeb continuam bloqueados.
