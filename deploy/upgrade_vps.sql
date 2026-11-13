-- Police Central: atualização segura de banco para instalações existentes.
-- Execute: mysql police_monitor < deploy/upgrade_vps.sql
-- Este arquivo não apaga tabelas nem cadastros.

SET @schema_name = DATABASE();

-- Índices aditivos para que relatórios e estados mais recentes usem o banco
-- sem ler o histórico completo; nunca remove nem modifica registros.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `alarm_events_received_idx` ON `alarm_events` (`receivedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_events' AND INDEX_NAME='alarm_events_received_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `alarm_events_system_code_received_idx` ON `alarm_events` (`alarmSystemId`,`eventCode`,`receivedAt`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_events' AND INDEX_NAME='alarm_events_system_code_received_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `alarm_events_code_system_received_idx` ON `alarm_events` (`eventCode`,`alarmSystemId`,`receivedAt`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_events' AND INDEX_NAME='alarm_events_code_system_received_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `alarm_events_auto_event_received_idx` ON `alarm_events` (`autoFinalized`,`eventCode`,`receivedAt`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_events' AND INDEX_NAME='alarm_events_auto_event_received_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `alarm_events_account_received_idx` ON `alarm_events` (`account`,`receivedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_events' AND INDEX_NAME='alarm_events_account_received_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `occurrences_finalized_idx` ON `occurrences` (`finalizedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='occurrences' AND INDEX_NAME='occurrences_finalized_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `occurrences_account_finalized_idx` ON `occurrences` (`account`,`finalizedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='occurrences' AND INDEX_NAME='occurrences_account_finalized_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `occurrences_client_finalized_idx` ON `occurrences` (`clientId`,`finalizedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='occurrences' AND INDEX_NAME='occurrences_client_finalized_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `occurrences_partner_finalized_idx` ON `occurrences` (`partnerCompanyId`,`finalizedAt`,`id`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='occurrences' AND INDEX_NAME='occurrences_partner_finalized_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

-- CPF/CNPJ é único dentro de cada categoria. Um documento pode existir uma vez
-- como parceira e uma vez como o cliente que representa a sua própria sede.
ALTER TABLE `clients` MODIFY COLUMN `document` VARCHAR(18) NULL;
ALTER TABLE `partner_companies` MODIFY COLUMN `cnpj` VARCHAR(18) NULL;

CREATE TABLE IF NOT EXISTS `registration_documents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `document` VARCHAR(18) NOT NULL,
  `ownerType` VARCHAR(20) NOT NULL,
  `ownerId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `registration_documents_document_ownerType_unique` (`document`,`ownerType`)
);

-- Migra instalações antigas do índice global para a unicidade por categoria.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `registration_documents` ADD UNIQUE KEY `registration_documents_document_ownerType_unique` (`document`,`ownerType`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='registration_documents' AND INDEX_NAME='registration_documents_document_ownerType_unique'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `registration_documents` DROP INDEX `registration_documents_document_unique`', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='registration_documents' AND INDEX_NAME='registration_documents_document_unique'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

INSERT IGNORE INTO `registration_documents` (`document`, `ownerType`, `ownerId`)
SELECT `document`, 'client', `id` FROM `clients` WHERE `document` IS NOT NULL AND TRIM(`document`) <> '';
INSERT IGNORE INTO `registration_documents` (`document`, `ownerType`, `ownerId`)
SELECT `cnpj`, 'partner', `id` FROM `partner_companies` WHERE `cnpj` IS NOT NULL AND TRIM(`cnpj`) <> '';

-- Bloqueia qualquer transmissão MicroBus real fora de sistemas marcados explicitamente como bancada.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN remoteCommandLabEnabled TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'remoteCommandLabEnabled'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Compatibilidade com instalações antigas que usavam alarmEventId.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE incidents ADD COLUMN eventId INT NULL AFTER id',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'eventId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @legacy_event_id_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'alarmEventId'
);
SET @statement = IF(
  @legacy_event_id_exists > 0,
  'UPDATE incidents SET eventId = alarmEventId WHERE eventId IS NULL',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Equipes e agentes de Tático Móvel vinculados à empresa parceira.
CREATE TABLE IF NOT EXISTS tactical_mobiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnerCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  vehicle VARCHAR(120),
  plate VARCHAR(12),
  notes TEXT,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Coluna de criação usada ao finalizar ocorrências.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE occurrences ADD COLUMN createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'occurrences' AND COLUMN_NAME = 'createdAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Colunas necessárias ao login próprio e ao vínculo de usuários Parceiros.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN password VARCHAR(255)',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN partnerId INT',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'users' AND COLUMN_NAME = 'partnerId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','supervisor','operator','partner') NOT NULL DEFAULT 'operator';

ALTER TABLE incidents MODIFY COLUMN status ENUM('waiting','attending','observing','dispatched','maintenance','closed') NOT NULL DEFAULT 'waiting';

-- Colunas dos contatos utilizadas pelo cadastro atualizado.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE client_contacts ADD COLUMN priority INT NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'client_contacts' AND COLUMN_NAME = 'priority'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE client_contacts ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'client_contacts' AND COLUMN_NAME = 'isActive'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Contatos passam a pertencer ao sistema de alarme para que um cliente possa
-- manter listas operacionais independentes em cada central.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE client_contacts ADD COLUMN alarmSystemId INT NULL AFTER clientId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'client_contacts' AND COLUMN_NAME = 'alarmSystemId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Campos adicionados ao cadastro de usuários programados nas centrais.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN phone VARCHAR(20) NULL AFTER name',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'phone'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER phone',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'isActive'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Credenciais dos usuários programados no painel para consulta durante o atendimento.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN password VARCHAR(50) NULL AFTER phone',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'password'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN counterPassword VARCHAR(50) NULL AFTER password',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'counterPassword'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN coercionPassword VARCHAR(50) NULL AFTER counterPassword',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'coercionPassword'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Preserva os contatos já cadastrados: cada contato legado é atribuído ao
-- primeiro sistema cadastrado do seu cliente. Clientes sem sistema permanecem
-- sem vínculo até que a primeira central seja criada.
UPDATE client_contacts contacts
INNER JOIN (
  SELECT clientId, MIN(id) AS firstSystemId
  FROM alarm_systems
  GROUP BY clientId
) systems ON systems.clientId = contacts.clientId
SET contacts.alarmSystemId = systems.firstSystemId
WHERE contacts.alarmSystemId IS NULL;

-- Identificadores físicos e lógicos do painel de alarme.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN imeiGprs VARCHAR(6)',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'imeiGprs'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN isepId VARCHAR(4)',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'isepId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN serialNumber VARCHAR(10)',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'serialNumber'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'CREATE UNIQUE INDEX alarm_systems_serial_number_unique ON alarm_systems (serialNumber)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND INDEX_NAME = 'alarm_systems_serial_number_unique'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Campos para registrar eventos finalizados automaticamente.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_events ADD COLUMN autoFinalized TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_events' AND COLUMN_NAME = 'autoFinalized'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_events ADD COLUMN autoFinalizationReason VARCHAR(255)',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_events' AND COLUMN_NAME = 'autoFinalizationReason'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Feriados nacionais/municipais e códigos Contact ID com qualifier.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    "ALTER TABLE partner_holidays ADD COLUMN type ENUM('nacional','municipal') NOT NULL DEFAULT 'municipal'",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'partner_holidays' AND COLUMN_NAME = 'type'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    "ALTER TABLE contact_id_codes ADD COLUMN qualifier ENUM('E','R','both') NOT NULL DEFAULT 'E'",
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'contact_id_codes' AND COLUMN_NAME = 'qualifier'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE contact_id_codes ADD COLUMN isUniversal TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'contact_id_codes' AND COLUMN_NAME = 'isUniversal'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Amplia a enumeração para os eventos analíticos das centrais JFL atuais.
ALTER TABLE contact_id_codes
  MODIFY COLUMN category ENUM('alarm','restore','fault','arm_disarm','test','system','access','analytics') NOT NULL DEFAULT 'alarm';

-- Dados operacionais complementares de cliente, comunicação móvel e condomínio.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clients ADD COLUMN propertyType ENUM(''residence'',''company'',''condominium'') NOT NULL DEFAULT ''residence'' AFTER type',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'propertyType'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN simCardNumber VARCHAR(50) NULL AFTER imeiGprs',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'simCardNumber'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN simPhoneNumber VARCHAR(30) NULL AFTER simCardNumber',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'simPhoneNumber'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_users ADD COLUMN apartmentNumber VARCHAR(30) NULL AFTER name',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_users' AND COLUMN_NAME = 'apartmentNumber'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT 'Atualização de schema concluída sem apagar dados.' AS resultado;

CREATE TABLE IF NOT EXISTS system_technical_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO system_technical_accounts (account, name, description, isActive)
VALUES ('0000', 'Conta do Sistema', 'Conta técnica para eventos recebidos sem identificação de cliente ou de central cadastrada.', 1);

-- Período programado de manutenção do sistema e prazo de observação da ocorrência.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN maintenanceStartAt TIMESTAMP NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'maintenanceStartAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN maintenanceEndAt TIMESTAMP NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'maintenanceEndAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN maintenanceNotes TEXT',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'maintenanceNotes'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN maintenanceOperatorId INT',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'maintenanceOperatorId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE incidents ADD COLUMN observationUntil TIMESTAMP NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'observationUntil'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Campos usados pelas filas de atendimento tático e observação.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE incidents ADD COLUMN dispatchedAt TIMESTAMP NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'incidents' AND COLUMN_NAME = 'dispatchedAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Um evento pode ter mais de um atendimento independente vinculado ao mesmo eventId.
-- A chave deve ser não única; a conversão é aplicada abaixo de forma compatível.

-- Métricas de supervisão por Keep Alive. Não alteram nem removem dados existentes.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN lastKeepAliveAt TIMESTAMP NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'lastKeepAliveAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN lastKeepAliveIntervalMs INT NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'lastKeepAliveIntervalMs'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

CREATE TABLE IF NOT EXISTS system_keep_alive_samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  brand VARCHAR(30) NOT NULL,
  receivedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  intervalMs INT NULL,
  INDEX system_keep_alive_samples_system_received (alarmSystemId, receivedAt)
);

-- Cada período contínuo sem Keep Alive gera no máximo uma ocorrência.
CREATE TABLE IF NOT EXISTS system_disconnect_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  outageStartedAt TIMESTAMP NOT NULL,
  detectedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eventId INT NULL,
  incidentId INT NULL,
  restoredAt TIMESTAMP NULL,
  restoredKeepAliveAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY system_disconnect_alerts_system_outage_unique (alarmSystemId, outageStartedAt)
);

-- Histórico imutável de comandos remotos; o primeiro uso é somente simulação.
CREATE TABLE IF NOT EXISTS alarm_remote_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  incidentId INT NULL,
  operatorId INT NOT NULL,
  brand VARCHAR(30) NOT NULL,
  commandType VARCHAR(40) NOT NULL,
  transportMode VARCHAR(20) NOT NULL DEFAULT 'simulation',
  status VARCHAR(30) NOT NULL DEFAULT 'simulated',
  `partition` INT NULL,
  zoneNumber INT NULL,
  pgmNumber INT NULL,
  reason TEXT NOT NULL,
  commandPayload TEXT NOT NULL,
  responsePayload TEXT NULL,
  confirmedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX alarm_remote_commands_system_created (alarmSystemId, createdAt),
  INDEX alarm_remote_commands_incident (incidentId)
);

