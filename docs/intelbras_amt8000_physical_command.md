# Intelbras AMT-8000 — Arme e Desarme físico

## Escopo

Esta integração é exclusiva para sistemas cadastrados como **Intelbras AMT-8000**. O comando físico só pode ser solicitado por operador autenticado, dentro do escopo da parceira, com motivo operacional de pelo menos cinco caracteres e credencial técnica Intelbras cadastrada.

A Senha Master é cifrada no banco. Ela não é devolvida pela API e não aparece no payload, histórico ou log do comando. No fluxo operacional `E7/0x16` a senha não é serializada dentro do quadro; o PoliceCentral a exige como trava administrativa de autorização técnica. Isso é diferente do fluxo autenticado `F0F0`, usado pela AMT-8000 para uma sessão remota específica, como a leitura de fotos.

## Protocolo usado

A documentação oficial `SDKCentraisDeAlarmeIntelbras-v1.0.1` orienta que a AMT-8000 use o encaminhamento `E7` no Receptor IP, inclusive para a comunicação com AMT Mobile V3. O comando interno documentado é `0x16`, que alterna o estado atual:

```text
[length] E7 02 16 [operação] [CRC Hi] [CRC Lo] [checksum]
```

A operação `0x00` representa todas as partições; `0x01`, `0x02`, `0x04` e `0x08` representam as partições A, B, C e D nos modelos compatíveis. Como `0x16` é toggle, o PoliceCentral não o chama diretamente de “toggle” na tela: a tela mostra apenas **ARMAR** para uma central desarmada ou **DESARME** para uma central armada. O servidor repete a mesma conferência antes do envio, portanto o botão visual não é a única trava.

O retorno esperado é `E7/0x96`. O retorno só é considerado confirmação quando o quadro tem formato e verificação válidos, o status não indica falha e os bits de partição confirmam o estado desejado. Respostas desconhecidas, timeout ou fechamento da sessão são auditados como falha/resultado indeterminado, nunca como sucesso.

## Travas de identidade e exclusividade

1. O receptor só mantém sessão de comando depois de validar o `0x94` da própria conexão, conferindo checksum, MAC físico, conta coerente e cadastro Intelbras ativo.
2. O comando nunca é entregue por conta ou IP isoladamente.
3. Há no máximo um comando físico `queued`, `waiting_connection` ou `sent` por central.
4. Se a central estiver desconectada, o comando fica `waiting_connection` e só é enviado após nova identificação `0x94` da mesma central.
5. Se não houver estado Armado/Desarmado confirmado no histórico do próprio sistema, o servidor bloqueia o envio para evitar uma alternância errada.
6. O botão da tela pede confirmação explícita com conta, central, MAC, operador e motivo.

## E9 / ISECMobile não é o caminho da AMT-8000

A aba de comando ISECMobile documenta outro protocolo, encapsulado em `E9`, com senha ASCII e comandos `0x41`/`0x44`. A aba de conexão do SDK, entretanto, determina `E7` especificamente para a AMT-8000. Portanto, o PoliceCentral não usa `E9/0x41` ou `E9/0x44` como se fossem comandos físicos da AMT-8000.

## F0F0 / 401E: sessão remota distinta

O material específico da AMT-8000 também registra a autenticação `F0F0` e o comando `401E`. O guia de integração fornecido pela Intelbras cita `F0F0` no processo de autenticação para leitura de fotos após um evento `0xB5`, seguido de `0x0BB0` e encerramento `F0F1`. Esse é um canal de sessão remota distinto do comando operacional direto de monitoramento.

O PoliceCentral não mistura os dois fluxos: Arme/Desarme usa somente o quadro oficial `E7/0x16` já validado no SDK para a AMT-8000. O fluxo `F0F0/401E` não é enviado nem presumido pelo receptor atual; ele só poderá ser acrescentado depois de homologação separada do transporte, identificação de origem/destino e retorno da própria AMT-8000. Isso evita inventar uma sessão de programação ou transmitir um comando ambiguamente encapsulado.

## Simulação

A simulação E7/0x16 existente permanece separada: registra um quadro calculado, mas não transmite. O transporte físico está em `server/receiver/intelbrasPhysicalTransport.ts` e só marca o comando como confirmado após a resposta da central.

## Homologação obrigatória

A implementação foi preparada e testada por software, mas nenhum comando físico foi transmitido nesta etapa. Antes de usar em produção, deve ser feito um teste único e observado em uma AMT-8000 de bancada autorizada: conferir o estado físico inicial, executar apenas a ação autorizada, conferir o retorno `E7/0x96`, confirmar o estado final no painel e revisar o histórico do PoliceCentral. Não reutilizar o teste em produção nem executar Arme e Desarme em sequência sem nova confirmação operacional.
