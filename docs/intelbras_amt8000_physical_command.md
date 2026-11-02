# Intelbras AMT-8000 — Arme/Desarme físico

## Situação atual

**O Arme/Desarme físico da AMT-8000 está bloqueado no PoliceCentral.** O fluxo anteriormente implementado usava o login ISECProgram `E7/0x11` com a credencial de Acesso Remoto/Configuração. Essa credencial é destinada à programação/configuração; não é a Senha Master (nem uma senha de usuário autorizada) que deve autenticar um comando de Arme/Desarme.

A rota do servidor recusa qualquer solicitação física antes de consultar a central, reservar um comando ou escrever no socket. O botão de transmissão não é exibido; o modal preserva apenas a simulação, que não envia quadros à central. O bloqueio está centralizado em `INTELBRAS_PHYSICAL_COMMAND_ENABLED = false` e só deve ser removido depois que o protocolo correto estiver implementado e validado por testes e homologação de bancada autorizada.

As tentativas antigas com `E7/0x16` que aparecem como **“Falhou — não confirmado”** não comprovam Arme nem Desarme. Não as repetir nem tratá-las como confirmação da central. A tela deve indicar que aquele método antigo está desabilitado.

## O que a documentação fornecida comprova

### Credenciais

O SDK Intelbras separa dois protocolos e seus segredos:

- O ISECProgram encapsulado em `E7` usa o comando interno `0x11` e a **Senha de Acesso Remoto de seis dígitos** para programação. Esse caminho não é a autorização de Arme/Desarme.
- Para comandos da central via ISECMobile, o SDK diz que são aceitas **Senha Master ou senha de usuário**; a Senha de Acesso Remoto é aceita apenas no protocolo de programação. Para este fluxo operacional, usar a **Senha Master** cadastrada (ou outro usuário explicitamente autorizado pela Intelbras e pelo operador).
- A Senha Master já tem perfil cifrado próprio e validação para 4 ou 6 dígitos. O campo de Acesso Remoto/Configuração permanece separado. Nenhum segredo deve aparecer em logs ou no histórico.

### Comando de Arme/Desarme `401E`

A planilha AMT-8000 enviada define `401E` como comando para ativar/desativar o painel. Os dados documentados são partição e operação:

- Partições `0x01`–`0x10`; `0xFF` significa todas as partições que o usuário está autorizado a usar.
- Operações: `0x00` desarmar; `0x01` armar; `0x02` Arme Stay; `0x03` Arme forçado.
- Resposta de sucesso: `401E` com partição e estado resultante; falha: `F0FD` com código NACK.
- Os exemplos demonstram que permissão e partições do usuário importam. A implementação inicial deve restringir escopo e validar cada resposta do painel; não presumir que `0xFF` ignora permissões.

### `F0F0` e sessão AMT Remoto/Receptor IP

`F0F0` é descrito no material AMT-8000 de integração de **leitura de fotos** como autenticação usando uma senha de usuário válida, seguida por `0x0BB0` para buscar fragmentos e `F0F1` para encerrar. Esse material, isoladamente, não prova que `F0F0` seja o handshake completo do comando `401E`; a documentação usa nomes de aplicação e envelopes diferentes. Não reutilizar automaticamente o fluxo de fotos como fluxo operacional.

O manual AMT Remoto/Receptor IP descreve uma sessão de aplicação separada: o AMT Remoto conecta como cliente TCP ao Receptor IP (servidor; porta padrão documentada `9010`), identifica-se por `E0`, consulta a conta/canal por `E3`, cria o link com `E4` e encaminha quadros à central conectada via `E7`. A resposta da central retorna pelo link. O `E4` é identificado pelo canal e pelos quatro dígitos da conta; deve ser associado à conexão autenticada e ao socket físico da central já identificado, nunca somente por IP ou conta recebida.

## Questões técnicas que ainda precisam ser fechadas

Há divergências entre exemplos/documentos sobre tamanho e envelope do `F0F0`, respostas e versões do protocolo. O SDK também descreve `401E` como operação de AMT-8000 V2, enquanto o manual de link AMT Remoto/Receptor IP define como `E0/E3/E4/E7` o transporte da aplicação até a central. Antes de habilitar o comando, é preciso confirmar o caminho completo aplicável ao software Receptor IP e ao firmware usado:

1. Se a autenticação com Senha Master é enviada como `F0F0` V2 dentro de `E7`, ou se há outra autenticação ISECMobile documentada para a sessão de Arme/Desarme.
2. Como `401E` é encapsulado e endereçado em `E7`, incluindo IDs de destino/origem, comprimento e checksum para o firmware AMT-8000 instalado.
3. Sequência e estados da sessão AMT Remoto: `E0` habilitado, `E3` conta/canal conectados, `E4` confirmado, envio único do comando e retorno correlacionado da central.
4. Como interpretar o bit 0 do status da partição e tratar NACK, timeout, duplicação e queda do link sem repetir automaticamente o comando.
5. Compatibilidade efetiva entre os exemplos AMT-8000 V2 e a versão/firmware da unidade de bancada. A planilha tem células conflitantes sobre tamanhos; não usar esses valores conflitantes sem uma captura/validação da Intelbras.

## Salvaguardas para a implementação futura

- Não transmitir o antigo `E7/0x11 → 0x16 → 0x15` para Arme/Desarme.
- Manter o sinalizador de transmissão física desligado até concluir as questões acima.
- Identificar a central por MAC/identidade física confirmada e sessão TCP ativa. Conta e IP isolados nunca autorizam comando.
- Enviar uma ação explícita (Armar ou Desarmar), confirmar o estado inicial recente, respeitar partições e autorização do usuário do painel e exigir confirmação/auditoria do operador.
- Não enfileirar comandos de alternância para execução tardia, nem repetir automaticamente uma operação de resultado incerto.
- Só declarar sucesso quando houver resposta correlacionada e interpretada do painel; a tela do cliente deve permanecer a fonte adicional de conferência durante a homologação.
- Testar primeiro em uma AMT-8000 de bancada com autorização específica; não enviar para equipamentos de clientes.
- Se a Senha Master já foi compartilhada em mensagem ou outro canal não destinado a segredo, recomendar sua troca e salvá-la novamente pelo campo protegido. Nunca copiá-la para código, logs, tickets ou este documento.

## Referências locais

- Documentos AMT-8000 fornecidos pelo usuário em `/home/ubuntu/amt8000_sdk_docs/` (planilha `AMT 8000 Resumido Comandos_REV1.xlsx` e guia `Processo Integração e recebimento fotos AMT 8000 REV1`).
- SDK Intelbras em `/home/ubuntu/tmp/intelbras_sdk_commands_rows.txt`; distinção ISECMobile/ISECProgram, `0x11`, `0x16` e regras de credencial.
- Manual `Descrição Comandos ISEC Net - AMT Remoto e AMT Mobile - Receptor IP - R04.pdf`: sessão `E0/E3/E4/E7` e porta padrão do Receptor IP.
- Manual `Descrição Comandos ISECNet - Smartphones-IntelbrasReceptorIP - R12.pdf`: outro escopo de cliente/aplicativo; não tratar como substituto da documentação AMT-8000.

Nenhum comando físico foi transmitido como parte desta correção. Nenhuma atualização da VPS foi realizada.