-- Rastreabilidade do evento Contact ID gerado por comando remoto confirmado.
-- Os campos são somente referências e códigos técnicos; nunca armazenam senha.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_events ADD COLUMN remoteCommandId INT NULL AFTER alarmSystemId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_events' AND COLUMN_NAME = 'remoteCommandId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_remote_commands ADD COLUMN technicalUserCode VARCHAR(20) NULL AFTER operatorId',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_commands' AND COLUMN_NAME = 'technicalUserCode'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_remote_commands ADD COLUMN panelConfirmedAt TIMESTAMP NULL AFTER responsePayload',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_commands' AND COLUMN_NAME = 'panelConfirmedAt'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_remote_commands ADD COLUMN remoteEventId INT NULL AFTER panelConfirmedAt',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_commands' AND COLUMN_NAME = 'remoteEventId'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Credenciais técnicas de painel para comando remoto. O segredo chega cifrado
-- pelo servidor e não é exposto em consultas, eventos ou histórico operacional.
CREATE TABLE IF NOT EXISTS alarm_remote_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  credentialKind VARCHAR(40) NOT NULL,
  technicalUserCode VARCHAR(20) NULL,
  encryptedSecret TEXT NOT NULL,
  updatedBy INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY alarm_remote_credentials_system_kind_unique (alarmSystemId, credentialKind)
);

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_remote_credentials ADD COLUMN technicalUserCode VARCHAR(20) NULL AFTER credentialKind',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_credentials' AND COLUMN_NAME = 'technicalUserCode'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @remote_credentials_legacy_unique_index = (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_credentials'
    AND INDEX_NAME IN ('alarm_remote_credentials_system_unique', 'alarm_remote_credentials_alarmSystemId_unique')
  LIMIT 1
);
SET @statement = IF(
  @remote_credentials_legacy_unique_index IS NOT NULL,
  CONCAT('ALTER TABLE alarm_remote_credentials DROP INDEX `', @remote_credentials_legacy_unique_index, '`'),
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'CREATE UNIQUE INDEX alarm_remote_credentials_system_kind_unique ON alarm_remote_credentials (alarmSystemId, credentialKind)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_remote_credentials' AND INDEX_NAME = 'alarm_remote_credentials_system_kind_unique'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Configuração individual de Keep Alive para cada sistema de alarme.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveMonitoringEnabled TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveMonitoringEnabled'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveExpectedIntervalSeconds INT NOT NULL DEFAULT 60',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveExpectedIntervalSeconds'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveFailureEventEnabled TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveFailureEventEnabled'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveOfflineAfterMinutes INT NOT NULL DEFAULT 5',
    'ALTER TABLE alarm_systems MODIFY COLUMN keepAliveOfflineAfterMinutes INT NOT NULL DEFAULT 5'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveOfflineAfterMinutes'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveDisconnectAlertEnabled TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveDisconnectAlertEnabled'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveRepeatAlertEnabled TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveRepeatAlertEnabled'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveRepeatAlertEveryMinutes INT NOT NULL DEFAULT 60',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveRepeatAlertEveryMinutes'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

UPDATE alarm_systems
SET keepAliveOfflineAfterMinutes = 5
WHERE keepAliveOfflineAfterMinutes IS NULL OR keepAliveOfflineAfterMinutes < 1;

-- Carga idempotente dos códigos Contact ID, incluindo tabelas JFL e Intelbras.
SOURCE deploy/seed_contact_ids.sql;

-- Corrige apenas a descrição legada de eventos Intelbras 403 que foram
-- persistidos como não cadastrados; rawData e demais campos de auditoria ficam intactos.
UPDATE alarm_events
SET description = CASE
  WHEN qualifier = 'E' THEN 'Auto-desativação (Desarme automático)'
  WHEN qualifier = 'R' THEN 'Auto-ativação (Arme automático)'
  ELSE description
END
WHERE UPPER(TRIM(COALESCE(brand, ''))) = 'INTELBRAS'
  AND eventCode = '403'
  AND qualifier IN ('E', 'R')
  AND description LIKE 'EVENTO NÃO CADASTRADO%';

-- Converter a tabela antiga (uma linha por dia) para uma agenda semanal por central.
-- A tabela legada é preservada como backup e os horários são agrupados sem perda.
SET @statement = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules' AND COLUMN_NAME = 'dayOfWeek') > 0
    AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules' AND COLUMN_NAME = 'mondayArm') = 0
    AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules_legacy') = 0,
    'RENAME TABLE `alarm_schedules` TO `alarm_schedules_legacy`',
    'SELECT 1'
  )
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

