-- Situação operacional do cliente monitorado.
-- Idempotente: pode ser executado mais de uma vez na VPS sem recriar as colunas.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monitoringStatus ENUM('active', 'blocked', 'suspended') NOT NULL DEFAULT 'active' AFTER isActive,
  ADD COLUMN IF NOT EXISTS monitoringStatusReason VARCHAR(255) NULL AFTER monitoringStatus,
  ADD COLUMN IF NOT EXISTS monitoringStatusUntil TIMESTAMP NULL AFTER monitoringStatusReason;

UPDATE clients
SET monitoringStatus = 'active'
WHERE monitoringStatus IS NULL OR monitoringStatus = '';
