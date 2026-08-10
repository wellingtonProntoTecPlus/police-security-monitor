CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user','admin','supervisor','operator') NOT NULL DEFAULT 'operator',
  partnerId INT,
  password VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS managing_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  zipCode VARCHAR(10),
  city VARCHAR(100),
  state VARCHAR(2),
  logoUrl TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  zipCode VARCHAR(10),
  city VARCHAR(100),
  state VARCHAR(2),
  logoUrl TEXT,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnerCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  fantasyName VARCHAR(255),
  document VARCHAR(20),
  documentType ENUM('cpf','cnpj') NOT NULL DEFAULT 'cpf',
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  number VARCHAR(20),
  complement VARCHAR(100),
  neighborhood VARCHAR(100),
  zipCode VARCHAR(10),
  city VARCHAR(100),
  state VARCHAR(2),
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  email VARCHAR(320),
  password VARCHAR(50),
  counterPassword VARCHAR(50),
  coercionPassword VARCHAR(50),
  priority INT NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_systems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  partnerCompanyId INT NOT NULL,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  version VARCHAR(50),
  account VARCHAR(20) NOT NULL,
  communicationType ENUM('ethernet','gprs','both') DEFAULT 'ethernet',
  macAddress VARCHAR(20),
  viawebCode VARCHAR(10),
  partitions INT NOT NULL DEFAULT 1,
  receiverIp VARCHAR(45),
  receiverPort INT,
  installDate DATE,
  batteryDate DATE,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  zoneNumber INT NOT NULL,
  name VARCHAR(255),
  type VARCHAR(50),
  `partition` INT DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  userNumber INT NOT NULL,
  name VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cameras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(100),
  rtspUrl TEXT,
  hlsUrl TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_id_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  qualifier ENUM('E','R','both') NOT NULL DEFAULT 'E',
  fabricante VARCHAR(20) NOT NULL DEFAULT 'UNIVERSAL',
  isUniversal TINYINT(1) NOT NULL DEFAULT 0,
  description VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) DEFAULT 'alarme',
  cor VARCHAR(10) DEFAULT '#EF4444',
  abre_tela BOOLEAN DEFAULT FALSE,
  fecha_automatico BOOLEAN DEFAULT FALSE,
  fecha_com_restauracao BOOLEAN DEFAULT FALSE,
  codigo_restauracao VARCHAR(10) DEFAULT '',
  tempo_espera_segundos INT DEFAULT 0,
  prioridade INT DEFAULT 3,
  category VARCHAR(50) DEFAULT 'alarm',
  priority VARCHAR(20) DEFAULT 'medium'
);

CREATE TABLE IF NOT EXISTS alarm_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT,
  account VARCHAR(10) NOT NULL,
  brand VARCHAR(50) NOT NULL,
  qualifier VARCHAR(5) NOT NULL,
  eventCode VARCHAR(10) NOT NULL,
  `partition` VARCHAR(5),
  zoneUser VARCHAR(10),
  description TEXT,
  priority ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
  receiverPort INT,
  remoteIp VARCHAR(45),
  rawData TEXT,
  receivedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_pgms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  pgmNumber INT NOT NULL,
  name VARCHAR(255),
  type VARCHAR(50),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alarm_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alarmSystemId INT NOT NULL,
  dayOfWeek ENUM('seg','ter','qua','qui','sex','sab','dom') NOT NULL,
  armTime VARCHAR(5),
  disarmTime VARCHAR(5),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_procedures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientId INT NOT NULL,
  description TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partnerCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS managing_holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  managingCompanyId INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId INT,
  alarmSystemId INT,
  clientId INT,
  operatorId INT,
  account VARCHAR(20),
  eventCode VARCHAR(10),
  eventDescription TEXT,
  observations TEXT,
  actionLog TEXT,
  attendTime INT,
  sentEmail BOOLEAN DEFAULT FALSE,
  sentPush BOOLEAN DEFAULT FALSE,
  finalizedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CÓDIGOS UNIVERSAIS CONTACT ID (aparecem em todas as abas)
-- ============================================================
INSERT IGNORE INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority) VALUES
('401', 'E', 'UNIVERSAL', 1, 'Desarme', 'desarme', '#F97316', 0, 1, 0, '', 0, 3, 'arm_disarm', 'low'),
('401', 'R', 'UNIVERSAL', 1, 'Arme', 'arme', '#10B981', 0, 1, 0, '', 0, 3, 'arm_disarm', 'low'),
('130', 'E', 'UNIVERSAL', 1, 'Disparo de Alarme - Zona/Setor', 'alarme', '#EF4444', 1, 0, 1, '130', 0, 1, 'alarm', 'critical'),
('130', 'R', 'UNIVERSAL', 1, 'Restauração de Alarme - Zona/Setor', 'restauracao', '#3B82F6', 0, 0, 0, '', 0, 5, 'restore', 'low'),
('602', 'E', 'UNIVERSAL', 1, 'Teste Periódico', 'teste', '#6B7280', 0, 1, 0, '', 0, 5, 'test', 'low'),
('610', 'E', 'UNIVERSAL', 1, 'Teste Manual', 'teste', '#6B7280', 0, 1, 0, '', 0, 5, 'test', 'low');