CREATE TABLE IF NOT EXISTS `alarm_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alarmSystemId` int NOT NULL,
  `partition` int NOT NULL DEFAULT 1,
  `name` varchar(255) NULL,
  `mondayArm` varchar(5) NULL, `mondayDisarm` varchar(5) NULL,
  `tuesdayArm` varchar(5) NULL, `tuesdayDisarm` varchar(5) NULL,
  `wednesdayArm` varchar(5) NULL, `wednesdayDisarm` varchar(5) NULL,
  `thursdayArm` varchar(5) NULL, `thursdayDisarm` varchar(5) NULL,
  `fridayArm` varchar(5) NULL, `fridayDisarm` varchar(5) NULL,
  `saturdayArm` varchar(5) NULL, `saturdayDisarm` varchar(5) NULL,
  `sundayArm` varchar(5) NULL, `sundayDisarm` varchar(5) NULL,
  `holidayArm` varchar(5) NULL, `holidayDisarm` varchar(5) NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

SET @statement = (
  SELECT IF(COUNT(*) > 0,
    'INSERT INTO `alarm_schedules` (`alarmSystemId`,`partition`,`name`,`mondayArm`,`mondayDisarm`,`tuesdayArm`,`tuesdayDisarm`,`wednesdayArm`,`wednesdayDisarm`,`thursdayArm`,`thursdayDisarm`,`fridayArm`,`fridayDisarm`,`saturdayArm`,`saturdayDisarm`,`sundayArm`,`sundayDisarm`,`isActive`,`createdAt`) SELECT grouped.`alarmSystemId`,1,''Agenda operacional'',grouped.`mondayArm`,grouped.`mondayDisarm`,grouped.`tuesdayArm`,grouped.`tuesdayDisarm`,grouped.`wednesdayArm`,grouped.`wednesdayDisarm`,grouped.`thursdayArm`,grouped.`thursdayDisarm`,grouped.`fridayArm`,grouped.`fridayDisarm`,grouped.`saturdayArm`,grouped.`saturdayDisarm`,grouped.`sundayArm`,grouped.`sundayDisarm`,grouped.`isActive`,grouped.`createdAt` FROM (SELECT `alarmSystemId`,MAX(CASE WHEN `dayOfWeek`=''mon'' THEN `armTime` END) AS `mondayArm`,MAX(CASE WHEN `dayOfWeek`=''mon'' THEN `disarmTime` END) AS `mondayDisarm`,MAX(CASE WHEN `dayOfWeek`=''tue'' THEN `armTime` END) AS `tuesdayArm`,MAX(CASE WHEN `dayOfWeek`=''tue'' THEN `disarmTime` END) AS `tuesdayDisarm`,MAX(CASE WHEN `dayOfWeek`=''wed'' THEN `armTime` END) AS `wednesdayArm`,MAX(CASE WHEN `dayOfWeek`=''wed'' THEN `disarmTime` END) AS `wednesdayDisarm`,MAX(CASE WHEN `dayOfWeek`=''thu'' THEN `armTime` END) AS `thursdayArm`,MAX(CASE WHEN `dayOfWeek`=''thu'' THEN `disarmTime` END) AS `thursdayDisarm`,MAX(CASE WHEN `dayOfWeek`=''fri'' THEN `armTime` END) AS `fridayArm`,MAX(CASE WHEN `dayOfWeek`=''fri'' THEN `disarmTime` END) AS `fridayDisarm`,MAX(CASE WHEN `dayOfWeek`=''sat'' THEN `armTime` END) AS `saturdayArm`,MAX(CASE WHEN `dayOfWeek`=''sat'' THEN `disarmTime` END) AS `saturdayDisarm`,MAX(CASE WHEN `dayOfWeek`=''sun'' THEN `armTime` END) AS `sundayArm`,MAX(CASE WHEN `dayOfWeek`=''sun'' THEN `disarmTime` END) AS `sundayDisarm`,MAX(`isActive`) AS `isActive`,MIN(`createdAt`) AS `createdAt` FROM `alarm_schedules_legacy` GROUP BY `alarmSystemId`) grouped WHERE NOT EXISTS (SELECT 1 FROM `alarm_schedules` current_schedule WHERE current_schedule.`alarmSystemId`=grouped.`alarmSystemId` AND current_schedule.`partition`=1)',
    'SELECT 1'
  )
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules_legacy'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Agenda operacional: horários próprios para feriados de cada conta.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `alarm_schedules` ADD `holidayArm` varchar(5) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules' AND COLUMN_NAME = 'holidayArm'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `alarm_schedules` ADD `holidayDisarm` varchar(5) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_schedules' AND COLUMN_NAME = 'holidayDisarm'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Exceções por data são vinculadas à central e preservam solicitante, motivo e operador.
CREATE TABLE IF NOT EXISTS `alarm_schedule_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alarmSystemId` int NOT NULL,
  `overrideDate` varchar(10) NOT NULL,
  `mode` enum('suspended','override') NOT NULL,
  `armAt` varchar(5) NULL,
  `disarmAt` varchar(5) NULL,
  `requester` varchar(255) NOT NULL,
  `reason` text NOT NULL,
  `createdBy` int NOT NULL,
  `updatedBy` int NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `alarm_schedule_overrides_system_date_unique` (`alarmSystemId`,`overrideDate`)
);

