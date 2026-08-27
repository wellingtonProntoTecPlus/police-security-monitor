# Solicitação técnica — MicroBus AW3 Pro com MW1 Wi‑Fi

**Destinatários:** suporte@compatec.com.br; assistência@compatec.com.br  
**Assunto:** Confirmação de quadro MicroBus para Arme remoto — AW3 Pro / MW1 Wi‑Fi

Olá, equipe Compatec.

Estamos integrando, em ambiente de bancada, uma central **AW3 Pro** com módulo **MW1 Wi‑Fi** a um software de monitoramento IP. A central se conecta ao receptor Contact ID IP e mantém comunicação pela porta `9112`. No MicroBus, a comunicação observada usa `AK` nos pedidos e `KA` nas respostas; por exemplo, as consultas `MB=AK0\r\n` e `MB=AK1\r\n` receberam respostas válidas da central.

Precisamos confirmar o quadro MicroBus correto para **Arme total remoto** nessa combinação específica de central e módulo Wi‑Fi.

Em nossa bancada, foram realizados somente testes controlados, registrados em auditoria e com confirmação no aplicativo Compatec:

| Quadro transmitido | Resultado observado no aplicativo |
|---|---|
| `MB=AK4[0,03FF]\r\n` | Desarme confirmado |
| `MB=AK4[0,0000]\r\n` | Desarme confirmado |

Pela orientação de uso do manual que possuímos, entendemos que `0000` deveria representar **Arme total** e `0001`, **Arme da Partição 1**. Contudo, o quadro `0000` também executou Desarme na central MW1 de bancada. Por segurança, bloqueamos novos testes e não enviaremos outros valores por tentativa.

Por gentileza, poderiam informar:

1. O **quadro MicroBus completo e exato** para executar Arme total remoto em uma AW3 Pro com MW1 Wi‑Fi, incluindo destino, origem, comando, argumentos e `CR/LF`.
2. O quadro para Arme da **Partição 1**, se aplicável a esse modelo.
3. Se há pré-requisito de autenticação, senha, modo de programação, sessão TCP ou configuração específica para comandos MicroBus pelo MW1.
4. Qual resposta ou ACK deve ser esperada para confirmar o Arme e qual é o tempo/repetição recomendados.
5. A documentação ou revisão oficial que descreve os comandos MicroBus para o **MW1 Wi‑Fi**.

Nossa finalidade é homologar a integração com segurança, inicialmente apenas nesta bancada. Nenhum comando será disponibilizado a centrais de clientes sem confirmação do fabricante e validação física independente.

Atenciosamente,

**Wellington Portes**  
Police Security

## Referências

[1]: https://compatec.com.br/suporte/ "Suporte Compatec"
[2]: https://compatec.com.br/produto/central-wi-fi-aw3-20/ "Central Wi‑Fi AW3 20 — Compatec"
