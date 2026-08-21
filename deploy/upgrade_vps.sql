-- Police Central: atualização segura de banco para instalações existentes.
-- Execute: mysql police_monitor < deploy/upgrade_vps.sql
-- Este arquivo não apaga tabelas nem cadastros.

SET @schema_name = DATABASE();

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

-- Garante que um evento possua uma única ocorrência persistida.
SET @statement = (
  SELECT IF(COUNT(*) = 0,
    'CREATE UNIQUE INDEX incidents_event_id_unique ON incidents (eventId)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'incidents' AND INDEX_NAME = 'incidents_event_id_unique'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

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
    'ALTER TABLE alarm_systems ADD COLUMN keepAliveOfflineAfterMinutes INT NOT NULL DEFAULT 5',
    'ALTER TABLE alarm_systems MODIFY COLUMN keepAliveOfflineAfterMinutes INT NOT NULL DEFAULT 5'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'alarm_systems' AND COLUMN_NAME = 'keepAliveOfflineAfterMinutes'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

UPDATE alarm_systems
SET keepAliveOfflineAfterMinutes = 5;

-- Carga idempotente dos códigos Contact ID, incluindo a tabela JFL.
SOURCE deploy/seed_contact_ids.sql;