CREATE TABLE IF NOT EXISTS `alarm_schedule_override_audit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `overrideId` int NULL,
  `alarmSystemId` int NOT NULL,
  `overrideDate` varchar(10) NOT NULL,
  `action` enum('created','updated','cancelled') NOT NULL,
  `operatorId` int NOT NULL,
  `operatorName` varchar(255) NOT NULL,
  `requester` varchar(255) NOT NULL,
  `reason` text NOT NULL,
  `previousSettings` text NULL,
  `newSettings` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- Alertas persistentes e deduplicados para arme não executado e desarme fora da agenda.
CREATE TABLE IF NOT EXISTS `alarm_schedule_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alarmSystemId` int NOT NULL,
  `scheduleId` int NULL,
  `sourceEventId` int NULL,
  `alertType` enum('missed_arm','unexpected_disarm') NOT NULL,
  `dedupeKey` varchar(191) NOT NULL,
  `alertDate` varchar(10) NOT NULL,
  `expectedAt` timestamp NULL,
  `detectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `currentState` varchar(20) NULL,
  `status` enum('active','acknowledged','resolved') NOT NULL DEFAULT 'active',
  `acknowledgedBy` int NULL,
  `acknowledgedAt` timestamp NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `alarm_schedule_alerts_dedupeKey_unique` (`dedupeKey`)
);


