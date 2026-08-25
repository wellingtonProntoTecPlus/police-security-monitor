CREATE TABLE `alarm_remote_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alarmSystemId` int NOT NULL,
	`credentialKind` varchar(40) NOT NULL,
	`encryptedSecret` text NOT NULL,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alarm_remote_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `alarm_remote_credentials_alarmSystemId_unique` UNIQUE(`alarmSystemId`)
);
