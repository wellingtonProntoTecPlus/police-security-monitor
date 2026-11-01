# Intelbras AMT-8000 — Arme e Desarme físico via ISECnet

## Situação

O PoliceCentral passa a montar a sequência autenticada documentada pelo SDK Intelbras: login remoto `E7/0x11`, alternância de Arme/Desarme `E7/0x16`, leitura da resposta de estado `E7/0x96` e encerramento `E7/0x15` com ACK `E7/0x95` para liberar o teclado. O código, a interface e os quadros foram validados por testes automatizados contra os exemplos reais publicados pela Intelbras.

**Nenhum comando físico foi transmitido durante esta etapa.** A transmissão só pode ser iniciada após um administrador habilitar o modo de bancada naquela AMT-8000 e um operador confirmar a ação no Dashboard. Homologação física controlada ainda é necessária antes de liberar uso operacional.

## Requisitos antes do teste de bancada

- Central ativa cadastrada como Intelbras AMT-8000 e associada por MAC físico e conta conferidos na sessão `0x94`.
- Senha de Acesso Remoto de seis dígitos cadastrada no perfil próprio do sistema. Essa é a credencial ISECProgram `0x11`; **não** é a Senha Master do painel nem a Senha de Instalador.
- Administrador habilita o modo de bancada na janela de credenciais do cadastro da própria central e informa motivo. O sistema registra quem habilitou/desabilitou, o MAC, a data e a justificativa. Ativar essa chave não transmite nenhum comando.
- Um operador confere o estado físico atual, informa o motivo e confirma ARMAR ou DESARMAR no Dashboard. A interface exibe somente a ação inversa do estado mais recente confirmado.
- A AMT-8000 deve ter uma sessão ativa no receptor. Se estiver desconectada, a tentativa é recusada e não fica guardada para envio posterior.

## Sequência e vetores do SDK

O comando `0x11` autentica a senha remota de seis dígitos em BCD, acrescenta a versão `0x99` e aguarda `0x50` (aceito) ou `0x53` (senha recusada). Após o login, `0x16` alterna o estado atual do sistema. A operação `0x00` abrange todas as partições; esta etapa não transmite operações individuais nem Stay. A senha não é gravada no histórico nem impressa em logs.

Vetor oficial do login para senha de teste `878787`:

```text
09 E7 05 11 87 87 87 99 68 F1 82
Resposta aceita: 05 E7 01 50 87 E3 28
```

Vetor real de Arme/Desarme total `0x16`:

```text
06 E7 02 16 00 C2 91 A6
Resposta de exemplo com estado 03: 06 E7 02 96 03 76 94 48
```

Vetor de exemplo do SDK para operação `0x04`:

```text
06 E7 02 16 04 42 8A 39
Resposta de exemplo: 06 E7 02 96 06 76 8A 53
```

O parser confere comprimento, CRC ISECProgram e checksum externo do frame. No retorno `0x96`, os bits baixos indicam partições A–D armadas; o bit 7 indica zonas abertas. Arme só é considerado confirmado quando alguma partição está armada e não há indicação de zona aberta. Desarme só é confirmado quando não há partições armadas.

Os quadros `0x16` e respostas `0x96` usam bytes finais observados nos exemplos reais da aba `5-Programar central via APP`; a máscara não é a regra genérica `XOR com FF` usada pelo ACK de login `0x50`. Os testes reproduzem as sequências byte a byte, inclusive rejeição de checksum/CRC incorretos.

Após `0x96`, o sistema envia `0x15` para finalizar o acesso remoto e liberar o teclado. Só marca o ciclo como concluído após `0x95`. Se a ação foi confirmada, mas a liberação do teclado falha, o histórico preserva a confirmação da ação e registra separadamente a falha de finalização.

O comando `0x10` é enviado a cada dez segundos enquanto a central aguarda uma resposta mais longa, como orienta o SDK; o ciclo termina ou falha no limite de 30 segundos.

## Contact ID 403 na Intelbras

A tabela de eventos enviada para a AMT-8000 define os estados separadamente: `E403` (`1 403`, evento novo) significa **Auto-desativação / Desarme automático**; `R403` (`3 403`, restauração) significa **Auto-ativação / Arme automático**. O PoliceCentral cataloga ambos somente para `INTELBRAS`, como eventos report-only, sem abrir atendimento e sem alterar o significado do código 403 de outras marcas. A captura da conta 0049/MAC 7B255F às 09:44 identificada como `E403` é, portanto, evidência de que aquela central se desarmou automaticamente nesse horário; sua captura bruta permanece preservada para auditoria.

## Travas e auditoria

1. A identificação e a sessão usam MAC físico e conta compatíveis; conta ou IP isolados não autorizam comando.
2. Apenas AMT-8000 ativa com MAC cadastrado pode habilitar bancada; a ativação/desativação Intelbras é restrita a administrador e auditada com justificativa.
3. Antes de reservar, o servidor exige modo de bancada, credencial remota válida de seis dígitos, sessão TCP ativa e estado conhecido que corresponda à ação solicitada. Após o login, verifica novamente a autorização e o estado antes de enviar `0x16`.
4. Há no máximo um comando físico em andamento por central. Requisições desconectadas não são aceitas como fila.
5. Comandos antigos em `waiting_connection` e reservas antigas ainda não transmitidas expiram. Uma reconexão futura nunca executa silenciosamente uma alternância solicitada antes.
6. Timeout, senha recusada, checksum/CRC inválido, queda de sessão, estado não confirmado e falha de desbloqueio ficam registrados como falhas ou resultado indeterminado, sem serem apresentados como sucesso.
7. O histórico guarda operador, motivo, resultado e quadros operacionais sem senha. A ativação da bancada deixa registro separado e informa explicitamente que nenhum comando foi transmitido.

## Fluxos que não são confundidos

- `E7/0x11 → 0x16 → 0x15` é o fluxo ISECProgram descrito pelo SDK para controle pelo Receptor IP.
- `E9/ISECMobile` é outro protocolo e não é usado como substituto do fluxo AMT-8000 via `E7`.
- O material de fotos/programação menciona autenticação `F0F0`, troca `0x0BB0` e encerramento `F0F1`; esse é um canal remoto separado. Este fluxo não é usado pelo comando operacional descrito acima.
- A mensagem `401E` deve permanecer fora desta implementação até que a Intelbras confirme o enquadramento, a sessão de destino e a confirmação apropriados para comando remoto operacional.

## Homologação física pendente

O operador e o administrador devem preparar uma AMT-8000 de bancada identificada e obter autorização explícita para o teste físico. Durante esse teste único, confirmar o estado físico inicial, a senha remota correta, a resposta `0x50`, o quadro `0x16`, o resultado `0x96`, o envio/resposta `0x15/0x95`, o estado final no painel e o histórico no PoliceCentral. Não testar em central de cliente nem enviar um segundo toggle para “corrigir” a primeira tentativa sem nova confirmação explícita.