-- Sessão exclusiva por usuário; armazena apenas o hash do token do navegador.
CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_sessions_tokenHash_unique` (`tokenHash`),
  KEY `auth_sessions_user_active_idx` (`userId`,`revokedAt`,`expiresAt`)
);

-- Colunas aditivas de atendimento; preservar todos os incidentes existentes.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `incidents` ADD `parentIncidentId` int NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND COLUMN_NAME='parentIncidentId'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `incidents` ADD `version` int NOT NULL DEFAULT 0', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND COLUMN_NAME='version'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `incidents` ADD `claimedAt` timestamp NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND COLUMN_NAME='claimedAt'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

-- Remover unicidade antiga por evento para permitir um atendimento independente vinculado ao original.
SET @statement = (
  SELECT IF(COUNT(*) > 0, 'ALTER TABLE `incidents` DROP INDEX `incidents_event_id_unique`', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND INDEX_NAME='incidents_event_id_unique'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `incidents_event_id_idx` ON `incidents` (`eventId`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND INDEX_NAME='incidents_event_id_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'CREATE INDEX `incidents_parent_status_idx` ON `incidents` (`parentIncidentId`,`status`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='incidents' AND INDEX_NAME='incidents_parent_status_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

CREATE TABLE IF NOT EXISTS `incident_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `incidentId` int NOT NULL,
  `parentIncidentId` int NULL,
  `operatorId` int NULL,
  `operatorName` varchar(255) NOT NULL,
  `action` varchar(40) NOT NULL,
  `statusBefore` varchar(24) NULL,
  `statusAfter` varchar(24) NULL,
  `note` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `incident_history_incident_created_idx` (`incidentId`,`createdAt`)
);

SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `occurrences` ADD `incidentId` int NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='occurrences' AND COLUMN_NAME='incidentId'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `alarm_schedule_overrides` ADD `validFromAt` timestamp NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_schedule_overrides' AND COLUMN_NAME='validFromAt'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `alarm_schedule_overrides` ADD `validUntilAt` timestamp NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_schedule_overrides' AND COLUMN_NAME='validUntilAt'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

