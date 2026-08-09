CREATE TABLE `alarm_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int,
	`account` varchar(10) NOT NULL,
	`brand` varchar(50) NOT NULL,
	`qualifier` varchar(1) NOT NULL,
	`eventCode` varchar(4) NOT NULL,
	`partition` varchar(3),
	`zoneUser` varchar(4),
	`description` text,
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`receiverPort` int,
	`remoteIp` varchar(45),
	`rawData` text,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alarm_systems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`account` varchar(10) NOT NULL,
	`brand` enum('JFL','INTELBRAS','VETTI','COMPATEC','RADIOENGE','VIAWEB') NOT NULL,
	`model` varchar(100),
	`firmwareVersion` varchar(50),
	`partitions` int NOT NULL DEFAULT 1,
	`receiverPort` int,
	`ipAddress` varchar(45),
	`isActive` boolean NOT NULL DEFAULT true,
	`isOnline` boolean NOT NULL DEFAULT false,
	`lastCommunication` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alarm_systems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alarm_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`userNumber` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alarm_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`zoneNumber` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('perimeter','internal','24h','fire','panic','medical') NOT NULL DEFAULT 'perimeter',
	`partition` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alarm_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cameras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`rtspUrl` text NOT NULL,
	`brand` varchar(100),
	`model` varchar(100),
	`location` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cameras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`whatsapp` varchar(20),
	`email` varchar(320),
	`role` varchar(100),
	`priority` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerCompanyId` int NOT NULL,
	`type` enum('pf','pj') NOT NULL,
	`name` varchar(255) NOT NULL,
	`document` varchar(18) NOT NULL,
	`phone` varchar(20),
	`whatsapp` varchar(20),
	`email` varchar(320),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`latitude` varchar(20),
	`longitude` varchar(20),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_id_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(4) NOT NULL,
	`description` varchar(255) NOT NULL,
	`category` enum('alarm','restore','fault','arm_disarm','test','system','access') NOT NULL,
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	CONSTRAINT `contact_id_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_id_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`alarmSystemId` int,
	`clientId` int,
	`operatorId` int,
	`status` enum('waiting','attending','observing','dispatched','closed') NOT NULL DEFAULT 'waiting',
	`priority` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`notes` text,
	`resolution` text,
	`dispatchedAt` timestamp,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `managing_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`logoUrl` text,
	`primaryColor` varchar(7) DEFAULT '#1a56db',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managing_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `managing_companies_cnpj_unique` UNIQUE(`cnpj`)
);
--> statement-breakpoint
CREATE TABLE `partner_companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`managingCompanyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`logoUrl` text,
	`primaryColor` varchar(7) DEFAULT '#1a56db',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `partner_companies_cnpj_unique` UNIQUE(`cnpj`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','partner','operator') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `partnerId` int;