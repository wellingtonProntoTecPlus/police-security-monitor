# Agenda operacional de Arme e Desarme

## Regras para o operador

- Cada central tem sua própria agenda semanal, cadastrada na ficha do cliente, aba **Agenda de Arme**.
- Os feriados cadastrados para a parceira formam o calendário aplicável às contas vinculadas. Os horários especiais de cada feriado são definidos separadamente em cada conta.
- A agenda aceita horários de desarme e Arme por dia da semana e horários próprios para feriados.
- A tolerância para um Arme que não chegou é de 10 minutos. Se, após esse prazo, o último estado confirmado do painel continuar desarmado, o sistema cria um alerta persistente no Dashboard.
- Um evento de desarme recebido fora de uma agenda ativa cria ocorrência para o operador, vinculada ao evento original e registrada no histórico de alertas.
- Eventos de Arme/Desarme realizados no horário, Arme Stay, isolamento/restauração de zona, e estados de contas sem agenda não abrem fila; permanecem nos relatórios operacionais.
- Uma exceção diária pode suspender a agenda para uma data (por exemplo, feriado em que a empresa vai funcionar) ou substituir um ou ambos os horários. Horários não alterados continuam herdados da agenda normal. Toda exceção exige solicitante e motivo, identifica o operador logado e mantém histórico auditável.
- O alerta ativo pode ser reconhecido pelo operador no Dashboard. Quando um novo estado válido regulariza a situação do painel, o alerta ativo é resolvido automaticamente; os registros históricos permanecem consultáveis no relatório **Alertas de agenda**.
- Eventos de Arme/Desarme emitidos pelo aplicativo do cliente continuam como eventos normais do painel e não devem ser confundidos com comandos remotos da Central de Monitoramento.

## Implantação

A migração aditiva da agenda está no `drizzle/0038_flowery_photon.sql` e também foi incluída no script `deploy/upgrade_vps.sql`. O endpoint interno já existente de varredura por minuto deve permanecer configurado no cron: além dos alertas de Keep Alive, a versão atualizada executa a conformidade da agenda e aplica a tolerância de 10 minutos.

Nenhuma transmissão física é executada pela configuração da agenda. Os comandos de Arme/Desarme seguem seu fluxo próprio de autorização, identidade do painel e confirmação.