-- Comandos físicos Compatec de Arme/Desarme também são ocorrências informativas do relatório.
-- A chave no texto de auditoria torna esta carga retroativa segura para reexecução.
INSERT INTO `occurrences` (
  `account`, `eventCode`, `qualifier`, `description`, `priority`, `brand`,
  `clientId`, `clientName`, `systemId`, `partnerCompanyId`, `operatorId`, `operatorName`,
  `status`, `observations`, `logs`, `attendingTimeMs`, `sendEmail`, `sendPush`,
  `eventReceivedAt`, `startedAt`, `finalizedAt`, `createdAt`
)
SELECT
  COALESCE(s.`account`, '0000'),
  'REMOTE',
  NULL,
  CONCAT(
    CASE rc.`commandType` WHEN 'arm' THEN 'Arme remoto via PoliceCentral' ELSE 'Desarme remoto via PoliceCentral' END,
    ' — ',
    CASE rc.`status`
      WHEN 'queued' THEN 'Solicitado; aguardando envio à central.'
      WHEN 'waiting_connection' THEN 'Ainda não enviado; aguardando conexão autenticada da central.'
      WHEN 'sent' THEN 'Enviado à central; aguardando confirmação.'
      WHEN 'responded' THEN 'Confirmado pela central.'
      WHEN 'failed' THEN 'Falha; a central não confirmou o comando.'
      WHEN 'expired' THEN 'Expirado sem envio à central.'
      WHEN 'cancelled' THEN 'Cancelado; não enviado à central.'
      ELSE CONCAT('Status do comando: ', rc.`status`, '.')
    END
  ),
  'low',
  COALESCE(s.`brand`, rc.`brand`),
  COALESCE(s.`clientId`, i.`clientId`),
  COALESCE(NULLIF(c.`fantasyName`, ''), c.`name`),
  s.`id`,
  c.`partnerCompanyId`,
  rc.`operatorId`,
  COALESCE(u.`name`, 'Operador autenticado'),
  'finalized',
  CONCAT(
    '[COMANDO REMOTO #', rc.`id`, ']', CHAR(10),
    'Operação: ', CASE rc.`commandType` WHEN 'arm' THEN 'Arme remoto via PoliceCentral' ELSE 'Desarme remoto via PoliceCentral' END, CHAR(10),
    'Origem: PoliceCentral (Central de Monitoramento)', CHAR(10),
    'Operador: ', COALESCE(u.`name`, 'Operador autenticado'), CHAR(10),
    'Motivo: ', rc.`reason`, CHAR(10),
    'Resultado: ', CASE rc.`status`
      WHEN 'queued' THEN 'Solicitado; aguardando envio à central.'
      WHEN 'waiting_connection' THEN 'Ainda não enviado; aguardando conexão autenticada da central.'
      WHEN 'sent' THEN 'Enviado à central; aguardando confirmação.'
      WHEN 'responded' THEN 'Confirmado pela central.'
      WHEN 'failed' THEN 'Falha; a central não confirmou o comando.'
      WHEN 'expired' THEN 'Expirado sem envio à central.'
      WHEN 'cancelled' THEN 'Cancelado; não enviado à central.'
      ELSE CONCAT('Status do comando: ', rc.`status`, '.')
    END,
    IF(rc.`responsePayload` IS NULL OR rc.`responsePayload` = '', '', CONCAT(CHAR(10), 'Resposta da central: ', rc.`responsePayload`)),
    CHAR(10), 'Auditoria do comando: #', rc.`id`
  ),
  JSON_ARRAY(CONCAT('[', DATE_FORMAT(COALESCE(rc.`panelConfirmedAt`, rc.`executedAt`, rc.`updatedAt`, rc.`createdAt`), '%H:%i:%s'), '] ',
    CASE rc.`commandType` WHEN 'arm' THEN 'Arme' ELSE 'Desarme' END, ' remoto via PoliceCentral — ', rc.`status`)),
  0,
  0,
  0,
  COALESCE(rc.`panelConfirmedAt`, rc.`executedAt`, rc.`updatedAt`, rc.`createdAt`),
  rc.`createdAt`,
  COALESCE(rc.`panelConfirmedAt`, rc.`executedAt`, rc.`updatedAt`, rc.`createdAt`),
  rc.`createdAt`
FROM `alarm_remote_commands` rc
LEFT JOIN `alarm_systems` s ON s.`id` = rc.`alarmSystemId`
LEFT JOIN `incidents` i ON i.`id` = rc.`incidentId`
LEFT JOIN `clients` c ON c.`id` = COALESCE(s.`clientId`, i.`clientId`)
LEFT JOIN `users` u ON u.`id` = rc.`operatorId`
WHERE rc.`brand` = 'COMPATEC'
  AND rc.`transportMode` = 'microbus_compatec'
  AND rc.`commandType` IN ('arm', 'disarm')
  AND NOT EXISTS (
    SELECT 1 FROM `occurrences` o
    WHERE o.`observations` LIKE CONCAT('%[COMANDO REMOTO #', rc.`id`, ']%')
  );

