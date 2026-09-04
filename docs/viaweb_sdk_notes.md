# Notas técnicas iniciais do SDK ViaWeb V10.1.5

## Evidências documentais já confirmadas

- O software de monitoramento **não recebe a central diretamente**; ele se conecta por socket TCP ao **VIAWEB Receiver**.
- A porta padrão documentada para a integração entre o software de monitoramento e o VIAWEB Receiver é **2700**.
- A comunicação padrão é **criptografada em AES-256-CBC** com **chave de 32 bytes** e **IV de 16 bytes**, ambos configurados na instalação do VIAWEB Receiver.
- O IV é **cumulativo**: no envio, os últimos 16 bytes criptografados viram o IV do próximo envio; na recepção, os últimos 16 bytes criptografados recebidos viram o IV da próxima descriptografia.
- A comunicação é **bidirecional e assíncrona**: o receptor e o software trocam operações JSON criptografadas, e cada operação recebida precisa de uma resposta de confirmação.
- O exemplo simplificado mostra a identificação inicial com `{"oper":[{"acao":"ident"...},{"acao":"salvarVIAWEB","operacao":2,"porta":1733,"monitoramento":1}]}`.
- O manual mostra eventos recebidos contendo `acao:"evento"`, `codigoEvento`, `particao`, `zonaUsuario` e `isep`.
- O manual mostra a confirmação do evento pelo software através de `{"resp":[{"id":"<id-do-evento>"}]}`.

## Regras adicionais confirmadas nas páginas 15 a 19

- As mensagens usam **JSON UTF-8** e podem trazer arrays `oper` e `resp` na mesma estrutura.
- A operação `ident` autentica uma **instância do software de monitoramento** junto ao VIAWEB Receiver; outras operações podem vir no mesmo pacote, mas só são processadas após a identificação ser aceita.
- O campo opcional `a` é um número aleatório usado para reforçar a segurança do primeiro envio criptografado.
- O campo `sinalizado` controla a fila dos eventos: com valor `1`, os eventos são enviados **em ordem e individualmente**, e o próximo só sai após a confirmação do anterior; com valor `0`, eventos podem ser agrupados.
- O campo `retransmite` pede o reenvio de operações ou eventos ainda não confirmados, com valor padrão de 60 segundos quando omitido.
- O campo `limite` controla quantos eventos pendentes podem ficar acumulados enquanto o software estiver offline; o campo `limiteOnline` controla quantos eventos podem ficar em RAM enquanto o software estiver online.
- O manual documenta erros genéricos importantes para o handshake, incluindo **erro 3: conexão bloqueada** e **erro 4: IP não autorizado**.

## Estrutura do evento ViaWeb confirmada no manual

- O VIAWEB Receiver envia ao monitoramento operações `acao: "evento"` dentro de `oper`.
- Cada evento pode trazer, entre outros campos, `nomeViaweb`, `portaViaweb`, `recepcao`, `dia`, `mes`, `hora`, `minuto`, `codigoEvento`, `eventoInterno`, `particao`, `zonaUsuario`, `contaCliente`, `supervisao`, `isep`, `numSerie`, `modelo`, `meio` e `ip`.
- O campo `codigoEvento` é **hexadecimal de 4 dígitos**.
- O campo `contaCliente` é **hexadecimal de 4 dígitos**.
- O campo `isep` é o **ID ISEP hexadecimal de 4 dígitos** que identifica o cliente no servidor ViaWeb.
- O campo `numSerie` do equipamento associado ao evento é **hexadecimal de 8 dígitos** quando presente.
- O software de monitoramento deve confirmar cada evento com `{"resp":[{"id":"..."}]}` para permitir o fluxo sequencial quando `sinalizado=1`.

## Relação com o Police Central

- A porta **9111** usada hoje no cadastro do Police Central não corresponde à porta 2700 do socket entre software e VIAWEB Receiver; portanto, a integração ViaWeb documentada aparenta exigir uma camada específica de cliente para o Receiver, não apenas um receptor Contact ID simples por porta.
- As páginas de comando do manual distinguem claramente a **porta do servidor VIAWEB** interno ao Receiver, exemplificada como **1733**, da **porta 2700** do socket de integração com o software de monitoramento.
- Até o momento, a captura da VPS enviada pelo usuário não contém linhas com `porta 9111`, `ViaWeb`, `VIAWEB`, `0337` ou `ISEP`; portanto, ainda não há evidência de recepção da central ViaWeb 0337 no ambiente publicado.

