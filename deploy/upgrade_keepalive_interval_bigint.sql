-- O intervalo é armazenado em milissegundos e pode ultrapassar o limite de INT
-- quando uma central volta após semanas desconectada.
ALTER TABLE `alarm_systems`
  MODIFY COLUMN `lastKeepAliveIntervalMs` BIGINT NULL;

ALTER TABLE `system_keep_alive_samples`
  MODIFY COLUMN `intervalMs` BIGINT NULL;
