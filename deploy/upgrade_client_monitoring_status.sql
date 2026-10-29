-- Situação operacional do cliente monitorado.
-- Compatível com MySQL/MariaDB que não aceitam ADD COLUMN IF NOT EXISTS.
-- Idempotente: pode ser executado mais de uma vez na VPS sem recriar as colunas.
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clients ADD COLUMN monitoringStatus ENUM(''active'', ''blocked'', ''suspended'') NOT NULL DEFAULT ''active'' AFTER isActive',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'clients' AND column_name = 'monitoringStatus'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clients ADD COLUMN monitoringStatusReason VARCHAR(255) NULL AFTER monitoringStatus',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'clients' AND column_name = 'monitoringStatusReason'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE clients ADD COLUMN monitoringStatusUntil TIMESTAMP NULL AFTER monitoringStatusReason',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'clients' AND column_name = 'monitoringStatusUntil'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE clients
SET monitoringStatus = 'active'
WHERE monitoringStatus IS NULL OR monitoringStatus = '';
