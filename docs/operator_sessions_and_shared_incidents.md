# Sessões de operadores, fila compartilhada e exceções da agenda

## Sessão única por operador

Após login local ou OAuth, o PoliceCentral cria uma sessão própria do sistema e armazena no banco somente o hash do token. Um novo login da mesma conta revoga a sessão operacional anterior; requisições protegidas da sessão revogada deixam de ser aceitas e seus sockets são desconectados. A sessão é validada no servidor, então não basta manter uma página antiga aberta.

## Fila compartilhada entre telas

Os eventos continuam visíveis para todos os operadores. O primeiro operador que inicia o atendimento faz uma reivindicação atômica no servidor; as demais telas recebem a mudança por Socket.IO e/ou reconciliam a fila. Os cartões indicam quem está atendendo e qual é o estado do registro.

Um atendimento em andamento não pode ser tomado silenciosamente por outro operador. Se o primeiro operador colocar o registro em observação, outro operador pode abrir a ocorrência em modo de leitura e usar **Assumir atendimento**. A assunção transfere a responsabilidade pelo mesmo incidente para o novo operador, retira o registro da observação e mantém o mesmo ID de atendimento e evento. O histórico anterior permanece anexado e recebe a auditoria da transferência; o novo responsável pode continuar o tratamento e finalizar essa mesma ocorrência. Não se cria ocorrência nem atendimento filho.

Atendimentos filhos que já existiam na versão anterior são preservados. Enquanto um desses registros legados estiver aberto, o atendimento principal não pode ser transferido para evitar dois fechamentos paralelos do mesmo evento; a interface informa qual registro antigo precisa ser resolvido.

### Finalização em massa e observação automática

Alertas KOFF restaurados e E361 Radioenge escalados podem estar em observação ou atendimento sem operador: ninguém os havia atendido ainda. Esses registros raiz agora podem ser reivindicados diretamente e finalizados em massa com os registros do próprio operador. Não é necessário criar atendimento filho para uma observação automática sem responsável.

O lote exige a central identificada, além da conta. Registros de outro sistema com a mesma conta, atendimentos de outro operador, manutenções e filhos sem responsável não são encerrados silenciosamente. O modal conta somente os elegíveis e informa quantos estão protegidos. A gravação do relatório, a auditoria de cada incidente e o fechamento ocorrem na mesma transação; qualquer falha reverte todo o lote.

O servidor devolve os IDs realmente encerrados. A interface remove somente esses cartões, atualiza o relatório e informa resultados parciais ou zero sem anunciar falso sucesso. O temporizador Radioenge usa bloqueio transacional e condição de status para não reabrir registros encerrados durante sua execução. Uma nova perda real de comunicação pode gerar um novo alerta; isso é diferente de reaparecer o mesmo registro já fechado.

## Agenda e exceções rápidas

A tabela semanal e o horário de feriado continuam na ficha do cliente/sistema. O operador também pode abrir **Alterar agenda** dentro do Dashboard — inclusive durante o atendimento — para suspender a agenda ou substituir um ou ambos os horários por uma hora, um dia ou sete dias. Cada exceção exige quem solicitou e o motivo, registra o operador e expira; ao expirar ou ser cancelada, a agenda semanal/feriado volta a valer.

O cadastro da agenda usa os campos diários legados quando encontrados e preserva uma cópia da tabela antiga na migração da VPS. Se uma falha ocorrer na página de agenda, a interface deve informar o erro em vez de permanecer carregando silenciosamente.

## Implantação e segurança

O código e as migrações são aditivos e idempotentes, mas precisam ser executados na VPS antes do uso: a instalação antiga da tabela semanal é convertida para o modelo atual, e as tabelas de sessão e histórico são criadas. O primeiro teste recomendado é com dois usuários diferentes: um inicia e observa um incidente, o outro assume; verificar que o ID do incidente permanece o mesmo, o responsável muda, a observação termina e o segundo operador consegue finalizar o atendimento com histórico preservado. Um teste adicional deve confirmar que o login do mesmo operador no segundo computador invalida o primeiro.

Esses fluxos não enviam comandos físicos às centrais. A autorização, a identidade e a confirmação dos comandos de Arme/Desarme continuam seguindo seus controles próprios.