-- Escala e presença operacional; todas as tabelas são aditivas e preservam histórico.
CREATE TABLE IF NOT EXISTS `operator_attendance_records` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `authSessionId` BIGINT NOT NULL,
  `userId` INT NOT NULL,
  `operatorName` VARCHAR(255) NOT NULL,
  `role` VARCHAR(30) NOT NULL,
  `loginMethod` VARCHAR(64) NULL,
  `loginAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logoutAt` TIMESTAMP NULL,
  `logoutReason` ENUM('logout','session_replaced','session_expired','revoked') NULL,
  `shiftCode` ENUM('first','second','third') NULL,
  `workDate` VARCHAR(10) NULL,
  `scheduledStartAt` TIMESTAMP NULL,
  `scheduledEndAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `operator_attendance_records_authSessionId_unique` (`authSessionId`),
  KEY `operator_attendance_user_login_idx` (`userId`,`loginAt`),
  KEY `operator_attendance_open_idx` (`logoutAt`,`userId`)
);

CREATE TABLE IF NOT EXISTS `operator_shift_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `operatorName` VARCHAR(255) NOT NULL,
  `shiftCode` ENUM('first','second','third') NOT NULL,
  `cycleAnchorDate` VARCHAR(10) NOT NULL,
  `effectiveFromDate` VARCHAR(10) NOT NULL,
  `effectiveUntilDate` VARCHAR(10) NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `changeReason` VARCHAR(500) NULL,
  `changedBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operator_shift_assignments_user_effective_idx` (`userId`,`effectiveFromDate`,`effectiveUntilDate`)
);

SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_shift_assignments` ADD COLUMN `isActive` TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_shift_assignments' AND COLUMN_NAME='isActive'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

CREATE TABLE IF NOT EXISTS `operator_shift_exceptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `operatorName` VARCHAR(255) NOT NULL,
  `workDate` VARCHAR(10) NOT NULL,
  `kind` ENUM('work','off') NOT NULL,
  `shiftCode` ENUM('first','second','third') NULL,
  `pairedUserId` INT NULL,
  `pairedOperatorName` VARCHAR(255) NULL,
  `reason` VARCHAR(500) NOT NULL,
  `createdBy` INT NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelledAt` TIMESTAMP NULL,
  `cancelledBy` INT NULL,
  PRIMARY KEY (`id`),
  KEY `operator_shift_exceptions_user_date_active_idx` (`userId`,`workDate`,`isActive`)
);

CREATE TABLE IF NOT EXISTS `operator_shift_messages` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `fromUserId` INT NOT NULL,
  `fromOperatorName` VARCHAR(255) NOT NULL,
  `fromAttendanceId` BIGINT NOT NULL,
  `toUserId` INT NOT NULL,
  `toOperatorName` VARCHAR(255) NOT NULL,
  `incidentId` INT NULL,
  `account` VARCHAR(20) NULL,
  `message` TEXT NOT NULL,
  `isCurrent` BOOLEAN NOT NULL DEFAULT TRUE,
  `readAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operator_shift_message_inbox_idx` (`toUserId`,`readAt`,`createdAt`),
  KEY `operator_shift_message_incident_idx` (`incidentId`,`createdAt`),
  KEY `operator_shift_message_active_incident_idx` (`incidentId`,`isCurrent`,`toUserId`,`createdAt`)
);

-- Mensagens de passagem associadas a incidente permanecem ativas até o atendimento ser finalizado.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_shift_messages` ADD COLUMN `isCurrent` BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_shift_messages' AND COLUMN_NAME='isCurrent'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_shift_messages` ADD INDEX `operator_shift_message_active_incident_idx` (`incidentId`,`isCurrent`,`toUserId`,`createdAt`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_shift_messages' AND INDEX_NAME='operator_shift_message_active_incident_idx'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
UPDATE `operator_shift_messages` SET `isCurrent` = FALSE WHERE `incidentId` IS NOT NULL;
UPDATE `operator_shift_messages` AS m
JOIN (
  SELECT message.`incidentId`, MAX(message.`id`) AS `latestId`
  FROM `operator_shift_messages` AS message
  JOIN `incidents` AS i ON i.`id` = message.`incidentId`
  WHERE i.`status` IN ('waiting','attending','observing','dispatched','maintenance')
  GROUP BY message.`incidentId`
) AS latest ON latest.`latestId` = m.`id`
SET m.`isCurrent` = TRUE;

CREATE TABLE IF NOT EXISTS `operator_shift_reminders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `attendanceId` BIGINT NOT NULL,
  `userId` INT NOT NULL,
  `operatorName` VARCHAR(255) NOT NULL,
  `shiftCode` ENUM('first','second','third') NOT NULL,
  `workDate` VARCHAR(10) NOT NULL,
  `minutesBefore` INT NOT NULL,
  `shiftEndsAt` TIMESTAMP NOT NULL,
  `sentAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `acknowledgedAt` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `operator_shift_reminder_unique` (`attendanceId`,`workDate`,`shiftCode`,`minutesBefore`),
  KEY `operator_shift_reminder_pending_idx` (`userId`,`acknowledgedAt`,`sentAt`)
);

