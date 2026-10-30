# Tratamento automático E361/R361 da Radioenge

As centrais Radioenge cadastradas no PoliceCentral transmitem o evento `E361` para indicar falha do Keep Alive e `R361` para indicar a restauração.

A medição feita nos eventos reais observados em 29/10/2026 encontrou três pares E361/R361 com intervalos de 1, 1 e 2 segundos. O maior intervalo observado foi, portanto, de 2 segundos.

A regra operacional usa o dobro desse máximo como janela de segurança:

- `E361` identificado em uma Radioenge cadastrada é persistido imediatamente e colocado em **Observação**;
- o sistema aguarda até **4 segundos** pela chegada do `R361` da mesma conta e do mesmo sistema;
- se o `R361` chegar dentro da janela, o E361 e o R361 são tratados juntos e a ocorrência é finalizada automaticamente como restauração;
- se a janela vencer sem R361, o incidente sai de Observação, passa para **Atendimento** e é emitido ao Dashboard para providência do operador;
- se o R361 chegar depois da escalada, segue o fluxo normal de restauração, sem esconder a falha que já foi apresentada ao operador;
- todos os eventos permanecem persistidos no banco, inclusive os finalizados automaticamente.

A regra é exclusiva da marca Radioenge e do código 361. Não altera E361/R361 de JFL, Intelbras, Vetti, Compatec ou ViaWeb.

A promoção do prazo é persistida no banco e também possui temporizador em memória para atualização imediata do Dashboard. Na reconstrução da fila após reinício, o banco promove qualquer observação vencida antes de devolver a fila operacional.
