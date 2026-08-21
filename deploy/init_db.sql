-- Police Central - Script de inicialização do banco MySQL (VPS)
-- Rodar: mysql police_monitor < deploy/init_db.sql
-- ATENÇÃO: Usa IF NOT EXISTS para não apagar dados existentes

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user','admin','supervisor','operator','partner') NOT NULL DEFAULT 'operator',
  partnerId INT,
  password VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS managing_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zipCode VARCHAR(10),
  logoUrl TEXT,
  primaryColor VARCHAR(7) DEFAULT '#1a56db',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  managingCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zipCode VARCHAR(10),
  logoUrl TEXT,
  primaryColor VARCHAR(7) DEFAULT '#1a56db',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnerCompanyId INT NOT NULL,
  type ENUM('pf','pj') NOT NULL,
  name VARCHAR(255) NOT NULL,
  fantasyName VARCHAR(255),
  document VARCHAR(20),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  number VARCHAR(20),
  complement VARCHAR(100),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(2),
  zipCode VARCHAR(10),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  notes TEXT,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  alarmSystemId INT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  role VARCHAR(100),
  password VARCHAR(100),
  counterPassword VARCHAR(100),
  coercionPassword VARCHAR(100),
  sortOrder INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_systems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  account VARCHAR(10) NOT NULL,
  brand ENUM('JFL','INTELBRAS','VETTI','COMPATEC','RADIOENGE','VIAWEB') NOT NULL,
  model VARCHAR(100),
  firmwareVersion VARCHAR(50),
  communicationType VARCHAR(50),
  macAddress VARCHAR(20),
  imeiGprs VARCHAR(20),
  serialNumber VARCHAR(10),
  isepId VARCHAR(4),
  viawebCode VARCHAR(10),
  partitions INT DEFAULT 1,
  receiverPort INT,
  ipAddress VARCHAR(50),
  installDate VARCHAR(20),
  batteryDate VARCHAR(20),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  isOnline TINYINT(1) NOT NULL DEFAULT 0,
  lastCommunication TIMESTAMP,
  lastKeepAliveAt TIMESTAMP NULL,
  lastKeepAliveIntervalMs INT NULL,
  keepAliveMonitoringEnabled TINYINT(1) NOT NULL DEFAULT 1,
  keepAliveOfflineAfterMinutes INT NOT NULL DEFAULT 5,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_keep_alive_samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  brand VARCHAR(30) NOT NULL,
  receivedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  intervalMs INT NULL,
  INDEX system_keep_alive_samples_system_received (alarmSystemId, receivedAt)
);

CREATE TABLE IF NOT EXISTS alarm_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  zoneNumber INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  type ENUM('perimeter','internal','24h','fire','panic','medical') DEFAULT 'perimeter',
  partition INT DEFAULT 1,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  userNumber INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password VARCHAR(50),
  counterPassword VARCHAR(50),
  coercionPassword VARCHAR(50),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cameras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  alarmSystemId INT,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(100),
  model VARCHAR(100),
  rtspUrl TEXT,
  location VARCHAR(255),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_pgms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  pgmNumber INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'pulse',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  dayOfWeek ENUM('mon','tue','wed','thu','fri','sat','sun') NOT NULL,
  armTime VARCHAR(5),
  disarmTime VARCHAR(5),
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_procedures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  description TEXT NOT NULL,
  sortOrder INT DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnerCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  date VARCHAR(10) NOT NULL,
  type ENUM('nacional','municipal') NOT NULL DEFAULT 'municipal',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS managing_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  managingCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  date VARCHAR(10) NOT NULL,
  type ENUM('nacional','municipal') NOT NULL DEFAULT 'municipal',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT,
  account VARCHAR(10) NOT NULL,
  brand VARCHAR(50) NOT NULL,
  qualifier VARCHAR(2),
  eventCode VARCHAR(10) NOT NULL,
  `partition` VARCHAR(5),
  zoneUser VARCHAR(10),
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium',
  receiverPort INT,
  remoteIp VARCHAR(50),
  rawData TEXT,
  autoFinalized TINYINT(1) NOT NULL DEFAULT 0,
  autoFinalizationReason VARCHAR(255),
  receivedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_id_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  qualifier ENUM('E','R','both') NOT NULL DEFAULT 'E',
  fabricante VARCHAR(20) NOT NULL DEFAULT 'COMPATEC',
  isUniversal TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT,
  category ENUM('alarm','restore','fault','arm_disarm','test','system','access','analytics') NOT NULL DEFAULT 'alarm',
  priority ENUM('critical','high','medium','low') DEFAULT 'medium',
  tipo VARCHAR(20) NOT NULL DEFAULT 'alarme',
  cor VARCHAR(10) NOT NULL DEFAULT '#EF4444',
  abre_tela INT NOT NULL DEFAULT 1,
  fecha_automatico INT NOT NULL DEFAULT 0,
  fecha_com_restauracao INT NOT NULL DEFAULT 0,
  codigo_restauracao VARCHAR(10) DEFAULT '',
  tempo_espera_segundos INT NOT NULL DEFAULT 0,
  prioridade INT DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account VARCHAR(20) NOT NULL,
  eventCode VARCHAR(10) NOT NULL,
  qualifier VARCHAR(2),
  `partition` VARCHAR(5),
  zoneUser VARCHAR(10),
  description TEXT,
  priority VARCHAR(20),
  brand VARCHAR(50),
  clientId INT,
  clientName VARCHAR(255),
  systemId INT,
  partnerCompanyId INT,
  operatorId INT,
  operatorName VARCHAR(255),
  status VARCHAR(20) DEFAULT 'finalized',
  observations TEXT,
  logs TEXT,
  attendingTimeMs INT,
  sendEmail TINYINT(1) DEFAULT 0,
  sendPush TINYINT(1) DEFAULT 0,
  eventReceivedAt TIMESTAMP,
  startedAt TIMESTAMP,
  finalizedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId INT,
  alarmSystemId INT,
  clientId INT,
  operatorId INT,
  status ENUM('waiting','attending','observing','dispatched','maintenance','closed') NOT NULL DEFAULT 'waiting',
  priority ENUM('critical','high','medium','low') DEFAULT 'medium',
  notes TEXT,
  resolution TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closedAt TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finalizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'outros',
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- Códigos universais Contact ID
INSERT IGNORE INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
VALUES
('401','E','UNIVERSAL',1,'Desarme','desarme','#F97316',0,1,0,'',0,3,'arm_disarm','low'),
('401','R','UNIVERSAL',1,'Arme','arme','#10B981',0,1,0,'',0,3,'arm_disarm','low'),
('130','E','UNIVERSAL',1,'Disparo de Alarme - Zona/Setor','alarme','#EF4444',1,0,1,'130',0,1,'alarm','critical'),
('130','R','UNIVERSAL',1,'Restauração de Alarme - Zona/Setor','restauracao','#3B82F6',0,0,0,'',0,5,'restore','low'),
('602','E','UNIVERSAL',1,'Teste Periódico','teste','#6B7280',0,1,0,'',0,5,'test','low'),
('610','E','UNIVERSAL',1,'Teste Manual','teste','#6B7280',0,1,0,'',0,5,'test','low');

-- Carga idempotente das tabelas específicas de fabricante, incluindo JFL.
SOURCE deploy/seed_contact_ids.sql;