## Captura da VPS recebida em 04/09/2026

A captura confirma somente que o processo `police-central` iniciou a escuta TCP em `Porta 9111 (VIAWEB)`. Ela também mostra um trecho de erro do driver MySQL `PromisePool.query`, sem mensagem-raiz legível no recorte. Não há na imagem uma linha de `Nova conexão VIAWEB`, `CAPTURA-IP VIAWEB`, `ISEP`, `0337` ou de comunicação pela porta 2700. Portanto, a captura não demonstra conexão da central 0337 nem a presença do VIAWEB Receiver na VPS.

Uma segunda captura executou a consulta de portas e processos. O resultado mostra somente o `node /opt/police-central` ouvindo a porta **9111**. Não há processo cujo nome contenha ViaWeb e não há serviços ouvindo as portas **2700** ou **1733**. Logo, o **VIAWEB Receiver não está instalado ou não está em execução** na VPS e a central 0337 ainda não possui o intermediário exigido pelo protocolo para encaminhar eventos ao Police Central.

Após a configuração do FullArm, a tela da central mudou o Servidor 1 (PoliceCentral) de `On Line` para **`Conectado`**, enquanto o Servidor 2 (FullArm) permaneceu `On Line`. Isso confirma que o IP `104.207.144.231`, a porta `9111` e o ISEP `F301` permitem o estabelecimento da conexão TCP, mas o processo Node do Police Central não conclui o protocolo ViaWeb que torna o servidor operacional. A consulta `ss` da VPS não exibiu sessão ativa nem log de dados recebidos porque a sessão é encerrada após não receber a resposta de protocolo esperada.

## Instalação Linux documentada pelo fabricante

O pacote Linux contém um binário `VIAWEBReceiver`, e o manual informa que ele pode ser instalado como serviço. A interface de integração atende na porta **2700** por padrão; o acesso do software de monitoramento por essa interface é criptografado por padrão. O manual prevê ainda uma interface web na porta **1780** por padrão e a porta do servidor ViaWeb, normalmente **1733**, como uma configuração separada.

Esta documentação ainda não autoriza executar a instalação automaticamente: antes é necessário confirmar com o responsável a instalação do binário fornecido pelo fabricante na VPS e obter de modo seguro a chave AES-256 e o IV CBC configurados no VIAWEB Receiver. Esses dados não devem ser colocados no chat, em logs ou no código-fonte.

## Decisão de integração autorizada

O responsável autorizou a instalação do VIAWEB Receiver oficial na VPS para resolver a diferença observada entre `Conectado` e `On Line`. A instalação será feita com o Receiver atendendo externamente a porta **9111**, exatamente a porta já programada no Servidor 1 da central 0337. O PoliceCentral deixará de abrir uma escuta genérica nesta porta e passará a se conectar apenas ao Receiver local pela porta **2700**.

Para a primeira homologação, a interface 2700 será configurada para permitir comunicação **sem criptografia apenas pelo loopback local** (`127.0.0.1`), conforme a alternativa expressamente prevista pelo manual do fabricante. Não haverá abertura de porta 2700 na internet. A implementação envia somente as operações documentadas `ident`, `salvarVIAWEB`, confirmação de evento e, após persistir o evento interno de autorização, `salvarCliente` para autorizar exclusivamente o ISEP cadastrado. Ela não implementa nem transmite `executar`, portanto não libera Arme, Desarme, Isolar Zona, PGM ou qualquer outro comando físico.

O instalador `deploy/install_viaweb_receiver.sh` confere o SHA-256 do binário oficial recebido (`e75b7161682df4c3b860a1e96a46561766bb227bb3835761efa903d8f7eb0e2f`), cria um serviço systemd persistente, preserva uma cópia do pacote compilado anterior e reinicia o PoliceCentral com a integração local explicitamente habilitada. Caso a instalação falhe após parar o processo Node, o instalador tenta restaurar o pacote compilado anterior e reiniciar o PoliceCentral.
