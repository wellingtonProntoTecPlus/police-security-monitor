-- Police Central: atualização segura de banco para instalações existentes.
-- Execute: mysql police_monitor < deploy/upgrade_vps.sql
-- Este arquivo não apaga tabelas nem cadastros.

SET @schema_name = DATABASE();

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

SELECT 'Atualização de schema concluída sem apagar dados.' AS resultado;
