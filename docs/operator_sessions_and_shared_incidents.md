# Sessões de operadores, fila compartilhada e exceções da agenda

## Sessão única por operador

Após login local ou OAuth, o PoliceCentral cria uma sessão própria do sistema e armazena no banco somente o hash do token. Cada usuário tem uma sessão operacional ativa; se não houver atendimento pendente, um novo login pode revogá-la, encerrar seu período de presença pelo motivo correto e desconectar os sockets anteriores. A sessão é validada no servidor, então não basta manter uma página antiga aberta.

Operadores, administradores e supervisores com atendimentos abertos não podem substituir a sessão silenciosamente por login em outro computador: recebem orientação para voltar à sessão anterior, finalizar as ocorrências ou realizar a passagem. Atualizações de fila, finalização, reivindicação, observação e assunção verificam novamente o ID da sessão dentro da mesma transação e usam o lock do usuário compartilhado com o logoff; uma requisição que chegou atrasada não pode reabrir o atendimento depois da saída. Em concorrência, vence a transação serializada e a outra é rejeitada.

## Escala, presença e relatório individual

O cadastro do usuário operacional pode ter escala dia sim/dia não em um dos turnos: 07:00–13:00, 13:00–19:00 ou 19:00–07:00, no fuso de São Paulo. A data-âncora determina a paridade; uma alteração permanente é registrada como nova vigência, encerra a vigência anterior sem apagar o histórico e pede uma justificativa. Exceções de troca cobrem as duas pessoas/datas combinadas e não mudam a paridade permanente. Os avisos de 40 e 20 minutos são exclusivos da sessão, deduplicados no banco e recuperados ao reconectar.

A tela **Escalas e Presença** separa previsão do turno e entrada/saída reais. O relatório filtrável por operador e intervalo mostra login, logoff e motivo de encerramento; a exportação CSV também preserva a diferença entre saída normal e substituição/expiração da sessão. Sessões existentes durante a migração entram com o login real guardado pela sessão autenticada, sem criar logoff fictício nem horário de trabalho retroativo.

O operador pode escrever um recado particular para outro colega de qualquer tela, ou associar notas e um prazo futuro a cada ocorrência pendente ao sair. O logoff em si é uma transação única: todas as ocorrências abertas atribuídas ao usuário precisam ser finalizadas ou ter destinatário, anotação e prazo validados antes; se uma delas falhar, sessão, notas, fila e mensagens permanecem sem alteração. Recados avulsos são registrados na caixa privada e não criam evento, ocorrência nem alteram a agenda. O cron operacional existente executa o envio 40/20 a cada minuto e a reconexão refaz a consulta para recuperar avisos que não foram vistos online.

## Fila compartilhada entre telas

Os eventos continuam visíveis para todos os operadores. O primeiro operador que inicia o atendimento faz uma reivindicação atômica no servidor; as demais telas recebem a mudança por Socket.IO e/ou reconciliam a fila. Os cartões indicam quem está atendendo e qual é o estado do registro.

Um atendimento em andamento não pode ser tomado silenciosamente por outro operador. Se o primeiro operador colocar o registro em observação, outro operador pode abrir a ocorrência em modo de leitura e usar **Assumir atendimento**. A assunção transfere a responsabilidade pelo mesmo incidente para o novo operador, retira o registro da observação e mantém o mesmo ID de atendimento e evento. O histórico anterior permanece anexado e recebe a auditoria da transferência; o novo responsável pode continuar o tratamento e finalizar essa mesma ocorrência. Não se cria ocorrência nem atendimento filho.

Atendimentos filhos que já existiam na versão anterior são preservados. Enquanto um desses registros legados estiver aberto, o atendimento principal não pode ser transferido para evitar dois fechamentos paralelos do mesmo evento; a interface informa qual registro antigo precisa ser resolvido.

### Finalização em massa e observação automática

