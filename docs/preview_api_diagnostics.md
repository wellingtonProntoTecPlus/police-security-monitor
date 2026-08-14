# Diagnóstico da pré-visualização — consulta tRPC

## Ocorrência observada

O painel de diagnóstico da pré-visualização exibiu a mensagem `Unexpected token '<', "<!doctype "... is not valid JSON`. A mensagem ocorreu no registro de erros do navegador como `API Query Error`.

## Causa confirmada

O diálogo da pré-visualização estava apresentando **registros históricos acumulados** pelo coletor de console, e não uma falha atual do dashboard. O próprio diálogo indicava “1 of 25 errors”. Os registros correspondentes no log local tinham timestamps anteriores, em 13/08 às 03:18 e 19:45, enquanto a tela atual já carregava normalmente.

O servidor registra `/api/trpc` antes do fallback HTML do Vite/SPA. Portanto, uma chamada tRPC atendida normalmente não recebe `index.html`; o retorno `<!doctype>` só pode ocorrer em uma indisponibilidade ou troca transitória do proxy de desenvolvimento. Não houve erro atual do backend, resposta 404 ou resposta 500 correlacionada no período da verificação.

## Validação reproduzível

Em 14/08, a rota foi consultada diretamente no processo local:

```text
GET /api/trpc/auth.me?batch=1&input=...
HTTP 200 | Content-Type: application/json
Início da resposta: [{"result":{"data":{"json":null}}}]
```

Também foi aberta uma nova captura de `/dashboard`, sem alerta de console e com as consultas do painel carregadas. Logo, a pré-visualização está estável neste momento e não foi necessária alteração do fluxo tRPC.

## Prevenção operacional

Quando esse diálogo reaparecer com vários itens, deve-se verificar a data do registro e atualizar a pré-visualização antes de tratar como falha do servidor. Um erro persistente deverá ser acompanhado de uma resposta recente diferente de `application/json` em `/api/trpc`; nesse caso, o log de rede identificará a consulta afetada antes de qualquer mudança no código.
