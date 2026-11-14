# Tratamento automático E361/R361 da Radioenge

As centrais Radioenge cadastradas no PoliceCentral transmitem o evento `E361` para indicar falha do Keep Alive e `R361` para indicar a restauração.

A medição feita nos eventos reais observados em 29/10/2026 encontrou três pares E361/R361 com intervalos de 1, 1 e 2 segundos. O maior intervalo observado foi, portanto, de 2 segundos.

A regra operacional usa o dobro desse máximo como janela de segurança:

- `E361` identificado em uma Radioenge cadastrada é persistido imediatamente e colocado em **Observação**;
- o sistema aguarda até **4 segundos** pela chegada do `R361` da mesma conta e do mesmo sistema;
- se o `R361` chegar dentro da janela, o E361 e o R361 são tratados juntos e a ocorrência é finalizada automaticamente como restauração;
- se a janela vencer sem R361, o incidente sai de Observação, passa para **Atendimento** e é emitido ao Dashboard para providência do operador;
- se o `R361` chegar depois da escalada, enquanto o incidente `E361` ainda estiver aberto — inclusive em **Manutenção** —, o sistema também finaliza a falha automaticamente; o relatório e o histórico registram **“Falha de Keep Alive restaurada”**, com a hora e o evento `R361`;
- o fechamento tardio é idempotente e exige que `E361` e `R361` estejam persistidos e vinculados à mesma central física; se o operador já encerrou o incidente, não é criado outro relatório;
- todos os eventos permanecem persistidos no banco, inclusive os finalizados automaticamente.

A regra é exclusiva da marca Radioenge e do código 361. Não altera E361/R361 de JFL, Intelbras, Vetti, Compatec ou ViaWeb.

A promoção do prazo é persistida no banco e também possui temporizador em memória para atualização imediata do Dashboard. Na reconstrução da fila após reinício, o banco promove qualquer observação vencida antes de devolver a fila operacional.

## KOFF / falha de Keep Alive genérica

Quando o Keep Alive da central identificada retorna, o KOFF em aberto — inclusive em **Manutenção** — é encerrado imediatamente; se antes disso chegar um Contact ID real do mesmo painel, ele também comprova o retorno da comunicação e encerra a falha. Incidentes legados já marcados como restaurados são fechados usando a hora original, sem substituí-la pela hora de um heartbeat posterior. Em todos os casos, o relatório e o histórico registram **“Falha de Keep Alive restaurada”** e a hora efetiva de recuperação. Um Keep Alive sintético (`KOFF`), evento interno ViaWeb, pacote `SYSTEM` como Contact ID, evento de outra central ou mera ocorrência por conta/IP não encerra o alerta. O fechamento preserva todos os eventos e não cria Contact ID fictício.