Alertas KOFF restaurados e E361 Radioenge escalados podem estar em observação ou atendimento sem operador: ninguém os havia atendido ainda. Esses registros raiz agora podem ser reivindicados diretamente e finalizados em massa com os registros do próprio operador. Não é necessário criar atendimento filho para uma observação automática sem responsável.

O lote exige a central identificada, além da conta. Registros de outro sistema com a mesma conta, atendimentos de outro operador, manutenções e filhos sem responsável não são encerrados silenciosamente. O modal conta somente os elegíveis e informa quantos estão protegidos. A gravação do relatório, a auditoria de cada incidente e o fechamento ocorrem na mesma transação; qualquer falha reverte todo o lote.

O servidor devolve os IDs realmente encerrados. A interface remove somente esses cartões, atualiza o relatório e informa resultados parciais ou zero sem anunciar falso sucesso. O temporizador Radioenge usa bloqueio transacional e condição de status para não reabrir registros encerrados durante sua execução. Uma nova perda real de comunicação pode gerar um novo alerta; isso é diferente de reaparecer o mesmo registro já fechado.

O modal de finalização em massa consulta uma prévia persistida no banco: total de atendimentos da central, quantidade de eventos únicos, IDs elegíveis e registros protegidos. Isso distingue casos legados como 24 eventos com 25 atendimentos por haver um filho antigo vinculado ao mesmo evento. O botão não promete mais a contagem de uma fila local possivelmente desatualizada. O marcador conta IDs distintos de atendimento da mesma central e não considera o objeto selecionado como uma linha nova.

A confirmação envia exatamente os IDs apresentados na prévia. A transação só grava relatórios e fecha o lote se todos esses IDs continuarem elegíveis; se a prévia prometia 25 e só 1 ainda pode ser finalizado, nenhum é fechado e o sistema solicita nova conferência. Eventos que chegaram depois da prévia não entram silenciosamente no lote. A interface verifica a quantidade retornada e não apresenta sucesso se ela divergir da confirmação. Atendimentos de outro operador ou em manutenção continuam protegidos e são informados antes da confirmação.

## Agenda e exceções rápidas

A tabela semanal e o horário de feriado continuam na ficha do cliente/sistema. O operador também pode abrir **Alterar agenda** dentro do Dashboard — inclusive durante o atendimento — para suspender a agenda ou substituir um ou ambos os horários por uma hora, um dia ou sete dias. Cada exceção exige quem solicitou e o motivo, registra o operador e expira; ao expirar ou ser cancelada, a agenda semanal/feriado volta a valer.

O cadastro da agenda usa os campos diários legados quando encontrados e preserva uma cópia da tabela antiga na migração da VPS. Se uma falha ocorrer na página de agenda, a interface deve informar o erro em vez de permanecer carregando silenciosamente.

## Implantação e segurança

O código e as migrações são aditivos e idempotentes, mas precisam ser executados na VPS antes do uso: a instalação antiga da tabela semanal é convertida para o modelo atual, e as tabelas de sessão e histórico são criadas. O primeiro teste recomendado é com dois usuários diferentes: um inicia e observa um incidente, o outro assume; verificar que o ID do incidente permanece o mesmo, o responsável muda, a observação termina e o segundo operador consegue finalizar o atendimento com histórico preservado. Um teste adicional deve confirmar que o login do mesmo operador no segundo computador invalida o primeiro.

Os turnos/notificações e guardas de sessão precisam ser aplicados na VPS antes do uso, e a tela deve ser validada com dois operadores, reabertura de browser e sessão antiga com pendência. A carga retroativa cria presença apenas para as sessões que já estavam abertas no momento da migração, usando `auth_sessions.createdAt`; não reconstrói logoffs anteriores ou escala passada sem dados de origem. Esses fluxos não enviam comandos físicos às centrais. A autorização, a identidade e a confirmação dos comandos de Arme/Desarme continuam seguindo seus controles próprios.
