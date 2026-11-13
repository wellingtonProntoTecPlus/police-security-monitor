CREATE TABLE `client_dvrs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`brand` varchar(100),
	`model` varchar(150),
	`firmwareVersion` varchar(100),
	`serialNumber` varchar(150),
	`host` varchar(255),
	`tcpPort` int,
	`udpPort` int,
	`httpPort` int,
	`rtspPort` int,
	`httpsPort` int,
	`serverPort` int,
	`username` varchar(128) NOT NULL DEFAULT 'admin',
	`encryptedPassword` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_dvrs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `client_dvrs_client_idx` ON `client_dvrs` (`clientId`);--> statement-breakpoint
CREATE INDEX `client_dvrs_serial_idx` ON `client_dvrs` (`serialNumber`);