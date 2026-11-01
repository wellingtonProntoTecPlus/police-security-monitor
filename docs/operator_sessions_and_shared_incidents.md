# Sessões de operadores, fila compartilhada e exceções da agenda

## Sessão única por operador

Após login local ou OAuth, o PoliceCentral cria uma sessão própria do sistema e armazena no banco somente o hash do token. Um novo login da mesma conta revoga a sessão operacional anterior; requisições protegidas da sessão revogada deixam de ser aceitas e seus sockets são desconectados. A sessão é validada no servidor, então não basta manter uma página antiga aberta.

## Fila compartilhada entre telas

Os eventos continuam visíveis para todos os operadores. O primeiro operador que inicia o atendimento faz uma reivindicação atômica no servidor; as demais telas recebem a mudança por Socket.IO e/ou reconciliam a fila. Os cartões indicam quem está atendendo e qual é o estado do registro.

Um atendimento em andamento não pode ser tomado silenciosamente por outro operador. Se o primeiro operador colocar o registro em observação, outro operador pode abrir a ocorrência em modo de leitura e usar **Assumir atendimento**. A assunção cria um registro de atendimento filho, independente e vinculado ao original. O atendimento original permanece em observação; o operador que assumiu pode registrar suas próprias providências e gerar seu próprio relatório. Uma assunção repetida do mesmo operador reutiliza seu filho existente.

## Agenda e exceções rápidas

A tabela semanal e o horário de feriado continuam na ficha do cliente/sistema. O operador também pode abrir **Alterar agenda** dentro do Dashboard — inclusive durante o atendimento — para suspender a agenda ou substituir um ou ambos os horários por uma hora, um dia ou sete dias. Cada exceção exige quem solicitou e o motivo, registra o operador e expira; ao expirar ou ser cancelada, a agenda semanal/feriado volta a valer.

O cadastro da agenda usa os campos diários legados quando encontrados e preserva uma cópia da tabela antiga na migração da VPS. Se uma falha ocorrer na página de agenda, a interface deve informar o erro em vez de permanecer carregando silenciosamente.

## Implantação e segurança

O código e as migrações são aditivos e idempotentes, mas precisam ser executados na VPS antes do uso: a instalação antiga da tabela semanal é convertida para o modelo atual, e as tabelas de sessão e histórico são criadas. O primeiro teste recomendado é com dois usuários diferentes: um inicia e observa um incidente, outro assume; verificar os dois atendimentos e seus relatórios. Um teste adicional deve confirmar que o login do mesmo operador no segundo computador invalida o primeiro.

Esses fluxos não enviam comandos físicos às centrais. A autorização, a identidade e a confirmação dos comandos de Arme/Desarme continuam seguindo seus controles próprios.