-- Expande os enums preservando todas as escalas, exceções, presenças e avisos existentes.
ALTER TABLE `operator_shift_assignments` MODIFY COLUMN `shiftCode` ENUM('first','second','third','commercial') NOT NULL;
ALTER TABLE `operator_shift_exceptions` MODIFY COLUMN `shiftCode` ENUM('first','second','third','commercial') NULL;
ALTER TABLE `operator_attendance_records` MODIFY COLUMN `shiftCode` ENUM('first','second','third','commercial') NULL;
ALTER TABLE `operator_shift_reminders` MODIFY COLUMN `shiftCode` ENUM('first','second','third','commercial') NOT NULL;

-- Sessões que já estavam abertas no momento da atualização: conserva o login real.
-- Não transforma revogações antigas em logoff voluntário e não cria escala fictícia.
INSERT IGNORE INTO `operator_attendance_records`
  (`authSessionId`,`userId`,`operatorName`,`role`,`loginMethod`,`loginAt`)
SELECT s.`id`, s.`userId`, COALESCE(u.`name`, CONCAT('Operador ', s.`userId`)),
       u.`role`, u.`loginMethod`, s.`createdAt`
FROM `auth_sessions` s
JOIN `users` u ON u.`id` = s.`userId`
WHERE s.`revokedAt` IS NULL AND s.`expiresAt` > CURRENT_TIMESTAMP
  AND u.`role` IN ('admin','supervisor','operator');

-- Dados de cliente/parceira e exceções de escala são aditivos; sem excluir dados.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `clients` ADD COLUMN `isPartnerHeadquarters` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='clients' AND COLUMN_NAME='isPartnerHeadquarters'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_attendance_records` ADD COLUMN `scheduleStatus` ENUM(''scheduled'',''outside_window'') NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_attendance_records' AND COLUMN_NAME='scheduleStatus'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_attendance_records` ADD COLUMN `outOfScheduleReason` ENUM(''scale_swap'',''double_shift'',''vacation_coverage'') NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_attendance_records' AND COLUMN_NAME='outOfScheduleReason'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `operator_attendance_records` ADD COLUMN `outOfScheduleDecisionAt` TIMESTAMP NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='operator_attendance_records' AND COLUMN_NAME='outOfScheduleDecisionAt'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;


-- Cadastros órfãos não podem representar cliente novo nem receber tráfego.
-- Preserva as linhas e eventos históricos; o cancelamento cobre somente comandos
-- que ainda não foram transmitidos. Exclusões futuras fazem a mesma limpeza no app.
SET @statement = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `alarm_systems` ADD COLUMN `retiredSerialNumber` VARCHAR(10) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='alarm_systems' AND COLUMN_NAME='retiredSerialNumber'
);
PREPARE migration_statement FROM @statement; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

UPDATE alarm_systems AS s
LEFT JOIN clients AS c ON c.id = s.clientId
SET s.isActive = 0,
    s.isOnline = 0,
    s.remoteCommandLabEnabled = 0,
    s.retiredSerialNumber = COALESCE(s.retiredSerialNumber, s.serialNumber),
    s.serialNumber = NULL
WHERE (c.id IS NULL OR c.isActive = 0)
  AND (s.isActive <> 0 OR s.isOnline <> 0 OR s.remoteCommandLabEnabled <> 0 OR s.serialNumber IS NOT NULL);

UPDATE alarm_remote_commands AS rc
INNER JOIN alarm_systems AS s ON s.id = rc.alarmSystemId
LEFT JOIN clients AS c ON c.id = s.clientId
SET rc.status = 'cancelled',
    rc.responsePayload = CONCAT_WS('\n', NULLIF(rc.responsePayload, ''), 'Comando cancelado: sistema sem cliente vinculado foi inativado antes da transmissão.')
WHERE (c.id IS NULL OR c.isActive = 0)
  AND rc.status IN ('queued', 'waiting_connection');

-- Intenção de inibir no próximo Arme Compatec, válida por 60s; não contém credenciais.
-- Não cria fila física nem modifica zonas do painel ao expirar.
CREATE TABLE IF NOT EXISTS compatec_zone_arm_selections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  zoneNumber INT NOT NULL,
  operatorId INT NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  armCommandId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY compatec_zone_arm_selection_system_zone_unique (alarmSystemId, zoneNumber),
  KEY compatec_zone_arm_selection_expiry_idx (alarmSystemId, expiresAt),
  KEY compatec_zone_arm_selection_command_idx (armCommandId)
);

-- Ficha cadastral de DVRs por cliente. Sem conexão ao equipamento; senha cifrada AES-256-GCM.
CREATE TABLE IF NOT EXISTS client_dvrs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  brand VARCHAR(100),
  model VARCHAR(150),
  firmwareVersion VARCHAR(100),
  serialNumber VARCHAR(150),
  host VARCHAR(255),
  tcpPort INT,
  udpPort INT,
  httpPort INT,
  rtspPort INT,
  httpsPort INT,
  serverPort INT,
  username VARCHAR(128) NOT NULL DEFAULT 'admin',
  encryptedPassword TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY client_dvrs_client_idx (clientId),
  KEY client_dvrs_serial_idx (serialNumber)
);
